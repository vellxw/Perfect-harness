import { z } from "zod";
import { Blocked } from "../domain/util.js";
import { releaseFromFiles, safeResource, sha, parseSkill } from "./importer.js";
import type { SkillRelease } from "./model.js";

export const GithubSkillSchema = z.object({
  repository: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  path: z.string().min(1).max(300),
  licenseFiles: z.array(z.string().max(300)).max(8),
  defaultSets: z.array(z.string()).max(8),
  triggers: z.array(z.string().min(2).max(100)).max(30),
  localOnly: z.boolean().default(false),
}).strict();
export type GithubSkillInput = z.infer<typeof GithubSkillSchema>;
export async function publicBytes(url: string, signal: AbortSignal, limit = 1_000_000): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["api.github.com", "raw.githubusercontent.com"].includes(parsed.hostname) || parsed.username || parsed.password || parsed.port)
    throw new Blocked("SKILL_REMOTE_ORIGIN", "Solo se admite GitHub público sin credenciales");
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), redirect: "error", headers: { "Accept": "application/vnd.github+json", "User-Agent": "Perfect-Harness-skills" } });
  if (!response.ok) { await response.body?.cancel(); throw new Blocked("SKILL_FETCH", `GitHub respondió ${response.status}; no se usó una cuenta personal`); }
  if (Number(response.headers.get("content-length")) > limit) { await response.body?.cancel(); throw new Blocked("SKILL_REMOTE_SIZE", "Respuesta demasiado grande"); }
  const chunks: Uint8Array[] = []; let total = 0;
  if (!response.body) throw new Blocked("SKILL_REMOTE_EMPTY", "Respuesta vacía");
  const reader = response.body.getReader();
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      total += item.value.length;
      if (total > limit) throw new Blocked("SKILL_REMOTE_SIZE", "Respuesta demasiado grande");
      chunks.push(item.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks);
}
const TreeSchema = z.object({ truncated: z.boolean(), tree: z.array(z.object({ path: z.string(), mode: z.string(), type: z.string(), size: z.number().optional(), sha: z.string() })) });
function recognizedLicense(text: string): string {
  if (/MIT License/i.test(text) && /Permission is hereby granted, free of charge/i.test(text)) return "MIT";
  if (/Apache License/i.test(text) && /Version 2\.0/i.test(text)) return "Apache-2.0";
  if (/Creative Commons Attribution-ShareAlike 4\.0|CC-BY-SA-4\.0|Attribution-ShareAlike 4\.0 International/i.test(text)) return "CC-BY-SA-4.0";
  if (/ISC License/i.test(text) && /Permission to use, copy, modify/i.test(text)) return "ISC";
  return "unknown";
}
/** Public GitHub only, immutable commit only, no git hooks, npm or user token. */
export async function importGithubSkill(raw: unknown, signal: AbortSignal, fetchBytes: typeof publicBytes = publicBytes): Promise<SkillRelease> {
  const input = GithubSkillSchema.parse(raw);
  safeResource(input.path);
  if (/supabase/i.test(input.repository)) throw new Blocked("SKILL_EXCLUDED", "Supabase está excluido");
  if (input.repository.toLowerCase() === "chuspeeism/dashi-motion") throw new Blocked("SKILL_LICENSE", "Dashi está pendiente de licencia; no se copia automáticamente");
  const transitions = input.repository.toLowerCase() === "jakubantalik/transitions.dev";
  if (transitions && (!input.localOnly || input.path !== "skills/transitions-dev")) throw new Blocked("SKILL_TRANSITIONS_SCOPE", "Solo se admite la skill gratuita anunciada, para uso local");
  const prefix = input.path + "/";
  const tree = TreeSchema.parse(JSON.parse((await fetchBytes(`https://api.github.com/repos/${input.repository}/git/trees/${input.commit}?recursive=1`, signal, 8_000_000)).toString("utf8")));
  if (tree.truncated) throw new Blocked("SKILL_TREE_TRUNCATED", "No se puede comprobar un árbol incompleto");
  const entries = tree.tree.filter(e => e.path.startsWith(prefix) && e.type !== "tree");
  if (!entries.length || entries.length > 120 || entries.some(e => e.type !== "blob" || !["100644", "100755"].includes(e.mode))) throw new Blocked("SKILL_REMOTE_LAYOUT", "Paquete vacío, excesivo o con enlaces/submódulos");
  const files: Record<string, Buffer> = Object.create(null) as Record<string, Buffer>;
  let total = 0;
  const rawFile = (path: string) => `https://raw.githubusercontent.com/${input.repository}/${input.commit}/${path.split("/").map(encodeURIComponent).join("/")}`;
  for (const entry of entries) {
    const name = safeResource(entry.path.slice(prefix.length));
    if (transitions && /(?:^|\/)pro(?:[-_/]|$)/i.test(name)) throw new Blocked("SKILL_PREMIUM_DENIED", "El importador gratuito no admite contenido Pro");
    const bytes = await fetchBytes(rawFile(entry.path), signal);
    if ((total += bytes.length) > 5_000_000) throw new Blocked("SKILL_SIZE", "Paquete demasiado grande");
    files[name] = bytes;
  }
  const licenseTexts: string[] = [];
  for (const path of input.licenseFiles) {
    safeResource(path);
    const bytes = await fetchBytes(rawFile(path), signal, 300000);
    licenseTexts.push(bytes.toString("utf8"));
    files[`licenses/${sha(path).slice(0, 12)}.txt`] = bytes;
  }
  for (const [path, bytes] of Object.entries(files)) if (/^(?:LICENSE|COPYING)(?:\.[a-z]+)?$/i.test(path)) licenseTexts.push(bytes.toString("utf8"));
  let license = recognizedLicense(licenseTexts.join("\n"));
  let adaptation: string | undefined;
  if (transitions) {
    license = "Transitions.dev free recipes — local use, no collection redistribution";
    files["TERMS-SOURCE.txt"] = Buffer.from("https://transitions.dev/terms.html\nImportación local solicitada. No republicar la colección. No se descargan endpoints Pro ni se utiliza una cuenta. Revisar términos antes de aprobar.\n");
    const original = files["SKILL.md"];
    if (!original) throw new Blocked("SKILL_FILES", "Falta SKILL.md");
    try { parseSkill(original.toString("utf8")); }
    catch {
      files["references/upstream-SKILL.md"] = original;
      files["SKILL.md"] = Buffer.from('---\nname: transitions-dev-free\ndescription: Seleccionar transiciones CSS gratuitas según el elemento de interfaz, conservando accesibilidad y reduced motion.\nlicense: TERMS-SOURCE.txt\n---\n\nLeé references/upstream-SKILL.md para el procedimiento original. Sus rutas relativas parten de la raíz de este paquete, no de references/. Cargá solo la receta pertinente. No invoques Pro, Refine LLM ni otro agente. Las políticas de Perfect y el diseño aprobado prevalecen.\n');
      adaptation = "La cabecera upstream no satisface el límite del estándar; se conserva el original íntegro como recurso local y se utiliza una entrada corta identificada.";
    }
  }
  return releaseFromFiles({ files, provenance: { kind: "github", source: `https://github.com/${input.repository}`, commit: input.commit, path: input.path, license, redistribution: transitions || input.localOnly ? "local-only" : license === "unknown" ? "unknown" : "allowed", adaptation }, defaultSets: input.defaultSets, triggers: input.triggers, privacy: "public", packageId: transitions ? "transitions-dev-free" : input.repository.toLowerCase() === "obra/superpowers" ? "superpowers" : undefined });
}
