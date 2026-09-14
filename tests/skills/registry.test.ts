import test from "node:test";
import assert from "node:assert/strict";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { defaultConfig } from "../../src/config/schema.js";
import { SkillsRegistry } from "../../src/skills/registry.js";
import { SkillSession } from "../../src/skills/session.js";
import { resolveProfile } from "../../src/agents/profiles.js";
import { builtinSkills } from "../../src/skills/library.js";
import type { Goal } from "../../src/domain/model.js";

function setup() {
  const store = new SqliteStore(":memory:"),
    base = defaultConfig(),
    registry = new SkillsRegistry(store),
    workspace = "/synthetic/workspace";
  const record = registry.get(workspace, base);
  const goal = {
    id: "goal-test",
    source: workspace,
    privacyClass: "private",
    mode: "mock",
    state: "PAUSED",
  } as Goal;
  goal.studioSnapshotId = registry.snapshot(goal, base).id;
  return { store, base, registry, record, goal };
}
test("catálogo/backend, activaciones inmutables, recursos bajo demanda y master off", () => {
  const x = setup();
  try {
    const profile = resolveProfile(x.record.config, "backend");
    const session = new SkillSession(
      x.store,
      x.goal,
      x.base,
      profile,
      "run-test",
      new AbortController().signal,
    );
    assert.ok(
      session
        .list()
        .every((s) => !s.id.includes("frontend") && !s.id.includes("beam")),
    );
    const loaded = session.auto("implementar API postgres con transacciones");
    assert.match(loaded, /PostgreSQL/);
    assert.equal(x.store.list("skillActivations", x.goal.id).length, 1);
    session.load("perfect-postgres-backend");
    assert.equal(x.store.list("skillActivations", x.goal.id).length, 1);
    assert.match(
      session.read("perfect-postgres-backend", "references/transactions.md"),
      /transaction/,
    );
    assert.throws(
      () => session.read("perfect-postgres-backend", "../other"),
      /SKILL_PATH/,
    );
    x.registry.setMaster(false);
    assert.throws(() => session.load("perfect-postgres-backend"), /SKILLS_OFF/);
    const fresh = new SkillSession(
      x.store,
      x.goal,
      x.base,
      profile,
      "run-fresh",
      new AbortController().signal,
    );
    assert.deepEqual(fresh.list(), []);
    assert.throws(() => fresh.load("perfect-postgres-backend"), /SKILL_SCOPE/);
  } finally {
    x.store.close();
  }
});
test("cambiar preferencias invalida sesión pero no reescribe snapshot ni bindings", () => {
  const x = setup();
  try {
    const profile = resolveProfile(x.record.config, "backend"),
      session = new SkillSession(
        x.store,
        x.goal,
        x.base,
        profile,
        "run-test",
        new AbortController().signal,
      );
    const before = x.registry.forGoal(x.goal, x.base);
    const updated = structuredClone(x.record.config);
    updated.skills.mode = "manual";
    x.registry.update(x.goal.source, x.base, x.record.hash, updated);
    assert.throws(() => session.list(), /SKILL_SESSION_STALE/);
    assert.equal(
      x.registry.forGoal(x.goal, x.base).skills.mode,
      before.skills.mode,
    );
    assert.throws(
      () => x.registry.update(x.goal.source, x.base, x.record.hash, updated),
      /STUDIO_CONFLICT/,
    );
  } finally {
    x.store.close();
  }
});
test("licencias desconocidas y autor no aprueban un borrador; el lock fija hashes", () => {
  const x = setup();
  try {
    const r = builtinSkills()[0]!;
    const draft = {
      ...r,
      id: "draft-release",
      creatorRunId: "creator",
      provenance: {
        ...r.provenance,
        kind: "draft" as const,
        redistribution: "unknown" as const,
      },
    };
    x.registry.quarantine(draft, x.goal.source);
    assert.throws(
      () => x.registry.approve(x.goal.source, draft.id, draft.hash, "creator"),
      /SKILL_SELF_APPROVAL/,
    );
    assert.throws(
      () => x.registry.approve(x.goal.source, draft.id, draft.hash, "user"),
      /SKILL_LICENSE/,
    );
    const lock = x.registry.lock(x.goal.source);
    assert.ok(lock.entries.length >= 8);
    assert.ok(lock.entries.every((e) => e.hash.length === 64));
    const snapshot = x.store.get("studioSnapshots", x.goal.studioSnapshotId!)!;
    assert.throws(
      () =>
        x.store.put("studioSnapshots", { ...snapshot, revision: 900 }, "bad"),
      /Immutable/,
    );
  } finally {
    x.store.close();
  }
});
