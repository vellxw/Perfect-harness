import { Command, CommanderError } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  withContext,
  goalConfig,
  goalExit,
  type GlobalOptions,
  type CliContext,
} from "./context.js";
import { statusSnapshot, renderStatus } from "./display.js";
import { doctor } from "./doctor.js";
import { login } from "./login.js";
import { providerSmoke, fullstackSmoke } from "./smoke.js";
import {
  controlGoal,
  approvePlan,
  approveCriterion,
  retryTask,
  applyGoal,
} from "./control.js";
import { defaultConfig, ConfigSchema } from "../config/schema.js";
import { localPolicy, savePolicy } from "../config/load.js";
import { PiRuntime } from "../adapters/pi/runtime.js";
import { PreparedDockerRunner } from "../adapters/sandbox/prepared-runner.js";
import { registerPrepare } from "./prepare.js";
import { GitWorkspace } from "../adapters/git/workspace.js";
import { Orchestrator } from "../application/orchestrator.js";
import { createGoal } from "../application/goals.js";
import { RoleSchema, type Goal } from "../domain/model.js";
import { hash, errorText, Blocked } from "../domain/util.js";

export interface MainOptions {
  signal?: AbortSignal;
}
export async function main(
  argv: string[],
  options: MainOptions = {},
): Promise<number> {
  const program = new Command();
  let exitCode = 0;
  program
    .name("perfect")
    .description("Evidence-driven local coding-agent orchestration on Pi SDK")
    .version("0.2.0")
    .option("--home <directory>", "Local state and account directory")
    .option(
      "--workspace <directory>",
      "Source workspace (default: current directory)",
    )
    .option("--json", "Machine-readable output")
    .exitOverride();
  const globals = () => program.opts<GlobalOptions>();
  const context = <T>(action: (ctx: CliContext) => Promise<T>) =>
    withContext(globals(), action);
  const interruptible = async <T>(
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    const controller = new AbortController(),
      cancel = () => controller.abort(new Error("User interrupted execution"));
    process.once("SIGINT", cancel);
    try {
      return await action(
        options.signal
          ? AbortSignal.any([controller.signal, options.signal])
          : controller.signal,
      );
    } finally {
      process.removeListener("SIGINT", cancel);
    }
  };
  const execute = async (ctx: CliContext, goal: Goal, acceptPlan = false) =>
    interruptible(async (signal) => {
      const config = goalConfig(goal);
      const orchestrator = new Orchestrator(
        ctx.store,
        new PiRuntime(ctx.home, config),
        new PreparedDockerRunner(config, ctx.store, join(ctx.home, "sandbox")),
      );
      const finished = await orchestrator.run(goal.id, {
        signal,
        acceptPlan,
        contributorConsent: async () =>
          (await localPolicy(ctx.home)).contributorWorkspaces.includes(
            goal.source,
          ),
        onState: (state) => {
          if (!ctx.json)
            process.stderr.write(
              `${state.state} · iteration ${state.iteration} · ${state.id}\n`,
            );
        },
      });
      ctx.print(
        statusSnapshot(ctx.store, finished),
        renderStatus(ctx.store, finished),
      );
      exitCode = goalExit(finished);
    });
  registerPrepare(program, context);
  program
    .command("goal <description...>")
    .description(
      "Create and run a real-provider goal without modifying the source checkout",
    )
    .option(
      "--public",
      "Declare this goal and its source suitable for public/contributor processing",
    )
    .option(
      "--accept-plan",
      "Explicitly authorize the generated acceptance contract without a separate approval pause",
    )
    .action(
      async (
        description: string[],
        flags: { public?: boolean; acceptPlan?: boolean },
      ) =>
        context(async (ctx) => {
          const goal = await createGoal(
            {
              request: description.join(" "),
              source: ctx.workspace,
              home: ctx.home,
              config: await ctx.config(),
              privacy: flags.public ? "public" : "private",
            },
            ctx.store,
          );
          await execute(ctx, goal, flags.acceptPlan);
        }),
    );
  program
    .command("resume [goalId]")
    .description(
      "Reconcile interrupted operations and resume a nonterminal goal",
    )
    .option("--accept-plan", "Authorize the pending acceptance contract")
    .action(
      async (goalId: string | undefined, flags: { acceptPlan?: boolean }) =>
        context((ctx) => execute(ctx, ctx.goal(goalId), flags.acceptPlan)),
    );
  program
    .command("status [goalId]")
    .option("--watch", "Refresh until interrupted")
    .action(async (goalId: string | undefined, flags: { watch?: boolean }) =>
      context(async (ctx) => {
        if (!flags.watch) {
          const goal = ctx.goal(goalId);
          ctx.print(
            statusSnapshot(ctx.store, goal),
            renderStatus(ctx.store, goal),
          );
          return;
        }
        await interruptible(async (signal) => {
          while (!signal.aborted) {
            const goal = ctx.goal(goalId);
            if (ctx.json)
              console.log(JSON.stringify(statusSnapshot(ctx.store, goal)));
            else {
              if (process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[H");
              console.log(renderStatus(ctx.store, goal));
            }
            try {
              await delay(1000, undefined, { signal });
            } catch {
              break;
            }
          }
        });
      }),
    );
  for (const name of ["plan", "tasks", "agents", "routing", "cost"] as const)
    program.command(`${name} [goalId]`).action(async (goalId?: string) =>
      context(async (ctx) => {
        const goal = ctx.goal(goalId),
          snapshot = statusSnapshot(ctx.store, goal);
        if (name === "plan")
          ctx.print({
            plan: ctx.store.get("plans", goal.activePlanId ?? ""),
            approvals: ctx.store
              .list("approvals", goal.id)
              .filter((a) => a.kind === "plan"),
          });
        if (name === "tasks") ctx.print(snapshot.tasks);
        if (name === "agents") ctx.print(ctx.store.list("runs", goal.id));
        if (name === "routing")
          ctx.print({
            configured: goalConfig(goal).agents,
            observed: ctx.store.list("runs", goal.id).map((run) => ({
              runId: run.id,
              role: run.agentDefinitionId,
              binding: run.routeBinding,
              usage: ctx.store
                .list("usage", goal.id)
                .filter((u) => u.runId === run.id),
            })),
          });
        if (name === "cost")
          ctx.print({
            accounts: snapshot.accounts,
            usage: ctx.store.list("usage", goal.id),
            reservations: ctx.store.list("reservations", goal.id),
          });
      }),
    );
  program
    .command("logs [goalId]")
    .option("--follow", "Follow domain events")
    .action(async (goalId: string | undefined, flags: { follow?: boolean }) =>
      context(async (ctx) => {
        const goal = ctx.goal(goalId);
        let after = 0;
        await interruptible(async (signal) => {
          do {
            for (const event of ctx.store.events(goal.id, after)) {
              after = event.sequence ?? after;
              console.log(
                ctx.json
                  ? JSON.stringify(event)
                  : `${event.sequence} ${event.occurredAt} ${event.type} ${JSON.stringify(event.payload)}`,
              );
            }
            if (!flags.follow) break;
            try {
              await delay(500, undefined, { signal });
            } catch {
              break;
            }
          } while (!signal.aborted);
        });
      }),
    );
  for (const name of ["pause", "abort"] as const)
    program.command(`${name} [goalId]`).action(async (goalId?: string) =>
      context(async (ctx) => {
        const goal = await controlGoal(ctx, ctx.goal(goalId), name);
        ctx.print(
          {
            goalId: goal.id,
            state: goal.state,
            requested: goal.controlRequest,
          },
          goal.controlRequest
            ? `${name} requested; inspect status for confirmed termination.`
            : `Goal is ${goal.state}. Checkpoints were preserved.`,
        );
      }),
    );
  program.command("retry <taskId>").action(async (taskId: string) =>
    context(async (ctx) => {
      await retryTask(ctx, taskId);
      ctx.print(
        { taskId, status: "pending" },
        `Retry queued without resetting limits. Use perfect resume.`,
      );
    }),
  );
  program
    .command("approve-plan [goalId]")
    .description(
      "Approve the exact currently displayed acceptance criteria and verification contract",
    )
    .action(async (goalId?: string) =>
      context(async (ctx) => {
        const goal = ctx.goal(goalId);
        approvePlan(ctx, goal);
        ctx.print(
          { goalId: goal.id, approved: true },
          "Acceptance contract approved. Use perfect resume.",
        );
      }),
    );
  program
    .command("approve <criterionId>")
    .option("--goal <goalId>")
    .action(async (criterionId: string, flags: { goal?: string }) =>
      context(async (ctx) => {
        const goal = ctx.goal(flags.goal);
        approveCriterion(ctx, goal, criterionId);
        ctx.print({
          criterionId,
          revision: goal.candidateRevision,
          approved: true,
        });
      }),
    );
  program.command("diff [goalId]").action(async (goalId?: string) =>
    context(async (ctx) => {
      const goal = ctx.goal(goalId),
        patch = await new GitWorkspace(goal.root, goalConfig(goal)).diff(
          goal.baseline,
        );
      ctx.print({ goalId: goal.id, patch }, patch || "No changes.");
    }),
  );
  program
    .command("apply [goalId]")
    .option(
      "--yes",
      "Approve applying the verified delta to the unchanged original workspace",
    )
    .action(async (goalId: string | undefined, flags: { yes?: boolean }) =>
      context(async (ctx) => {
        const goal = ctx.goal(goalId);
        await applyGoal(ctx, goal, Boolean(flags.yes));
        ctx.print(
          { goalId: goal.id, applied: true, source: goal.source },
          `Applied verified changes to ${goal.source}. No commit or push was made in the original repository.`,
        );
      }),
    );
  program
    .command("init")
    .description(
      "Write default JSON config and trust that exact generated version",
    )
    .action(async () =>
      context(async (ctx) => {
        const config = defaultConfig();
        await writeFile(
          join(ctx.workspace, "perfect.config.json"),
          JSON.stringify(config, null, 2) + "\n",
          { flag: "wx" },
        );
        const policy = await localPolicy(ctx.home);
        policy.trustedConfigs[ctx.workspace] = hash(config);
        await savePolicy(policy, ctx.home);
        ctx.print(
          { created: "perfect.config.json" },
          "Created and trusted the generated default configuration.",
        );
      }),
    );
  program
    .command("config-schema")
    .action(() =>
      console.log(JSON.stringify(z.toJSONSchema(ConfigSchema), null, 2)),
    );
  program
    .command("trust-config")
    .option("--yes", "Authorize this exact reviewed configuration")
    .action(async (flags: { yes?: boolean }) =>
      context(async (ctx) => {
        const config = ConfigSchema.parse(
          JSON.parse(
            await readFile(join(ctx.workspace, "perfect.config.json"), "utf8"),
          ),
        );
        ctx.print(config);
        if (!flags.yes)
          throw new Blocked(
            "CONFIG_APPROVAL",
            "Review the configuration above, then run trust-config --yes",
          );
        const policy = await localPolicy(ctx.home);
        policy.trustedConfigs[ctx.workspace] = hash(config);
        await savePolicy(policy, ctx.home);
      }),
    );
  program
    .command("consent-contributor")
    .option(
      "--yes",
      "Allow public workspace content to use the Contributor training route",
    )
    .option("--revoke", "Revoke consent for this workspace")
    .action(async (flags: { yes?: boolean; revoke?: boolean }) =>
      context(async (ctx) => {
        if (!flags.yes && !flags.revoke)
          throw new Blocked(
            "CONTRIBUTOR_APPROVAL",
            "Contributor prompts/responses may be used for training. Review the workspace and pass --yes explicitly; never use for confidential or third-party private data.",
          );
        const policy = await localPolicy(ctx.home);
        policy.contributorWorkspaces = policy.contributorWorkspaces.filter(
          (path) => path !== ctx.workspace,
        );
        if (!flags.revoke) policy.contributorWorkspaces.push(ctx.workspace);
        await savePolicy(policy, ctx.home);
        ctx.print(
          { workspace: ctx.workspace, consent: !flags.revoke },
          flags.revoke
            ? "Contributor consent revoked."
            : "Contributor consent recorded. Each applicable goal must still be explicitly classified --public.",
        );
      }),
    );
  program
    .command("doctor")
    .option("--online", "Resolve/refresh credentials; never run inference")
    .action(async (flags: { online?: boolean }) =>
      context(async (ctx) => {
        const checks = await doctor(
          ctx.home,
          ctx.workspace,
          await ctx.config(),
          Boolean(flags.online),
        );
        ctx.print(
          checks,
          checks
            .map((c) => `${c.status.padEnd(12)} ${c.name}: ${c.detail}`)
            .join("\n"),
        );
        if (checks.some((c) => c.status === "BLOCKED")) exitCode = 2;
      }),
    );
  program
    .command("login <provider>")
    .option("--account <reference>")
    .option(
      "--key-env <variable>",
      "Read API key from a named environment variable, never from a CLI token argument",
    )
    .action(
      async (provider: string, flags: { account?: string; keyEnv?: string }) =>
        context(async (ctx) =>
          login(
            ctx.home,
            await ctx.config(),
            provider,
            flags.account,
            flags.keyEnv,
          ),
        ),
    );
  program
    .command("smoke")
    .option("--role <role>", "Test a single configured role")
    .option(
      "--fullstack",
      "Create and verify the temporary reservation scenario",
    )
    .option(
      "--mock",
      "Use visibly scripted providers in the fullstack scenario; tools and Docker remain real",
    )
    .option(
      "--accept-plan",
      "Authorize the temporary fullstack acceptance contract",
    )
    .option(
      "--allow-contributor",
      "Consent only to synthetic public smoke-test data using Contributor",
    )
    .action(
      async (flags: {
        role?: string;
        fullstack?: boolean;
        mock?: boolean;
        acceptPlan?: boolean;
        allowContributor?: boolean;
      }) =>
        context(async (ctx) =>
          interruptible(async (signal) => {
            const config = await ctx.config(),
              policy = await localPolicy(ctx.home);
            const consent =
              Boolean(flags.allowContributor) ||
              policy.contributorWorkspaces.includes(ctx.workspace);
            if (flags.fullstack || flags.mock) {
              const result = await fullstackSmoke({
                home: ctx.home,
                config,
                store: ctx.store,
                mock: Boolean(flags.mock),
                acceptPlan: flags.acceptPlan,
                contributorConsent: consent,
                signal,
              });
              ctx.print(result);
              exitCode = result.status === "PASS" ? 0 : 2;
            } else {
              const result = await providerSmoke({
                home: ctx.home,
                config,
                store: ctx.store,
                roles: flags.role ? [RoleSchema.parse(flags.role)] : undefined,
                contributorConsent: consent,
                signal,
              });
              ctx.print(result);
              exitCode = result.checks.every((c) => c.status === "PASS")
                ? 0
                : 2;
            }
          }),
        ),
    );
  program
    .command("shell")
    .description("Interactive slash-command shell")
    .action(async () => {
      const { shell } = await import("./shell.js");
      await shell(globals());
    });
  if (argv.length === 0) argv = ["--help"];
  try {
    await program.parseAsync(argv, { from: "user" });
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    if (options.signal?.aborted) return 130;
    const code = error instanceof Blocked ? 2 : 3;
    if (globals().json)
      console.error(JSON.stringify({ error: errorText(error), code }));
    else console.error(errorText(error));
    return code;
  }
}
