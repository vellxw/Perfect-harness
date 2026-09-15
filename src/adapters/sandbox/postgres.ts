import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PerfectConfig } from "../../config/schema.js";
import type { CommandSpec, OperationIntent } from "../../domain/model.js";
import type { StateStore } from "../../ports/state-store.js";
import type { ExecutionRequest, ExecutionOutput } from "../../ports/execution.js";
import { Blocked, id, now } from "../../domain/util.js";
import { processRun } from "../git/process.js";
import { copySnapshot } from "../git/workspace.js";
import { relativePath } from "../../tools/paths.js";
import { confinementArgs, DockerRunner } from "./docker.js";
import { commandDriver } from "./drivers.js";
import { preparedImage } from "./dependencies.js";
import { POSTGRES_IMAGE } from "../../modes/capabilities.js";

/** Every invocation gets a new database and internal network. No arbitrary URL, host port or production credential. */
export class PostgresRunner {
  constructor(private config: PerfectConfig, private store: StateStore, private directory: string) {}
  async run(request: ExecutionRequest, command: CommandSpec): Promise<ExecutionOutput> {
    if (!this.config.permissions.allowedExecutables.includes(command.executable)) throw new Blocked("COMMAND_DENIED", command.executable);
    if (command.cwd !== ".") relativePath(command.cwd);
    const runtime = new DockerRunner(this.config, this.store, this.directory);
    if (!await runtime.available()) throw new Blocked("SANDBOX_REQUIRED", "PostgreSQL se verifica en contenedores, nunca contra una base del host");
    const appImage = await preparedImage(request.workspace, request.goalId, this.config.sandbox.image, this.store);
    const imageIds: Record<string, string> = {};
    for (const image of [POSTGRES_IMAGE, appImage]) {
      const inspected = await processRun("docker", ["image", "inspect", "--format", "{{.Id}}", image], { timeoutMs: 5000 });
      if (inspected.code || !/^sha256:[a-f0-9]{64}$/.test(inspected.stdout.trim())) throw new Blocked("SANDBOX_IMAGE", `Prepará explícitamente ${image}`);
      imageIds[image] = inspected.stdout.trim();
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const dir = await mkdtemp(join(this.directory, "postgres-"));
    if (/[:,\n]/.test(dir)) throw new Blocked("MOUNT_PATH", "Ruta incompatible con montaje Docker");
    await copySnapshot(request.workspace, join(dir, "input"), this.config);
    await writeFile(join(dir, "driver.mjs"), commandDriver);
    await writeFile(join(dir, "spec.json"), JSON.stringify(command));
    const network = id("perfect-pg-net"), database = id("perfect-pg-db"), app = id("perfect-pg-check"), password = randomBytes(24).toString("hex");
    const intents: OperationIntent[] = [];
    const intent = (resource: string) => {
      const value: OperationIntent = { id: id("operation"), goalId: request.goalId, taskId: request.taskId, kind: "container", status: "started", resource, beforeRevision: request.revision, createdAt: now() };
      this.store.put("intents", value, "postgres.resource_started"); intents.push(value);
    };
    const run = (args: string[], timeoutMs = 30000) => processRun("docker", args, { signal: request.signal, timeoutMs });
    try {
      intent(`network:${network}`);
      const net = await run(["network", "create", "--internal", "--label", `perfect.goal=${request.goalId}`, network]);
      if (net.code) throw new Blocked("POSTGRES_NETWORK", "No se pudo crear red interna de prueba");
      intent(database);
      const db = await run(["run", "--detach", "--pull=never", "--name", database, "--label", `perfect.goal=${request.goalId}`, "--network", network, "--network-alias", "perfect-postgres.test", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=999:999", "--pids-limit=128", "--memory=512m", "--cpus=1", "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,nodev,uid=999,gid=999,mode=0700,size=256m", "--tmpfs", "/var/run/postgresql:rw,nosuid,nodev,uid=999,gid=999,mode=0770,size=8m", "--tmpfs", "/tmp:rw,nosuid,nodev,mode=1777,size=64m", "--env", "PGDATA=/var/lib/postgresql/data", "--env", "POSTGRES_USER=perfect_test", "--env", "POSTGRES_DB=perfect_test", "--env", `POSTGRES_PASSWORD=${password}`, imageIds[POSTGRES_IMAGE]!]);
      if (db.code) throw new Blocked("POSTGRES_START", "No se pudo iniciar PostgreSQL temporal");
      let ready = false;
      for (let i = 0; i < 60; i++) {
        request.signal.throwIfAborted();
        const check = await run(["exec", database, "pg_isready", "-h", "127.0.0.1", "-U", "perfect_test", "-d", "perfect_test"], 3000);
        if (!check.code) { ready = true; break; }
        await new Promise(r => setTimeout(r, 250));
      }
      if (!ready) throw new Blocked("POSTGRES_READY", "PostgreSQL no quedó listo");
      intent(app);
      const result = await run([...confinementArgs(app, request.goalId, this.config, network), "--env", `DATABASE_URL=postgresql://perfect_test:${password}@perfect-postgres.test:5432/perfect_test`, "--env", "PERFECT_EPHEMERAL_DATABASE=1", "--volume", `${resolve(dir)}/input:/input:ro`, "--volume", `${resolve(dir)}/driver.mjs:/driver/execute.mjs:ro`, "--volume", `${resolve(dir)}/spec.json:/spec.json:ro`, imageIds[appImage]!, "node", "/driver/execute.mjs"], Math.min(command.timeoutMs, this.config.limits.timeoutPerTask));
      return { code: result.code, stdout: result.stdout.replaceAll(password, "[test-secret]"), stderr: result.stderr.replaceAll(password, "[test-secret]"), artifacts: [], environment: { database: "PostgreSQL", databaseImage: imageIds[POSTGRES_IMAGE], appImage: imageIds[appImage], ephemeral: true, network: "internal", portsPublished: false } };
    } finally {
      // Reuse the label-checked recovery path. Never delete arbitrary names or the user's DB.
      for (const record of [...intents].reverse()) {
        const networkResource = record.resource.startsWith("network:"), resource = networkResource ? record.resource.slice(8) : record.resource;
        const check = await processRun("docker", [networkResource ? "network" : "container", "inspect", "--format", networkResource ? '{{ index .Labels "perfect.goal" }}' : '{{ index .Config.Labels "perfect.goal" }}', resource], { timeoutMs: 5000 });
        if (!check.code) {
          if (check.stdout.trim() !== request.goalId) throw new Blocked("RESOURCE_OWNER_MISMATCH", resource);
          const removed = await processRun("docker", networkResource ? ["network", "rm", resource] : ["rm", "--force", resource], { timeoutMs: 10000 });
          if (removed.code) throw new Blocked("RESOURCE_STOP_FAILED", resource);
        } else if (!await runtime.available()) throw new Blocked("RECOVERY_SANDBOX", "Docker no responde; se conserva el intent para reconciliarlo");
        this.store.put("intents", { ...record, status: "completed" }, "postgres.resource_stopped");
      }
    }
  }
}
