import { z } from "zod";
import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import type { Goal, Task, OperationIntent, Evidence } from "../domain/model.js";
import type { StateStore } from "../ports/state-store.js";
import type { PerfectConfig } from "../config/schema.js";
import { GitWorkspace } from "../adapters/git/workspace.js";
import { git } from "../adapters/git/process.js";
import { AgentExecutor } from "./agent-executor.js";
import { OwnershipManager } from "./ownership.js";
import { readEvidence, imageMime } from "../tools/evidence.js";
import { id, now, hash, errorText, Blocked } from "../domain/util.js";

export const WorkerResultSchema = z
  .object({
    summary: z.string().min(8),
    outputs: z.array(z.string()).default([]),
  })
  .strict();
export interface TaskOutcome {
  task: Task;
  error?: unknown;
}
export class TaskEngine {
  constructor(
    private store: StateStore,
    private executor: AgentExecutor,
    private config: PerfectConfig,
  ) {}
  async execute(
    goalId: string,
    task: Task,
    signal: AbortSignal,
  ): Promise<TaskOutcome> {
    const goal = this.store.get("goals", goalId)!,
      workspace = new GitWorkspace(goal.root, this.config),
      ownership = new OwnershipManager(this.store);
    if (task.attempt >= task.maxAttempts)
      return { task, error: new Error("TASK_ATTEMPTS_EXHAUSTED") };
    try {
      await this.executor.preflight(goal, task.assignedAgent, task, signal);
    } catch (error) {
      return { task, error };
    } // Auth/policy failures do not consume implementation attempts.
    const base = task.resultRevision
      ? task.baseRevision
      : goal.candidateRevision;
    task = {
      ...task,
      status: "running",
      attempt: task.attempt + 1,
      baseRevision: base,
      updatedAt: now(),
      dependencyOutputVersions: Object.fromEntries(
        task.dependencies.map((dep) => [
          dep,
          this.store.get("tasks", dep)?.resultRevision ?? "",
        ]),
      ),
    };
    this.store.put("tasks", task, "task.assigned");
    let leaseId: string | undefined;
    try {
      signal.throwIfAborted();
      const worktree = await workspace.worktree({
        ...task,
        baseRevision: task.resultRevision ?? base,
      });
      task = { ...task, worktreeRef: worktree };
      this.store.put("tasks", task, "task.workspace_created");
      leaseId = ownership.acquire(
        task,
        worktree,
        this.config.limits.timeoutPerTask + 60000,
      ).id;
      const proofIds = new Set(
        this.store
          .list("failures", goal.id)
          .filter((f) => !f.resolvedAt && task.triggerFailureIds.includes(f.id))
          .flatMap((f) => f.evidenceIds),
      );
      const evidence = this.store
        .list("evidence", goal.id)
        .filter((e) => proofIds.has(e.id) && e.validity === "valid");
      const captures = evidence.filter(
        (e) => e.kind === "screenshot" || e.kind === "frame",
      );
      if (captures.length > this.config.limits.maxReviewImages)
        throw new Blocked(
          "VISUAL_SCOPE",
          "Repair evidence exceeds image budget",
        );
      const images = this.executor
        .definition(goal, task.assignedAgent, task)
        .capabilities.includes("image")
        ? await Promise.all(
            captures.map(async (e) => {
              const bytes = await readEvidence(
                goal,
                e,
                this.config.limits.maxImageBytes,
              );
              return {
                data: bytes.toString("base64"),
                mimeType: imageMime(bytes),
                source: `FAILURE ${e.id}`,
              };
            }),
          )
        : [];
      const invocation = await this.executor.invoke(
        {
          goal: { ...goal, candidateRevision: task.resultRevision ?? base },
          role: task.assignedAgent,
          task,
          evidence,
          images,
          workspace: worktree,
          leaseId,
          instruction:
            "Implement only this task and its owned surfaces. Read before replacing files. Preserve contracts. Existing tests and references are protected. If an earlier attempt failed, inspect the current checkpoint and evidence instead of repeating the same change. Your submission is a proposal; independent verification decides acceptance.",
          schema: z.toJSONSchema(WorkerResultSchema),
          parse: (value) => WorkerResultSchema.parse(value),
        },
        signal,
      );
      signal.throwIfAborted();
      const result = WorkerResultSchema.parse(invocation.output.result);
      const commit = await workspace.checkpoint(worktree, task);
      task = {
        ...task,
        status: "produced",
        resultRevision: commit,
        resolvedRouteBinding: invocation.run.routeBinding,
        summary: result.summary,
        outputs: result.outputs,
        updatedAt: now(),
      };
      this.store.put("tasks", task, "task.produced");
      return { task };
    } catch (error) {
      let partial = task.resultRevision;
      if (task.worktreeRef)
        partial = await workspace
          .checkpoint(task.worktreeRef, task)
          .catch(() => partial);
      task = {
        ...task,
        status: "failed",
        resultRevision: partial,
        failureReason: errorText(error),
        updatedAt: now(),
      };
      this.store.put("tasks", task, "task.failed");
      return { task, error };
    } finally {
      if (leaseId) {
        const active = this.store
          .list("intents", goal.id)
          .some(
            (i) =>
              i.kind === "container" &&
              i.status !== "completed" &&
              (i.taskId === task.id || !i.taskId),
          );
        if (!active) ownership.release(leaseId);
      }
    }
  }
  async integrate(goalId: string, task: Task): Promise<TaskOutcome> {
    const goal = this.store.get("goals", goalId)!,
      workspace = new GitWorkspace(goal.root, this.config);
    if (task.status !== "produced" || !task.resultRevision)
      return { task, error: new Error("No produced task checkpoint") };
    const intent: OperationIntent = {
      id: id("operation"),
      goalId,
      taskId: task.id,
      kind: "integration",
      status: "started",
      resource: task.resultRevision,
      beforeRevision: goal.candidateRevision,
      createdAt: now(),
    };
    this.store.put("intents", intent, "integration.started");
    try {
      const revision = await workspace.integrate(task, task.resultRevision);
      const patch = await git(workspace.repo, [
        "diff",
        "--stat",
        goal.candidateRevision,
        revision,
      ]);
      const artifactDir = join(goal.root, "artifacts", id("integration"));
      await mkdir(artifactDir, { recursive: true, mode: 0o700 });
      const artifactRef = join(artifactDir, "diff.txt");
      await writeFile(artifactRef, patch);
      const evidence: Evidence = {
        id: id("evidence"),
        goalId,
        taskId: task.id,
        kind: "diff",
        artifactRef,
        contentHash: hash(Buffer.from(patch).toString("base64")),
        producer: "controller",
        revision,
        environmentHash: hash({ integration: "git-three-way" }),
        criteriaIds: task.acceptanceCriteria,
        capturedAt: now(),
        validity: "valid",
      };
      task = {
        ...task,
        status: "accepted",
        resultRevision: revision,
        evidence: [...task.evidence, evidence.id],
        updatedAt: now(),
      };
      this.store.transaction(() => {
        this.store.put("evidence", evidence, "evidence.created");
        this.store.put("tasks", task, "task.accepted");
        this.store.put(
          "goals",
          {
            ...this.store.get("goals", goalId)!,
            candidateRevision: revision,
            updatedAt: now(),
          },
          "candidate.updated",
        );
        this.store.put(
          "intents",
          { ...intent, status: "completed", afterRevision: revision },
          "integration.completed",
        );
        this.store.event(goalId, "evidence.invalidated", {
          reason: "candidate changed",
          previousRevision: goal.candidateRevision,
          revision,
        });
      });
      return { task };
    } catch (error) {
      const current = await workspace.revision();
      if (current !== goal.candidateRevision)
        throw new Blocked(
          "INTEGRATION_UNCERTAIN",
          "Integration changed Git before state was committed; resume must reconcile",
        );
      this.store.put(
        "intents",
        { ...intent, status: "completed" },
        "integration.rolled_back",
      );
      task = {
        ...task,
        status: "failed",
        failureReason: errorText(error),
        updatedAt: now(),
      };
      this.store.put("tasks", task, "task.failed");
      return { task, error };
    }
  }
  pendingProduced(goal: Goal): Task[] {
    return this.store
      .list("tasks", goal.id)
      .filter((t) => t.status === "produced");
  }
}
