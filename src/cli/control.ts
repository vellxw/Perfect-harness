import type { CliContext } from "./context.js";
import { goalConfig } from "./context.js";
import type { Goal, OperationIntent } from "../domain/model.js";
import { terminal, transition } from "../domain/goal-state-machine.js";
import { acceptanceHash } from "../application/orchestrator.js";
import { recoverGoal } from "../application/recovery.js";
import { lineageAttempts } from "../application/failures.js";
import { DockerRunner } from "../adapters/sandbox/docker.js";
import { GitWorkspace } from "../adapters/git/workspace.js";
import { join } from "node:path";
import { id, now, hash, Blocked } from "../domain/util.js";

export async function controlGoal(
  context: CliContext,
  goal: Goal,
  action: "pause" | "abort",
): Promise<Goal> {
  if (terminal(goal.state)) return goal;
  const owner = id("user-control");
  try {
    context.store.lock(goal.workspaceId, owner, process.pid);
  } catch (error) {
    if (!(error instanceof Blocked) || error.code !== "WORKSPACE_BUSY")
      throw error;
    const next = {
      ...context.store.get("goals", goal.id)!,
      controlRequest: action,
      updatedAt: now(),
    };
    context.store.put("goals", next, `goal.${action}_requested`, "user");
    return next;
  }
  try {
    const config = goalConfig(goal),
      runner = new DockerRunner(
        config,
        context.store,
        join(context.home, "sandbox"),
      );
    await recoverGoal(goal, context.store, runner, config);
    const next = transition(
      context.store.get("goals", goal.id)!,
      action === "abort" ? "ABORTED" : "PAUSED",
      `User requested ${action}`,
    );
    context.store.put("goals", next, `goal.${action}ed`, "user");
    return next;
  } finally {
    context.store.unlock(goal.workspaceId, owner);
  }
}
export function approvePlan(context: CliContext, goal: Goal): void {
  const plan = context.store.get("plans", goal.activePlanId ?? "");
  if (!plan)
    throw new Blocked("PLAN_MISSING", "Generate and inspect a plan first");
  context.store.put(
    "approvals",
    {
      id: id("approval"),
      goalId: goal.id,
      kind: "plan",
      scopeHash: acceptanceHash(plan),
      approvedAt: now(),
      actor: "user",
    },
    "plan.user_authorized",
    "user",
  );
}
export function approveCriterion(
  context: CliContext,
  goal: Goal,
  criterionId: string,
): void {
  if (!goal.criteria.some((c) => c.id === criterionId && c.kind === "human"))
    throw new Blocked(
      "CRITERION_INVALID",
      "Only explicitly human-reviewed criteria accept this approval",
    );
  context.store.put(
    "approvals",
    {
      id: id("approval"),
      goalId: goal.id,
      kind: "human",
      scopeHash: hash({ criterionId, revision: goal.candidateRevision }),
      approvedAt: now(),
      actor: "user",
    },
    "criterion.user_approved",
    "user",
  );
}
export async function retryTask(
  context: CliContext,
  taskId: string,
): Promise<void> {
  const task = context.store.get("tasks", taskId);
  if (!task) throw new Blocked("TASK_NOT_FOUND", taskId);
  const goal = context.goal(task.goalId),
    config = goalConfig(goal);
  if (goal.state !== "PAUSED")
    throw new Blocked(
      "RETRY_STATE",
      "Pause the goal before retrying. Terminal goals are immutable; create a new continuation goal instead.",
    );
  if (!["failed", "blocked"].includes(task.status))
    throw new Blocked("RETRY_STATE", `Task status is ${task.status}`);
  if (
    task.attempt >= task.maxAttempts ||
    lineageAttempts(task, context.store) >= config.limits.maxTaskRetries + 1
  )
    throw new Blocked(
      "RETRY_LIMIT",
      "Retry cannot reset task or lineage counters",
    );
  const owner = id("retry");
  context.store.lock(goal.workspaceId, owner, process.pid);
  try {
    await recoverGoal(
      goal,
      context.store,
      new DockerRunner(config, context.store, join(context.home, "sandbox")),
      config,
    );
    context.store.put(
      "tasks",
      { ...task, status: "pending", updatedAt: now() },
      "task.user_retry",
      "user",
    );
  } finally {
    context.store.unlock(goal.workspaceId, owner);
  }
}
export async function applyGoal(
  context: CliContext,
  goal: Goal,
  confirmed: boolean,
): Promise<void> {
  if (!confirmed)
    throw new Blocked(
      "APPLY_APPROVAL",
      "Review perfect diff, then explicitly pass --yes",
    );
  if (goal.state !== "DONE")
    throw new Blocked(
      "APPLY_STATE",
      "Only an evidence-complete candidate can be applied by V1. Partial work remains available in its managed repository.",
    );
  const owner = id("apply");
  context.store.lock(goal.workspaceId, owner, process.pid);
  try {
    if (
      context.store
        .list("intents", goal.id)
        .some((i) => i.kind === "apply" && i.status !== "completed")
    )
      throw new Blocked(
        "APPLY_UNCERTAIN",
        "An earlier apply was interrupted. Inspect the original checkout; no automatic replay is permitted.",
      );
    const workspace = new GitWorkspace(goal.root, goalConfig(goal));
    context.store.put(
      "approvals",
      {
        id: id("approval"),
        goalId: goal.id,
        kind: "apply",
        scopeHash: hash({
          revision: goal.candidateRevision,
          source: goal.source,
        }),
        approvedAt: now(),
        actor: "user",
      },
      "apply.user_authorized",
      "user",
    );
    const intent: OperationIntent = {
      id: id("operation"),
      goalId: goal.id,
      kind: "apply",
      status: "started",
      resource: goal.source,
      beforeRevision: goal.baseline,
      createdAt: now(),
    };
    context.store.put("intents", intent, "apply.started", "user");
    try {
      await workspace.apply(goal);
      context.store.put(
        "intents",
        {
          ...intent,
          status: "completed",
          afterRevision: goal.candidateRevision,
        },
        "apply.completed",
        "user",
      );
    } catch (error) {
      // A known precondition failure has no effect. Other errors remain uncertain.
      if (
        error instanceof Blocked &&
        ["SOURCE_CHANGED", "APPLY_PATH", "CANDIDATE_CHANGED"].includes(
          error.code,
        )
      )
        context.store.put(
          "intents",
          { ...intent, status: "completed" },
          "apply.not_applied",
          "user",
        );
      else
        context.store.put(
          "intents",
          { ...intent, status: "uncertain" },
          "apply.uncertain",
          "user",
        );
      throw error;
    }
  } finally {
    context.store.unlock(goal.workspaceId, owner);
  }
}
