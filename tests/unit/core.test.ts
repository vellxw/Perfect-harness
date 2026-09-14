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
    tasks: [makeTask({ status: "accepted" })],
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
