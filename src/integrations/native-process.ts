import { spawn } from "node:child_process";
import { Blocked } from "../domain/util.js";
import { cleanEnvironment } from "./wire.js";

/** Fixed binaries only. Cancellation waits for termination, not just a sent signal. */
export async function nativeProcess(
  executable: string,
  args: string[],
  directory: string,
  signal: AbortSignal,
  input?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: directory,
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...cleanEnvironment(directory, {}),
        WINAPP_CLI_TELEMETRY_OPTOUT: "1",
        DOTNET_CLI_TELEMETRY_OPTOUT: "1",
        NO_COLOR: "1",
      },
    });
    const buffers: Buffer[] = [];
    let bytes = 0;
    let stderr = "";
    let settled = false;
    let stopping = false;
    let failure: unknown;
    let force: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => stop(new Blocked("DESKTOP_TIMEOUT", "La herramienta nativa excedió su tiempo; verificá el resultado antes de repetir")), 30000);
    const abort = () => stop(signal.reason ?? new Error("Cancelado"));
    function cleanup() {
      clearTimeout(timer);
      clearTimeout(force);
      clearTimeout(deadline);
      signal.removeEventListener("abort", abort);
    }
    function stop(error: unknown) {
      if (settled || stopping) return;
      stopping = true;
      failure = error;
      child.kill("SIGTERM");
      force = setTimeout(() => { if (!settled) child.kill("SIGKILL"); }, 1000);
      deadline = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Blocked("DESKTOP_STOP_UNCONFIRMED", "No se confirmó la terminación del proceso nativo. Detené el control y revisá el equipo antes de continuar."));
      }, 5000);
    }
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    child.on("error", stop);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 8_000_000) stop(new Blocked("DESKTOP_OUTPUT_LIMIT", "Salida nativa demasiado grande"));
      else if (!stopping) buffers.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-4000); });
    child.on("close", code => {
      if (settled) return;
      settled = true;
      cleanup();
      if (stopping) reject(failure);
      else resolve({ code: code ?? 137, stdout: Buffer.concat(buffers).toString("utf8"), stderr });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
