import {
  mkdir,
  mkdtemp,
  writeFile,
  readdir,
  lstat,
  copyFile,
  realpath,
} from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import type { PerfectConfig } from "../../config/schema.js";
import type {
  CommandSpec,
  OperationIntent,
  VerificationSpec,
  VisualScenario,
} from "../../domain/model.js";
import type { StateStore } from "../../ports/state-store.js";
import type {
  ExecutionOutput,
  ExecutionRequest,
  ExecutionRunner,
} from "../../ports/execution.js";
import { id, now, Blocked } from "../../domain/util.js";
import { processRun } from "../git/process.js";
import { copySnapshot } from "../git/workspace.js";
import { relativePath, safePath } from "../../tools/paths.js";
import { Semaphore } from "../../application/semaphore.js";
import { browserDriver, commandDriver, remotionDriver } from "./drivers.js";
import { SANDBOX_APP_HOST } from "./browser-driver.js";
const require = createRequire(import.meta.url);

export function confinementArgs(
  name: string,
  goalId: string,
  config: PerfectConfig,
  network = "none",
): string[] {
  const uid = process.getuid?.() ?? 1000,
    gid = process.getgid?.() ?? 1000;
  return [
    "run",
    "--pull=never",
    "--rm",
    "--name",
    name,
    "--label",
    `perfect.goal=${goalId}`,
    "--network",
    network,
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--pids-limit",
    String(config.sandbox.pids),
    "--memory",
    `${config.sandbox.memoryMb}m`,
    "--cpus",
    String(config.sandbox.cpus),
    "--user",
    `${uid}:${gid}`,
    "--tmpfs",
    `/tmp:rw,nosuid,nodev,size=512m,mode=1777`,
    "--tmpfs",
    `/workspace:rw,nosuid,nodev,size=${config.sandbox.memoryMb}m,mode=1777`,
    "--env",
    "HOME=/tmp",
    "--env",
    "CI=1",
  ];
}
export class DockerRunner implements ExecutionRunner {
  private heavy: Semaphore;
  constructor(
    private config: PerfectConfig,
    private store: StateStore,
    private runtimeDir: string,
  ) {
    this.heavy = new Semaphore(config.parallelism.heavyCommands);
  }
  async available(): Promise<boolean> {
    try {
      return (
        (
          await processRun(
            "docker",
            ["version", "--format", "{{.Server.Version}}"],
            { timeoutMs: 5000 },
          )
        ).code === 0
      );
    } catch {
      return false;
    }
  }
  private async requireImage(image: string): Promise<string> {
    if (!(await this.available()))
      throw new Blocked(
        "SANDBOX_REQUIRED",
        "Docker is unavailable; no host-shell fallback is permitted",
      );
    const inspected = await processRun(
      "docker",
      ["image", "inspect", "--format", "{{.Id}}", image],
      { timeoutMs: 5000 },
    );
    if (
      inspected.code !== 0 ||
      !/^sha256:[a-f0-9]{64}$/.test(inspected.stdout.trim())
    )
      throw new Blocked(
        "SANDBOX_IMAGE",
        `Install the approved image explicitly: ${image}`,
      );
    return inspected.stdout.trim();
  }
  private intent(request: ExecutionRequest, resource: string): OperationIntent {
    const intent: OperationIntent = {
      id: id("operation"),
      goalId: request.goalId,
      taskId: request.taskId,
      kind: "container",
      status: "started",
      resource,
      beforeRevision: request.revision,
      createdAt: now(),
    };
    this.store.put("intents", intent, "operation.started");
    return intent;
  }
  private async stop(intent: OperationIntent): Promise<void> {
    const isNetwork = intent.resource.startsWith("network:");
    const name = isNetwork ? intent.resource.slice(8) : intent.resource;
    if (!/^perfect-[a-zA-Z0-9_-]+$/.test(name))
      throw new Blocked("RESOURCE_DENIED", name);
    const kind = isNetwork ? "network" : "container";
    const inspected = await processRun(
      "docker",
      [
        kind,
        "inspect",
        "--format",
        isNetwork
          ? '{{ index .Labels "perfect.goal" }}'
          : '{{ index .Config.Labels "perfect.goal" }}',
        name,
      ],
      { timeoutMs: 5000 },
    );
    if (inspected.code === 0) {
      if (inspected.stdout.trim() !== intent.goalId)
        throw new Blocked("RESOURCE_OWNER_MISMATCH", name);
      const removed = await processRun(
        "docker",
        isNetwork ? ["network", "rm", name] : ["rm", "--force", name],
        { timeoutMs: 15000 },
      );
      if (removed.code !== 0) throw new Blocked("RESOURCE_STOP_FAILED", name);
    } else if (
      !/no such (?:object|container|network)|network .* not found/i.test(
        inspected.stderr,
      )
    ) {
      throw new Blocked(
        "RESOURCE_UNKNOWN",
        `Cannot establish whether ${name} stopped; keep ownership until recovery`,
      );
    }
    this.store.put(
      "intents",
      { ...intent, status: "completed" },
      "operation.completed",
    );
  }
  async recover(goalId: string): Promise<void> {
    const active = this.store
      .list("intents", goalId)
      .filter((i) => i.kind === "container" && i.status !== "completed");
    if (active.length && !(await this.available()))
      throw new Blocked(
        "RECOVERY_SANDBOX",
        "Cannot reconcile containers while Docker is unavailable",
      );
    for (const intent of active.filter(
      (i) => !i.resource.startsWith("network:"),
    ))
      await this.stop(intent);
    for (const intent of active.filter((i) =>
      i.resource.startsWith("network:"),
    ))
      await this.stop(intent);
  }
  private async setup(
    request: ExecutionRequest,
    script: string,
    spec: unknown,
    includeSource = true,
  ) {
    await mkdir(this.runtimeDir, { recursive: true, mode: 0o700 });
    const dir = await mkdtemp(join(this.runtimeDir, "run-"));
    if (/[:,\n]/.test(dir) || /[:,\n]/.test(request.artifactsDir))
      throw new Blocked("MOUNT_PATH", "Unsupported Docker mount path");
    await mkdir(request.artifactsDir, { recursive: true, mode: 0o700 });
    if (includeSource)
      await copySnapshot(request.workspace, join(dir, "input"), this.config);
    await writeFile(join(dir, "driver.mjs"), script);
    await writeFile(join(dir, "spec.json"), JSON.stringify(spec));
    return dir;
  }
  private mounts(
    dir: string,
    request: ExecutionRequest,
    input = true,
    output = true,
  ): string[] {
    return [
      "--volume",
      `${dir}/driver.mjs:/driver/execute.mjs:ro`,
      "--volume",
      `${dir}/spec.json:/spec.json:ro`,
      ...(input ? ["--volume", `${dir}/input:/input:ro`] : []),
      ...(output
        ? ["--volume", `${resolve(request.artifactsDir)}:/output:rw`]
        : []),
    ];
  }
  private validateCommand(command: CommandSpec): void {
    if (
      !this.config.permissions.allowedExecutables.includes(command.executable)
    )
      throw new Blocked("COMMAND_DENIED", command.executable);
    if (command.cwd !== ".") relativePath(command.cwd);
  }
  async command(
    request: ExecutionRequest,
    command: CommandSpec,
  ): Promise<ExecutionOutput> {
    this.validateCommand(command);
    return this.heavy.use(request.signal, async () => {
      const imageId = await this.requireImage(this.config.sandbox.image);
      const dir = await this.setup(request, commandDriver, command),
        name = id("perfect-command"),
        intent = this.intent(request, name);
      try {
        const result = await processRun(
          "docker",
          [
            ...confinementArgs(name, request.goalId, this.config),
            ...this.mounts(dir, request, true, false),
            imageId,
            "node",
            "/driver/execute.mjs",
          ],
          { signal: request.signal, timeoutMs: command.timeoutMs },
        );
        return { ...result, artifacts: [], environment: { imageId } };
      } finally {
        await this.stop(intent);
      }
    });
  }
  private async artifacts(dir: string): Promise<ExecutionOutput["artifacts"]> {
    const result: ExecutionOutput["artifacts"] = [];
    for (const name of (await readdir(dir)).sort()) {
      if (!/^[a-zA-Z0-9_.-]+\.(png|json|zip|mp4)$/.test(name)) continue;
      const path = join(dir, name),
        st = await lstat(path);
      if (!st.isFile() || st.nlink !== 1 || st.size > 200_000_000)
        throw new Blocked("ARTIFACT_DENIED", name);
      result.push({
        path,
        kind: name.endsWith(".png")
          ? name.startsWith("frame-")
            ? "frame"
            : "screenshot"
          : name.endsWith(".zip")
            ? "trace"
            : "report",
      });
    }
    return result;
  }
  async browser(
    request: ExecutionRequest,
    scenario: VisualScenario,
  ): Promise<ExecutionOutput> {
    this.validateCommand(scenario.server);
    return this.heavy.use(request.signal, async () => {
      const imageId = await this.requireImage(this.config.sandbox.image);
      const browserImageId = await this.requireImage(
        this.config.sandbox.browserImage,
      );
      const network = id("perfect-net"),
        serverName = id("perfect-server"),
        browserName = id("perfect-browser");
      const netIntent = this.intent(request, `network:${network}`);
      const net = await processRun("docker", [
        "network",
        "create",
        "--internal",
        "--label",
        `perfect.goal=${request.goalId}`,
        network,
      ]);
      if (net.code !== 0) throw new Blocked("SANDBOX_NETWORK", net.stderr);
      let serverIntent: OperationIntent | undefined,
        browserIntent: OperationIntent | undefined;
      try {
        const serverDir = await this.setup(request, commandDriver, {
          ...scenario.server,
          port: scenario.port,
        });
        serverIntent = this.intent(request, serverName);
        const args = confinementArgs(
          serverName,
          request.goalId,
          this.config,
          network,
        );
        args.splice(1, 0, "--detach");
        const server = await processRun("docker", [
          ...args,
          "--network-alias",
          SANDBOX_APP_HOST,
          ...this.mounts(serverDir, request, true, false),
          imageId,
          "node",
          "/driver/execute.mjs",
        ]);
        if (server.code !== 0) throw new Error(server.stderr);
        const browserDir = await this.setup(
          request,
          browserDriver,
          scenario,
          false,
        );
        await mkdir(join(browserDir, "targets"));
        for (const [i, target] of scenario.targetFiles.entries()) {
          if (!target.endsWith(".png"))
            throw new Blocked(
              "REFERENCE_FORMAT",
              "V1 browser targets must be PNG",
            );
          await copyFile(
            await safePath(request.workspace, target),
            join(browserDir, "targets", `${i}.png`),
          );
        }
        const playwright = await realpath(
          dirname(require.resolve("playwright/package.json")),
        );
        const core = await realpath(
          dirname(require.resolve("playwright-core/package.json")),
        );
        browserIntent = this.intent(request, browserName);
        const result = await processRun(
          "docker",
          [
            ...confinementArgs(
              browserName,
              request.goalId,
              this.config,
              network,
            ),
            ...this.mounts(browserDir, request, false, true),
            "--volume",
            `${browserDir}/targets:/targets:ro`,
            "--volume",
            `${playwright}:/driver/node_modules/playwright:ro`,
            "--volume",
            `${core}:/driver/node_modules/playwright-core:ro`,
            browserImageId,
            "node",
            "/driver/execute.mjs",
          ],
          {
            signal: request.signal,
            timeoutMs: Math.min(this.config.limits.timeoutPerTask, 300000),
          },
        );
        return {
          ...result,
          artifacts: await this.artifacts(request.artifactsDir),
          environment: { imageId, browserImageId },
        };
      } finally {
        const failures: unknown[] = [];
        for (const intent of [browserIntent, serverIntent, netIntent]) {
          if (intent)
            try {
              await this.stop(intent);
            } catch (error) {
              failures.push(error);
            }
        }
        if (failures.length) throw failures[0];
      }
    });
  }
  async remotion(
    request: ExecutionRequest,
    spec: NonNullable<VerificationSpec["remotion"]>,
  ): Promise<ExecutionOutput> {
    relativePath(spec.entry);
    return this.heavy.use(request.signal, async () => {
      const imageId = await this.requireImage(this.config.sandbox.image);
      const dir = await this.setup(request, remotionDriver, spec),
        name = id("perfect-render"),
        intent = this.intent(request, name);
      try {
        const result = await processRun(
          "docker",
          [
            ...confinementArgs(name, request.goalId, this.config),
            ...this.mounts(dir, request),
            imageId,
            "node",
            "/driver/execute.mjs",
          ],
          {
            signal: request.signal,
            timeoutMs: this.config.limits.timeoutPerTask,
          },
        );
        return {
          ...result,
          artifacts: await this.artifacts(request.artifactsDir),
          environment: { imageId },
        };
      } finally {
        await this.stop(intent);
      }
    });
  }
}
