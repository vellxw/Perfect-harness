import { createHash } from "node:crypto";
import { lstat, readdir, realpath, readFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { parseDocument } from "yaml";
import { z } from "zod";
import { Blocked, hash, now } from "../domain/util.js";
import { Key, type SkillFile, type SkillProvenance, type SkillRelease } from "./model.js";

export const sha = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");
const Frontmatter = z.object({ name: Key, description: z.string().trim().min(1).max(1024), license: z.string().max(500).optional(), compatibility: z.string().max(500).optional(), metadata: z.record(z.string(), z.string()).optional(), "allowed-tools": z.string().max(2000).optional() }).passthrough();
export function parseSkill(content: string) {
  if (Buffer.byteLength(content) > 160000) throw new Blocked("SKILL_SIZE", "SKILL.md supera el límite");
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(content);
  if (!match) throw new Blocked("SKILL_FRONTMATTER", "Falta cabecera YAML delimitada");
  if (match[1]!.length > 12000) throw new Blocked("SKILL_FRONTMATTER", "Cabecera demasiado grande");
  const doc = parseDocument(match[1]!, { uniqueKeys: true });
  if (doc.errors.length) throw new Blocked("SKILL_YAML", "Cabecera YAML inválida");
  let metadata: z.infer<typeof Frontmatter>;
  try { metadata = Frontmatter.parse(doc.toJS({ maxAliasCount: 0 })); }
  catch { throw new Blocked("SKILL_METADATA", "Metadatos inválidos o alias YAML no autorizados"); }
  if (!match[2]!.trim()) throw new Blocked("SKILL_EMPTY", "Faltan instrucciones");
  return { metadata, body: match[2]!.trim() };
}
export function safeResource(path: string): string {
  if (!path || path.length > 512 || /[\\\x00-\x1f:]/.test(path) || path.startsWith("/") || path.split("/").some(p => !p || p === "." || p === ".." || /[. ]$/.test(p) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))
    throw new Blocked("SKILL_PATH", "Ruta de recurso no permitida");
  return path;
}
export function releaseFromFiles(input: { files: Record<string, Buffer>; provenance: SkillProvenance; defaultSets: string[]; triggers?: string[]; excludes?: string[]; packageId?: string; privacy?: SkillRelease["privacy"]; dependencies?: string[]; conflicts?: string[]; creatorRunId?: string }): SkillRelease {
  const names = Object.keys(input.files).sort();
  if (!names.includes("SKILL.md") || names.length > 128) throw new Blocked("SKILL_FILES", "Paquete incompleto o excesivo");
  if (new Set(names.map(n => n.toLowerCase())).size !== names.length) throw new Blocked("SKILL_CASE_COLLISION", "Rutas incompatibles en Windows");
  let total = 0;
  const files: Record<string, SkillFile> = Object.create(null) as Record<string, SkillFile>;
  for (const name of names) {
    safeResource(name);
    const bytes = input.files[name]!;
    if (bytes.length > 1_000_000 || (total += bytes.length) > 5_000_000) throw new Blocked("SKILL_SIZE", "Paquete demasiado grande");
    if (/(?:^|\/)(?:\.env(?:\.|$)|\.git(?:\/|$)|credentials|auth\.json)|\.(?:woff2?|ttf|otf|exe|dll|node)$/i.test(name)) throw new Blocked("SKILL_RESOURCE_DENIED", name);
    files[name] = { hash: sha(bytes), bytes: bytes.length, base64: bytes.toString("base64") };
  }
  const { metadata } = parseSkill(input.files["SKILL.md"]!.toString("utf8"));
  const contentHash = hash(names.map(n => [n, files[n]!.hash]));
  const packageId = /(?:^|\/)superpowers(?:\/|$)/i.test(input.provenance.source) ? "superpowers" : Key.parse(input.packageId ?? metadata.name);
  return { id: `skill-${contentHash}`, goalId: "skills-registry", skillId: metadata.name, packageId, name: metadata.name, description: metadata.description, version: metadata.metadata?.version ?? "0.0.0", hash: contentHash, files, provenance: input.provenance, defaultSets: [...new Set(input.defaultSets.map(s => Key.parse(s)))], triggers: input.triggers ?? metadata.description.split(/[,;.!?]/).map(s => s.trim()).filter(s => s.length > 2).slice(0, 16), excludes: input.excludes ?? [], dependencies: input.dependencies ?? [], conflicts: input.conflicts ?? [], requiredCapabilities: [], privacy: input.privacy ?? (input.provenance.kind === "github" ? "public" : "private"), creatorRunId: input.creatorRunId, createdAt: now() };
}
export function releaseBytes(release: SkillRelease, name: string): Buffer {
  safeResource(name);
  const file = release.files[name];
  if (!file) throw new Blocked("SKILL_RESOURCE", "Recurso fuera del paquete");
  const bytes = Buffer.from(file.base64, "base64");
  if (bytes.length !== file.bytes || sha(bytes) !== file.hash) throw new Blocked("SKILL_INTEGRITY", "El recurso cambió");
  const actual = hash(Object.keys(release.files).sort().map(n => [n, release.files[n]!.hash]));
  if (actual !== release.hash) throw new Blocked("SKILL_INTEGRITY", "Manifiesto alterado");
  return bytes;
}
export async function importDirectory(directory: string, workspace: string, options: Omit<Parameters<typeof releaseFromFiles>[0], "files">): Promise<SkillRelease> {
  const root = await realpath(directory), source = await realpath(workspace);
  const relation = relative(source, root);
  if (!relation || (!relation.startsWith(`..${sep}`) && relation !== "..")) throw new Blocked("SKILL_SOURCE_SCOPE", "Importá desde una carpeta externa al proyecto para no exponer copias sin filtrar");
  const files: Record<string, Buffer> = Object.create(null) as Record<string, Buffer>;
  let count = 0, bytes = 0;
  const visit = async (dir: string, prefix = "") => {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      if (++count > 256) throw new Blocked("SKILL_FILES", "Demasiados recursos");
      const rel = prefix + item.name;
      safeResource(rel);
      const path = join(dir, item.name), stat = await lstat(path);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) throw new Blocked("SKILL_LINK", rel);
      if (stat.isDirectory()) { if (rel.split("/").length > 5) throw new Blocked("SKILL_DEPTH", rel); await visit(path, rel + "/"); }
      else {
        if (stat.size > 1_000_000 || (bytes += stat.size) > 5_000_000) throw new Blocked("SKILL_SIZE", rel);
        files[rel] = await readFile(path);
        const after = await lstat(path);
        if (after.isSymbolicLink() || after.ino !== stat.ino || after.size !== stat.size) throw new Blocked("SKILL_CHANGED", rel);
      }
    }
  };
  await visit(root);
  const release = releaseFromFiles({ ...options, files });
  if (basename(root) !== release.skillId) throw new Blocked("SKILL_DIRECTORY_NAME", "El directorio debe coincidir con name en SKILL.md");
  return release;
}
