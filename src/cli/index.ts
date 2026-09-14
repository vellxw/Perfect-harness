#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeArgs } from "../i18n/es.js";
import type { Motion, Screen } from "../presentation/protocol.js";
const raw = normalizeArgs(process.argv.slice(2)),
  args = raw.filter((a) => a !== "--no-ui" && a !== "--tui-child");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major !== 26 || (minor ?? 0) < 4) {
  console.error(
    `Perfect requiere Node 26.4 o posterior dentro de 26.x; se encontró ${process.versions.node}. El paquete de Windows incluye su propio entorno.`,
  );
  process.exitCode = 1;
} else {
  const optionValue = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const rest = args.filter(
    (arg, i) =>
      !["--workspace", "--home", "--demo", "--screen", "--motion"].includes(
        arg,
      ) &&
      !["--workspace", "--home", "--demo", "--screen", "--motion"].includes(
        args[i - 1] ?? "",
      ),
  );
  const tui =
    !raw.includes("--no-ui") && !raw.includes("--json") && rest.length === 0;
  if (tui && process.stdin.isTTY && process.stdout.isTTY) {
    if (!process.execArgv.includes("--experimental-ffi")) {
      const child = spawn(
        process.execPath,
        [
          ...process.execArgv,
          "--experimental-ffi",
          fileURLToPath(import.meta.url),
          ...raw,
        ],
        { stdio: "inherit", env: process.env },
      );
      child.on("error", (error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
      child.on("exit", (code) => {
        process.exitCode = code ?? 1;
      });
    } else {
      try {
        const { startTui } = await import("../ui/tui/index.js");
        await startTui({
          home: optionValue("--home"),
          workspace: optionValue("--workspace"),
          demo: optionValue("--demo"),
          screen: optionValue("--screen") as Screen | undefined,
          motion: optionValue("--motion") as Motion | undefined,
        });
      } catch (error) {
        console.error(
          `No se pudo iniciar la interfaz de Perfect: ${String(error)}\nLa CLI tradicional está disponible con --sin-interfaz.`,
        );
        process.exitCode = 1;
      }
    }
  } else {
    if (raw.includes("--demo") && !process.stdout.isTTY) {
      console.error(
        "La demostración requiere una terminal interactiva. Para capturas sin pantalla, usá el script del renderizador.",
      );
      process.exitCode = 2;
    } else {
      const { main } = await import("./main.js");
      process.exitCode = await main(args.length ? args : ["--help"]);
    }
  }
}
