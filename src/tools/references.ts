import { randomUUID, createHash } from "node:crypto";
import { lstat, mkdir, open, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { constants } from "node:fs";
import type { Goal, Privacy } from "../domain/model.js";
import {
  UserReferenceSchema,
  type UserReference,
} from "../domain/references.js";
import { Blocked } from "../domain/util.js";
import { safePath, sensitive, secretContent } from "./paths.js";
import { imageMime } from "./evidence.js";
const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export const referenceWorkspace = (workspace: string) => digest(workspace);
async function fileBytes(path: string, max: number) {
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.size < 1 ||
    stat.size > max
  )
    throw new Blocked(
      "REFERENCE_FILE",
      "Archivo no regular, enlazado o fuera del límite",
    );
  const handle = await open(
    path,
    constants.O_RDONLY |
      (process.platform === "win32" ? 0 : constants.O_NOFOLLOW),
  );
  try {
    const opened = await handle.stat();
    if (
      opened.ino !== stat.ino ||
      opened.dev !== stat.dev ||
      opened.size !== stat.size ||
      opened.nlink !== 1
    )
      throw new Blocked(
        "REFERENCE_CHANGED",
        "Archivo modificado durante la selección",
      );
    const bytes = await handle.readFile();
    if (bytes.length !== stat.size)
      throw new Blocked(
        "REFERENCE_CHANGED",
        "Archivo modificado durante la lectura",
      );
    return bytes;
  } finally {
    await handle.close();
  }
}
export async function importUserReferences(
  home: string,
  workspace: string,
  paths: string[],
  privacy: Privacy,
): Promise<UserReference[]> {
  if (paths.length < 1 || paths.length > 8)
    throw new Blocked(
      "REFERENCE_LIMIT",
      "Seleccioná entre uno y ocho recursos",
    );
  const owner = referenceWorkspace(await realpath(workspace)),
    result: UserReference[] = [];
  const root = join(home, "user-references");
  await mkdir(root, { recursive: true, mode: 0o700 });
  let total = 0;
  for (const candidate of paths) {
    const original = resolve(candidate);
    if (sensitive(original.replaceAll("\\", "/")))
      throw new Blocked(
        "REFERENCE_PRIVATE_PATH",
        "No se importan secretos ni configuraciones privadas",
      );
    let parent = dirname(original);
    while (parent !== dirname(parent)) {
      if ((await lstat(parent)).isSymbolicLink())
        throw new Blocked("REFERENCE_LINK", "Directorio enlazado");
      parent = dirname(parent);
    }
    const bytes = await fileBytes(original, 12000000);
    if ((total += bytes.length) > 25000000)
      throw new Blocked("REFERENCE_TOTAL", "Máximo 25 MB por selección");
    const extension = extname(original).toLowerCase();
    let kind: UserReference["kind"], mimeType: UserReference["mimeType"];
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
      kind = "image";
      mimeType = imageMime(bytes);
      if (
        mimeType === "image/png" &&
        bytes.length >= 24 &&
        bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 40000000
      )
        throw new Blocked(
          "REFERENCE_PIXELS",
          "La imagen supera el límite de píxeles",
        );
    } else if ([".md", ".txt", ".json", ".csv"].includes(extension)) {
      kind = "text";
      mimeType = "text/plain";
      const text = bytes.toString("utf8");
      if (
        bytes.length > 300000 ||
        !Buffer.from(text).equals(bytes) ||
        bytes.includes(0) ||
        secretContent(text)
      )
        throw new Blocked(
          "REFERENCE_TEXT",
          "Solo UTF-8 sin credenciales, hasta 300 KB",
        );
    } else
      throw new Blocked(
        "REFERENCE_FORMAT",
        "Referencias: PNG/JPEG/WebP o texto MD/TXT/JSON/CSV",
      );
    const id = randomUUID(),
      name = basename(original)
        .replace(/[\x00-\x1f\x7f]/g, "")
        .slice(0, 240);
    const reference = UserReferenceSchema.parse({
      id,
      workspaceId: owner,
      name,
      kind,
      mimeType,
      sha256: digest(bytes),
      bytes: bytes.length,
      privacy,
      approvedAt: new Date().toISOString(),
    });
    const directory = join(root, id);
    await mkdir(directory, { mode: 0o700 });
    await writeFile(join(directory, "content"), bytes, {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(
      join(directory, "metadata.json"),
      JSON.stringify(reference),
      { flag: "wx", mode: 0o600 },
    );
    result.push(reference);
  }
  return result;
}
export async function resolveUserReferences(
  home: string,
  workspace: string,
  ids: string[],
  privacy: Privacy,
): Promise<UserReference[]> {
  if (ids.length > 8 || new Set(ids).size !== ids.length)
    throw new Blocked("REFERENCE_LIMIT", "Referencias duplicadas o excesivas");
  const owner = referenceWorkspace(await realpath(workspace)),
    result: UserReference[] = [];
  for (const id of ids) {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new Blocked("REFERENCE_ID", "Referencia inválida");
    const root = join(home, "user-references"),
      meta = await safePath(root, id + "/metadata.json");
    const reference = UserReferenceSchema.parse(
      JSON.parse((await fileBytes(meta, 10000)).toString("utf8")),
    );
    if (reference.id !== id || reference.workspaceId !== owner)
      throw new Blocked("REFERENCE_SCOPE", "Referencia de otra carpeta");
    if (
      (privacy === "public" && reference.privacy !== "public") ||
      (privacy !== "confidential" && reference.privacy === "confidential")
    )
      throw new Blocked(
        "REFERENCE_PRIVACY",
        "La referencia requiere privacidad más restrictiva",
      );
    const bytes = await fileBytes(
      await safePath(root, id + "/content"),
      12000000,
    );
    if (bytes.length !== reference.bytes || digest(bytes) !== reference.sha256)
      throw new Blocked(
        "REFERENCE_INTEGRITY",
        "Referencia modificada después de aprobarse",
      );
    result.push(reference);
  }
  return result;
}
export async function copyGoalReferences(
  home: string,
  root: string,
  references: UserReference[],
): Promise<void> {
  if (!references.length) return;
  const directory = join(root, "references");
  await mkdir(directory, { mode: 0o700 });
  for (const reference of references) {
    const bytes = await fileBytes(
      await safePath(join(home, "user-references"), reference.id + "/content"),
      12000000,
    );
    if (digest(bytes) !== reference.sha256)
      throw new Blocked(
        "REFERENCE_CHANGED",
        "Referencia modificada antes del snapshot",
      );
    await writeFile(join(directory, reference.id), bytes, {
      flag: "wx",
      mode: 0o600,
    });
  }
}
export async function readGoalReference(
  goal: Goal,
  id: string,
): Promise<{ reference: UserReference; bytes: Buffer }> {
  const reference = goal.references?.find((r) => r.id === id);
  if (!reference)
    throw new Blocked(
      "REFERENCE_SCOPE",
      "La referencia no pertenece al objetivo aprobado",
    );
  const bytes = await fileBytes(
    await safePath(join(goal.root, "references"), id),
    12000000,
  );
  if (bytes.length !== reference.bytes || digest(bytes) !== reference.sha256)
    throw new Blocked("REFERENCE_INTEGRITY", "Referencia congelada alterada");
  return { reference, bytes };
}
