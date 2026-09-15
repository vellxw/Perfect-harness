import test from "node:test";
import assert from "node:assert/strict";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { OwnershipManager } from "../../src/application/ownership.js";
import { makeGoal, makePlan, makeTask } from "../fixtures/domain.js";

test("state and events roll back together", () => {
  const store = new SqliteStore(":memory:");
  try {
    assert.throws(() =>
      store.transaction(() => {
        store.put("goals", makeGoal(), "goal.created");
        throw Error("crash");
      }),
    );
    assert.equal(store.list("goals").length, 0);
    assert.equal(store.events("goal-test").length, 0);
  } finally {
    store.close();
  }
});
test("plans are immutable", () => {
  const store = new SqliteStore(":memory:");
  try {
    store.put("plans", makePlan(), "plan.generated");
    assert.throws(
      () => store.put("plans", { ...makePlan(), version: 2 }, "plan.generated"),
      /Immutable/,
    );
  } finally {
    store.close();
  }
});
test("ownership prevents intersecting writes; release is explicit", () => {
  const store = new SqliteStore(":memory:");
  try {
    const manager = new OwnershipManager(store);
    const lease = manager.acquire(makeTask({ id: "a" }), "/tree-a", 60000);
    assert.throws(
      () =>
        manager.acquire(
          makeTask({ id: "b", ownedSurfaces: ["src/nested"] }),
          "/tree-b",
          60000,
        ),
      /BUSY/,
    );
    assert.throws(() => manager.assert(lease.id, "other/file"), /DENIED/);
    manager.assert(lease.id, "src/file");
    manager.release(lease.id);
    assert.doesNotThrow(() =>
      manager.acquire(makeTask({ id: "b" }), "/tree-b", 60000),
    );
  } finally {
    store.close();
  }
});
test("expired ownership is not silently reallocated", () => {
  const store = new SqliteStore(":memory:");
  try {
    const manager = new OwnershipManager(store);
    manager.acquire(makeTask({ id: "a" }), "/tree-a", -1);
    assert.throws(
      () => manager.acquire(makeTask({ id: "b" }), "/tree-b", 60000),
      /BUSY/,
    );
  } finally {
    store.close();
  }
});

test("the same task cannot hold two overlapping write leases", () => {
  const store = new SqliteStore(":memory:");
  try {
    const ownership = new OwnershipManager(store),
      task = makeTask();
    ownership.acquire(task, "one", 60000);
    assert.throws(
      () => ownership.acquire(task, "two", 60000),
      /OWNERSHIP_BUSY/,
    );
  } finally {
    store.close();
  }
});
