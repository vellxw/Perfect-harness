import test from "node:test";
import assert from "node:assert/strict";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { BudgetManager } from "../../src/application/budget.js";
import { Semaphore } from "../../src/application/semaphore.js";
import { defaultConfig } from "../../src/config/schema.js";
import { makeGoal } from "../fixtures/domain.js";
import type { RouteBinding } from "../../src/domain/model.js";
const route = (): RouteBinding => ({
  ...defaultConfig().agents.general,
  runtimeVersion: "test",
  capabilityHash: "hash",
  endpoint: "mock://",
  requestedReasoning: "medium",
  selectedReasoning: "medium",
  resolvedAt: "now",
  provenance: "mock",
});
test("hard budgets reserve concurrent requests before admission", () => {
  const store = new SqliteStore(":memory:"),
    cfg = defaultConfig();
  cfg.budgets.mode = "hard";
  cfg.budgets.maxTokens = 150;
  try {
    store.put("goals", makeGoal(), "goal.created");
    const budget = new BudgetManager(store, "goal-test", cfg);
    budget.reserve("r1", "run1", route(), 100);
    assert.throws(
      () => budget.reserve("r2", "run2", route(), 100),
      /BUDGET_LIMIT/,
    );
    budget.interrupt("run1");
    assert.equal(store.get("reservations", "r1")?.status, "unknown");
    assert.throws(
      () => budget.reserve("r3", "run3", route(), 100),
      /BUDGET_LIMIT/,
    );
  } finally {
    store.close();
  }
});
test("metered routes cannot piggyback on subscriptions", () => {
  const store = new SqliteStore(":memory:");
  try {
    store.put("goals", makeGoal(), "goal.created");
    const budget = new BudgetManager(store, "goal-test", defaultConfig());
    assert.throws(
      () =>
        budget.reserve("r", "run", { ...route(), billingMode: "metered" }, 10),
      /METERED_DENIED/,
    );
  } finally {
    store.close();
  }
});
test("semaphore provides real bounded parallelism and aborts queued work", async () => {
  const semaphore = new Semaphore(2),
    signal = new AbortController().signal;
  let running = 0,
    maximum = 0;
  await Promise.all(
    Array.from({ length: 8 }, () =>
      semaphore.use(signal, async () => {
        running++;
        maximum = Math.max(maximum, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
      }),
    ),
  );
  assert.equal(maximum, 2);
  const one = new Semaphore(1),
    controller = new AbortController();
  let release!: () => void;
  const held = one.use(
    signal,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await new Promise((r) => setTimeout(r, 0));
  const queued = one.use(controller.signal, async () => {
    throw new Error("Should never run");
  });
  controller.abort();
  await assert.rejects(queued);
  release();
  await held;
});
