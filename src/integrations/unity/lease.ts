import { mkdir, readFile, writeFile, rm, lstat } from "node:fs/promises";
import { join } from "node:path";
import { Blocked, hash, now } from "../../domain/util.js";
import type { UnityPolicy } from "./schema.js";

/** One writer per editor project across goals; uncertain outcomes never auto-expire. */
export class UnityLease {
  private uncertain = false;
  private acquired = false;
  readonly path: string;
  constructor(home: string, readonly policy: UnityPolicy, readonly runId: string) {
    this.path = join(home, "unity-leases", hash(policy.projectPath));
  }
  async acquire(): Promise<void> {
    if (this.acquired) return;
    await mkdir(join(this.path, ".."), { recursive: true, mode: 0o700 });
    try { await mkdir(this.path, { mode: 0o700 }); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Blocked("UNITY_WRITER_BUSY", "Otro agente posee el Editor o una escritura quedó incierta; no se roba el lock por timeout"); throw e; }
    try {
      await writeFile(join(this.path, "owner.json"), JSON.stringify({ runId: this.runId, pid: process.pid, editorPid: this.policy.editorPid, descriptorFingerprint: this.policy.descriptorFingerprint, projectHash: hash(this.policy.projectPath), createdAt: now() }), { flag: "wx", mode: 0o600 });
      this.acquired = true;
    } catch (e) { await rm(this.path, { recursive: true, force: true }); throw e; }
  }
  markUncertain(): void { this.uncertain = true; }
  async close(): Promise<void> {
    if (!this.acquired || this.uncertain) return;
    const path = join(this.path, "owner.json"), stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Blocked("UNITY_LEASE_TAMPERED", "Lock alterado");
    const owner = JSON.parse(await readFile(path, "utf8"));
    if (owner.runId !== this.runId || owner.pid !== process.pid) throw new Blocked("UNITY_LEASE_OWNER", "No se borra un lock ajeno");
    await rm(this.path, { recursive: true }); this.acquired = false;
  }
}
