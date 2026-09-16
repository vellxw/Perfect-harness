import { DatabaseSync } from "node:sqlite";
import { createReadStream } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

const LockSchema = z.object({ pid: z.number().int().positive(), nonce: z.string().uuid() }).strict();
const FileSchema = z.object({ name: z.string(), bytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const MarkerSchema = z.object({
  schemaVersion: z.literal(1), product: z.literal("perfect-desktop-v5"),
  status: z.literal("complete"), createdAt: z.string(),
  backupDirectory: z.string().regex(/^backups\/v5-[a-f0-9-]{36}$/),
  sourceSchemaVersions: z.record(z.string(), z.number().int().nonnegative()),
  files: z.array(FileSchema).max(10),
  migration: z.literal("Core V4 schema and credential files unchanged; consistent first-Desktop backup"),
}).strict();
export type DesktopUpgrade = z.infer<typeof MarkerSchema>;
async function exists(path: string) {
  try { return await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}
async function digest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
async function syncedFile(path: string, bytes: string | Buffer) {
  const file = await open(path, "wx", 0o600);
  try { await file.writeFile(bytes); await file.sync(); }
  finally { await file.close(); }
}
async function marker(path: string): Promise<DesktopUpgrade | undefined> {
  const stat = await exists(path);
  if (!stat) return undefined;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536)
    throw Error("UPGRADE_MARKER: el registro de migración no es un archivo local válido");
  return MarkerSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

/** Runs before Desktop creates or changes V4 state. Never copies a live .sqlite file.
 * VACUUM INTO takes a committed SQLite snapshot, including its WAL. Credentials
 * remain in their original owner-protected vault; they are not decrypted or copied.
 * The shared V4 schema remains unchanged. Only a first-Desktop receipt is added.
 */
export async function prepareDesktopState(home: string): Promise<DesktopUpgrade> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  home = await realpath(home);
  const markerPath = join(home, "desktop-migration-v5.json");
  const complete = await marker(markerPath);
  if (complete) return complete;
  const lockPath = join(home, ".desktop-migration-v5.lock"), nonce = randomUUID();
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  for (let attempt = 0; attempt < 2 && !lock; attempt++) {
    try { lock = await open(lockPath, "wx", 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stat = await lstat(lockPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 2048) throw Error("UPGRADE_LOCK: registro local inválido");
      const previous = LockSchema.parse(JSON.parse(await readFile(lockPath, "utf8")));
      if (alive(previous.pid)) throw Error("UPGRADE_ACTIVE: otra instancia está preparando los datos; cerrala de forma segura y volvé a abrir Perfect");
      // Preserve an abandoned lock as evidence; never kill or steal from a live process.
      const current = LockSchema.parse(JSON.parse(await readFile(lockPath, "utf8")));
      if (current.nonce !== previous.nonce) throw Error("UPGRADE_LOCK_CHANGED: otra instancia recuperó la migración");
      await rename(lockPath, join(home, `.desktop-migration-v5.abandoned-${randomUUID()}.json`));
    }
  }
  if (!lock) throw Error("UPGRADE_LOCK: no se obtuvo exclusividad");
  await lock.writeFile(JSON.stringify({ pid: process.pid, nonce }));
  await lock.sync();
  const pending = join(home, "backups", `.v5-pending-${nonce}`);
  try {
    const recovered = await marker(markerPath);
    if (recovered) return recovered;
    await mkdir(pending, { recursive: true, mode: 0o700 });
    const files: DesktopUpgrade["files"] = [], sourceSchemaVersions: Record<string, number> = {};
    for (const name of ["state.sqlite", "integrations.sqlite"]) {
      const source = join(home, name), stat = await exists(source);
      if (!stat) continue;
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw Error("UPGRADE_DATABASE: archivo de estado inválido");
      const db = new DatabaseSync(source);
      try {
        db.exec("PRAGMA busy_timeout=5000");
        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='process_locks'").get()) {
          for (const row of db.prepare("SELECT pid FROM process_locks").all()) {
            const pid = Number(row.pid);
            if (!Number.isSafeInteger(pid) || pid < 1 || alive(pid)) throw Error("UPGRADE_ACTIVE: hay un controlador activo; pausá y cerrá la instancia anterior antes de actualizar los datos");
          }
        }
        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'").get()) {
          const row = db.prepare("SELECT COALESCE(MAX(version),0) AS version FROM migrations").get();
          sourceSchemaVersions[name] = Number(row?.version ?? 0);
          if (sourceSchemaVersions[name]! > 3) throw Error("UPGRADE_NEWER_SCHEMA: los datos pertenecen a otra versión; no se intenta un downgrade");
        }
        db.prepare("VACUUM INTO ?").run(join(pending, name));
      } finally { db.close(); }
      const backup = join(pending, name);
      await chmod(backup, 0o600);
      const handle = await open(backup, "r+");
      try { await handle.sync(); } finally { await handle.close(); }
      const verification = new DatabaseSync(backup, { readOnly: true });
      try { if (verification.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") throw Error("UPGRADE_BACKUP_INTEGRITY: la copia SQLite no se pudo verificar"); }
      finally { verification.close(); }
      files.push({ name, bytes: (await lstat(backup)).size, sha256: await digest(backup) });
    }
    for (const name of ["ui.json", "desktop.json", "desktop-recent.json"]) {
      const source = join(home, name), stat = await exists(source);
      if (!stat) continue;
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 2_000_000) throw Error("UPGRADE_PREFERENCES: archivo local inválido");
      const bytes = await readFile(source);
      await syncedFile(join(pending, name), bytes);
      files.push({ name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    const receipt: DesktopUpgrade = {
      schemaVersion: 1, product: "perfect-desktop-v5", status: "complete", createdAt: new Date().toISOString(),
      backupDirectory: `backups/v5-${nonce}`, sourceSchemaVersions, files,
      migration: "Core V4 schema and credential files unchanged; consistent first-Desktop backup",
    };
    await syncedFile(join(pending, "manifest.json"), JSON.stringify(receipt, null, 2));
    await rename(pending, join(home, "backups", `v5-${nonce}`));
    const temporaryMarker = join(home, `.desktop-migration-v5-${nonce}.tmp`);
    await syncedFile(temporaryMarker, JSON.stringify(receipt, null, 2));
    await rename(temporaryMarker, markerPath);
    return receipt;
  } finally {
    await lock.close();
    const remaining = await exists(lockPath);
    if (remaining && remaining.isFile() && !remaining.isSymbolicLink()) {
      const own = LockSchema.parse(JSON.parse(await readFile(lockPath, "utf8")));
      if (own.nonce === nonce) await rm(lockPath);
    }
    // Completed backups are retained. A failed private staging directory is not
    // advertised as a backup and is left for explicit diagnosis/recovery.
  }
}
