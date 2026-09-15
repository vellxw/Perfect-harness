import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { splitArguments } from "../cli/shell.js";
import { commandName, normalizeArgs } from "../i18n/es.js";
import { humanMessage } from "../i18n/messages.js";

/** Thin presentation adapter: all scheduling, state and policies remain in the application. */
export default function perfectExtension(pi: ExtensionAPI): void {
  const cli = fileURLToPath(new URL("../cli/index.js", import.meta.url));
  const children = new Set<ReturnType<typeof spawn>>();
  const invoke = async (args: string[], ctx: ExtensionCommandContext) => {
    args = normalizeArgs(args);
    const allowed = new Set([
      "goal",
      "status",
      "plan",
      "tasks",
      "agents",
      "routing",
      "cost",
      "pause",
      "resume",
      "abort",
      "retry",
      "logs",
      "diff",
      "doctor",
      "approve-plan",
    ]);
    if (!allowed.has(args[0] ?? "")) {
      ctx.ui.notify(
        "Usá la CLI independiente para conectar cuentas, autorizar datos, configurar y aplicar cambios.",
        "warning",
      );
      return;
    }
    if (args.includes("--watch") || args.includes("--follow")) {
      ctx.ui.notify(
        "Usá una terminal para seguir el estado y los registros.",
        "warning",
      );
      return;
    }
    ctx.ui.notify(
      `Perfect: ${commandName(args[0]!)} iniciado. El estado sigue disponible en la CLI independiente.`,
      "info",
    );
    const child = spawn(
      process.execPath,
      [cli, "--workspace", ctx.cwd, ...args],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    children.add(child);
    let stdout = "",
      stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-60000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-16000);
    });
    try {
      const code = await new Promise<number>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (value) => resolve(value ?? 130));
      });
      ctx.ui.notify(
        (stdout || stderr || `Perfect terminó con código ${code}`).slice(
          -16000,
        ),
        code === 0 ? "info" : code === 2 ? "warning" : "error",
      );
    } catch (error) {
      ctx.ui.notify(
        humanMessage(error instanceof Error ? error.message : String(error)),
        "error",
      );
    } finally {
      children.delete(child);
    }
  };
  for (const name of ["goal", "objetivo"])
    pi.registerCommand(name, {
      description:
        "Crear un objetivo de Perfect Harness con auditoría independiente",
      handler: async (args, ctx) => {
        if (!args.trim()) {
          ctx.ui.notify("Uso: /objetivo <descripción>", "warning");
          return;
        }
        await invoke(["goal", "--", args], ctx);
      },
    });
  pi.registerCommand("perfect", {
    description:
      "Estado, tareas, modelos, pausa, reanudación e inspección de Perfect",
    handler: async (args, ctx) => {
      try {
        await invoke(splitArguments(args.trim() || "status"), ctx);
      } catch (error) {
        ctx.ui.notify(
          humanMessage(error instanceof Error ? error.message : String(error)),
          "error",
        );
      }
    },
  });
  pi.on("session_shutdown", async () => {
    for (const child of children) child.kill("SIGINT");
    await Promise.all(
      [...children].map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null) {
              resolve();
              return;
            }
            child.once("close", () => resolve());
            const timer = setTimeout(() => {
              child.kill("SIGTERM");
              resolve();
            }, 10000);
            timer.unref();
          }),
      ),
    );
  });
}
