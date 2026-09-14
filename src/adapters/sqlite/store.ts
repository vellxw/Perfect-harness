import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  Collection,
  EntityMap,
  StateStore,
} from "../../ports/state-store.js";
import type { Event } from "../../domain/model.js";
import { id, now, hash, Blocked } from "../../domain/util.js";

const listeners = new Map<string, Set<() => void>>();
/** Local, post-commit wakeups. No polling or presentation dependencies in the store. */
export function onDatabaseChange(
  path: string,
  listener: () => void,
): () => void {
  const key = resolve(path);
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (!set!.size) listeners.delete(key);
  };
}

/** Keeps the V1 file format. Transactions support nested savepoints and publish only committed changes. */
export class SqliteStore implements StateStore {
  private db: DatabaseSync;
  private depth = 0;
  private changed = false;
  private readonly key: string;
  constructor(path: string) {
    this.key = resolve(path);
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,goal_id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS entities_goal ON entities(kind,goal_id);
      CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,goal_id TEXT NOT NULL,body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_goal ON events(goal_id,sequence);
      CREATE TABLE IF NOT EXISTS process_locks(workspace_id TEXT PRIMARY KEY,owner TEXT NOT NULL,pid INTEGER NOT NULL,created_at TEXT NOT NULL);`);
    const version = this.db
      .prepare("SELECT MAX(version) AS version FROM migrations")
      .get() as { version: number | null };
    if ((version.version ?? 0) > 2) {
      this.db.close();
      throw new Blocked(
        "DATABASE_VERSION",
        "Database belongs to a newer harness; refusing downgrade",
      );
    }
    if (version.version === 1 && path !== ":memory:") {
      const backup = resolve(path) + ".before-v4.sqlite";
      if (!existsSync(backup)) this.db.prepare("VACUUM INTO ?").run(backup);
      chmodSync(backup, 0o600);
    }
    this.db.prepare("INSERT OR IGNORE INTO migrations VALUES(1,?)").run(now());
    this.db.prepare("INSERT OR IGNORE INTO migrations VALUES(2,?)").run(now());
    if (path !== ":memory:") chmodSync(path, 0o600);
  }
  get<K extends Collection>(
    kind: K,
    entityId: string,
  ): EntityMap[K] | undefined {
    const row = this.db
      .prepare("SELECT body FROM entities WHERE kind=? AND id=?")
      .get(kind, entityId) as { body: string } | undefined;
    return row ? (JSON.parse(row.body) as EntityMap[K]) : undefined;
  }
  list<K extends Collection>(kind: K, goalId?: string): EntityMap[K][] {
    const rows = (
      goalId
        ? this.db
            .prepare(
              "SELECT body FROM entities WHERE kind=? AND goal_id=? ORDER BY rowid",
            )
            .all(kind, goalId)
        : this.db
            .prepare("SELECT body FROM entities WHERE kind=? ORDER BY rowid")
            .all(kind)
    ) as { body: string }[];
    return rows.map((r) => JSON.parse(r.body) as EntityMap[K]);
  }
  transaction<T>(fn: () => T): T {
    const level = this.depth,
      before = this.changed;
    const savepoint = `perfect_${level}`;
    this.db.exec(level ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    this.depth++;
    let result: T;
    try {
      result = fn();
      if (result && typeof (result as { then?: unknown }).then === "function")
        throw new Error("SQLite transactions must be synchronous");
      this.db.exec(level ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
    } catch (error) {
      this.db.exec(
        level
          ? `ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`
          : "ROLLBACK",
      );
      this.changed = before;
      throw error;
    } finally {
      this.depth--;
    }
    if (!level && this.changed) {
      this.changed = false;
      for (const listener of [...(listeners.get(this.key) ?? [])])
        queueMicrotask(listener);
    }
    return result;
  }
  put<K extends Collection>(
    kind: K,
    value: EntityMap[K],
    eventType: string,
    actor = "controller",
  ): void {
    this.transaction(() => {
      const goalId = "goalId" in value ? value.goalId : value.id,
        existing = this.get(kind, value.id);
      if (
        kind === "runs" &&
        existing &&
        hash((existing as EntityMap["runs"]).routeBinding) !==
          hash((value as EntityMap["runs"]).routeBinding)
      )
        throw new Blocked("BINDING_IMMUTABLE", value.id);
      if (
        [
          "plans",
          "contexts",
          "evidence",
          "approvals",
          "usage",
          "studioSnapshots",
          "studioHistory",
          "skillReleases",
          "skillActivations",
          "skillEvaluations",
        ].includes(kind) &&
        existing &&
        JSON.stringify(existing) !== JSON.stringify(value)
      )
        throw new Error(`Immutable record: ${kind}/${value.id}`);
      if (kind === "runs" && existing) {
        const oldRun = existing as EntityMap["runs"],
          newRun = value as EntityMap["runs"];
        if (
          hash([oldRun.profileId, oldRun.setIds, oldRun.studioSnapshotId]) !==
          hash([newRun.profileId, newRun.setIds, newRun.studioSnapshotId])
        )
          throw new Blocked("PROFILE_BINDING_IMMUTABLE", value.id);
      }
      this.db
        .prepare(
          "INSERT INTO entities(kind,id,goal_id,body) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
        )
        .run(kind, value.id, goalId, JSON.stringify(value));
      this.event(goalId, eventType, { entityId: value.id, kind }, actor);
    });
  }
  event(
    goalId: string,
    type: string,
    payload: unknown,
    actor = "controller",
  ): void {
    const write = () => {
      const event: Event = {
        id: id("event"),
        schemaVersion: 1,
        type,
        goalId,
        actor,
        correlationId: goalId,
        occurredAt: now(),
        payload,
      };
      this.db
        .prepare("INSERT INTO events(id,goal_id,body) VALUES(?,?,?)")
        .run(event.id, goalId, JSON.stringify(event));
      this.changed = true;
    };
    if (this.depth) write();
    else this.transaction(write);
  }
  events(goalId: string, after = 0): Event[] {
    const rows = this.db
      .prepare(
        "SELECT sequence,body FROM events WHERE goal_id=? AND sequence>? ORDER BY sequence",
      )
      .all(goalId, after) as { sequence: number; body: string }[];
    return rows.map((r) => ({
      ...(JSON.parse(r.body) as Event),
      sequence: r.sequence,
    }));
  }
  tailEvents(goalId: string, limit = 150): Event[] {
    const rows = this.db
      .prepare(
        "SELECT sequence,body FROM events WHERE goal_id=? ORDER BY sequence DESC LIMIT ?",
      )
      .all(goalId, Math.min(1000, Math.max(1, limit))) as {
      sequence: number;
      body: string;
    }[];
    return rows
      .reverse()
      .map((r) => ({ ...(JSON.parse(r.body) as Event), sequence: r.sequence }));
  }
  lastSequence(goalId: string): number {
    return (
      this.db
        .prepare(
          "SELECT COALESCE(MAX(sequence),0) AS value FROM events WHERE goal_id=?",
        )
        .get(goalId) as { value: number }
    ).value;
  }
  lock(workspaceId: string, owner: string, pid: number): void {
    this.transaction(() => {
      const current = this.db
        .prepare("SELECT owner,pid FROM process_locks WHERE workspace_id=?")
        .get(workspaceId) as { owner: string; pid: number } | undefined;
      if (current) {
        let alive = true;
        try {
          process.kill(current.pid, 0);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ESRCH") alive = false;
        }
        if (alive)
          throw new Blocked(
            "WORKSPACE_BUSY",
            `Another controller (${current.pid}) owns this workspace`,
          );
      }
      this.db
        .prepare(
          "INSERT INTO process_locks VALUES(?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET owner=excluded.owner,pid=excluded.pid,created_at=excluded.created_at",
        )
        .run(workspaceId, owner, pid, now());
    });
  }
  unlock(workspaceId: string, owner: string): void {
    this.db
      .prepare("DELETE FROM process_locks WHERE workspace_id=? AND owner=?")
      .run(workspaceId, owner);
  }
  close(): void {
    this.db.close();
  }
}
