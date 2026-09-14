import type { Task, AgentDefinition } from "../domain/model.js";
import type { PerfectConfig } from "../config/schema.js";
import { readyTasks, overlaps } from "../domain/task-graph.js";
/** Admission is deterministic; only ready tasks with disjoint write ownership enter a wave. */
export function selectWave(
  tasks: Task[],
  config: PerfectConfig,
  definitionFor: (task: Task) => AgentDefinition = (task) =>
    config.agents[task.assignedAgent],
): Task[] {
  const selected: Task[] = [];
  const accounts = new Map<string, number>();
  for (const task of readyTasks(tasks)) {
    if (selected.length >= config.parallelism.maxParallelAgents) break;
    const def = definitionFor(task);
    const writers = selected.filter(
      (t) => t.ownedFiles.length + t.ownedSurfaces.length > 0,
    ).length;
    if (
      task.ownedFiles.length + task.ownedSurfaces.length > 0 &&
      writers >= config.parallelism.maxParallelWriters
    )
      continue;
    if (
      task.assignedAgent === "general" &&
      selected.filter((t) => t.assignedAgent === "general").length >=
        config.parallelism.maxParallelGeneralWorkers
    )
      continue;
    if (
      (accounts.get(def.accountRef) ?? 0) >=
      (config.parallelism.perAccount[def.accountRef] ?? 1)
    )
      continue;
    const surfaces = [...task.ownedFiles, ...task.ownedSurfaces];
    if (
      selected.some((t) =>
        [...t.ownedFiles, ...t.ownedSurfaces].some((a) =>
          surfaces.some((b) => overlaps(a, b)),
        ),
      )
    )
      continue;
    selected.push(task);
    accounts.set(def.accountRef, (accounts.get(def.accountRef) ?? 0) + 1);
  }
  return selected;
}
