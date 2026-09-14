import type { Task, TaskSpec } from "../domain/model.js";
import { TaskSpecSchema } from "../domain/model.js";
import { canonical } from "../domain/util.js";

/** Invalidate changed outputs and their transitive consumers, not unrelated work. */
export function planImpact(
  previous: Task[],
  next: TaskSpec[],
  triggerId?: string,
): Set<string> {
  const byId = new Map(previous.map((task) => [task.id, task]));
  const affected = new Set<string>();
  if (triggerId) {
    let task = byId.get(triggerId);
    while (task) {
      if (affected.has(task.id)) throw new Error("Repair lineage cycle");
      affected.add(task.id);
      task = task.repairsTaskId ? byId.get(task.repairsTaskId) : undefined;
    }
  }
  for (const spec of next) {
    const old = byId.get(spec.id);
    if (
      !old ||
      canonical(TaskSpecSchema.strip().parse(old)) !== canonical(spec)
    )
      affected.add(spec.id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of next) {
      if (
        !affected.has(task.id) &&
        task.dependencies.some((dep) => affected.has(dep))
      ) {
        affected.add(task.id);
        changed = true;
      }
    }
  }
  return affected;
}
