import { createInterface } from "node:readline/promises";
import { normalizeArgs } from "../i18n/es.js";
import { humanMessage } from "../i18n/messages.js";
import type { GlobalOptions } from "./context.js";

/** Parse shell-like quoting only. Never invoke a system shell or expand substitutions. */
export function splitArguments(text: string): string[] {
  const result: string[] = [];
  let current = "",
    quote = "",
    escaped = false,
    started = false;
  for (const char of text) {
    if (escaped) {
      current += char;
      escaped = false;
      started = true;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      started = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) {
        result.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    current += char;
    started = true;
  }
  if (quote || escaped) throw new Error("Unclosed quote or escape");
  if (started) result.push(current);
  return result;
}
export async function shell(options: GlobalOptions): Promise<void> {
  const { main } = await import("./main.js");
  const rl = createInterface({ input: process.stdin, output: process.stdout }),
    controller = new AbortController();
  const common = [
    ...(options.home ? ["--home", options.home] : []),
    ...(options.workspace ? ["--workspace", options.workspace] : []),
    ...(options.json ? ["--json"] : []),
  ];
  let active: Promise<number> | undefined;
  console.log(
    'Perfect Harness · /objetivo "..." · /estado · /pausar · /reanudar · /salir',
  );
  try {
    for await (const line of rl) {
      const value = line.trim();
      if (!value) continue;
      if (["/exit", "exit", "/salir", "salir"].includes(value)) {
        controller.abort(new Error("Consola cerrada"));
        break;
      }
      try {
        const args = normalizeArgs(splitArguments(value.replace(/^\//, "")));
        if (["goal", "resume", "smoke"].includes(args[0] ?? "")) {
          if (active) {
            console.log(
              "Ya hay una ejecución activa. Usá /estado, /pausar o /cancelar.",
            );
            continue;
          }
          const running = main([...common, ...args], {
            signal: controller.signal,
          });
          active = running;
          void running.finally(() => {
            if (active === running) active = undefined;
          });
        } else await main([...common, ...args]);
      } catch (error) {
        console.error(
          humanMessage(error instanceof Error ? error.message : String(error)),
        );
      }
    }
  } finally {
    controller.abort(new Error("Consola cerrada"));
    await active;
    rl.close();
  }
}
