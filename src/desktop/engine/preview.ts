import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PerfectConfig } from "../../config/schema.js";
import type { StateStore } from "../../ports/state-store.js";
import type { Goal, OperationIntent } from "../../domain/model.js";
import { id, now, Blocked } from "../../domain/util.js";
import { processRun } from "../../adapters/git/process.js";
import { GitWorkspace, copySnapshot } from "../../adapters/git/workspace.js";
import { preparedImage } from "../../adapters/sandbox/dependencies.js";
import {
  confinementArgs,
  DockerRunner,
} from "../../adapters/sandbox/docker.js";
import { commandDriver } from "../../adapters/sandbox/drivers.js";

/** Separate manual preview, never the verifier's live session or the source checkout. */
export class DesktopPreview {
  private resources: OperationIntent[] = [];
  private goal?: Goal;
  private expiry?: ReturnType<typeof setTimeout>;
  constructor(
    private store: StateStore,
    private config: PerfectConfig,
    private home: string,
  ) {}
  async start(goal: Goal, checkId: string) {
    this.goal = goal;
    const plan = this.store.get("plans", goal.activePlanId ?? ""),
      spec = plan?.verification.find(
        (v) => v.id === checkId && v.kind === "browser",
      );
    if (!spec?.scenario)
      throw new Blocked(
        "PREVIEW_CONTRACT",
        "El preview debe usar un servidor de un contrato de navegador aprobado",
      );
    const plain = new DockerRunner(
      this.config,
      this.store,
      join(this.home, "sandbox"),
    );
    if (!(await plain.available()))
      throw new Blocked(
        "SANDBOX_REQUIRED",
        "El preview necesita Docker; no ejecuta comandos en el host",
      );
    const workspace = new GitWorkspace(goal.root, this.config);
    if ((await workspace.revision()) !== goal.candidateRevision)
      throw new Blocked("CANDIDATE_CHANGED", "El candidato cambió");
    const image = await preparedImage(
      workspace.repo,
      goal.id,
      this.config.sandbox.image,
      this.store,
    );
    const dirRoot = join(goal.root, "desktop-preview");
    await mkdir(dirRoot, { recursive: true });
    const dir = await mkdtemp(join(dirRoot, "session-"));
    if (/[:,\n]/.test(dir))
      throw new Blocked("MOUNT_PATH", "Ruta incompatible con Docker");
    await copySnapshot(workspace.repo, join(dir, "input"), this.config);
    await writeFile(join(dir, "driver.mjs"), commandDriver);
    await writeFile(
      join(dir, "spec.json"),
      JSON.stringify({ ...spec.scenario.server, port: spec.scenario.port }),
    );
    const network = id("perfect-preview-net"),
      name = id("perfect-preview");
    const remember = (resource: string) => {
      const intent: OperationIntent = {
        id: id("operation"),
        goalId: goal.id,
        kind: "container",
        status: "started",
        resource,
        beforeRevision: goal.candidateRevision,
        createdAt: now(),
      };
      this.store.put("intents", intent, "desktop.preview_started");
      this.resources.push(intent);
    };
    try {
      remember("network:" + network);
      const net = await processRun(
        "docker",
        [
          "network",
          "create",
          "--internal",
          "--label",
          `perfect.goal=${goal.id}`,
          network,
        ],
        { timeoutMs: 15000 },
      );
      if (net.code) throw Error(net.stderr);
      remember(name);
      const args = confinementArgs(name, goal.id, this.config, network);
      const at = args.indexOf("--rm");
      if (at >= 0) args.splice(at, 1);
      args.splice(1, 0, "--detach");
      const result = await processRun(
        "docker",
        [
          ...args,
          "--publish",
          `127.0.0.1::${spec.scenario.port}`,
          "--volume",
          `${resolve(dir)}/input:/input:ro`,
          "--volume",
          `${resolve(dir)}/driver.mjs:/driver/run.mjs:ro`,
          "--volume",
          `${resolve(dir)}/spec.json:/spec.json:ro`,
          image,
          "node",
          "/driver/run.mjs",
        ],
        { timeoutMs: 20000 },
      );
      if (result.code) throw Error(result.stderr);
      const mapping = await processRun(
        "docker",
        ["port", name, `${spec.scenario.port}/tcp`],
        { timeoutMs: 5000 },
      );
      const match = /^127\.0\.0\.1:(\d+)\s*$/.exec(mapping.stdout);
      if (!match) throw Error("Docker no publicó exclusivamente loopback");
      const url = `http://127.0.0.1:${match[1]}`;
      let ready = false;
      for (let n = 0; n < 80; n++) {
        try {
          const response = await fetch(url + spec.scenario.path, {
            signal: AbortSignal.timeout(1000),
            redirect: "error",
          });
          await response.body?.cancel();
          if (response.status < 500) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!ready) throw Error("El servidor de preview no respondió");
      this.expiry = setTimeout(() => void this.close(), 20 * 60 * 1000);
      this.expiry.unref();
      return {
        url: url + spec.scenario.path,
        origin: url,
        revision: goal.candidateRevision,
        expiresInSeconds: 1200,
        notice:
          "Vista manual aislada. No es una verificación ni comparte sesión con los tests.",
      };
    } catch (error) {
      await this.close();
      throw error;
    }
  }
  async close() {
    if (this.expiry) clearTimeout(this.expiry);
    const goal = this.goal;
    if (!goal) return;
    for (const item of [...this.resources].reverse()) {
      const net = item.resource.startsWith("network:"),
        name = net ? item.resource.slice(8) : item.resource;
      const check = await processRun(
        "docker",
        [
          net ? "network" : "container",
          "inspect",
          "--format",
          net
            ? '{{ index .Labels "perfect.goal" }}'
            : '{{ index .Config.Labels "perfect.goal" }}',
          name,
        ],
        { timeoutMs: 5000 },
      );
      if (check.code) {
        const available = await processRun(
          "docker",
          ["info", "--format", "{{.ServerVersion}}"],
          { timeoutMs: 5000 },
        );
        if (available.code)
          throw new Blocked(
            "PREVIEW_STOP_UNCERTAIN",
            "Docker no responde; se conserva intent",
          );
      } else {
        if (check.stdout.trim() !== goal.id)
          throw new Blocked("RESOURCE_OWNER_MISMATCH", name);
        const stopped = await processRun(
          "docker",
          net ? ["network", "rm", name] : ["rm", "--force", name],
          { timeoutMs: 10000 },
        );
        if (stopped.code) throw new Blocked("PREVIEW_STOP_UNCERTAIN", name);
      }
      this.store.put(
        "intents",
        { ...item, status: "completed" },
        "desktop.preview_stopped",
      );
    }
    this.resources = [];
    this.goal = undefined;
  }
}
