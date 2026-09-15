import type { Command } from "commander";
import { prepareDependencies } from "../adapters/sandbox/dependencies.js";
import type { CliContext } from "./context.js";
import { goalConfig } from "./context.js";
export function registerPrepare(
  program: Command,
  context: <T>(action: (ctx: CliContext) => Promise<T>) => Promise<T>,
): void {
  program
    .command("prepare [goalId]")
    .description(
      "Preparar una imagen de dependencias del registro; nunca ejecutar scripts de instalación",
    )
    .option(
      "--allow-network",
      "Autorizar la descarga de paquetes del registro público de npm",
    )
    .option("--task <taskId>", "Preparar los manifiestos de una tarea pausada")
    .option(
      "--render",
      "Usar la imagen de navegador configurada como base para renderizar",
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
              controller.abort(new Error("Preparación interrumpida"));
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
              `Imagen inmutable de dependencias preparada: ${image.imageId}. El archivo de dependencias quedó guardado solo en el estado administrado. Reanudá el objetivo.`,
            );
          } finally {
            process.removeListener("SIGINT", cancel);
          }
        }),
    );
}
