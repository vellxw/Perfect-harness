import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, writeFile, realpath } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { SqliteStore, onDatabaseChange } from "../adapters/sqlite/store.js";
import {
  homeDir,
  loadConfig,
  localPolicy,
  savePolicy,
} from "../config/load.js";
import { goalConfig, type CliContext } from "../cli/context.js";
import {
  controlGoal,
  approvePlan,
  approveCriterion,
  retryTask,
  applyGoal,
} from "../cli/control.js";
import { doctor } from "../cli/doctor.js";
import { Orchestrator, acceptanceHash } from "../application/orchestrator.js";
import { createGoal } from "../application/goals.js";
import { PiRuntime } from "../adapters/pi/runtime.js";
import { PreparedDockerRunner } from "../adapters/sandbox/prepared-runner.js";
import { prepareDependencies } from "../adapters/sandbox/dependencies.js";
import { GitWorkspace } from "../adapters/git/workspace.js";
import { VerificationService } from "../adapters/verification/service.js";
import { readEvidence } from "../tools/evidence.js";
import { Blocked, id } from "../domain/util.js";
import type { Goal } from "../domain/model.js";
import { snapshot } from "./snapshot.js";
import {
  UiActionSchema,
  UiPreferencesSchema,
  text,
  type UiAction,
  type UiMessage,
  type UiPreferences,
  type UiSnapshot,
} from "./protocol.js";

/** One engine worker, no TCP server. The UI receives projections and sends validated user intents. */
export class PresentationEngine {
  readonly store: SqliteStore;
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
    this.unsubscribe = onDatabaseChange(join(home, "state.sqlite"), () =>
      this.wake(),
    );
    this.watcher = watch(home, (_event, name) => {
      if (name?.startsWith("state.sqlite")) this.wake();
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
          message: "UI preferences could not be read; using safe defaults.",
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
        this.send({ type: "fault", message: text(error) });
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
      ),
      serialized = JSON.stringify(state);
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
          throw new Blocked("GOAL_SCOPE", "Select a goal from this workspace");
        return g;
      },
      print: () => {},
    };
  }
  private idle(): void {
    if (this.active || this.authAbort)
      throw new Blocked(
        "ENGINE_BUSY",
        "Pause the active work or finish authentication first",
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
          this.send({ type: "fault", message: text(error) });
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
        message: "Invalid user action",
      });
      return;
    }
    try {
      const ctx = this.context();
      let message = "Updated",
        content: string | undefined,
        path: string | undefined,
        operation: string | undefined;
      switch (action.type) {
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
          message = "Goal started. Your original checkout remains unchanged.";
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
            this.activeAbort?.abort(new Error("User stopped manual operation"));
          await controlGoal(ctx, ctx.goal(action.goalId), action.type);
          message = "Request recorded; waiting for confirmed termination.";
          break;
        case "resume":
          this.start(ctx.goal(action.goalId));
          message = "Resuming with recovery checks";
          break;
        case "approve": {
          const goal = ctx.goal(action.goalId),
            plan = this.store.get("plans", goal.activePlanId ?? "");
          if (!plan || acceptanceHash(plan) !== action.planHash)
            throw new Blocked(
              "STALE_APPROVAL",
              "The plan changed. Review the current plan before approving.",
            );
          approvePlan(ctx, goal);
          message = "Plan approved. Use Resume to continue.";
          break;
        }
        case "criterion": {
          const goal = ctx.goal(action.goalId);
          if (goal.candidateRevision !== action.revision)
            throw new Blocked("STALE_APPROVAL", "Candidate changed");
          approveCriterion(ctx, goal, action.criterionId);
          message = "Human criterion approved for this candidate only";
          break;
        }
        case "apply": {
          this.idle();
          const goal = ctx.goal(action.goalId);
          if (goal.candidateRevision !== action.revision)
            throw new Blocked("STALE_APPROVAL", "Candidate changed");
          await applyGoal(ctx, goal, true);
          message = "Verified candidate applied to original workspace";
          break;
        }
        case "retry": {
          const task = this.store.get("tasks", action.taskId);
          if (!task || task.goalId !== action.goalId)
            throw new Blocked("TASK_SCOPE", "Task not in selected goal");
          ctx.goal(action.goalId);
          await retryTask(ctx, action.taskId);
          message = "Retry queued without resetting counters";
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
          message = "Candidate diff; source checkout is untouched";
          break;
        }
        case "artifact": {
          const goal = ctx.goal(action.goalId),
            e = this.store.get("evidence", action.evidenceId);
          if (!e || e.goalId !== goal.id)
            throw new Blocked("EVIDENCE_SCOPE", "Evidence is not in this goal");
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
              "Only verified images/video may be opened. Copy the path to inspect other artifacts explicitly.",
            );
          path = e.artifactRef;
          message = `${e.kind} · ${e.contentHash} · ${e.revision === goal.candidateRevision ? "current candidate" : "older candidate"}`;
          break;
        }
        case "reverify": {
          this.idle();
          const goal = ctx.goal(action.goalId);
          if (goal.state !== "PAUSED")
            throw new Blocked(
              "VERIFY_STATE",
              "Pause a nonterminal goal before manual verification",
            );
          const plan = this.store.get("plans", goal.activePlanId ?? "");
          if (!plan)
            throw new Blocked(
              "PLAN_MISSING",
              "No accepted verification contract",
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
                  "Reconcile the candidate before verifying",
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
              this.send({ type: "fault", message: text(error) });
            } finally {
              this.store.unlock(goal.workspaceId, owner);
              this.active = undefined;
              this.activeGoal = undefined;
              this.activeAbort = undefined;
              this.publish();
            }
          })();
          message =
            "Verification started; only the core Judge can complete a goal";
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
            "Diagnostics complete; provider inference has not been tested";
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
            ? "Contributor consent recorded for this workspace; only public goals qualify"
            : "Contributor consent revoked";
          break;
        }
        case "login":
          this.idle();
          void this.authenticate(action.provider);
          message = "Authentication opened; credentials stay local";
          break;
        case "auth-answer": {
          const answer = this.answers.get(action.promptId);
          if (!answer)
            throw new Blocked("AUTH_EXPIRED", "Authentication prompt expired");
          this.answers.delete(action.promptId);
          answer(action.value);
          message = "Authentication answer sent";
          break;
        }
        case "auth-cancel":
          this.authAbort?.abort(new Error("Login cancelled"));
          message = "Authentication cancelled";
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
                message: "Approved dependency image prepared",
              });
            })
            .catch((error) => {
              this.send({ type: "fault", message: text(error) });
            })
            .finally(() => {
              this.active = undefined;
              this.activeGoal = undefined;
              this.activeKind = undefined;
              this.activeAbort = undefined;
              this.publish();
            });
          message =
            "Preparing the approved dependency image; Pause cancels safely";
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
      this.send({ type: "result", requestId, ok: false, message: text(error) });
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
              message: text(event.instructions ?? "Continue in your browser"),
              url: event.url,
            });
          else if (event.type === "device_code")
            this.send({
              type: "auth",
              provider,
              message: "Authorize the device in your browser",
              url: event.verificationUri,
              code: event.userCode,
            });
          else
            this.send({ type: "auth", provider, message: text(event.message) });
        },
        prompt: async (prompt) => {
          const promptId = id("auth-prompt");
          const value = await new Promise<string>((resolveAnswer, reject) => {
            const cancel = () => {
              this.answers.delete(promptId);
              reject(new Error("Login cancelled"));
            };
            controller.signal.addEventListener("abort", cancel, { once: true });
            this.answers.set(promptId, (value) => {
              controller.signal.removeEventListener("abort", cancel);
              resolveAnswer(value);
            });
            this.send({
              type: "auth",
              provider,
              message: text(prompt.message),
              promptId,
              secret: prompt.type === "secret",
              options:
                prompt.type === "select"
                  ? prompt.options.map((o) => ({ id: o.id, label: o.label }))
                  : undefined,
            });
          });
          if (prompt.type === "select") {
            const selected =
              prompt.options.find((o) => o.id === value) ??
              prompt.options[Number(value) - 1];
            if (!selected) throw new Error("Invalid authentication choice");
            return selected.id;
          }
          return value;
        },
      });
      this.send({
        type: "auth",
        provider,
        message: "Connected. Credentials saved outside the repository.",
        done: true,
      });
    } catch (error) {
      this.send({ type: "auth", provider, message: text(error), done: true });
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
      this.activeAbort?.abort(new Error("UI closed"));
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
    this.store.close();
  }
}
