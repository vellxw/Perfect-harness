import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  lstat,
} from "node:fs/promises";
import { dirname } from "node:path";
import type { OwnershipManager } from "../application/ownership.js";
import { safePath, sensitive, secretContent } from "./paths.js";
import { id, hash, Blocked } from "../domain/util.js";
export interface FilePolicy {
  readOnly: boolean;
  protectedPaths: string[];
  maxFileBytes: number;
  frozenFiles: Record<string, string>;
}
export class FileBroker {
  constructor(
    readonly root: string,
    private policy: FilePolicy,
    private ownership?: OwnershipManager,
    private leaseId?: string,
  ) {}
  async read(
    path: string,
  ): Promise<{ path: string; content: string; hash: string }> {
    if (sensitive(path)) throw new Blocked("SECRET_DENIED", path);
    const full = await safePath(this.root, path);
    const stat = await lstat(full);
    if (!stat.isFile() || stat.size > this.policy.maxFileBytes)
      throw new Blocked("FILE_SIZE", path);
    const content = await readFile(full, "utf8");
    if (secretContent(content)) throw new Blocked("SECRET_CONTENT", path);
    return { path, content, hash: hash(content) };
  }
  private async permit(path: string): Promise<string> {
    if (this.policy.readOnly) throw new Blocked("READ_ONLY", path);
    if (
      sensitive(path) ||
      this.policy.protectedPaths.some(
        (p) =>
          path === p || path.startsWith(`${p}/`) || path.split("/").includes(p),
      )
    )
      throw new Blocked("PROTECTED_PATH", path);
    if (this.policy.frozenFiles[path])
      throw new Blocked(
        "FROZEN_VERIFIER",
        "Existing tests/references cannot be modified by a worker",
      );
    if (!this.ownership || !this.leaseId)
      throw new Blocked("OWNERSHIP_REQUIRED", path);
    this.ownership.assert(this.leaseId, path);
    return safePath(this.root, path, true);
  }
  async write(
    path: string,
    content: string,
    expectedHash?: string,
  ): Promise<{ path: string; hash: string }> {
    const full = await this.permit(path);
    if (Buffer.byteLength(content) > this.policy.maxFileBytes)
      throw new Blocked("FILE_SIZE", path);
    if (secretContent(content)) throw new Blocked("SECRET_CONTENT", path);
    if (expectedHash) {
      const previous = await this.read(path);
      if (previous.hash !== expectedHash) throw new Blocked("STALE_FILE", path);
    }
    await mkdir(dirname(full), { recursive: true });
    await safePath(this.root, path, true);
    const temp = `${full}.${id("write")}.tmp`;
    try {
      await writeFile(temp, content, { flag: "wx", mode: 0o644 });
      await rename(temp, full);
    } finally {
      await unlink(temp).catch(() => {});
    }
    return { path, hash: hash(content) };
  }
  async remove(path: string, expectedHash: string): Promise<void> {
    const full = await this.permit(path);
    const old = await this.read(path);
    if (old.hash !== expectedHash) throw new Blocked("STALE_FILE", path);
    await unlink(full);
  }
}
