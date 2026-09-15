import test from "node:test";
import assert from "node:assert/strict";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { defaultConfig } from "../../src/config/schema.js";
import { SkillsRegistry } from "../../src/skills/registry.js";
import { SkillSession } from "../../src/skills/session.js";
import { resolveProfile } from "../../src/agents/profiles.js";
import {
  control,
  selectManual,
  selectionClosure,
  policyLease,
  epoch,
} from "../../src/skills/control.js";
import type { Goal, Role } from "../../src/domain/model.js";

test("manual vacío, versión fijada, fuera del equipo y revocación OFF/ON", async () => {
  const store = new SqliteStore(":memory:"),
    base = defaultConfig(),
    registry = new SkillsRegistry(store),
    workspace = "/synthetic/manual";
  try {
    const old = registry.get(workspace, base),
      cfg = structuredClone(old.config);
    cfg.skills.mode = "manual";
    registry.update(workspace, base, old.hash, cfg);
    const make = (role: Role = "backend") => {
      const g = {
        id: "manual-goal",
        source: workspace,
        privacyClass: "private",
        mode: "mock",
        state: "PAUSED",
      } as Goal;
      g.studioSnapshotId = registry.snapshot(g, base).id;
      return new SkillSession(
        store,
        g,
        base,
        resolveProfile(cfg, role),
        "manual-run",
        new AbortController().signal,
      );
    };
    const empty = make();
    assert.deepEqual(empty.list(), []);
    assert.throws(() => empty.load("perfect-postgres-backend"), /SKILL_SCOPE/);
    const release = store
      .list("skillReleases")
      .find((r) => r.skillId === "perfect-postgres-backend")!;
    const pins = selectionClosure(store, workspace, release.id);
    assert.throws(
      () =>
        selectManual(
          store,
          workspace,
          base,
          release.id,
          release.hash,
          true,
          control(store, workspace).epoch,
          [],
        ),
      /DEPENDENCY_APPROVAL/,
    );
    selectManual(
      store,
      workspace,
      base,
      release.id,
      release.hash,
      true,
      control(store, workspace).epoch,
      pins,
    );
    const chosen = make();
    assert.equal(chosen.list().length, 1);
    assert.match(chosen.auto("tarea manual"), /PostgreSQL/);
    assert.deepEqual(make("frontend").list(), []);
    assert.throws(() => chosen.load("perfect-frontend-quality"), /SKILL_SCOPE/);
    const starting = epoch(store, workspace),
      lease = policyLease(store, workspace, new AbortController().signal);
    registry.setMaster(false);
    registry.setMaster(true);
    assert.notEqual(epoch(store, workspace), starting);
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(lease.signal.aborted, true);
    lease.close();
    assert.throws(() => chosen.list(), /SKILL_POLICY_REVOKED/);
  } finally {
    store.close();
  }
});

test("una nueva versión no hereda selección y los snapshots no se reescriben", () => {
  const store = new SqliteStore(":memory:"),
    base = defaultConfig(),
    registry = new SkillsRegistry(store),
    workspace = "/synthetic/version";
  try {
    const original = registry.get(workspace, base),
      cfg = structuredClone(original.config);
    cfg.skills.mode = "manual";
    registry.update(workspace, base, original.hash, cfg);
    const r = store
      .list("skillReleases")
      .find((r) => r.skillId === "perfect-postgres-backend")!;
    selectManual(
      store,
      workspace,
      base,
      r.id,
      r.hash,
      true,
      control(store, workspace).epoch,
      selectionClosure(store, workspace, r.id),
    );
    const g = {
      id: "goal-version",
      source: workspace,
      privacyClass: "private",
      mode: "mock",
      state: "PAUSED",
    } as Goal;
    const snap = registry.snapshot(g, base);
    g.studioSnapshotId = snap.id;
    const selection = store
      .list("skillSelections")
      .find((s) => s.releaseId === r.id)!;
    store.put(
      "skillSelections",
      { ...selection, releaseId: "new-version", reviewedHash: "f".repeat(64) },
      "test.changed",
    );
    const session = new SkillSession(
      store,
      g,
      base,
      resolveProfile(cfg, "backend"),
      "run-version",
      new AbortController().signal,
    );
    assert.deepEqual(session.list(), []);
    assert.deepEqual(store.get("studioSnapshots", snap.id), snap);
  } finally {
    store.close();
  }
});
