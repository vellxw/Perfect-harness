import { mkdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SqliteStore } from "../adapters/sqlite/store.js";
import { ConfigSchema, type PerfectConfig } from "../config/schema.js";
import { homeDir, loadConfig } from "../config/load.js";
import type { Goal } from "../domain/model.js";
import { Blocked } from "../domain/util.js";

export interface GlobalOptions {
  home?: string;
  workspace?: string;
  json?: boolean;
}
export interface CliContext {
  home: string;
  workspace: string;
  json: boolean;
  store: SqliteStore;
  config: () => Promise<PerfectConfig>;
  goal: (goalId?: string) => Goal;
  print: (value: unknown, text?: string) => void;
}
export async function withContext<T>(
  options: GlobalOptions,
  action: (context: CliContext) => Promise<T>,
): Promise<T> {
  const home = resolve(options.home ?? homeDir()),
    workspace = await realpath(resolve(options.workspace ?? process.cwd()));
  await mkdir(home, { recursive: true, mode: 0o700 });
  const store = new SqliteStore(join(home, "state.sqlite"));
  const context: CliContext = {
    home,
    workspace,
    json: Boolean(options.json),
    store,
    config: () => loadConfig(workspace, home),
    goal: (goalId) => {
      const value = goalId
        ? store.get("goals", goalId)
        : store
            .list("goals")
            .filter((g) => g.source === workspace)
            .at(-1);
      if (!value)
        throw new Blocked(
          "GOAL_NOT_FOUND",
          goalId ?? "No goal exists for this workspace. Specify its id.",
        );
      return value;
    },
    print: (value, text) =>
      console.log(
        options.json || text === undefined
          ? JSON.stringify(value, null, 2)
          : text,
      ),
  };
  try {
    return await action(context);
  } finally {
    store.close();
  }
}
export const goalConfig = (goal: Goal): PerfectConfig =>
  ConfigSchema.parse(goal.configSnapshot);
export function goalExit(goal: Goal): number {
  return goal.state === "DONE"
    ? 0
    : goal.state === "ABORTED"
      ? 130
      : goal.state === "PAUSED"
        ? 2
        : 3;
}
