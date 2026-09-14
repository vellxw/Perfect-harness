import type { Command } from "commander";
import type { CliContext } from "./context.js";
import { goalConfig } from "./context.js";
import { prepareDependencies } from "../adapters/sandbox/dependencies.js";
export function registerPrepare(
  program: Command,
  context: <T>(action: (ctx: CliContext) => Promise<T>) => Promise<T>,
): void {
  program
    .command("prepare [goalId]")
    .description(
      "Explicitly prepare a registry-only dependency image; never runs npm lifecycle scripts",
    )
    .option(
      "--allow-network",
      "Approve downloading packages from the public npm registry",
    )
    .option(
      "--task <taskId>",
      "Prepare manifests from a paused task checkpoint",
    )
    .option(
      "--render",
      "Use the configured browser image as the base for render dependencies",
    )
    .action(
      async (
        goalId: string | undefined,
        flags: { allowNetwork?: boolean; task?: string; render?: boolean },
      ) =>
        context(async (ctx) => {
          const goal = ctx.goal(goalId),
            controller = new AbortController(),
            cancel = () =>
              controller.abort(new Error("Preparation interrupted"));
          process.once("SIGINT", cancel);
          try {
            const image = await prepareDependencies({
              goal,
              config: goalConfig(goal),
              store: ctx.store,
              home: ctx.home,
              allowNetwork: Boolean(flags.allowNetwork),
              taskId: flags.task,
              render: flags.render,
              signal: controller.signal,
            });
            ctx.print(
              image,
              `Prepared immutable dependency image ${image.imageId}. The lockfile was checkpointed only in managed state. Resume the goal.`,
            );
          } finally {
            process.removeListener("SIGINT", cancel);
          }
        }),
    );
}
