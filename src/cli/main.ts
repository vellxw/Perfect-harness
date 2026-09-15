import { Command, CommanderError } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { GitWorkspace } from "../adapters/git/workspace.js";
import { PiRuntime } from "../adapters/pi/runtime.js";
import { PreparedDockerRunner } from "../adapters/sandbox/prepared-runner.js";
import { createGoal } from "../application/goals.js";
import { Orchestrator } from "../application/orchestrator.js";
import { localPolicy, savePolicy } from "../config/load.js";
import { ConfigSchema, defaultConfig } from "../config/schema.js";
import { RoleSchema, type Goal } from "../domain/model.js";
import { Blocked, errorText, hash } from "../domain/util.js";
import { normalizeArgs, stateLabel, valueLabel } from "../i18n/es.js";
import { humanMessage } from "../i18n/messages.js";
import {
  goalConfig,
  goalExit,
  withContext,
  type CliContext,
  type GlobalOptions,
} from "./context.js";
import {
  applyGoal,
  approveCriterion,
  approvePlan,
  controlGoal,
  retryTask,
} from "./control.js";
import { renderStatus, statusSnapshot } from "./display.js";
import { doctor } from "./doctor.js";
import { registerIntegrations } from "./integrations.js";
import { login } from "./login.js";
import { registerPrepare } from "./prepare.js";
import { fullstackSmoke, providerSmoke } from "./smoke.js";
import { configureSpanishHelp, humanData } from "./spanish.js";

export interface MainOptions {
  signal?: AbortSignal;
}
export async function main(
  argv: string[],
  options: MainOptions = {},
): Promise<number> {
  argv = normalizeArgs(argv);
  const program = new Command();
  let exitCode = 0;
  program
    .name("perfect")
    .description(
      "Orquestación local de agentes de programación con evidencia y Pi SDK",
    )
    .version("0.2.1")
    .option("--home <directory>", "Carpeta local de estado y cuentas")
    .option(
      "--workspace <directory>",
      "Carpeta original de trabajo (predeterminada: carpeta actual)",
    )
    .option("--json", "Salida JSON para herramientas y automatizaciones")
    .exitOverride();
  const globals = () => program.opts<GlobalOptions>();
  const context = <T>(action: (ctx: CliContext) => Promise<T>) =>
    withContext(globals(), action);
  const interruptible = async <T>(
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    const controller = new AbortController(),
      cancel = () =>
        controller.abort(new Error("El usuario interrumpió la ejecución"));
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
              `${stateLabel(state.state)} · iteración ${state.iteration} · ${state.id}\n`,
            );
        },
      });
      ctx.print(
        statusSnapshot(ctx.store, finished),
        renderStatus(ctx.store, finished),
      );
      exitCode = goalExit(finished);
    });
  registerIntegrations(program, globals);
  registerPrepare(program, context);
  program
    .command("goal <description...>")
    .description(
      "Crear y ejecutar un objetivo con proveedores reales sin modificar la carpeta original",
    )
    .option(
      "--public",
      "Declarar el objetivo y su código aptos para procesamiento público/Contributor",
    )
    .option(
      "--accept-plan",
      "Autorizar explícitamente el contrato de aceptación generado sin una pausa adicional",
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
      "Reconciliar operaciones interrumpidas y reanudar un objetivo no finalizado",
    )
    .option("--accept-plan", "Autorizar el contrato de aceptación pendiente")
    .action(
      async (goalId: string | undefined, flags: { acceptPlan?: boolean }) =>
        context((ctx) => execute(ctx, ctx.goal(goalId), flags.acceptPlan)),
    );
  program
    .command("status [goalId]")
    .option("--watch", "Actualizar hasta que se interrumpa")
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
    .option("--follow", "Seguir los eventos del dominio")
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
                  : `${event.sequence} ${event.occurredAt} · Evento ${event.type}\n${humanData(event.payload)}`,
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
            ? `${valueLabel(name)} solicitado; revisá el estado para confirmar la detención.`
            : `Objetivo ${stateLabel(goal.state)}. Se conservaron los puntos de recuperación.`,
        );
      }),
    );
  program.command("retry <taskId>").action(async (taskId: string) =>
    context(async (ctx) => {
      await retryTask(ctx, taskId);
      ctx.print(
        { taskId, status: "pending" },
        "Reintento en espera, sin reiniciar límites. Usá perfect reanudar.",
      );
    }),
  );
  program
    .command("approve-plan [goalId]")
    .description(
      "Aprobar los criterios y el contrato de verificación que se muestran",
    )
    .action(async (goalId?: string) =>
      context(async (ctx) => {
        const goal = ctx.goal(goalId);
        approvePlan(ctx, goal);
        ctx.print(
          { goalId: goal.id, approved: true },
          "Contrato de aceptación aprobado. Usá perfect reanudar.",
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
      ctx.print({ goalId: goal.id, patch }, patch || "Sin cambios.");
    }),
  );
  program
    .command("apply [goalId]")
    .option(
      "--yes",
      "Autorizar la aplicación de los cambios verificados a la carpeta original intacta",
    )
    .action(async (goalId: string | undefined, flags: { yes?: boolean }) =>
      context(async (ctx) => {
        const goal = ctx.goal(goalId);
        await applyGoal(ctx, goal, Boolean(flags.yes));
        ctx.print(
          { goalId: goal.id, applied: true, source: goal.source },
          `Cambios verificados aplicados a ${goal.source}. No se creó ningún commit ni se publicó nada en el repositorio original.`,
        );
      }),
    );
  program
    .command("init")
    .description(
      "Crear la configuración JSON predeterminada y autorizar esa versión exacta",
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
          "Configuración predeterminada creada y autorizada.",
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
    .option("--yes", "Autorizar esta configuración exacta después de revisarla")
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
            "Revisá la configuración y ejecutá confiar-config --si",
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
      "Permitir el uso del contenido público de esta carpeta en la ruta de entrenamiento Contributor",
    )
    .option("--revoke", "Revocar el consentimiento de esta carpeta")
    .action(async (flags: { yes?: boolean; revoke?: boolean }) =>
      context(async (ctx) => {
        if (!flags.yes && !flags.revoke)
          throw new Blocked(
            "CONTRIBUTOR_APPROVAL",
            "Los mensajes y respuestas de Contributor pueden usarse para entrenamiento. Revisá la carpeta y pasá --si explícitamente. Nunca lo uses con datos confidenciales ni privados de terceros.",
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
            ? "Consentimiento de Contributor revocado."
            : "Consentimiento registrado. Cada objetivo debe declararse público explícitamente con --publico.",
        );
      }),
    );
  program
    .command("doctor")
    .option(
      "--online",
      "Resolver o renovar credenciales; nunca enviar inferencias",
    )
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
            .map(
              (c) =>
                `${stateLabel(c.status).padEnd(14)} ${c.name}: ${humanMessage(c.detail)}`,
            )
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
      "Leer la clave API desde una variable de entorno, nunca como argumento visible",
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
    .option("--role <role>", "Probar un único rol configurado")
    .option(
      "--fullstack",
      "Crear y verificar el escenario temporal de reservas",
    )
    .option(
      "--mock",
      "Usar proveedores claramente simulados; las herramientas y Docker siguen siendo reales",
    )
    .option(
      "--accept-plan",
      "Autorizar el contrato de aceptación del escenario integral temporal",
    )
    .option(
      "--allow-contributor",
      "Autorizar solo los datos sintéticos públicos de esta prueba en Contributor",
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
    .description("Consola interactiva con comandos precedidos por /")
    .action(async () => {
      const { shell } = await import("./shell.js");
      await shell(globals());
    });
  configureSpanishHelp(program);
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
    else console.error(humanMessage(errorText(error)));
    return code;
  }
}
