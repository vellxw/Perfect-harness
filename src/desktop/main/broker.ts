import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { appendFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { validSnapshot, type UiMessage, type UiSnapshot, type DesktopEvent } from "../contracts/protocol.js";

function safeDiagnostic(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/(?:Bearer\s+)[^\s]+/gi, "Bearer [redacted]")
    .replace(/((?:token|api[_-]?key|secret|password)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/https?:\/\/[^\s]+/g, "[URL]").slice(0, 2000);
}

export class EngineBroker extends EventEmitter {
  snapshot?: UiSnapshot;
  connected = false;
  sequence = 0;
  workspaceId = "unselected";
  startupFailure?: string;
  private child?: ChildProcess;
  private closing?: Promise<void>;
  private startupTimer?: ReturnType<typeof setTimeout>;
  private initialized = false;
  private bootAcknowledged = false;
  private diagnostics = 0;
  private logPending = Promise.resolve();
  private readonly logFile: string;
  private waiting = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  constructor(readonly node: string, readonly worker: string, readonly home: string, readonly workspace: string, readonly desktopSessionId: string = randomUUID()) {
    super();
    this.logFile = join(home, `desktop-startup-${randomUUID()}.jsonl`);
  }
  private log(stage: string, data: Record<string, unknown> = {}): void {
    if (this.diagnostics++ >= 32) return;
    const line = JSON.stringify({ at: new Date().toISOString(), stage, ...data }) + "\n";
    this.logPending = this.logPending.then(() => appendFile(this.logFile, line, {
      mode: 0o600,
      flag: constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0),
    })).catch(() => {});
  }
  start(): void {
    if (this.child) throw Error("El motor ya se inició");
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/^(?:NODE_OPTIONS|NODE_PATH|NODE_COMPILE_CACHE|ELECTRON_RUN_AS_NODE|ELECTRON_NO_ASAR|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED)$/i.test(key)) delete env[key];
    }
    const entry = join(dirname(this.worker), "entry.js");
    this.log("spawn", { node: this.node, entry, platform: process.platform });
    const child = spawn(this.node, [entry, this.home], {
      stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
      shell: false, env,
    });
    this.child = child;
    child.stdout?.resume();
    child.stderr?.on("data", (bytes: Buffer) => {
      if (!this.initialized) this.log("startup-stderr", { message: safeDiagnostic(bytes.toString("utf8")) });
    });
    this.startupTimer = setTimeout(() => {
      if (!this.connected) this.fail("El motor no respondió durante el inicio. Revisá el registro local desktop-startup y recuperá el motor; no se repitieron operaciones.");
    }, 20000);
    child.on("spawn", () => this.log("spawned", { pid: child.pid }));
    child.on("message", (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      const signal = raw as Record<string, unknown>;
      if (signal.type === "desktop-ready") {
        if (this.bootAcknowledged || signal.protocol !== 1 || signal.pid !== child.pid || this.closing || this.startupFailure) return;
        this.bootAcknowledged = true;
        this.log("listener-ready", { pid: child.pid, node: signal.node, loadMs: signal.loadMs, rssBytes: signal.rssBytes });
        child.send({ type: "initialize", options: { home: this.home, workspace: this.workspace, desktopSessionId: this.desktopSessionId } }, error => {
          if (error) this.fail("No se pudo inicializar el motor: " + safeDiagnostic(error.message));
          else this.log("initialize-sent");
        });
        return;
      }
      if (signal.type === "desktop-startup-failed") {
        this.fail("No se pudo cargar el motor: " + safeDiagnostic(String(signal.message ?? "Error de inicio")));
        return;
      }
      const m = raw as UiMessage | { type: "desktop-result"; requestId: string; ok: boolean; data?: unknown; message?: string };
      if (m.type === "fault" && !this.initialized) {
        this.fail("Inicio del motor rechazado: " + safeDiagnostic(m.message));
        return;
      }
      if (m.type === "snapshot") {
        if (!this.bootAcknowledged || !validSnapshot(m.snapshot)) { this.fail("Snapshot inválido del motor"); return; }
        if (!this.initialized) this.log("initialized", { pid: child.pid, workspace: m.snapshot.workspace });
        this.initialized = true;
        if (this.startupTimer) clearTimeout(this.startupTimer);
        this.snapshot = m.snapshot;
        this.connected = true;
        this.startupFailure = undefined;
        this.workspaceId = createHash("sha256").update(m.snapshot.workspace).digest("hex").slice(0, 24);
      }
      if ((m.type === "result" || m.type === "desktop-result") && this.waiting.has(m.requestId)) {
        const pending = this.waiting.get(m.requestId)!;
        clearTimeout(pending.timer); this.waiting.delete(m.requestId);
        if (m.ok) pending.resolve(m);
        else pending.reject(new Error(m.message ?? "Operación rechazada"));
      }
      if (m.type !== "desktop-result") this.emit("event", {
        type: "engine", message: m, sequence: ++this.sequence, workspaceId: this.workspaceId,
      } as DesktopEvent);
    });
    child.on("error", error => this.fail(safeDiagnostic(error.message)));
    child.on("exit", (code, signal) => {
      if (this.startupTimer) clearTimeout(this.startupTimer);
      this.log("exit", { code, signal, initialized: this.initialized });
      if (!this.closing && !this.startupFailure) this.fail(`Motor desconectado (${code ?? signal ?? "desconocido"}). No se repitieron operaciones; recuperá el trabajo antes de reanudar.`);
    });
  }
  private fail(reason: string): void {
    this.connected = false;
    this.startupFailure = reason;
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.log("failure", { message: safeDiagnostic(reason) });
    for (const pending of this.waiting.values()) { clearTimeout(pending.timer); pending.reject(new Error(reason)); }
    this.waiting.clear();
    this.emit("event", { type: "connection", connected: false, reason, workspaceId: this.workspaceId });
  }
  request(type: "action" | "query", payload: unknown, requestId: string = randomUUID()): Promise<unknown> {
    if (this.startupFailure) return Promise.reject(new Error(this.startupFailure));
    if (this.closing || !this.child?.connected || !this.initialized) return Promise.reject(new Error("El motor no está conectado"));
    if (this.waiting.has(requestId)) return Promise.reject(new Error("ID de solicitud duplicado"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(requestId);
        reject(new Error("La respuesta venció; el efecto puede estar pendiente. No se reintentó automáticamente."));
      }, 120000);
      this.waiting.set(requestId, { resolve, reject, timer });
      this.child!.send(type === "action" ? { type, requestId, action: payload } : { type, requestId, query: payload }, error => {
        if (!error) return;
        const pending = this.waiting.get(requestId);
        if (pending) { clearTimeout(pending.timer); this.waiting.delete(requestId); pending.reject(new Error("La entrega IPC falló; no se repitió el efecto.")); }
      });
    });
  }
  async ready(timeout = 20000): Promise<void> {
    const end = Date.now() + timeout;
    while (!this.connected && !this.startupFailure && Date.now() < end) await new Promise(r => setTimeout(r, 25));
    if (!this.connected) throw Error(this.startupFailure ?? "El motor no quedó listo");
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      if (this.startupTimer) clearTimeout(this.startupTimer);
      const child = this.child;
      if (child && child.exitCode === null && child.signalCode === null) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(Error("No se confirmó la parada del motor; no se liberaron locks")), 30000);
          child.once("exit", () => { clearTimeout(timer); resolve(); });
          if (child.connected && this.bootAcknowledged) child.send({ type: "shutdown" }, error => {
            if (error && !this.initialized) child.kill();
          });
          else if (!this.initialized) child.kill();
        });
      }
      for (const pending of this.waiting.values()) { clearTimeout(pending.timer); pending.reject(new Error("Motor detenido")); }
      this.waiting.clear();
      await this.logPending;
    })();
    return this.closing;
  }
}
