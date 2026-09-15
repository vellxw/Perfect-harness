import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Goal,
  GoalState,
  Task,
  Plan,
  Failure,
  VerificationResult,
} from "../domain/model.js";
import type { StateStore } from "../ports/state-store.js";
import type { AgentRuntime } from "../ports/agent-runtime.js";
import type { ExecutionRunner } from "../ports/execution.js";
import type { PerfectConfig } from "../config/schema.js";
import { ConfigSchema } from "../config/schema.js";
import { transition, terminal } from "../domain/goal-state-machine.js";
import { judge } from "../domain/evidence-judge.js";
import { id, now, hash, errorText, Blocked } from "../domain/util.js";
import { GitWorkspace, manifest } from "../adapters/git/workspace.js";
import { VerificationService } from "../adapters/verification/service.js";
import { AgentExecutor } from "./agent-executor.js";
import { PlanningService } from "./planning.js";
import { TaskEngine } from "./task-engine.js";
import { ReviewService } from "./reviews.js";
import { recoverGoal } from "./recovery.js";
import { selectWave } from "./scheduler.js";
import { recordFailure, lineage, lineageAttempts } from "./failures.js";
import { escalation, needsOracle, classifyFailure } from "./policies.js";

export const acceptanceHash = (plan: Plan) =>
  hash({ criteria: plan.criteria, verification: plan.verification });
export interface RunOptions {
  signal?: AbortSignal;
  acceptPlan?: boolean;
  contributorConsent?: boolean | (() => Promise<boolean>);
  onState?: (goal: Goal) => void;
}

export class Orchestrator {
  private goalId = "";
  private config!: PerfectConfig;
  private executor!: AgentExecutor;
  private planning!: PlanningService;
  private taskEngine!: TaskEngine;
  private reviews!: ReviewService;
  private verifier!: VerificationService;
  private signal!: AbortSignal;
  private options: RunOptions = {};
  constructor(
    private store: StateStore,
    private runtime: AgentRuntime,
    private runner: ExecutionRunner,
  ) {}
  private goal(): Goal {
    const goal = this.store.get("goals", this.goalId);
    if (!goal) throw new Error("Unknown goal");
    return goal;
  }
  private plan(): Plan {
    const plan = this.store.get("plans", this.goal().activePlanId ?? "");
    if (!plan) throw new Error("Goal has no accepted plan");
    return plan;
  }
  private tasks(): Task[] {
    return this.store.list("tasks", this.goalId);
  }
  private move(state: GoalState, reason?: string): void {
    const updated = transition(this.goal(), state, reason);
    this.store.put("goals", updated, `goal.${state.toLowerCase()}`);
    this.options.onState?.(updated);
  }
  private patch(values: Partial<Goal>, event: string): void {
    this.store.put(
      "goals",
      { ...this.goal(), ...values, updatedAt: now() },
      event,
    );
  }
  private cycle(): void {
    const latest = new Map<string, VerificationResult>();
    for (const result of this.store.list("verifications", this.goalId)) {
      if (result.revision === this.goal().candidateRevision)
        latest.set(result.specId, result);
    }
    const passed = this.plan().verification.filter(
      (spec) => spec.mandatory && latest.get(spec.id)?.status === "passed",
    ).length;
    // A new plan, another task ID or a changed diff is not verified progress.
    const progress = passed > (this.goal().bestVerificationPasses ?? 0);
    const goal = this.goal(),
      iteration = goal.iteration + 1,
      noProgress = progress ? 0 : goal.noProgress + 1;
    if (iteration > this.config.limits.maxGoalIterations)
      throw new Error("GOAL_ITERATION_LIMIT");
    if (noProgress > this.config.limits.maxNoProgressIterations)
      throw new Error("NO_PROGRESS_LIMIT");
    this.patch(
      {
        iteration,
        noProgress,
        bestVerificationPasses: Math.max(
          passed,
          goal.bestVerificationPasses ?? 0,
        ),
      },
      "goal.iteration",
    );
  }
  private async discover(): Promise<void> {
    const goal = this.goal(),
      workspace = new GitWorkspace(goal.root, this.config);
    const snapshot = await manifest(workspace.repo, this.config);
    const dir = join(goal.root, "artifacts", "discovery");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(
      join(dir, "manifest.json"),
      JSON.stringify(snapshot, null, 2),
    );
    this.store.event(goal.id, "discovery.completed", {
      revision: goal.candidateRevision,
      fileCount: snapshot.files.length,
      baselineChecks: this.config.verificationPolicy.extraChecks.map(
        (v) => v.id,
      ),
    });
    for (const spec of this.config.verificationPolicy.extraChecks) {
      try {
        await this.verifier.run(goal, workspace.repo, spec, this.signal);
      } catch (error) {
        if (this.signal.aborted) throw error;
        this.store.event(goal.id, "baseline.not_tested", {
          specId: spec.id,
          reason: errorText(error),
        });
      }
    }
  }
  private ensurePlanApproval(): void {
    const plan = this.plan(),
      scopeHash = acceptanceHash(plan);
    const approved = this.store
      .list("approvals", this.goalId)
      .some((a) => a.kind === "plan" && a.scopeHash === scopeHash);
    if (approved) return;
    if (
      this.options.acceptPlan ||
      !this.config.verificationPolicy.requirePlanApproval
    ) {
      this.store.put(
        "approvals",
        {
          id: id("approval"),
          goalId: this.goalId,
          kind: "plan",
          scopeHash,
          approvedAt: now(),
          actor: "user",
        },
        "plan.user_authorized",
      );
      return;
    }
    throw new Blocked(
      "PLAN_APPROVAL",
      `Inspect perfect plan, then run perfect approve-plan ${this.goalId} and perfect resume ${this.goalId}`,
    );
  }
  private async replan(failure: Failure, task?: Task): Promise<void> {
    this.move("REPLAN", failure.normalizedError);
    this.store.put(
      "failures",
      { ...failure, escalationLevel: Math.max(1, failure.escalationLevel) },
      "planner.escalated",
    );
    if (
      escalation(
        failure.occurrences,
        failure.severity === "critical",
        this.config.limits.maxSameFailureRetries,
      ) === "oracle"
    ) {
      await this.reviews.run(
        this.goal(),
        this.plan(),
        "oracle",
        this.signal,
        `Diagnose this failure independently; do not approve the feature yet: ${failure.normalizedError}`,
      );
      this.store.put(
        "failures",
        { ...failure, escalationLevel: 2 },
        "oracle.escalated",
      );
    }
    await this.planning.generate(
      this.goal(),
      this.signal,
      failure.normalizedError,
      task,
    );
    this.move("DECOMPOSE");
    this.ensurePlanApproval();
    this.move("ASSIGN");
    this.cycle();
  }
  private async taskFailure(task: Task, error: unknown): Promise<void> {
    if (this.signal.aborted) throw this.signal.reason;
    if (error instanceof Blocked) throw error;
    const category = classifyFailure(errorText(error));
    if (["provider", "environment", "policy"].includes(category))
      throw new Blocked("TASK_BLOCKED", errorText(error));
    const root = lineage(task, this.store);
    const failure = recordFailure(this.store, {
      goalId: this.goalId,
      task,
      checkId: `task-${root}`,
      message: errorText(error),
      category,
    });
    if (
      lineageAttempts(task, this.store) >=
      this.config.limits.maxTaskRetries + 1
    )
      throw new Error(`TASK_LINEAGE_ATTEMPTS_EXHAUSTED: ${root}`);
    if (
      escalation(
        failure.occurrences,
        failure.severity === "critical",
        this.config.limits.maxSameFailureRetries,
      ) !== "worker"
    ) {
      await this.replan(failure, task);
      return;
    }
    this.move("REPAIR");
    if (category === "integration") {
      const agent = ["high", "critical"].includes(task.riskLevel)
        ? "backend"
        : "integrator";
      this.planning.repair(
        this.goal(),
        task,
        failure,
        `Resolve the integration conflict against the current candidate. Reimplement the task's intended behavior while preserving other accepted changes. Original task: ${task.description}. Proposed checkpoint: ${task.resultRevision}. Failure: ${failure.normalizedError}`,
        agent,
      );
    } else {
      this.store.put(
        "tasks",
        {
          ...task,
          status: "pending",
          triggerFailureIds: [...task.triggerFailureIds, failure.id],
          updatedAt: now(),
        },
        "task.retry_scheduled",
      );
    }
    this.cycle();
    this.move("ASSIGN");
  }
  private parentFor(result: VerificationResult): Task {
    const plan = this.plan(),
      spec = plan.verification.find((v) => v.id === result.specId)!;
    const active = this.tasks().filter((t) => t.status === "accepted");
    const role =
      spec.kind === "browser" || spec.kind === "remotion"
        ? "frontend"
        : "backend";
    const parent =
      [...active]
        .reverse()
        .find(
          (t) =>
            t.assignedAgent === role &&
            t.acceptanceCriteria.some((c) => spec.criteriaIds.includes(c)),
        ) ??
      [...active]
        .reverse()
        .find((t) => t.verificationStrategy.includes(spec.id)) ??
      [...active]
        .reverse()
        .find((t) =>
          t.acceptanceCriteria.some((c) => spec.criteriaIds.includes(c)),
        );
    if (!parent)
      throw new Blocked(
        "REPAIR_OWNERSHIP",
        "No accepted task owns the failing criterion",
      );
    return parent;
  }
  private async verificationFailure(result: VerificationResult): Promise<void> {
    const classified = classifyFailure(result.summary);
    if (["provider", "environment", "policy"].includes(classified)) {
      this.store.event(this.goalId, "verification.infrastructure_blocked", {
        verificationId: result.id,
        category: classified,
        evidenceIds: result.evidenceIds,
      });
      throw new Blocked("VERIFICATION_INFRASTRUCTURE", result.summary);
    }
    const parent = this.parentFor(result),
      spec = this.plan().verification.find((v) => v.id === result.specId)!;
    const failure = recordFailure(this.store, {
      goalId: this.goalId,
      task: parent,
      checkId: result.specId,
      message: result.summary,
      evidenceIds: result.evidenceIds,
      category: spec.kind === "command" ? "verification" : "visual",
    });
    this.store.put(
      "verifications",
      { ...result, failureIds: [...result.failureIds, failure.id] },
      "verification.diagnosed",
    );
    if (
      lineageAttempts(parent, this.store) >=
      this.config.limits.maxTaskRetries + 1
    )
      throw new Error("REPAIR_LINEAGE_LIMIT");
    if (
      escalation(
        failure.occurrences,
        parent.riskLevel === "critical",
        this.config.limits.maxSameFailureRetries,
      ) !== "worker"
    ) {
      await this.replan(failure, parent);
      return;
    }
    this.move("REPAIR");
    this.planning.repair(
      this.goal(),
      parent,
      failure,
      `Repair verifier ${spec.id}: ${spec.title}. Preserve the accepted criterion and verifier. Inspect captured evidence. Failure: ${result.summary}. Original responsibility: ${parent.description}`,
    );
    this.cycle();
    this.move("ASSIGN");
  }
  private async reviewFailure(
    role: "oracle" | "visual",
    summary: string,
    evidenceIds: string[],
  ): Promise<void> {
    const parent =
      [...this.tasks()]
        .reverse()
        .find(
          (t) =>
            t.status === "accepted" &&
            t.assignedAgent === (role === "visual" ? "frontend" : "backend"),
        ) ?? [...this.tasks()].reverse().find((t) => t.status === "accepted");
    if (!parent) throw new Error("Review has no repair owner");
    const failure = recordFailure(this.store, {
      goalId: this.goalId,
      task: parent,
      checkId: `review-${role}`,
      message: summary,
      evidenceIds,
      category: role === "visual" ? "visual" : "implementation",
    });
    if (
      lineageAttempts(parent, this.store) >=
      this.config.limits.maxTaskRetries + 1
    )
      throw new Error("REVIEW_REPAIR_LIMIT");
    if (failure.occurrences > this.config.limits.maxSameFailureRetries) {
      await this.replan(failure, parent);
      return;
    }
    this.move("REPAIR");
    this.planning.repair(
      this.goal(),
      parent,
      failure,
      `Address independent ${role} findings without weakening acceptance criteria: ${summary}`,
    );
    this.cycle();
    this.move("ASSIGN");
  }
  private async drive(): Promise<void> {
    if (!this.goal().activePlanId) {
      if (this.goal().state !== "RECEIVED" && this.goal().state !== "PAUSED")
        this.move("PAUSED", "Restart planning safely");
      this.move("UNDERSTAND");
      this.move("DISCOVER");
      await this.discover();
      this.move("PLAN");
      await this.planning.generate(this.goal(), this.signal);
      this.move("DECOMPOSE");
      this.ensurePlanApproval();
      this.move("ASSIGN");
    } else {
      if (this.goal().state !== "PAUSED")
        this.move("PAUSED", "Reconcile and resume from a scheduling boundary");
      this.ensurePlanApproval();
      this.move("ASSIGN");
    }
    if (!this.goal().iteration) this.patch({ iteration: 1 }, "goal.iteration");
    while (true) {
      this.signal.throwIfAborted();
      this.ensurePlanApproval();
      for (const produced of this.taskEngine.pendingProduced(this.goal())) {
        if (this.goal().state === "ASSIGN") this.move("EXECUTE");
        const integrated = await this.taskEngine.integrate(
          this.goalId,
          produced,
        );
        if (integrated.error)
          await this.taskFailure(integrated.task, integrated.error);
      }
      const failed = this.tasks().find((t) => t.status === "failed");
      if (failed) {
        if (this.goal().state === "ASSIGN") this.move("EXECUTE");
        await this.taskFailure(
          failed,
          new Error(failed.failureReason ?? "Previous task attempt failed"),
        );
        continue;
      }
      const wave = selectWave(this.tasks(), this.config, (task) =>
        this.executor.definition(this.goal(), task.assignedAgent, task),
      );
      if (wave.length) {
        if (this.goal().state !== "ASSIGN") this.move("ASSIGN");
        this.move("EXECUTE");
        const outcomes = await Promise.all(
          wave.map((task) =>
            this.taskEngine.execute(this.goalId, task, this.signal),
          ),
        );
        const errors: typeof outcomes = [];
        for (const outcome of outcomes) {
          if (outcome.error) {
            errors.push(outcome);
            continue;
          }
          const integrated = await this.taskEngine.integrate(
            this.goalId,
            outcome.task,
          );
          if (integrated.error) errors.push(integrated);
        }
        if (errors[0]) await this.taskFailure(errors[0].task, errors[0].error);
        else this.move("ASSIGN");
        continue;
      }
      if (
        this.tasks().some((t) => !["accepted", "superseded"].includes(t.status))
      )
        throw new Blocked(
          "SCHEDULER_BLOCKED",
          "No runnable tasks; inspect dependencies and ownership",
        );
      this.move("VERIFY");
      const plan = this.plan(),
        workspace = new GitWorkspace(this.goal().root, this.config);
      const results: VerificationResult[] = [];
      for (const spec of plan.verification) {
        this.signal.throwIfAborted();
        results.push(
          await this.verifier.run(
            this.goal(),
            workspace.repo,
            spec,
            this.signal,
          ),
        );
      }
      const failure = results.find(
        (r) =>
          r.status !== "passed" &&
          plan.verification.find((v) => v.id === r.specId)?.mandatory,
      );
      if (failure) {
        await this.verificationFailure(failure);
        continue;
      }
      this.move("REVIEW");
      const required: ("oracle" | "visual")[] = [];
      if (
        needsOracle(
          plan,
          this.tasks(),
          this.config.reviewPolicy.finalFeatureReview,
        )
      )
        required.push("oracle");
      if (
        this.config.reviewPolicy.visualReview &&
        plan.verification.some(
          (v) => v.kind === "browser" || v.kind === "remotion",
        )
      )
        required.push("visual");
      let needsRepair = false;
      for (const role of required) {
        const current = this.goal();
        let review = this.store
          .list("reviews", this.goalId)
          .filter(
            (r) =>
              r.role === role &&
              r.purpose === "acceptance" &&
              r.revision === current.candidateRevision,
          )
          .at(-1);
        if (!review)
          review = await this.reviews.run(current, plan, role, this.signal);
        if (review.decision === "uncertain")
          throw new Blocked("REVIEW_UNCERTAIN", review.summary);
        if (
          review.decision === "request_changes" ||
          review.findings.some((f) =>
            ["major", "critical"].includes(f.severity),
          )
        ) {
          await this.reviewFailure(
            role,
            JSON.stringify(
              review.findings.length ? review.findings : review.summary,
            ),
            review.evidenceIds,
          );
          needsRepair = true;
          break;
        }
      }
      if (needsRepair) continue;
      this.move("JUDGE");
      const goal = this.goal();
      const evidence = this.store
        .list("evidence", goal.id)
        .filter((e) => e.revision === goal.candidateRevision);
      const runs = this.store.list("runs", goal.id);
      const routingValid = this.tasks()
        .filter((t) => t.status === "accepted")
        .every((t) =>
          runs.some(
            (r) =>
              r.taskId === t.id &&
              r.status === "completed" &&
              (goal.mode === "mock" ||
                r.routeBinding.provenance === "catalog") &&
              hash(r.routeBinding) === hash(t.resolvedRouteBinding),
          ),
        );
      const humanApprovedIds = plan.criteria
        .filter(
          (c) =>
            c.kind === "human" &&
            this.store.list("approvals", goal.id).some(
              (a) =>
                a.kind === "human" &&
                a.scopeHash ===
                  hash({
                    criterionId: c.id,
                    revision: goal.candidateRevision,
                  }),
            ),
        )
        .map((c) => c.id);
      const judgment = judge({
        goal,
        plan,
        tasks: this.tasks(),
        evidence,
        results: this.store.list("verifications", goal.id),
        reviews: this.store.list("reviews", goal.id),
        requiredReviews: required,
        artifactsValid: await this.verifier.artifactsValid(evidence),
        routingValid,
        humanApprovedIds,
      });
      this.store.event(goal.id, "judge.decided", judgment);
      if (!judgment.done)
        throw new Blocked("ACCEPTANCE_BLOCKED", judgment.reasons.join("; "));
      for (const f of this.store
        .list("failures", goal.id)
        .filter((f) => !f.resolvedAt))
        this.store.put(
          "failures",
          { ...f, resolvedAt: now() },
          "failure.resolved",
        );
      this.move("DONE", "evidence-judge-approved");
      return;
    }
  }
  async run(goalId: string, options: RunOptions = {}): Promise<Goal> {
    this.goalId = goalId;
    this.options = options;
    const initial = this.goal();
    if (terminal(initial.state)) return initial;
    this.config = ConfigSchema.parse(initial.configSnapshot);
    if (hash(this.config) !== initial.configSnapshotHash)
      throw new Blocked(
        "CONFIG_CHANGED",
        "Persisted configuration fingerprint mismatch",
      );
    const owner = id("controller");
    this.store.transaction(() => {
      this.store.lock("perfect-active-goal-loop", owner, process.pid);
      this.store.lock(initial.workspaceId, owner, process.pid);
    });
    const started = Date.now(),
      controller = new AbortController();
    let requested: "pause" | "abort" | undefined;
    const remaining = this.config.limits.timeoutPerGoal - initial.activeMs;
    const deadline = AbortSignal.timeout(Math.max(1, remaining));
    this.signal = AbortSignal.any([
      controller.signal,
      deadline,
      ...(options.signal ? [options.signal] : []),
    ]);
    const timer = setInterval(() => {
      const current = this.goal();
      if (current.controlRequest) {
        requested = current.controlRequest;
        controller.abort(new Error(`USER_${requested.toUpperCase()}`));
      }
    }, 200);
    timer.unref();
    this.executor = new AgentExecutor(
      this.store,
      this.runtime,
      this.runner,
      this.config,
      options.contributorConsent ?? false,
    );
    this.planning = new PlanningService(this.store, this.executor, this.config);
    this.taskEngine = new TaskEngine(this.store, this.executor, this.config);
    this.reviews = new ReviewService(this.store, this.executor, this.config);
    this.verifier = new VerificationService(this.store, this.runner);
    try {
      if (remaining <= 0) throw new Error("GOAL_ACTIVE_TIMEOUT");
      await recoverGoal(initial, this.store, this.runner, this.config);
      this.patch({ controlRequest: undefined }, "goal.control_acknowledged");
      for (const task of this.tasks().filter(
        (t) =>
          t.status === "failed" &&
          ["provider", "environment", "policy"].includes(
            classifyFailure(t.failureReason ?? ""),
          ),
      ))
        this.store.put(
          "tasks",
          { ...task, status: "pending", updatedAt: now() },
          "task.unblocked_for_retry",
        );
      await this.drive();
    } catch (error) {
      if (!terminal(this.goal().state)) {
        if (requested === "abort") this.move("ABORTED", "User requested abort");
        else if (deadline.aborted) this.move("FAILED", "GOAL_ACTIVE_TIMEOUT");
        else if (requested === "pause" || options.signal?.aborted)
          this.move("PAUSED", "Execution paused at a recoverable boundary");
        else if (error instanceof Blocked) this.move("PAUSED", error.message);
        else this.move("FAILED", errorText(error));
      }
    } finally {
      clearInterval(timer);
      controller.abort();
      this.patch(
        {
          activeMs: this.goal().activeMs + Date.now() - started,
          controlRequest: undefined,
        },
        "goal.checkpointed",
      );
      this.store.transaction(() => {
        this.store.unlock(initial.workspaceId, owner);
        this.store.unlock("perfect-active-goal-loop", owner);
      });
      const goal = this.goal();
      await writeFile(
        join(goal.root, "report.json"),
        JSON.stringify(
          {
            goal,
            plans: this.store.list("plans", goal.id),
            tasks: this.tasks(),
            runs: this.store.list("runs", goal.id),
            verifications: this.store.list("verifications", goal.id),
            reviews: this.store.list("reviews", goal.id),
            failures: this.store.list("failures", goal.id),
          },
          null,
          2,
        ),
      );
    }
    return this.goal();
  }
}
