import test from "node:test";
import assert from "node:assert/strict";
import { planImpact } from "../../src/application/plan-impact.js";
import { TaskSpecSchema } from "../../src/domain/model.js";
import { makeTask } from "../fixtures/domain.js";

test("changed contract invalidates its transitive consumers but not independent tasks", () => {
  const tasks = [
    makeTask({ id: "a" }),
    makeTask({ id: "b", dependencies: ["a"] }),
    makeTask({ id: "c", dependencies: ["b"] }),
    makeTask({ id: "d" }),
  ];
  const next = tasks.map((t) => TaskSpecSchema.strip().parse(t));
  next[0]!.description = "A changed implementation contract";
  assert.deepEqual([...planImpact(tasks, next)].sort(), ["a", "b", "c"]);
});
test("failure on a repair invalidates its accepted root even if the Planner omits the repair", () => {
  const root = makeTask({ id: "original", status: "accepted" });
  const repair = makeTask({
    id: "repair",
    repairsTaskId: "original",
    status: "accepted",
  });
  assert.ok(
    planImpact(
      [root, repair],
      [TaskSpecSchema.strip().parse(root)],
      "repair",
    ).has("original"),
  );
});
test("unchanged accepted tasks outside the failure keep their outputs", () => {
  const task = makeTask({ status: "accepted" });
  assert.equal(
    planImpact([task], [TaskSpecSchema.strip().parse(task)]).size,
    0,
  );
});
