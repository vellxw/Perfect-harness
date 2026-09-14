import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan, readyTasks } from "../../src/domain/task-graph.js";
import { transition } from "../../src/domain/goal-state-machine.js";
import { judge } from "../../src/domain/evidence-judge.js";
import {
  escalation,
  failureSignature,
  needsOracle,
} from "../../src/application/policies.js";
import { selectWave } from "../../src/application/scheduler.js";
import { defaultConfig } from "../../src/config/schema.js";
import { makeGoal, makePlan, makeTask, proposal } from "../fixtures/domain.js";
import type { Evidence, VerificationResult } from "../../src/domain/model.js";

test("accepted plan has a valid DAG", () =>
  assert.equal(validatePlan(proposal()).tasks.length, 1));
test("planner cannot return a cycle", () => {
  const p = proposal();
  p.tasks[0]!.dependencies = ["implement"];
  assert.throws(() => validatePlan(p), /dependency/);
});
test("planner cannot omit verification coverage", () => {
  const p = proposal();
  p.criteria.push({
    id: "extra",
    description: "An uncovered requirement",
    mandatory: true,
    kind: "functional",
  });
  assert.throws(() => validatePlan(p), /Uncovered/);
});
test("replan cannot change accepted criteria", () => {
  const p = proposal();
  p.criteria[0]!.description = "Weaker replacement criterion";
  assert.throws(() => validatePlan(p, proposal()), /replace/);
});
test("frontend routing cannot inherit another role", () => {
  const p = proposal();
  p.tasks[0]!.type = "frontend";
  assert.throws(() => validatePlan(p), /Frontend/);
});
test("state machine rejects arbitrary DONE", () =>
  assert.throws(() => transition(makeGoal(), "DONE"), /Illegal/));
test("only Judge gate can complete", () =>
  assert.throws(
    () => transition({ ...makeGoal(), state: "JUDGE" }, "DONE"),
    /Judge/,
  ));
test("terminal state cannot restart silently", () =>
  assert.throws(
    () => transition({ ...makeGoal(), state: "DONE" }, "ASSIGN"),
    /Terminal/,
  ));
test("dependencies wait for acceptance, not a completed model turn", () => {
  const a = makeTask({ id: "a", status: "produced" }),
    b = makeTask({ id: "b", dependencies: ["a"] });
  assert.equal(readyTasks([a, b]).length, 0);
  a.status = "accepted";
  assert.equal(readyTasks([a, b])[0]?.id, "b");
});
test("scheduler respects overlapping ownership and account limits", () => {
  const cfg = defaultConfig();
  const a = makeTask({ id: "a" }),
    b = makeTask({ id: "b" }),
    c = makeTask({ id: "c", ownedSurfaces: ["docs"] });
  assert.equal(selectWave([a, b, c], cfg).length, 2);
  cfg.parallelism.perAccount["xai-personal"] = 1;
  assert.equal(selectWave([a, b, c], cfg).length, 1);
});
test("same error across ports has same signature", () =>
  assert.equal(
    failureSignature("test", "connect localhost:3333").signature,
    failureSignature("test", "connect localhost:4444").signature,
  ));
test("second repeated failure escalates to planner", () =>
  assert.equal(escalation(2, false, 1), "planner"));
test("critical issue escalates to Oracle", () =>
  assert.equal(escalation(1, true, 1), "oracle"));
test("mechanical task does not require optional Oracle", () =>
  assert.equal(needsOracle(proposal(), [makeTask()], false), false));
test("payments require Oracle even with final review disabled", () =>
  assert.equal(
    needsOracle(
      proposal(),
      [makeTask({ description: "Implement payments securely" })],
      false,
    ),
    true,
  ));

function judgmentInput() {
  const evidence: Evidence = {
    id: "evidence-test",
    goalId: "goal-test",
    verificationId: "result-test",
    kind: "command",
    artifactRef: "/artifact",
    contentHash: "hash",
    producer: "runner",
    revision: "rev1",
    environmentHash: "env",
    criteriaIds: ["works"],
    capturedAt: "now",
    validity: "valid",
  };
  const result: VerificationResult = {
    id: "result-test",
    goalId: "goal-test",
    specId: "test",
    revision: "rev1",
    status: "passed",
    exitCode: 0,
    evidenceIds: [evidence.id],
    startedAt: "now",
    endedAt: "now",
    failureIds: [],
    summary: "passed",
  };
  return {
    goal: makeGoal(),
    plan: makePlan(),
    tasks: [makeTask({ status: "accepted", resultRevision: "rev1" })],
    evidence: [evidence],
    results: [result],
    reviews: [],
    requiredReviews: [],
    artifactsValid: true,
    routingValid: true,
  };
}
test("Judge accepts current runner evidence", () =>
  assert.equal(judge(judgmentInput()).done, true));
test("Judge rejects stale evidence", () => {
  const input = judgmentInput();
  input.evidence[0]!.revision = "old";
  assert.equal(judge(input).done, false);
});
test("Judge rejects worker-written evidence", () => {
  const input = judgmentInput();
  input.evidence[0]!.producer = "controller";
  assert.equal(judge(input).done, false);
});
test("Judge rejects skipped tests", () => {
  const input = judgmentInput();
  input.results[0]!.status = "skipped";
  assert.equal(judge(input).done, false);
});
test("Judge rejects modified artifacts", () =>
  assert.equal(
    judge({ ...judgmentInput(), artifactsValid: false }).done,
    false,
  ));

test("Judge rejects missing active-plan tasks even if another task claims acceptance", () => {
  const input = judgmentInput();
  input.tasks[0]!.id = "different";
  assert.equal(judge(input).done, false);
});
test("Judge refuses superseded tasks still required by the active plan", () => {
  const input = judgmentInput();
  input.tasks[0]!.status = "superseded";
  assert.equal(judge(input).done, false);
});
test("Judge rejects evidence borrowed from another verifier execution", () => {
  const input = judgmentInput();
  input.evidence[0]!.verificationId = "other-run";
  assert.equal(judge(input).done, false);
});
test("Judge requires a real successful exit, not merely a passed label", () => {
  const input = judgmentInput();
  input.results[0]!.exitCode = 1;
  assert.equal(judge(input).done, false);
});
test("Judge refuses a mutated acceptance contract", () => {
  const input = judgmentInput();
  input.plan.criteria[0]!.description = "A weaker unapproved condition";
  assert.equal(judge(input).done, false);
});
test("diagnostic Oracle advice never satisfies the final acceptance review", () => {
  const input = judgmentInput();
  const proof = {
    ...input.evidence[0]!,
    id: "review-proof",
    producer: "reviewer" as const,
    runId: "oracle-run",
    kind: "review" as const,
  };
  const review = {
    id: "review-test",
    goalId: input.goal.id,
    runId: "oracle-run",
    revision: "rev1",
    role: "oracle" as const,
    purpose: "diagnostic" as const,
    decision: "approve" as const,
    summary: "Diagnostic advice, not final approval",
    findings: [],
    evidenceIds: [proof.id],
    createdAt: "now",
  };
  assert.equal(
    judge({
      ...input,
      evidence: [...input.evidence, proof],
      reviews: [review],
      requiredReviews: ["oracle"],
    }).done,
    false,
  );
  assert.equal(
    judge({
      ...input,
      evidence: [...input.evidence, proof],
      reviews: [{ ...review, purpose: "acceptance" }],
      requiredReviews: ["oracle"],
    }).done,
    true,
  );
});
test("TAP timing and worktree attempt IDs cannot hide the same failure", () => {
  assert.equal(
    failureSignature(
      "test",
      "duration_ms: 12.456\nerror at worktrees/task-one-1/src/test.ts\nFailure (5.6ms)",
    ).signature,
    failureSignature(
      "test",
      "duration_ms: 99.001\nerror at worktrees/repair-two-2/src/test.ts\nFailure (200ms)",
    ).signature,
  );
});

test("UUIDs and authentication assertions do not masquerade as provider outages", async () => {
  const { classifyFailure } = await import("../../src/application/policies.js");
  assert.equal(
    classifyFailure(
      "AssertionError: auth endpoint must return HTTP 401; goal-4016-4030-4290",
    ),
    "implementation",
  );
  assert.equal(
    classifyFailure(
      "file:///tmp/goal-4016-4030-4290/src/ui.ts:1 expected button",
    ),
    "implementation",
  );
  assert.equal(
    classifyFailure("PROVIDER_FAILED: HTTP 429 quota exhausted"),
    "provider",
  );
});

test("task classification can raise confidentiality but cannot lower the goal", async () => {
  const { effectivePrivacy } = await import("../../src/domain/model.js");
  assert.equal(effectivePrivacy("public", "confidential"), "confidential");
  assert.equal(effectivePrivacy("private", "public"), "private");
  assert.equal(effectivePrivacy("confidential", "private"), "confidential");
});
