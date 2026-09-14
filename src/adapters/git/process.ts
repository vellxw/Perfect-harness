import { spawn } from "node:child_process";
export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}
export function processRun(
  executable: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    input?: string;
    timeoutMs?: number;
    maxOutputBytes?: number;
  } = {},
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "",
      stderr = "",
      settled = false;
    const max = options.maxOutputBytes ?? 2_000_000;
    const stop = () => {
      try {
        if (child.pid && process.platform !== "win32")
          process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* Already exited. */
      }
    };
    const timer = setTimeout(stop, options.timeoutMs ?? 120000);
    timer.unref();
    const abort = () => stop();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) stop();
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > max) {
        stdout = stdout.slice(0, max);
        stop();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > max) {
        stderr = stderr.slice(0, max);
        stop();
      }
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(error);
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve({ code: code ?? 137, stdout, stderr });
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.input);
  });
}
export function gitEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: "/nonexistent",
    LANG: "C.UTF-8",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Perfect Harness",
    GIT_AUTHOR_EMAIL: "perfect-harness@localhost",
    GIT_COMMITTER_NAME: "Perfect Harness",
    GIT_COMMITTER_EMAIL: "perfect-harness@localhost",
  };
}
export async function git(
  cwd: string,
  args: string[],
  input?: string,
): Promise<string> {
  const result = await processRun(
    "git",
    [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "protocol.file.allow=never",
      "-c",
      "core.autocrlf=false",
      ...args,
    ],
    { cwd, env: gitEnv(), input },
  );
  if (result.code !== 0)
    throw new Error(`Git ${args[0]} failed: ${result.stderr.slice(0, 12000)}`);
  return result.stdout.trimEnd();
}
