import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { GitWorkspace } from "../adapters/git/workspace.js";
import { PiRuntime } from "../adapters/pi/runtime.js";
import { prepareDependencies } from "../adapters/sandbox/dependencies.js";
import { PreparedDockerRunner } from "../adapters/sandbox/prepared-runner.js";
import { SqliteStore, onDatabaseChange } from "../adapters/sqlite/store.js";
import { VerificationService } from "../adapters/verification/service.js";
import { createGoal } from "../application/goals.js";
import { Orchestrator, acceptanceHash } from "../application/orchestrator.js";
import { goalConfig, type CliContext } from "../cli/context.js";
import {
  applyGoal,
  approveCriterion,
  approvePlan,
  controlGoal,
  retryTask,
} from "../cli/control.js";
import { doctor } from "../cli/doctor.js";
import {
  homeDir,
  loadConfig,
  localPolicy,
  savePolicy,
} from "../config/load.js";
import type { Goal } from "../domain/model.js";
import { Blocked, id } from "../domain/util.js";
import { valueLabel } from "../i18n/es.js";
import { humanMessage } from "../i18n/messages.js";
import { IntegrationAdmin } from "../integrations/admin.js";
import { readEvidence } from "../tools/evidence.js";
import {
  UiActionSchema,
  UiPreferencesSchema,
  text,
  type UiAction,
  type UiMessage,
  type UiPreferences,
  type UiSnapshot,
} from "./protocol.js";
import { snapshot } from "./snapshot.js";

/** One engine worker, no TCP server. The UI receives projections and sends validated user intents. */
export class PresentationEngine {
  readonly store: SqliteStore;
  readonly integrations: IntegrationAdmin;
  readonly home: string;
  private workspace: string;
  private selected?: string;
  private preferences: UiPreferences = UiPreferencesSchema.parse({});
  private diagnostics: UiSnapshot["diagnostics"] = [];
  private watcher?: FSWatcher;
  private unsubscribe: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private lastPayload = "";
  private closing = false;
  private active?: Promise<void>;
  private activeGoal?: string;
  private activeKind?: "goal" | "verification" | "preparation";
  private actionQueue: Promise<void> = Promise.resolve();
  private activeAbort?: AbortController;
  private authAbort?: AbortController;
  private answers = new Map<string, (value: string) => void>();
  private constructor(
    home: string,
    workspace: string,
    private send: (event: UiMessage) => void,
  ) {
    this.home = home;
    this.workspace = workspace;
    this.store = new SqliteStore(join(home, "state.sqlite"));
    this.integrations = new IntegrationAdmin(home);
    this.unsubscribe = onDatabaseChange(join(home, "state.sqlite"), () =>
      this.wake(),
    );
    this.watcher = watch(home, (_event, name) => {
      if (
        name?.startsWith("state.sqlite") ||
        name?.startsWith("integrations.sqlite")
      )
        this.wake();
    });
  }
  static async create(
    options: { home?: string; workspace?: string },
    send: (event: UiMessage) => void,
  ): Promise<PresentationEngine> {
    const home = resolve(options.home ?? homeDir()),
      workspace = await realpath(resolve(options.workspace ?? process.cwd()));
    await mkdir(home, { recursive: true, mode: 0o700 });
    // Windows may expose an 8.3 TEMP alias while fs events use its long name.
    // Canonicalize before watching: libuv asserts if the directory prefixes disagree.
    const engine = new PresentationEngine(
      await realpath(home),
      workspace,
      send,
    );
    try {
      engine.preferences = UiPreferencesSchema.parse(
        JSON.parse(await readFile(join(home, "ui.json"), "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        engine.send({
          type: "fault",
          message:
            "No se pudieron leer los ajustes de la interfaz; se usarán valores seguros.",
        });
    }
    engine.publish();
    return engine;
  }
  private wake(): void {
    if (this.closing || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      try {
        this.publish();
      } catch (error) {
        this.send({ type: "fault", message: humanMessage(text(error)) });
      }
    }, 20);
  }
  private publish(force = false): void {
    if (this.closing) return;
    const state = snapshot(
      this.store,
      this.workspace,
      this.preferences,
      this.selected,
      Boolean(this.active),
      this.diagnostics,
    );
    const integrationState = this.integrations.snapshot(this.workspace);
    if (
      integrationState.connections.length ||
      integrationState.pending.length ||
      integrationState.windows.length
    )
      state.integrations = integrationState;
    const serialized = JSON.stringify(state);
    if (force || serialized !== this.lastPayload) {
      this.lastPayload = serialized;
      this.send({ type: "snapshot", snapshot: state });
    }
  }
  private context(): CliContext {
    return {
      home: this.home,
      workspace: this.workspace,
      json: true,
      store: this.store,
      config: () => loadConfig(this.workspace, this.home),
      goal: (goalId) => {
        const g = goalId
          ? this.store.get("goals", goalId)
          : this.store
              .list("goals")
              .filter((g) => g.source === this.workspace)
              .at(-1);
        if (!g || g.source !== this.workspace)
          throw new Blocked(
            "GOAL_SCOPE",
            "Seleccioná un objetivo de esta carpeta",
          );
        return g;
      },
      print: () => {},
    };
  }
  private idle(): void {
    if (this.active || this.authAbort)
      throw new Blocked(
        "ENGINE_BUSY",
        "Primero pausá el trabajo activo o terminá la autenticación",
      );
  }
  private start(goal: Goal): void {
    this.idle();
    this.selected = goal.id;
    this.activeGoal = goal.id;
    this.activeKind = "goal";
    this.activeAbort = new AbortController();
    const config = goalConfig(goal),
      orchestrator = new Orchestrator(
        this.store,
        new PiRuntime(this.home, config),
        new PreparedDockerRunner(
          config,
          this.store,
          join(this.home, "sandbox"),
        ),
      );
    this.active = orchestrator
      .run(goal.id, {
        signal: this.activeAbort.signal,
        contributorConsent: async () =>
          (await localPolicy(this.home)).contributorWorkspaces.includes(
            goal.source,
          ),
        onState: () => this.wake(),
      })
      .then(
        () => {},
        (error) => {
          this.send({ type: "fault", message: humanMessage(text(error)) });
        },
      )
      .finally(() => {
        this.active = undefined;
        this.activeGoal = undefined;
        this.activeAbort = undefined;
        this.publish();
      });
    this.publish();
  }
  dispatch(requestId: string, raw: unknown): Promise<void> {
    const next = this.actionQueue.then(() => this.perform(requestId, raw));
    this.actionQueue = next.catch(() => {});
    return next;
  }
  private async perform(requestId: string, raw: unknown): Promise<void> {
    let action: UiAction;
    try {
      action = UiActionSchema.parse(raw);
    } catch {
      this.send({
        type: "result",
        requestId,
        ok: false,
        message: "Acción de usuario inválida",
      });
      return;
    }
    try {
      const ctx = this.context();
      let message = "Actualizado",
        content: string | undefined,
        path: string | undefined,
        operation: string | undefined;
      switch (action.type) {
        case "integration": {
          if (action.action.command === "login") {
            this.idle();
            this.integrations.credentialKey(this.workspace, action.action.id);
            void this.authenticateIntegration(action.action.id);
            message = "Ingresá la credencial en el campo enmascarado";
          } else {
            const result = await this.integrations.perform(
              this.workspace,
              action.action,
              AbortSignal.timeout(60000),
            );
            message = result.message;
            content = result.content;
            operation = "integration";
          }
          break;
        }
        case "goal": {
          this.idle();
          const goal = await createGoal(
            {
              request: action.description,
              source: this.workspace,
              home: this.home,
              config: await ctx.config(),
              privacy: action.public ? "public" : "private",
            },
            this.store,
          );
          this.start(goal);
          message = "Objetivo iniciado. La carpeta original permanece intacta.";
          break;
        }
        case "select":
          ctx.goal(action.goalId);
          this.selected = action.goalId;
          break;
        case "workspace":
          this.idle();
          this.workspace = await realpath(resolve(action.path));
          this.selected = undefined;
          this.diagnostics = [];
          break;
        case "pause":
        case "abort":
          if (this.activeGoal === action.goalId && this.activeKind !== "goal")
            this.activeAbort?.abort(
              new Error("El usuario detuvo la operación manual"),
            );
          await controlGoal(ctx, ctx.goal(action.goalId), action.type);
          message = "Solicitud registrada; esperando confirmar la detención.";
          break;
        case "resume":
          this.start(ctx.goal(action.goalId));
          message = "Reanudando con comprobaciones de recuperación";
          break;
        case "approve": {
          const goal = ctx.goal(action.goalId),
            plan = this.store.get("plans", goal.activePlanId ?? "");
          if (!plan || acceptanceHash(plan) !== action.planHash)
            throw new Blocked(
              "STALE_APPROVAL",
              "El plan cambió. Revisá la versión actual antes de aprobar.",
            );
          approvePlan(ctx, goal);
          message = "Plan aprobado. Usá /reanudar para continuar.";
          break;
        }
        case "criterion": {
          const goal = ctx.goal(action.goalId);
          if (goal.candidateRevision !== action.revision)
            throw new Blocked("STALE_APPROVAL", "La versión candidata cambió");
          approveCriterion(ctx, goal, action.criterionId);
          message = "Criterio humano aprobado solo para esta versión";
          break;
        }
        case "apply": {
          this.idle();
          const goal = ctx.goal(action.goalId);
          if (goal.candidateRevision !== action.revision)
            throw new Blocked("STALE_APPROVAL", "La versión candidata cambió");
          await applyGoal(ctx, goal, true);
          message = "Versión verificada aplicada a la carpeta original";
          break;
        }
        case "retry": {
          const task = this.store.get("tasks", action.taskId);
          if (!task || task.goalId !== action.goalId)
            throw new Blocked(
              "TASK_SCOPE",
              "La tarea no pertenece al objetivo seleccionado",
            );
          ctx.goal(action.goalId);
          await retryTask(ctx, action.taskId);
          message = "Reintento en espera, sin reiniciar contadores";
          break;
        }
        case "diff": {
          const goal = ctx.goal(action.goalId);
          content = text(
            await new GitWorkspace(goal.root, goalConfig(goal)).diff(
              goal.baseline,
            ),
            1000000,
          );
          message =
            "Cambios de la versión candidata; la carpeta original está intacta";
          break;
        }
        case "artifact": {
          const goal = ctx.goal(action.goalId),
            e = this.store.get("evidence", action.evidenceId);
          if (!e || e.goalId !== goal.id)
            throw new Blocked(
              "EVIDENCE_SCOPE",
              "La evidencia no pertenece a este objetivo",
            );
          const bytes = await readEvidence(goal, e, 200_000_000);
          operation = action.operation;
          if (
            action.operation === "inspect" &&
            [".txt", ".json", ".md", ".log", ".diff"].includes(
              extname(e.artifactRef),
            )
          )
            content = text(bytes.toString("utf8"), 1000000);
          if (
            action.operation === "open" &&
            ![".png", ".jpg", ".jpeg", ".webp", ".mp4"].includes(
              extname(e.artifactRef).toLowerCase(),
            )
          )
            throw new Blocked(
              "OPEN_DENIED",
              "Solo se pueden abrir imágenes y videos verificados. Copiá la ruta para inspeccionar otros archivos de forma explícita.",
            );
          path = e.artifactRef;
          message = `${valueLabel(e.kind)} · ${e.contentHash} · ${e.revision === goal.candidateRevision ? "versión actual" : "versión anterior"}`;
          break;
        }
        case "reverify": {
          this.idle();
          const goal = ctx.goal(action.goalId);
          if (goal.state !== "PAUSED")
            throw new Blocked(
              "VERIFY_STATE",
              "Pausá un objetivo que no haya terminado antes de verificarlo manualmente",
            );
          const plan = this.store.get("plans", goal.activePlanId ?? "");
          if (!plan)
            throw new Blocked(
              "PLAN_MISSING",
              "No hay un contrato de verificación aceptado",
            );
          const config = goalConfig(goal),
            workspace = new GitWorkspace(goal.root, config),
            owner = id("manual-verify");
          this.store.lock(goal.workspaceId, owner, process.pid);
          this.activeAbort = new AbortController();
          this.activeGoal = goal.id;
          this.activeKind = "verification";
          this.active = (async () => {
            try {
              if ((await workspace.revision()) !== goal.candidateRevision)
                throw new Blocked(
                  "CANDIDATE_CHANGED",
                  "Reconciliá la versión candidata antes de verificar",
                );
              const verifier = new VerificationService(
                this.store,
                new PreparedDockerRunner(
                  config,
                  this.store,
                  join(this.home, "sandbox"),
                ),
              );
              for (const spec of plan.verification)
                await verifier.run(
                  goal,
                  workspace.repo,
                  spec,
                  this.activeAbort!.signal,
                );
            } catch (error) {
              this.send({ type: "fault", message: humanMessage(text(error)) });
            } finally {
              this.store.unlock(goal.workspaceId, owner);
              this.active = undefined;
              this.activeGoal = undefined;
              this.activeAbort = undefined;
              this.publish();
            }
          })();
          message =
            "Verificación iniciada; solo el evaluador del núcleo puede completar un objetivo";
          break;
        }
        case "doctor":
          this.diagnostics = await doctor(
            this.home,
            this.workspace,
            await ctx.config(),
            action.online,
          );
          message =
            "Diagnóstico completo; todavía no se probaron inferencias del proveedor";
          break;
        case "preferences":
          this.preferences = action.preferences;
          await writeFile(
            join(this.home, "ui.json"),
            JSON.stringify(this.preferences, null, 2),
            { mode: 0o600 },
          );
          break;
        case "contributor": {
          const policy = await localPolicy(this.home);
          policy.contributorWorkspaces = action.allow
            ? [...new Set([...policy.contributorWorkspaces, this.workspace])]
            : policy.contributorWorkspaces.filter((p) => p !== this.workspace);
          await savePolicy(policy, this.home);
          message = action.allow
            ? "Consentimiento de Contributor registrado para esta carpeta; solo admite objetivos públicos"
            : "Consentimiento de Contributor revocado";
          break;
        }
        case "login":
          this.idle();
          void this.authenticate(action.provider);
          message =
            "Autenticación iniciada; las credenciales permanecen locales";
          break;
        case "auth-answer": {
          const answer = this.answers.get(action.promptId);
          if (!answer)
            throw new Blocked(
              "AUTH_EXPIRED",
              "La solicitud de autenticación venció",
            );
          this.answers.delete(action.promptId);
          answer(action.value);
          message = "Respuesta de autenticación enviada";
          break;
        }
        case "auth-cancel":
          this.authAbort?.abort(new Error("Conexión cancelada"));
          message = "Autenticación cancelada";
          break;
        case "prepare": {
          this.idle();
          const goal = ctx.goal(action.goalId);
          this.activeAbort = new AbortController();
          this.activeGoal = goal.id;
          this.activeKind = "preparation";
          const signal = AbortSignal.any([
            this.activeAbort.signal,
            AbortSignal.timeout(goalConfig(goal).limits.timeoutPerTask),
          ]);
          this.active = prepareDependencies({
            goal,
            config: goalConfig(goal),
            store: this.store,
            home: this.home,
            allowNetwork: true,
            render: action.render,
            signal,
          })
            .then(() => {
              this.send({
                type: "result",
                requestId,
                ok: true,
                message: "Imagen de dependencias autorizada preparada",
              });
            })
            .catch((error) => {
              this.send({ type: "fault", message: humanMessage(text(error)) });
            })
            .finally(() => {
              this.active = undefined;
              this.activeGoal = undefined;
              this.activeKind = undefined;
              this.activeAbort = undefined;
              this.publish();
            });
          message =
            "Preparando la imagen autorizada; Pausar la detiene de forma segura";
          break;
        }
        case "refresh":
          break;
      }
      this.publish();
      this.send({
        type: "result",
        requestId,
        ok: true,
        message,
        content,
        path,
        operation,
      });
    } catch (error) {
      this.send({
        type: "result",
        requestId,
        ok: false,
        message: humanMessage(text(error)),
      });
      this.publish();
    }
  }
  private async authenticateIntegration(serverId: string): Promise<void> {
    const controller = new AbortController();
    this.authAbort = controller;
    const workspace = this.workspace,
      promptId = id("integration-secret");
    try {
      const value = await new Promise<string>((resolveAnswer, reject) => {
        const cancel = () => {
          this.answers.delete(promptId);
          reject(new Error("Conexión cancelada"));
        };
        controller.signal.addEventListener("abort", cancel, { once: true });
        this.answers.set(promptId, (value) => {
          controller.signal.removeEventListener("abort", cancel);
          resolveAnswer(value);
        });
        this.send({
          type: "auth",
          provider: serverId,
          promptId,
          secret: true,
          message:
            "Ingresá una credencial con los permisos mínimos del servicio. Se guarda solo en este equipo (DPAPI en Windows; archivo privado en Linux). No se envía a un modelo ni se incluye en el repositorio.",
        });
      });
      controller.signal.throwIfAborted();
      await this.integrations.credential(workspace, serverId, value);
      this.send({
        type: "auth",
        provider: serverId,
        message:
          "Credencial guardada. Probá la conexión y revisá su catálogo en /integraciones.",
        done: true,
      });
    } catch (error) {
      this.send({
        type: "auth",
        provider: serverId,
        message:
          error instanceof Blocked
            ? humanMessage(text(error))
            : "No se guardó la credencial o se canceló la conexión.",
        done: true,
      });
    } finally {
      this.answers.delete(promptId);
      this.authAbort = undefined;
      this.publish();
    }
  }
  private async authenticate(provider: string): Promise<void> {
    const controller = new AbortController();
    this.authAbort = controller;
    try {
      const config = await loadConfig(this.workspace, this.home),
        definition = Object.values(config.agents).find(
          (d) => d.provider === provider,
        );
      if (!definition || definition.auth === "mock")
        throw new Blocked("PROVIDER_UNKNOWN", provider);
      const runtime = await new PiRuntime(this.home, config).modelRuntime(
        definition,
      );
      await runtime.login(provider, definition.auth, {
        signal: controller.signal,
        notify: (event) => {
          if (event.type === "auth_url")
            this.send({
              type: "auth",
              provider,
              message: humanMessage(
                text(event.instructions ?? "Continuá en tu navegador"),
              ),
              url: event.url,
            });
          else if (event.type === "device_code")
            this.send({
              type: "auth",
              provider,
              message: "Autorizá el dispositivo en tu navegador",
              url: event.verificationUri,
              code: event.userCode,
            });
          else
            this.send({
              type: "auth",
              provider,
              message: humanMessage(text(event.message)),
            });
        },
        prompt: async (prompt) => {
          const promptId = id("auth-prompt");
          const value = await new Promise<string>((resolveAnswer, reject) => {
            const cancel = () => {
              this.answers.delete(promptId);
              reject(new Error("Conexión cancelada"));
            };
            controller.signal.addEventListener("abort", cancel, { once: true });
            this.answers.set(promptId, (value) => {
              controller.signal.removeEventListener("abort", cancel);
              resolveAnswer(value);
            });
            this.send({
              type: "auth",
              provider,
              message: humanMessage(text(prompt.message)),
              promptId,
              secret: prompt.type === "secret",
              options:
                prompt.type === "select"
                  ? prompt.options.map((o) => ({
                      id: o.id,
                      label: humanMessage(o.label),
                    }))
                  : undefined,
            });
          });
          if (prompt.type === "select") {
            const selected =
              prompt.options.find((o) => o.id === value) ??
              prompt.options[Number(value) - 1];
            if (!selected) throw new Error("Opción de autenticación inválida");
            return selected.id;
          }
          return value;
        },
      });
      this.send({
        type: "auth",
        provider,
        message: "Conectado. Credenciales guardadas fuera del repositorio.",
        done: true,
      });
    } catch (error) {
      this.send({
        type: "auth",
        provider,
        message: humanMessage(text(error)),
        done: true,
      });
    } finally {
      this.authAbort = undefined;
      this.answers.clear();
      this.publish();
    }
  }
  async dispose(): Promise<void> {
    if (this.closing) return;
    await this.actionQueue;
    this.authAbort?.abort();
    if (this.activeKind && this.activeKind !== "goal")
      this.activeAbort?.abort(new Error("Interfaz cerrada"));
    if (this.active && this.activeGoal) {
      await controlGoal(
        this.context(),
        this.context().goal(this.activeGoal),
        "pause",
      );
      await this.active;
    }
    this.closing = true;
    this.watcher?.close();
    this.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
    this.integrations.close();
    this.store.close();
  }
}
