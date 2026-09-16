import { constants } from "node:fs";
import { mkdir, open, lstat, realpath, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function identifier(value: string): string {
  if (!uuid.test(value)) throw Error("ID de sesión/solicitud no válido");
  return value.toLowerCase();
}
async function ownedDirectory(path: string): Promise<string> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw Error("El registro de solicitudes no admite enlaces");
  const actual = await realpath(path);
  if (relative(resolve(path), actual) !== "" && process.platform !== "win32")
    throw Error("El registro de solicitudes cambió de ubicación");
  return actual;
}

/** Atomic, content-free receipts. No unbounded in-memory UUID Set and no hard
 * request-count restart. The same Desktop session ID survives engine restarts;
 * old actions remain rejected even after the Node child is replaced.
 * Application effects still use the core's intents/approvals and are never
 * retried merely because a receipt exists. No payload or credential is stored. */
export class RequestReceipts {
  private root?: Promise<string>;
  private closed = false;
  private pending = new Set<Promise<void>>();
  private directories = new Map<string, Promise<string>>();
  readonly sessionId: string;
  constructor(readonly home: string, sessionId: string, readonly channel: "desktop" | "engine") {
    this.sessionId = identifier(sessionId);
  }
  private location(): Promise<string> {
    this.root ??= (async () => {
      const canonicalHome = await realpath(this.home);
      const base = await ownedDirectory(join(canonicalHome, "desktop-request-receipts"));
      const session = await ownedDirectory(join(base, this.sessionId));
      return ownedDirectory(join(session, this.channel));
    })();
    return this.root;
  }
  async claim(requestId: string): Promise<void> {
    if (this.closed) throw Error("La sesión de solicitudes está cerrada");
    if (this.pending.size >= 128) throw Error("Demasiadas solicitudes simultáneas; esperá las respuestas pendientes");
    const key = identifier(requestId);
    const work = this.writeReceipt(key);
    this.pending.add(work);
    try { await work; } finally { this.pending.delete(work); }
  }
  private async writeReceipt(key: string): Promise<void> {
    const bucket = key.slice(0, 2);
    let directory = this.directories.get(bucket);
    if (!directory) {
      directory = this.location().then(root => ownedDirectory(join(root, bucket)));
      this.directories.set(bucket, directory);
    }
    const path = join(await directory, key);
    let file;
    try {
      file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
      await file.sync();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw Error("Solicitud duplicada; no se repitió el efecto");
      throw error;
    } finally { await file?.close(); }
  }
  async close(): Promise<void> {
    this.closed = true;
    await Promise.allSettled([...this.pending]);
  }
  /** Only call after both participants stopped; restart must preserve receipts. */
  static async removeSession(home: string, sessionId: string): Promise<void> {
    const base = join(await realpath(home), "desktop-request-receipts");
    try {
      const st = await lstat(base);
      if (!st.isDirectory() || st.isSymbolicLink()) throw Error("Directorio de solicitudes no válido");
      const path = join(base, identifier(sessionId)), session = await lstat(path);
      if (!session.isDirectory() || session.isSymbolicLink()) throw Error("Sesión de solicitudes enlazada");
      await rm(path, { recursive: true, force: false });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}
