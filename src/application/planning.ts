import { z } from "zod";
import {
  PlanProposalSchema,
  TaskSpecSchema,
  type Goal,
  type Plan,
  type PlanProposal,
  type Task,
  type Failure,
} from "../domain/model.js";
import type { StateStore } from "../ports/state-store.js";
import type { PerfectConfig } from "../config/schema.js";
import { AgentExecutor } from "./agent-executor.js";
import { validatePlan, overlaps } from "../domain/task-graph.js";
import { sensitive } from "../tools/paths.js";
import { GitWorkspace } from "../adapters/git/workspace.js";
import { lineageAttempts } from "./failures.js";
import { hash, id, now, canonical, Blocked } from "../domain/util.js";

function taskSpec(task: Task) {
  return TaskSpecSchema.strip().parse(task);
}
export class PlanningService {
  constructor(
    private store: StateStore,
    private executor: AgentExecutor,
    private config: PerfectConfig,
  ) {}
  validate(value: unknown, previous?: Plan): PlanProposal {
    const proposal = validatePlan(value, previous);
    for (const task of proposal.tasks)
      for (const path of [...task.ownedFiles, ...task.ownedSurfaces]) {
        if (
          sensitive(path) ||
          this.config.protectedPaths.some((p) => overlaps(path, p))
        )
          throw new Error(`Protected ownership requested: ${path}`);
      }
    for (const criterion of proposal.criteria.filter(
      (c) => c.kind === "visual" && c.mandatory,
    ))
      if (
        !proposal.verification.some(
          (v) =>
            v.criteriaIds.includes(criterion.id) &&
            ["browser", "remotion"].includes(v.kind),
        )
      )
        throw new Error(`Visual criterion requires captures: ${criterion.id}`);
    return proposal;
  }
  async generate(
    goal: Goal,
    signal: AbortSignal,
    reason?: string,
    triggerTask?: Task,
  ): Promise<Plan> {
    const previous = goal.activePlanId
      ? this.store.get("plans", goal.activePlanId)
      : undefined;
    const current = this.store.get("goals", goal.id)!;
    if (current.plannerCalls >= this.config.limits.maxPlannerCalls)
      throw new Blocked("PLANNER_LIMIT", "Planner invocation limit reached");
    this.store.put(
      "goals",
      { ...current, plannerCalls: current.plannerCalls + 1, updatedAt: now() },
      "planner.requested",
    );
    const invocation = await this.executor.invoke(
      {
        goal,
        role: "planner",
        workspace: new GitWorkspace(goal.root, this.config).repo,
        instruction: [
          "Interpret the goal, inspect the repository, state assumptions, design explicit contracts and return a real acyclic task graph. Do not implement code. Assign substantial frontend to frontend, sensitive backend to backend, exploration/tests/docs to general. Avoid shared file ownership unless tasks are sequential. Every mandatory criterion needs an actual verification strategy.",
          "Each verifier runs in a fresh isolated snapshot with no public network. A server/build check must be self-contained. Prefer committed, auditable tests over inline scripts. Network/dependency preparation requires a separate user approval. Existing tests, secrets and references cannot be changed. Protected paths: " +
            JSON.stringify(this.config.protectedPaths),
          "Do not use a verification that merely prints success. Cover observable behavior, edge cases and failure paths. Add browser or Remotion capture scenarios for visual criteria. Descriptions must be self-contained.",
          `Additional required checks: ${JSON.stringify(this.config.verificationPolicy.extraChecks)}`,
          previous
            ? `Replan reason: ${reason}. Preserve the exact criteria and verification array. Retain IDs and specifications of unchanged accepted tasks; changed tasks must be explicit. Previous plan: ${JSON.stringify(previous)}. Task status: ${JSON.stringify(this.store.list("tasks", goal.id).map((t) => ({ id: t.id, status: t.status, attempt: t.attempt, error: t.failureReason })))}`
            : "Create the initial plan. Model/account selection and reasoning are controlled by the harness, not by the plan.",
        ].join("\n\n"),
        schema: z.toJSONSchema(PlanProposalSchema),
        parse: (value) => this.validate(value, previous),
        evidence: this.store
          .list("evidence", goal.id)
          .filter((e) => triggerTask?.evidence.includes(e.id))
          .slice(-6),
      },
      signal,
    );
    const proposal = this.validate(invocation.output.result, previous);
    for (const extra of this.config.verificationPolicy.extraChecks)
      if (!proposal.verification.some((v) => canonical(v) === canonical(extra)))
        throw new Error(
          `Planner omitted required configured verifier: ${extra.id}`,
        );
    const prefix = goal.id.slice(5, 13) + "-";
    const ids = new Map(
      proposal.tasks.map((t) => [
        t.id,
        t.id.startsWith(prefix) ? t.id : `${prefix}${t.id}`,
      ]),
    );
    const qualified = this.validate({
      ...proposal,
      tasks: proposal.tasks.map((t) => ({
        ...t,
        id: ids.get(t.id)!,
        dependencies: t.dependencies.map((d) => ids.get(d)!),
        privacyClass: goal.privacyClass,
      })),
    });
    const plan: Plan = {
      ...qualified,
      id: id("plan"),
      goalId: goal.id,
      version: (previous?.version ?? 0) + 1,
      parentPlanId: previous?.id,
      basedOnRevision: goal.candidateRevision,
      generatedByRunId: invocation.run.id,
      createdAt: now(),
      hash: hash(qualified),
    };
    const taskIds = new Set(plan.tasks.map((t) => t.id));
    this.store.transaction(() => {
      this.store.put("plans", plan, "plan.generated");
      for (const old of this.store.list("tasks", goal.id))
        if (!taskIds.has(old.id) && old.status !== "superseded")
          this.store.put(
            "tasks",
            { ...old, status: "superseded", updatedAt: now() },
            "task.superseded",
          );
      for (const spec of plan.tasks) {
        const existing = this.store.get("tasks", spec.id),
          definition = this.config.agents[spec.assignedAgent];
        const same =
          existing && canonical(taskSpec(existing)) === canonical(spec);
        const remaining = triggerTask
          ? this.config.limits.maxTaskRetries +
            1 -
            lineageAttempts(triggerTask, this.store)
          : this.config.limits.maxTaskRetries + 1;
        const task: Task = {
          ...spec,
          goalId: goal.id,
          planId: plan.id,
          status:
            same && existing.status === "accepted" ? "accepted" : "pending",
          model: definition.model,
          reasoning: definition.reasoning,
          baseRevision:
            same && existing ? existing.baseRevision : goal.candidateRevision,
          dependencyOutputVersions: existing?.dependencyOutputVersions ?? {},
          attempt: existing?.attempt ?? 0,
          maxAttempts: existing?.maxAttempts ?? Math.max(0, remaining),
          outputs: existing?.outputs ?? [],
          evidence: existing?.evidence ?? [],
          summary: existing?.summary,
          resultRevision: same ? existing?.resultRevision : undefined,
          resolvedRouteBinding: same
            ? existing?.resolvedRouteBinding
            : undefined,
          repairsTaskId:
            existing?.repairsTaskId ??
            (!existing ? triggerTask?.id : undefined),
          triggerFailureIds:
            existing?.triggerFailureIds ??
            this.store
              .list("failures", goal.id)
              .filter((f) => !f.resolvedAt)
              .slice(-4)
              .map((f) => f.id),
          createdAt: existing?.createdAt ?? now(),
          updatedAt: now(),
        };
        this.store.put(
          "tasks",
          task,
          existing ? "task.replanned" : "task.created",
        );
      }
      this.store.put(
        "goals",
        {
          ...this.store.get("goals", goal.id)!,
          activePlanId: plan.id,
          criteria: plan.criteria,
          updatedAt: now(),
        },
        "plan.accepted_by_controller",
      );
    });
    return plan;
  }
  repair(
    goal: Goal,
    parent: Task,
    failure: Failure,
    description: string,
    agent = parent.assignedAgent,
  ): Task {
    const remaining =
      this.config.limits.maxTaskRetries +
      1 -
      lineageAttempts(parent, this.store);
    if (remaining <= 0) throw new Error("TASK_LINEAGE_ATTEMPTS_EXHAUSTED");
    const previous = this.store.get("plans", goal.activePlanId!)!;
    const replacement = parent.status !== "accepted";
    const repairId = id("repair"),
      definition = this.config.agents[agent];
    const task: Task = {
      ...parent,
      id: repairId,
      title: `Repair: ${parent.title}`,
      description,
      type: agent === "integrator" ? "integration" : "repair",
      assignedAgent: agent,
      model: definition.model,
      reasoning: definition.reasoning,
      status: "pending",
      dependencies: replacement ? parent.dependencies : [parent.id],
      baseRevision: goal.candidateRevision,
      resultRevision: undefined,
      worktreeRef: undefined,
      resolvedRouteBinding: undefined,
      attempt: 0,
      maxAttempts: remaining,
      outputs: [],
      evidence: [],
      summary: undefined,
      failureReason: undefined,
      repairsTaskId: parent.id,
      triggerFailureIds: [failure.id],
      createdAt: now(),
      updatedAt: now(),
    };
    const specs = [
      ...previous.tasks
        .filter((t) => !replacement || t.id !== parent.id)
        .map((t) => ({
          ...t,
          dependencies: t.dependencies.map((d) =>
            replacement && d === parent.id ? repairId : d,
          ),
        })),
      taskSpec(task),
    ];
    const proposal = this.validate({
      ...previous,
      tasks: specs,
      id: undefined,
      goalId: undefined,
      version: undefined,
      parentPlanId: undefined,
      basedOnRevision: undefined,
      generatedByRunId: undefined,
      createdAt: undefined,
      hash: undefined,
    });
    const plan: Plan = {
      ...proposal,
      id: id("plan"),
      goalId: goal.id,
      version: previous.version + 1,
      parentPlanId: previous.id,
      basedOnRevision: goal.candidateRevision,
      generatedByRunId: "controller-repair-policy",
      createdAt: now(),
      hash: hash(proposal),
    };
    task.planId = plan.id;
    this.store.transaction(() => {
      this.store.put("plans", plan, "plan.amended");
      if (replacement) {
        this.store.put(
          "tasks",
          { ...parent, status: "superseded", updatedAt: now() },
          "task.superseded",
        );
        for (const other of this.store
          .list("tasks", goal.id)
          .filter((t) => t.dependencies.includes(parent.id)))
          this.store.put(
            "tasks",
            {
              ...other,
              dependencies: other.dependencies.map((d) =>
                d === parent.id ? task.id : d,
              ),
              updatedAt: now(),
            },
            "task.dependency_redirected",
          );
      }
      this.store.put("tasks", task, "repair.created");
      this.store.put(
        "goals",
        {
          ...this.store.get("goals", goal.id)!,
          activePlanId: plan.id,
          updatedAt: now(),
        },
        "plan.accepted_by_controller",
      );
    });
    return task;
  }
}
