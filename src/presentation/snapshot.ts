import { basename } from "node:path";
import type { Goal, Event } from "../domain/model.js";
import type { SqliteStore } from "../adapters/sqlite/store.js";
import { goalConfig } from "../cli/context.js";
import { acceptanceHash } from "../application/orchestrator.js";
import {
  text,
  type UiActivity,
  type UiSnapshot,
  type UiPreferences,
} from "./protocol.js";

const labels: Record<string, [string, UiActivity["status"]]> = {
  "goal.created": ["Goal received", "info"],
  "plan.generated": ["Implementation plan ready", "completed"],
  "plan.user_authorized": ["Plan approved by you", "completed"],
  "agent.started": ["Agent started working", "running"],
  "agent.completed": ["Agent finished its assignment", "completed"],
  "agent.failed": ["Agent stopped before completing", "failed"],
  "task.created": ["Task added to the plan", "info"],
  "task.assigned": ["Task assigned", "running"],
  "task.accepted": ["Task accepted into candidate", "completed"],
  "verification.started": ["Checking the candidate", "running"],
  "verification.passed": ["Verification passed", "completed"],
  "verification.failed": ["Verification needs attention", "failed"],
  "repair.created": ["Repair assigned with evidence", "running"],
  "oracle.requested": ["Independent review requested", "running"],
  "goal.completed": ["Evidence Judge accepted the goal", "completed"],
  "goal.paused": ["Goal paused safely", "blocked"],
  "goal.failed": ["Goal stopped with unresolved evidence", "failed"],
  "goal.aborted": ["Goal aborted; checkpoints preserved", "blocked"],
  "task.integrated": ["Changes integrated", "completed"],
  "apply.completed": ["Verified changes applied", "completed"],
};
export function activity(event: Event, store: SqliteStore): UiActivity | null {
  const payload = (
    event.payload && typeof event.payload === "object" ? event.payload : {}
  ) as Record<string, unknown>;
  if (
    /usage|request_started|reserved|settled|file\.|lease|lock|attempt\.|context|provider\.payload/.test(
      event.type,
    )
  )
    return null;
  const entry = labels[event.type];
  if (
    !entry &&
    !/goal\.|verification\.|repair\.|review\.|plan\.|integration\./.test(
      event.type,
    )
  )
    return null;
  const run =
    typeof payload.runId === "string"
      ? store.get("runs", payload.runId)
      : payload.kind === "runs"
        ? store.get("runs", String(payload.entityId))
        : undefined;
  const task =
    typeof payload.taskId === "string"
      ? store.get("tasks", payload.taskId)
      : payload.kind === "tasks"
        ? store.get("tasks", String(payload.entityId))
        : run?.taskId
          ? store.get("tasks", run.taskId)
          : undefined;
  const check =
    payload.kind === "verifications"
      ? store.get("verifications", String(payload.entityId))
      : undefined;
  return {
    id: event.id,
    sequence: event.sequence ?? 0,
    time: event.occurredAt,
    role: run?.agentDefinitionId ?? task?.assignedAgent ?? event.actor,
    title: entry?.[0] ?? event.type.replaceAll(".", " ").replaceAll("_", " "),
    detail: text(
      check?.summary ?? task?.title ?? payload.reason ?? payload.state ?? "",
      400,
    ),
    status: entry?.[1] ?? "info",
    rawType: event.type,
  };
}
export function snapshot(
  store: SqliteStore,
  workspace: string,
  preferences: UiPreferences,
  selected?: string,
  busy = false,
  diagnostics: UiSnapshot["diagnostics"] = [],
): UiSnapshot {
  const goals = store.list("goals").filter((g) => g.source === workspace),
    goal = selected ? goals.find((g) => g.id === selected) : goals.at(-1);
  const config = goal ? goalConfig(goal) : undefined,
    plan = goal ? store.get("plans", goal.activePlanId ?? "") : undefined;
  const runs = goal ? store.list("runs", goal.id) : [],
    usage = goal ? store.list("usage", goal.id) : [];
  const definitions = config ? Object.values(config.agents) : [];
  const agents = definitions.flatMap((d) => {
    const roleRuns = runs.filter((r) => r.agentDefinitionId === d.id);
    const activeRuns = roleRuns.filter((r) => r.status === "running");
    const visibleRuns = activeRuns.length ? activeRuns : [roleRuns.at(-1)];
    return visibleRuns.map((run) => {
      const records = run ? usage.filter((u) => u.runId === run.id) : [],
        last = records.at(-1),
        binding = run?.routeBinding;
      return {
        id: run?.id ?? d.id,
        role: d.id,
        model: binding?.model ?? d.model,
        provider: binding?.provider ?? d.provider,
        account: binding?.accountRef ?? d.accountRef,
        status: run?.status ?? "idle",
        task: run?.taskId,
        startedAt: run?.startedAt,
        requested: binding?.requestedReasoning ?? d.reasoning,
        selected: binding?.selectedReasoning ?? d.reasoning,
        sent: last?.reasoningSent,
        reported: last?.reasoningReported,
        modelReported: last?.modelReported,
        tokens: records.some((u) => u.totalTokens !== undefined)
          ? records.reduce((n, u) => n + (u.totalTokens ?? 0), 0)
          : undefined,
        requests: run?.requestIds.length ?? 0,
        latencyMs: last?.latencyMs,
        provenance: binding?.provenance ?? "configured, not tested",
      };
    });
  });
  const results = goal
    ? store
        .list("verifications", goal.id)
        .filter((v) => v.revision === goal.candidateRevision)
    : [];
  const checks = (plan?.verification ?? []).map((spec) => {
    const r = results.findLast((v) => v.specId === spec.id);
    return {
      id: spec.id,
      title: spec.title,
      kind: spec.kind,
      status: r?.status ?? "waiting",
      summary: text(r?.summary ?? "Not run on this candidate", 1500),
      evidenceIds: r?.evidenceIds ?? [],
      revision: goal?.candidateRevision ?? "",
    };
  });
  const accounts = [...new Set(usage.map((u) => u.accountRef))].map(
    (account) => {
      const records = usage.filter((u) => u.accountRef === account);
      return {
        account,
        tokens: records.reduce((n, u) => n + (u.totalTokens ?? 0), 0),
        uncertain: records.filter((u) => u.totalTokens === undefined).length,
        charge: records.some((u) => u.reportedCharge !== undefined)
          ? records.reduce((n, u) => n + (u.reportedCharge ?? 0), 0)
          : undefined,
        estimate: records.some(
          (u) => u.billingMode === "metered" && u.estimatedCost !== undefined,
        )
          ? records.reduce(
              (n, u) =>
                n + (u.billingMode === "metered" ? (u.estimatedCost ?? 0) : 0),
              0,
            )
          : undefined,
      };
    },
  );
  return {
    protocol: 1,
    version: "0.2.0",
    sequence: goal ? store.lastSequence(goal.id) : 0,
    workspace,
    workspaceName: basename(workspace),
    connected: true,
    busy,
    demo: false,
    goal: goal ? projectGoal(goal) : undefined,
    plan: plan
      ? {
          id: plan.id,
          hash: acceptanceHash(plan),
          version: plan.version,
          summary: text(plan.summary),
          architecture: plan.architecture.map((x) => text(x)),
          risks: plan.risks.map((x) => text(x)),
          criteria: plan.criteria.map((c) => ({
            id: c.id,
            description: text(c.description),
            kind: c.kind,
          })),
          approved: store
            .list("approvals", goal!.id)
            .some(
              (a) => a.kind === "plan" && a.scopeHash === acceptanceHash(plan),
            ),
        }
      : undefined,
    tasks: goal
      ? store
          .list("tasks", goal.id)
          .filter((t) => t.status !== "superseded")
          .slice(-500)
          .map((t) => ({
            id: t.id,
            title: text(t.title),
            status: t.status,
            role: t.assignedAgent,
            dependencies: t.dependencies,
            attempt: t.attempt,
            maxAttempts: t.maxAttempts,
            description: text(t.description),
            surfaces: [...t.ownedFiles, ...t.ownedSurfaces],
          }))
      : [],
    agents,
    checks,
    verification: {
      passed: checks.filter((c) => c.status === "passed").length,
      total: checks.length,
    },
    accounts,
    artifacts: goal
      ? store
          .list("evidence", goal.id)
          .slice(-200)
          .map((e) => ({
            id: e.id,
            name: basename(e.artifactRef),
            kind: e.kind,
            revision: e.revision,
            current:
              e.revision === goal.candidateRevision && e.validity === "valid",
            hash: e.contentHash,
          }))
      : [],
    activity: goal
      ? store
          .tailEvents(goal.id, 1000)
          .map((e) => activity(e, store))
          .filter((e): e is UiActivity => e !== null)
          .slice(-120)
      : [],
    recentGoals: goals
      .slice(-30)
      .reverse()
      .map((g) => ({
        id: g.id,
        request: text(g.originalRequest, 300),
        state: g.state,
      })),
    diagnostics,
    preferences,
  };
}
function projectGoal(goal: Goal): NonNullable<UiSnapshot["goal"]> {
  return {
    id: goal.id,
    request: text(goal.originalRequest, 3000),
    state: goal.state,
    mode: goal.mode,
    iteration: goal.iteration,
    maxIterations: goalConfig(goal).limits.maxGoalIterations,
    revision: goal.candidateRevision,
    reason:
      text(goal.pauseReason ?? goal.terminalReason ?? "", 2000) || undefined,
    privacy: goal.privacyClass,
    activeMs: goal.activeMs,
  };
}
