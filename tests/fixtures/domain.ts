import type { Goal, Plan, PlanProposal, Task } from "../../src/domain/model.js";
import { PlanProposalSchema } from "../../src/domain/model.js";
import { defaultConfig } from "../../src/config/schema.js";
import { hash, now } from "../../src/domain/util.js";
export const proposal = (): PlanProposal =>
  PlanProposalSchema.parse({
    summary: "Create a tested example feature",
    architecture: ["Separate interfaces and storage"],
    criteria: [{ id: "works", description: "The example responds correctly" }],
    verification: [
      {
        id: "test",
        title: "Run tests",
        kind: "command",
        criteriaIds: ["works"],
        command: { executable: "node", args: ["--test"] },
      },
    ],
    tasks: [
      {
        id: "implement",
        title: "Implement example",
        description: "Implement the tested example feature",
        type: "general",
        assignedAgent: "general",
        ownedSurfaces: ["src"],
        acceptanceCriteria: ["works"],
      },
    ],
  });
export function makeGoal(): Goal {
  return {
    id: "goal-test",
    schemaVersion: 1,
    originalRequest: "Create tested example",
    state: "RECEIVED",
    workspaceId: "workspace-test",
    source: "/tmp/source",
    root: "/tmp/control",
    baseline: "base",
    sourceFingerprint: "fingerprint",
    candidateRevision: "rev1",
    criteria: proposal().criteria,
    activePlanId: "plan-test",
    configSnapshot: defaultConfig(),
    configSnapshotHash: hash(defaultConfig()),
    iteration: 0,
    plannerCalls: 0,
    oracleCalls: 0,
    providerRequests: 0,
    noProgress: 0,
    activeMs: 0,
    privacyClass: "public",
    mode: "mock",
    createdAt: now(),
    updatedAt: now(),
  };
}
export function makeTask(patch: Partial<Task> = {}): Task {
  return {
    ...proposal().tasks[0]!,
    goalId: "goal-test",
    planId: "plan-test",
    status: "pending",
    model: "grok-4.6",
    reasoning: "medium",
    baseRevision: "rev1",
    dependencyOutputVersions: {},
    attempt: 0,
    maxAttempts: 3,
    outputs: [],
    evidence: [],
    triggerFailureIds: [],
    createdAt: now(),
    updatedAt: now(),
    ...patch,
  };
}
export function makePlan(): Plan {
  return {
    ...proposal(),
    id: "plan-test",
    goalId: "goal-test",
    version: 1,
    basedOnRevision: "rev1",
    generatedByRunId: "run-test",
    createdAt: now(),
    hash: hash(proposal()),
  };
}
