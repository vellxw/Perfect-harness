import type { Goal } from "../domain/model.js";
import { stateLabel, valueLabel } from "../i18n/es.js";
import type { StateStore } from "../ports/state-store.js";
export function statusSnapshot(store: StateStore, goal: Goal) {
  const tasks = store.list("tasks", goal.id),
    runs = store.list("runs", goal.id),
    usage = store.list("usage", goal.id),
    verifications = store
      .list("verifications", goal.id)
      .filter((v) => v.revision === goal.candidateRevision);
  const latestChecks = [
    ...new Map(verifications.map((v) => [v.specId, v])).values(),
  ];
  const plan = goal.activePlanId
    ? store.get("plans", goal.activePlanId)
    : undefined;
  const accounts = [...new Set(usage.map((u) => u.accountRef))].map(
    (account) => {
      const records = usage.filter((u) => u.accountRef === account);
      return {
        account,
        billingModes: [...new Set(records.map((u) => u.billingMode))],
        reportedTokens: records.reduce((n, u) => n + (u.totalTokens ?? 0), 0),
        unknownRequests: records.filter((u) => u.totalTokens === undefined)
          .length,
        estimatedMeteredUsd: records.some(
          (u) => u.billingMode === "metered" && u.estimatedCost !== undefined,
        )
          ? records.reduce(
              (n, u) =>
                n + (u.billingMode === "metered" ? (u.estimatedCost ?? 0) : 0),
              0,
            )
          : null,
        reportedChargesUsd: records.some((u) => u.reportedCharge !== undefined)
          ? records.reduce((n, u) => n + (u.reportedCharge ?? 0), 0)
          : null,
      };
    },
  );
  return {
    goal: {
      id: goal.id,
      request: goal.originalRequest,
      state: goal.state,
      mode: goal.mode,
      iteration: goal.iteration,
      revision: goal.candidateRevision,
      reason: goal.pauseReason ?? goal.terminalReason,
      activeMs: goal.activeMs,
    },
    tasks,
    running: runs.filter((r) => r.status === "running"),
    recentRuns: runs.slice(-10),
    verification: {
      passed: latestChecks.filter((v) => v.status === "passed").length,
      total: plan?.verification.length ?? latestChecks.length,
    },
    oracleCalls: goal.oracleCalls,
    plannerCalls: goal.plannerCalls,
    providerRequests: goal.providerRequests,
    accounts,
  };
}
export function renderStatus(store: StateStore, goal: Goal): string {
  const value = statusSnapshot(store, goal);
  const lines = [
    `GOAL ${goal.id}`,
    goal.originalRequest,
    `Estado: ${stateLabel(goal.state)} | Modo: ${valueLabel(goal.mode)} | Iteración: ${goal.iteration}/${(goal.configSnapshot as { limits: { maxGoalIterations: number } }).limits.maxGoalIterations}`,
    `Candidate: ${goal.candidateRevision}`,
    `Planner: ${goal.plannerCalls} calls | Oracle: ${goal.oracleCalls} calls | Requests: ${goal.providerRequests}`,
    "",
  ];
  for (const run of value.running) {
    const route = run.routeBinding;
    const observation = store
      .list("usage", goal.id)
      .filter((u) => u.runId === run.id)
      .at(-1);
    const elapsed = Math.floor((Date.now() - Date.parse(run.startedAt)) / 1000);
    lines.push(
      `EN CURSO ${run.taskId ?? route.id}: ${route.provider}/${route.model} | solicitado ${route.requestedReasoning} | seleccionado ${route.selectedReasoning} | enviado ${observation?.reasoningSent ?? "todavía no observado"} | informado ${observation?.reasoningReported ?? "desconocido"} | ${elapsed}s`,
    );
  }
  for (const task of value.tasks.filter(
    (t) => !["superseded", "accepted"].includes(t.status),
  ))
    lines.push(
      `${task.status.toUpperCase()} ${task.id}: ${task.title} (${task.attempt}/${task.maxAttempts})`,
    );
  lines.push(
    "",
    `Verificación de la versión actual: ${value.verification.passed}/${value.verification.total}`,
  );
  for (const account of value.accounts)
    lines.push(
      `${account.account}: ${account.reportedTokens} tokens informados; ${account.unknownRequests} solicitudes inciertas; cargo observado ${account.reportedChargesUsd === null ? "no informado" : `USD ${account.reportedChargesUsd.toFixed(4)}`}`,
    );
  if (goal.pauseReason ?? goal.terminalReason)
    lines.push(`Reason: ${goal.pauseReason ?? goal.terminalReason}`);
  lines.push(`Evidencia e informe: ${goal.root}`);
  return lines.join("\n");
}
