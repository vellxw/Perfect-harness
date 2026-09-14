import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { defaultConfig } from "../../src/config/schema.js";
import { createGoal } from "../../src/application/goals.js";
import {
  Orchestrator,
  acceptanceHash,
} from "../../src/application/orchestrator.js";
import { ScriptedRuntime } from "../fake-provider/scripted.js";
import { NodeFixtureRunner } from "../fixtures/node-runner.js";
import { proposal } from "../fixtures/domain.js";
import { id, now } from "../../src/domain/util.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "perfect-loop-")),
    source = join(root, "source"),
    home = join(root, "home");
  await mkdir(join(source, "tests"), { recursive: true });
  await writeFile(
    join(source, "tests", "answer.test.mjs"),
    `import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';test('required behavior',async()=>{const value=JSON.parse(await readFile('src/answer.json','utf8'));assert.equal(value.answer,42);});`,
  );
  const config = defaultConfig();
  config.reviewPolicy.finalFeatureReview = false;
  const plan = proposal();
  plan.verification[0]!.command!.args = ["--test", "tests/answer.test.mjs"];
  const store = new SqliteStore(join(home, "state.sqlite"));
  const goal = await createGoal(
    {
      request: "Produce answer 42 and prove it with the existing test.",
      source,
      home,
      config,
      privacy: "public",
      mode: "mock",
    },
    store,
  );
  return { root, source, home, config, plan, store, goal };
}
test("real code test fails, creates repair, re-verifies and reaches evidence-based DONE", async () => {
  const f = await fixture();
  let writes = 0;
  const runtime = new ScriptedRuntime(async (request) => {
    if (request.run.agentDefinitionId === "planner") return f.plan;
    writes++;
    await request.services.writeFile!(
      "src/answer.json",
      JSON.stringify({ answer: writes === 1 ? 41 : 42 }),
    );
    return {
      summary: "Implementation candidate prepared",
      outputs: ["src/answer.json"],
    };
  });
  try {
    const finished = await new Orchestrator(
      f.store,
      runtime,
      new NodeFixtureRunner(),
    ).run(f.goal.id, { acceptPlan: true });
    assert.equal(
      finished.state,
      "DONE",
      finished.terminalReason ?? finished.pauseReason,
    );
    assert.equal(writes, 2);
    assert.equal(finished.iteration, 2);
    assert.ok(
      f.store.events(f.goal.id).some((e) => e.type === "verification.failed"),
    );
    assert.ok(
      f.store.events(f.goal.id).some((e) => e.type === "repair.created"),
    );
    assert.ok(
      f.store
        .list("verifications", f.goal.id)
        .some((v) => v.status === "failed"),
    );
    assert.equal(
      f.store.list("verifications", f.goal.id).at(-1)?.status,
      "passed",
    );
    assert.ok(
      f.store
        .list("runs", f.goal.id)
        .every((r) => r.routeBinding.provider === "perfect-mock"),
    );
    await assert.rejects(() => readFile(join(f.source, "src", "answer.json")));
  } finally {
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});
test("plan approval and resume survive closing SQLite", async () => {
  const f = await fixture();
  const runtime = new ScriptedRuntime(async (request) => {
    if (request.run.agentDefinitionId === "planner") return f.plan;
    await request.services.writeFile!("src/answer.json", '{"answer":42}');
    return {
      summary: "Prepared the required answer",
      outputs: ["src/answer.json"],
    };
  });
  let store = f.store;
  try {
    const paused = await new Orchestrator(
      store,
      runtime,
      new NodeFixtureRunner(),
    ).run(f.goal.id);
    assert.equal(paused.state, "PAUSED");
    assert.match(paused.pauseReason ?? "", /PLAN_APPROVAL/);
    const plan = store.get("plans", paused.activePlanId!)!;
    store.put(
      "approvals",
      {
        id: id("approval"),
        goalId: f.goal.id,
        kind: "plan",
        scopeHash: acceptanceHash(plan),
        approvedAt: now(),
        actor: "user",
      },
      "plan.user_authorized",
    );
    store.close();
    store = new SqliteStore(join(f.home, "state.sqlite"));
    const done = await new Orchestrator(
      store,
      runtime,
      new NodeFixtureRunner(),
    ).run(f.goal.id);
    assert.equal(done.state, "DONE", done.pauseReason ?? done.terminalReason);
    assert.equal(
      runtime.invocations.filter((r) => r.run.agentDefinitionId === "planner")
        .length,
      1,
    );
  } finally {
    store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});
test("user abort cancels the active worker without deleting its workspace", async () => {
  const f = await fixture();
  const runtime = new ScriptedRuntime(async (request) => {
    if (request.run.agentDefinitionId === "planner") return f.plan;
    await new Promise<void>((_resolve, reject) =>
      request.signal.addEventListener(
        "abort",
        () => reject(request.signal.reason),
        { once: true },
      ),
    );
    return { summary: "Not reachable", outputs: [] };
  });
  try {
    const running = new Orchestrator(
      f.store,
      runtime,
      new NodeFixtureRunner(),
    ).run(f.goal.id, { acceptPlan: true });
    for (
      let i = 0;
      i < 100 &&
      !runtime.invocations.some((r) => r.run.agentDefinitionId === "general");
      i++
    )
      await new Promise((r) => setTimeout(r, 20));
    const current = f.store.get("goals", f.goal.id)!;
    f.store.put(
      "goals",
      { ...current, controlRequest: "abort" },
      "goal.abort_requested",
      "user",
    );
    const aborted = await running;
    assert.equal(aborted.state, "ABORTED");
    assert.ok(
      f.store.list("runs", f.goal.id).some((r) => r.status === "interrupted"),
    );
    assert.ok(await readFile(join(f.goal.root, "report.json"), "utf8"));
  } finally {
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("repeated failure replans the accepted producer, preserves retry lineage, and executes a real third attempt", async () => {
  const f = await fixture();
  let writes = 0;
  const runtime = new ScriptedRuntime(async (request) => {
    if (request.run.agentDefinitionId === "planner") return f.plan;
    writes++;
    await request.services.writeFile!(
      "src/answer.json",
      JSON.stringify({ answer: writes < 3 ? 41 : 42 }),
    );
    return {
      summary: "Candidate with retained attempt history",
      outputs: ["src/answer.json"],
    };
  });
  try {
    const goal = await new Orchestrator(
      f.store,
      runtime,
      new NodeFixtureRunner(),
    ).run(f.goal.id, { acceptPlan: true });
    assert.equal(goal.state, "DONE", goal.pauseReason ?? goal.terminalReason);
    assert.equal(writes, 3);
    assert.equal(
      goal.plannerCalls,
      2,
      "the identical second failure must invoke the Planner",
    );
    assert.equal(
      f.store.list("tasks", goal.id).reduce((n, t) => n + t.attempt, 0),
      3,
    );
    const failures = f.store.list("failures", goal.id);
    assert.equal(failures[0]?.signature, failures[1]?.signature);
    assert.equal(failures[1]?.occurrences, 2);
    assert.equal(f.store.list("plans", goal.id).length, 3);
  } finally {
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("another plan is not progress; no-progress budget terminates a stable failing loop", async () => {
  const f = await fixture();
  // A deliberately larger retry allowance isolates the no-progress invariant.
  f.config.limits.maxTaskRetries = 8;
  f.config.limits.maxNoProgressIterations = 1;
  const { hash } = await import("../../src/domain/util.js");
  f.store.put(
    "goals",
    { ...f.goal, configSnapshot: f.config, configSnapshotHash: hash(f.config) },
    "fixture.configured",
  );
  const runtime = new ScriptedRuntime(async (request) => {
    if (request.run.agentDefinitionId === "planner") return f.plan;
    await request.services.writeFile!("src/answer.json", '{"answer":41}');
    return { summary: "Same unverified result", outputs: ["src/answer.json"] };
  });
  try {
    const goal = await new Orchestrator(
      f.store,
      runtime,
      new NodeFixtureRunner(),
    ).run(f.goal.id, { acceptPlan: true });
    assert.equal(goal.state, "FAILED");
    assert.match(goal.terminalReason ?? "", /NO_PROGRESS_LIMIT/);
    assert.equal(goal.plannerCalls, 2);
    assert.equal(goal.oracleCalls, 0);
  } finally {
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("browser infrastructure failure preserves its evidence and pauses without a source repair", async () => {
  const f = await fixture();
  const runtime = new ScriptedRuntime(async (request) => {
    if (request.run.agentDefinitionId === "planner") return f.plan;
    await request.services.writeFile!("src/answer.json", '{"answer":42}');
    return {
      summary: "Valid implementation candidate",
      outputs: ["src/answer.json"],
    };
  });
  class BrokenInfrastructure extends NodeFixtureRunner {
    override async command() {
      return {
        code: 1,
        stdout: "",
        stderr: "net::ERR_SSL_PROTOCOL_ERROR at http://app:3000/",
        artifacts: [],
      };
    }
  }
  try {
    const goal = await new Orchestrator(
      f.store,
      runtime,
      new BrokenInfrastructure(),
    ).run(f.goal.id, { acceptPlan: true });
    assert.equal(goal.state, "PAUSED");
    assert.match(goal.pauseReason ?? "", /VERIFICATION_INFRASTRUCTURE/);
    assert.ok(
      f.store.list("evidence", goal.id).some((e) => e.producer === "runner"),
    );
    assert.equal(
      f.store.events(goal.id).filter((e) => e.type === "repair.created").length,
      0,
    );
    assert.equal(goal.plannerCalls, 1);
  } finally {
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("resume rejects candidate drift without a recorded integration intent", async () => {
  const f = await fixture();
  const { recoverGoal } = await import("../../src/application/recovery.js");
  const { git } = await import("../../src/adapters/git/process.js");
  const repo = new (
    await import("../../src/adapters/git/workspace.js")
  ).GitWorkspace(f.goal.root, f.config).repo;
  try {
    // A manual edit must not become a newly accepted baseline on resume.
    await writeFile(join(repo, "unexpected.txt"), "unverified");
    await assert.rejects(
      () => recoverGoal(f.goal, f.store, new NodeFixtureRunner(), f.config),
      /RECOVERY_DIRTY/,
    );
    await git(repo, ["add", "unexpected.txt"]);
    await git(repo, ["commit", "-m", "Unverified manual change"]);
    await assert.rejects(
      () => recoverGoal(f.goal, f.store, new NodeFixtureRunner(), f.config),
      /RECOVERY_REVISION/,
    );
    assert.equal(
      f.store.get("goals", f.goal.id)!.candidateRevision,
      f.goal.candidateRevision,
    );
  } finally {
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});
