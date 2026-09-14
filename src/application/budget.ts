import type { PerfectConfig } from "../config/schema.js";
import type { RouteBinding, Usage } from "../domain/model.js";
import type { StateStore, BudgetReservation } from "../ports/state-store.js";
import { now, Blocked } from "../domain/util.js";
export class BudgetManager {
  constructor(
    private store: StateStore,
    private goalId: string,
    private config: PerfectConfig,
  ) {}
  reserve(
    requestId: string,
    runId: string,
    route: RouteBinding,
    tokens: number,
    estimatedCost?: number,
  ): void {
    this.store.transaction(() => {
      if (this.store.get("reservations", requestId))
        throw new Error("Duplicate request reservation");
      const goal = this.store.get("goals", this.goalId);
      if (!goal) throw new Error("Goal not found");
      if (goal.providerRequests >= this.config.limits.maxGoalProviderRequests)
        throw new Blocked("REQUEST_BUDGET", "Provider request limit reached");
      if (route.billingMode === "metered" && !this.config.budgets.allowMetered)
        throw new Blocked(
          "METERED_DENIED",
          "Pay-per-token routes are disabled",
        );
      const usage = this.store.list("usage", this.goalId),
        held = this.store
          .list("reservations", this.goalId)
          .filter((r) => r.status !== "settled");
      const totalTokens =
        usage.reduce((n, u) => n + (u.totalTokens ?? 0), 0) +
        held.reduce((n, r) => n + r.tokens, 0) +
        tokens;
      const totalCost =
        usage.reduce((n, u) => n + (u.estimatedCost ?? 0), 0) +
        held.reduce((n, r) => n + (r.estimatedCost ?? 0), 0) +
        (estimatedCost ?? 0);
      const exceeded =
        totalTokens > this.config.budgets.maxTokens ||
        (this.config.budgets.maxCostUsd !== undefined &&
          totalCost > this.config.budgets.maxCostUsd);
      if (
        this.config.budgets.mode === "hard" &&
        this.config.budgets.maxCostUsd !== undefined &&
        route.billingMode === "metered" &&
        estimatedCost === undefined
      )
        throw new Blocked(
          "COST_UNKNOWN",
          "Cannot enforce a monetary bound on this request",
        );
      if (exceeded && this.config.budgets.mode === "hard")
        throw new Blocked("BUDGET_LIMIT", "Admission would exceed budget");
      if (exceeded && this.config.budgets.mode === "warn")
        this.store.event(this.goalId, "budget.warning", {
          totalTokens,
          totalCost,
        });
      const reservation: BudgetReservation = {
        id: requestId,
        goalId: this.goalId,
        runId,
        tokens,
        estimatedCost,
        status: "held",
        createdAt: now(),
      };
      this.store.put("reservations", reservation, "budget.reserved");
      this.store.put(
        "goals",
        {
          ...goal,
          providerRequests: goal.providerRequests + 1,
          updatedAt: now(),
        },
        "provider.requested",
      );
    });
  }
  settle(usage: Usage): void {
    this.store.transaction(() => {
      this.store.put("usage", usage, "usage.recorded");
      const reservation = usage.requestId
        ? this.store.get("reservations", usage.requestId)
        : undefined;
      if (reservation)
        this.store.put(
          "reservations",
          {
            ...reservation,
            status: usage.totalTokens === undefined ? "unknown" : "settled",
          },
          "budget.settled",
        );
    });
  }
  interrupt(runId: string): void {
    for (const r of this.store
      .list("reservations", this.goalId)
      .filter((r) => r.runId === runId && r.status === "held"))
      this.store.put(
        "reservations",
        { ...r, status: "unknown" },
        "budget.uncertain",
      );
  }
}
