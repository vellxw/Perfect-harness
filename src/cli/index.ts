#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Screen, Motion } from "../presentation/protocol.js";
const raw = process.argv.slice(2),
  args = raw.filter((a) => a !== "--no-ui" && a !== "--tui-child");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major !== 26 || (minor ?? 0) < 4) {
  console.error(
    `Perfect requires Node 26.4 or newer in the 26.x line; got ${process.versions.node}. The Windows package includes its own runtime.`,
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
          `Perfect TUI could not start: ${String(error)}\nTraditional CLI is available with --no-ui.`,
        );
        process.exitCode = 1;
      }
    }
  } else {
    if (raw.includes("--demo") && !process.stdout.isTTY) {
      console.error(
        "Demo TUI requires an interactive terminal. Use the renderer test script for headless captures.",
      );
      process.exitCode = 2;
    } else {
      const { main } = await import("./main.js");
      process.exitCode = await main(args.length ? args : ["--help"]);
    }
  }
}
