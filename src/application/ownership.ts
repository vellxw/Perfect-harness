import type { StateStore } from "../ports/state-store.js";
import type { FileOwnership, Task } from "../domain/model.js";
import { overlaps, validateSurface } from "../domain/task-graph.js";
import { id, now, Blocked } from "../domain/util.js";
export class OwnershipManager {
  constructor(private store: StateStore) {}
  acquire(task: Task, worktree: string, timeoutMs: number): FileOwnership {
    return this.store.transaction(() => {
      const surfaces = [
        ...new Set([...task.ownedFiles, ...task.ownedSurfaces]),
      ].sort();
      surfaces.forEach(validateSurface);
      const held = this.store
        .list("ownership", task.goalId)
        .filter((l) => l.status === "held");
      if (
        held.some((l) =>
          l.surfaces.some((a) => surfaces.some((b) => overlaps(a, b))),
        )
      )
        throw new Blocked("OWNERSHIP_BUSY", task.id);
      const lease: FileOwnership = {
        id: id("lease"),
        goalId: task.goalId,
        taskId: task.id,
        surfaces,
        mode: "write",
        worktreeId: worktree,
        leaseEpoch: Date.now(),
        acquiredAt: now(),
        expiresAt: new Date(Date.now() + timeoutMs).toISOString(),
        status: "held",
      };
      this.store.put("ownership", lease, "file.locked");
      return lease;
    });
  }
  assert(leaseId: string, path: string): void {
    const lease = this.store.get("ownership", leaseId);
    if (
      !lease ||
      lease.status !== "held" ||
      !Number.isFinite(Date.parse(lease.expiresAt)) ||
      Date.parse(lease.expiresAt) <= Date.now()
    )
      throw new Blocked("OWNERSHIP_EXPIRED", path);
    if (!lease.surfaces.some((s) => path === s || path.startsWith(`${s}/`)))
      throw new Blocked("OWNERSHIP_DENIED", path);
  }
  release(leaseId: string): void {
    const lease = this.store.get("ownership", leaseId);
    if (lease)
      this.store.put(
        "ownership",
        { ...lease, status: "released", releasedAt: now() },
        "file.unlocked",
      );
  }
}
