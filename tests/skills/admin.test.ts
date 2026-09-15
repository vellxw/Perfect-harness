import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { defaultConfig } from "../../src/config/schema.js";
import { StudioAdmin } from "../../src/skills/admin.js";
import {
  evaluateSelection,
  compareBehavior,
} from "../../src/skills/evaluator.js";
import { builtinSkills } from "../../src/skills/library.js";

test("administración real: global off, asignación por equipo, versión y lock fuera del workspace", async () => {
  const root = await realpath(
      await mkdtemp(join(tmpdir(), "perfect-skill-admin-")),
    ),
    home = join(root, "state"),
    store = new SqliteStore(join(home, "state.sqlite")),
    a = new StudioAdmin(store, home),
    c = defaultConfig();
  try {
    const p = a.panel(root, c);
    assert.equal(p.masterEnabled, true);
    await a.perform(root, c, { command: "master", enabled: false });
    assert.equal(a.panel(root, c).masterEnabled, false);
    await assert.rejects(
      () => a.perform(root, c, { command: "master", enabled: true }),
      /SKILL_CONFIRMATION/,
    );
    await a.perform(root, c, {
      command: "master",
      enabled: true,
      confirmation: "ACTIVAR",
    });
    await a.perform(root, c, {
      command: "assign",
      expectedHash: p.hash,
      assignment: {
        skillId: "perfect-beam-design",
        scope: "set",
        target: "backend",
        decision: "disable",
      },
    });
    assert.ok(
      a
        .panel(root, c)
        .config.skills.assignments.some((x) => x.target === "backend"),
    );
    await assert.rejects(
      () =>
        a.perform(root, c, {
          command: "skill-mode",
          mode: "manual",
          expectedHash: p.hash,
        }),
      /STUDIO_CONFLICT/,
    );
    const result = await a.perform(root, c, { command: "lock" });
    assert.ok(result.path?.startsWith(home));
    const next = a.panel(root, c);
    await a.perform(root, c, {
      command: "set",
      expectedHash: next.hash,
      set: { id: "custom-team", name: "Equipo propio", enabled: true },
    });
    assert.ok(
      a.panel(root, c).config.sets.some((s) => s.name === "Equipo propio"),
    );
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
test("evaluación separa activación léxica, partición reservada y evidencia de mocks", () => {
  const skill = builtinSkills().find(
    (s) => s.skillId === "perfect-beam-design",
  )!;
  const cases = [
    { id: "a", prompt: "poner beam", expected: true, partition: "development" },
    { id: "b", prompt: "crear SQL", expected: false, partition: "development" },
    { id: "c", prompt: "borde luminoso", expected: true, partition: "holdout" },
    { id: "d", prompt: "juego offline", expected: false, partition: "holdout" },
  ];
  const result = evaluateSelection(skill, "workspace", cases, "holdout");
  assert.equal(result.status, "passed");
  assert.deepEqual(
    result.checks.map((c) => c.name),
    ["c", "d"],
  );
  const pair = [
    {
      id: "a",
      condition: "baseline" as const,
      caseId: "case",
      partition: "holdout" as const,
      bindingHash: "m",
      toolsHash: "t",
      inputHash: "i",
      outputHash: "one",
      passed: true,
      source: "mock" as const,
      latencyMs: 1,
    },
    {
      id: "b",
      condition: "skill" as const,
      caseId: "case",
      partition: "holdout" as const,
      bindingHash: "m",
      toolsHash: "t",
      inputHash: "i",
      outputHash: "two",
      passed: true,
      source: "mock" as const,
      latencyMs: 1,
    },
  ];
  assert.equal(
    compareBehavior(skill, "workspace", pair, "holdout").status,
    "not-tested",
  );
  assert.throws(
    () =>
      compareBehavior(
        skill,
        "workspace",
        [{ ...pair[0]!, bindingHash: "other" }, pair[1]!],
        "holdout",
      ),
    /EVAL_PAIR/,
  );
});
