import { policyLease } from "../skills/control.js";
import {
  evaluationContext,
  type EvaluationInvocation,
} from "../skills/experiments.js";
import { executeSkillScript } from "../skills/scripts.js";
import { assertNativeProfile } from "../modes/capabilities.js";
import { SkillsRegistry } from "../skills/registry.js";
import { SkillSession } from "../skills/session.js";
import { resolveProfile, profileDefinition } from "../agents/profiles.js";
import type { AgentDefinition, TaskSpec } from "../domain/model.js";
import { recordIntegrationEvidence } from "./integration-evidence.js";
import { join } from "node:path";
import { readFile, lstat } from "node:fs/promises";
import { safePath, sensitive } from "../tools/paths.js";
import { readEvidence, imageMime } from "../tools/evidence.js";
import { effectivePrivacy } from "../domain/model.js";
import type {
  AgentRun,
  Evidence,
  Goal,
  Role,
  Task,
  Usage,
} from "../domain/model.js";
import type { PerfectConfig } from "../config/schema.js";
import type {
  AgentRuntime,
  AgentServices,
  AgentOutput,
} from "../ports/agent-runtime.js";
import type { StateStore } from "../ports/state-store.js";
import type { ExecutionRunner } from "../ports/execution.js";
import { FileBroker } from "../tools/file-broker.js";
import { fetchReference } from "../tools/research.js";
import { manifest, GitWorkspace } from "../adapters/git/workspace.js";
import { OwnershipManager } from "./ownership.js";
import { BudgetManager } from "./budget.js";
import { buildContext } from "./context.js";
import { Semaphore } from "./semaphore.js";
import { id, now, errorText, Blocked } from "../domain/util.js";

export interface Invocation {
  evaluation?: EvaluationInvocation;
  requestGuard?: (requestId: string, runId: string, tokens: number) => void;
  usageObserver?: (usage: Usage) => void;
  goal: Goal;
  role: Role;
  profileId?: string;
  task?: Task;
  workspace: string;
  leaseId?: string;
  instruction: string;
  schema: Record<string, unknown>;
  parse: (value: unknown) => unknown;
  evidence?: Evidence[];
  images?: { data: string; mimeType: string; source: string }[];
}
export class AgentExecutor {
  private accounts = new Map<string, Semaphore>();
  constructor(
    private store: StateStore,
    private runtime: AgentRuntime,
    private runner: ExecutionRunner,
    private config: PerfectConfig,
    private consent: boolean | (() => Promise<boolean>),
  ) {}
  profile(goal: Goal, role: Role, task?: TaskSpec, profileId?: string) {
    return resolveProfile(
      new SkillsRegistry(this.store).forGoal(goal, this.config),
      role,
      profileId ?? task?.profileId,
    );
  }
  definition(goal: Goal, role: Role, task?: TaskSpec): AgentDefinition {
    return profileDefinition(this.profile(goal, role, task));
  }
  private async consentGranted(): Promise<boolean> {
    return typeof this.consent === "function" ? this.consent() : this.consent;
  }
  async preflight(
    goal: Goal,
    role: Role,
    task: Task | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    assertNativeProfile(this.profile(goal, role, task).profile.id);
    await this.runtime.resolve(
      this.definition(goal, role, task),
      effectivePrivacy(goal.privacyClass, task?.privacyClass),
      await this.consentGranted(),
      signal,
    );
  }
  services(
    goal: Goal,
    role: Role,
    workspace: string,
    signal: AbortSignal,
    leaseId?: string,
    taskId?: string,
    evidence: Evidence[] = [],
    definition: AgentDefinition = this.config.agents[role],
  ): AgentServices {
    const ownership = new OwnershipManager(this.store);
    const makeBroker = async () =>
      new FileBroker(
        workspace,
        {
          readOnly: definition.readOnly || !leaseId,
          protectedPaths: this.config.protectedPaths,
          maxFileBytes: this.config.limits.maxFileBytes,
          frozenFiles: await new GitWorkspace(
            goal.root,
            this.config,
          ).frozenFiles(),
        },
        ownership,
        leaseId,
      );
    return {
      listFiles: async () =>
        (await manifest(workspace, this.config)).files.map((f) => f.path),
      readFile: async (path, startLine = 1, endLine) => {
        signal.throwIfAborted();
        if (
          !Number.isSafeInteger(startLine) ||
          startLine < 1 ||
          (endLine !== undefined &&
            (!Number.isSafeInteger(endLine) || endLine < startLine))
        )
          throw new Blocked("LINE_RANGE", "Invalid read range");
        const file = await (await makeBroker()).read(path),
          lines = file.content.split("\n");
        const selected: string[] = [];
        let chars = 0,
          index = startLine - 1;
        for (
          ;
          index < Math.min(lines.length, endLine ?? lines.length);
          index++
        ) {
          const line = lines[index]!;
          if (chars + line.length > this.config.limits.maxToolTextChars) break;
          selected.push(line);
          chars += line.length + 1;
        }
        if (
          !selected.length &&
          index < lines.length &&
          lines[index]!.length > this.config.limits.maxToolTextChars
        )
          throw new Blocked(
            "LINE_SIZE",
            "Line exceeds tool budget; request a scoped refactor or inspect a non-minified source",
          );
        return {
          ...file,
          content: selected.join("\n"),
          truncated: index < lines.length,
          totalLines: lines.length,
          nextLine: index < lines.length ? index + 1 : undefined,
        };
      },
      readEvidence: async (evidenceId) => {
        signal.throwIfAborted();
        const item = evidence.find((e) => e.id === evidenceId);
        if (!item || !["report", "review", "diff", "log"].includes(item.kind))
          throw new Blocked(
            "EVIDENCE_SCOPE",
            "Only scoped text evidence may be read",
          );
        const bytes = await readEvidence(
          goal,
          item,
          this.config.limits.maxFileBytes,
        );
        const content = bytes.toString("utf8");
        return {
          id: item.id,
          content: content.slice(0, this.config.limits.maxToolTextChars),
          truncated: content.length > this.config.limits.maxToolTextChars,
        };
      },
      ...(definition.capabilities.includes("image")
        ? {
            readImage: async (path: string) => {
              signal.throwIfAborted();
              if (sensitive(path)) throw new Blocked("SECRET_DENIED", path);
              const full = await safePath(workspace, path),
                stat = await lstat(full);
              if (
                !stat.isFile() ||
                stat.size > this.config.limits.maxImageBytes
              )
                throw new Blocked("IMAGE_SIZE", path);
              const data = await readFile(full);
              if (data.length > this.config.limits.maxImageBytes)
                throw new Blocked("IMAGE_SIZE", path);
              return {
                data: data.toString("base64"),
                mimeType: imageMime(data),
                source: path,
              };
            },
          }
        : {}),
      ...(!definition.readOnly && leaseId
        ? {
            writeFile: async (
              path: string,
              content: string,
              expectedHash?: string,
            ) => {
              signal.throwIfAborted();
              return (await makeBroker()).write(path, content, expectedHash);
            },
            removeFile: async (path: string, expectedHash: string) => {
              signal.throwIfAborted();
              await (await makeBroker()).remove(path, expectedHash);
            },
            command: async (
              command: import("../domain/model.js").CommandSpec,
            ) => {
              signal.throwIfAborted();
              const output = await this.runner.command(
                {
                  goalId: goal.id,
                  taskId,
                  workspace,
                  revision: goal.candidateRevision,
                  artifactsDir: join(goal.root, "artifacts", id("tool")),
                  signal,
                },
                command,
              );
              return {
                code: output.code,
                stdout: output.stdout,
                stderr: output.stderr,
              };
            },
          }
        : {}),
      ...(this.config.permissions.researchHosts.length
        ? {
            research: (url: string) =>
              fetchReference(
                url,
                this.config.permissions.researchHosts,
                signal,
              ),
          }
        : {}),
    };
  }
  async invoke(
    input: Invocation,
    outerSignal: AbortSignal,
  ): Promise<{ run: AgentRun; output: AgentOutput }> {
    let signal = AbortSignal.any([
      outerSignal,
      AbortSignal.timeout(this.config.limits.timeoutPerTask),
    ]);
    const profile = this.profile(
      input.goal,
      input.role,
      input.task,
      input.profileId,
    );
    const definition = profileDefinition(profile);
    let semaphore = this.accounts.get(definition.accountRef);
    if (!semaphore) {
      semaphore = new Semaphore(
        this.config.parallelism.perAccount[definition.accountRef] ?? 1,
      );
      this.accounts.set(definition.accountRef, semaphore);
    }
    return semaphore.use(signal, async () => {
      const route = await this.runtime.resolve(
        definition,
        effectivePrivacy(input.goal.privacyClass, input.task?.privacyClass),
        await this.consentGranted(),
        signal,
      );
      if (route.provenance === "mock" && input.goal.mode !== "mock")
        throw new Blocked(
          "MOCK_ROUTE_DENIED",
          "Real goals cannot use a simulated route",
        );
      const runId = id("run");
      const skillSession = new SkillSession(
        this.store,
        {
          ...input.goal,
          privacyClass: effectivePrivacy(
            input.goal.privacyClass,
            input.task?.privacyClass,
          ),
        },
        this.config,
        profile,
        runId,
        signal,
      );
      const trial = input.evaluation
        ? evaluationContext(this.store, input.evaluation, profile.profile)
        : undefined;
      const origin = input.evaluation
        ? this.store.get("skillTrials", input.evaluation.trialId)!.workspace
        : input.goal.source;
      const revocation = policyLease(
        this.store,
        origin,
        signal,
        input.evaluation
          ? () => {
              evaluationContext(this.store, input.evaluation!, profile.profile);
            }
          : undefined,
      );
      signal = revocation.signal;
      try {
        const services = this.services(
          input.goal,
          input.role,
          input.workspace,
          signal,
          input.leaseId,
          input.task?.id,
          input.evidence,
          definition,
        );
        services.skillGuard = () => skillSession.guard();
        const catalog = trial ? [] : skillSession.list();
        if (catalog.length)
          services.skills = {
            list: () => skillSession.list(),
            load: (skillId) => skillSession.load(skillId),
            read: (skillId, resource) => skillSession.read(skillId, resource),
            ...(!definition.readOnly && services.command
              ? {
                  run: (skillId: string, resource: string, args: string[]) =>
                    executeSkillScript({
                      goal: input.goal,
                      workspace: input.workspace,
                      release: skillSession.authorizedRelease(skillId),
                      resource,
                      args,
                      config: this.config,
                      runner: this.runner,
                      signal,
                      guard: () => skillSession.guard(),
                    }),
                }
              : {}),
          };
        const procedures = trial
          ? trial.procedures
          : input.role === "planner"
            ? ""
            : skillSession.auto(
                input.task
                  ? input.task.title + " " + input.task.description
                  : input.instruction,
              );
        const frozen = new SkillsRegistry(this.store).forGoal(
          input.goal,
          this.config,
        );
        const specialization = {
          profileId: profile.profile.id,
          setIds: [...profile.profile.setIds],
          workMode: profile.mode.id,
          instruction: profile.mode.instruction,
          catalog,
          procedures,
          ...(input.role === "planner"
            ? {
                availableProfiles: frozen.profiles
                  .filter(
                    (p) => p.enabled && profile.mode.profiles.includes(p.id),
                  )
                  .map((p) => ({
                    id: p.id,
                    role: p.role,
                    setIds: p.setIds,
                    readOnly: p.readOnly,
                  })),
              }
            : {}),
        };
        const context = await buildContext(
          input.goal,
          input.role,
          input.task,
          services,
          this.store,
          this.config,
          input.evidence,
          specialization,
        );
        let run: AgentRun = {
          id: runId,
          profileId: profile.profile.id,
          setIds: [...profile.profile.setIds],
          studioSnapshotId: input.goal.studioSnapshotId,
          goalId: input.goal.id,
          taskId: input.task?.id,
          attempt: input.task?.attempt ?? 1,
          agentDefinitionId: input.role,
          status: "running",
          routeBinding: route,
          contextPackageId: context.id,
          inputRevision: input.goal.candidateRevision,
          requestIds: [],
          usageIds: [],
          startedAt: now(),
        };
        this.store.put("runs", run, "agent.started");
        if (input.task)
          this.store.put(
            "attempts",
            {
              id: `${input.task.id}-attempt-${input.task.attempt}`,
              goalId: input.goal.id,
              taskId: input.task.id,
              number: input.task.attempt,
              runId: run.id,
              status: "running",
              startedAt: now(),
            },
            "attempt.started",
          );
        const budget = new BudgetManager(
          this.store,
          input.goal.id,
          this.config,
        );
        try {
          const output = await this.runtime.run({
            toolAllowlist: trial?.tools,
            disableIntegrations: Boolean(trial),
            run,
            context,
            cwd: input.workspace,
            sourceWorkspace: input.goal.source,
            goalRoot: input.goal.root,
            observeIntegration: (observation) =>
              recordIntegrationEvidence(
                this.store,
                input.goal,
                run,
                observation,
              ),
            controlDir: join(input.goal.root, "runs", run.id),
            signal,
            services,
            instruction: input.instruction,
            resultSchema: input.schema,
            parseResult: input.parse,
            images: input.images,
            beforeRequest: async (requestId, tokens, cost) => {
              skillSession.guard();
              if (
                route.provenance !== "mock" &&
                definition.model.includes("contributor") &&
                !(await this.consentGranted())
              )
                throw new Blocked(
                  "CONTRIBUTOR_CONSENT",
                  "Workspace consent was revoked during execution",
                );
              input.requestGuard?.(requestId, run.id, tokens);
              budget.reserve(requestId, run.id, route, tokens, cost);
              run = { ...run, requestIds: [...run.requestIds, requestId] };
              this.store.put("runs", run, "agent.request_started");
            },
            usage: (usage: Usage) => {
              budget.settle(usage);
              input.usageObserver?.(usage);
              run = { ...run, usageIds: [...run.usageIds, usage.id] };
              this.store.put("runs", run, "agent.usage_updated");
            },
            event: (type, payload) =>
              this.store.event(
                input.goal.id,
                type,
                { runId: run.id, taskId: input.task?.id, details: payload },
                input.role,
              ),
          });
          signal.throwIfAborted();
          input.parse(output.result);
          run = {
            ...run,
            status: "completed",
            endedAt: now(),
            sessionRef: output.sessionRef,
          };
          this.store.put("runs", run, "agent.completed");
          if (input.task) {
            const attempt = this.store.get(
              "attempts",
              `${input.task.id}-attempt-${input.task.attempt}`,
            )!;
            this.store.put(
              "attempts",
              { ...attempt, status: "completed", endedAt: now() },
              "attempt.completed",
            );
          }
          return { run, output };
        } catch (error) {
          run = {
            ...run,
            status: signal.aborted ? "interrupted" : "failed",
            endedAt: now(),
            stopReason: errorText(error),
          };
          this.store.put("runs", run, "agent.failed");
          if (input.task) {
            const attempt = this.store.get(
              "attempts",
              `${input.task.id}-attempt-${input.task.attempt}`,
            )!;
            this.store.put(
              "attempts",
              {
                ...attempt,
                status: signal.aborted ? "interrupted" : "failed",
                endedAt: now(),
              },
              "attempt.failed",
            );
          }
          throw error;
        } finally {
          budget.interrupt(run.id);
        }
      } finally {
        revocation.close();
      }
    });
  }
}
