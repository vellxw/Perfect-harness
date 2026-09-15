import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  Evidence,
  Goal,
  VerificationSpec,
  VerificationResult,
} from "../../domain/model.js";
import type { StateStore } from "../../ports/state-store.js";
import type {
  ExecutionRunner,
  ExecutionOutput,
} from "../../ports/execution.js";
import { readEvidence } from "../../tools/evidence.js";
import { hash, id, now, errorText, Blocked } from "../../domain/util.js";
export class VerificationService {
  constructor(
    private store: StateStore,
    private runner: ExecutionRunner,
  ) {}
  async run(
    goal: Goal,
    workspace: string,
    spec: VerificationSpec,
    signal: AbortSignal,
    taskId?: string,
  ): Promise<VerificationResult> {
    const resultId = id("verification"),
      startedAt = now(),
      artifactsDir = join(goal.root, "artifacts", resultId);
    await mkdir(artifactsDir, { recursive: true, mode: 0o700 });
    this.store.event(goal.id, "verification.started", {
      specId: spec.id,
      revision: goal.candidateRevision,
      taskId,
    });
    const request = {
      goalId: goal.id,
      taskId,
      workspace,
      revision: goal.candidateRevision,
      artifactsDir,
      signal,
    };
    let output: ExecutionOutput;
    try {
      if (spec.kind === "postgres") {
        if (!this.runner.postgres)
          throw new Blocked(
            "POSTGRES_RUNNER_REQUIRED",
            "La verificación requiere PostgreSQL real aislado; no se sustituye por SQLite",
          );
        output = await this.runner.postgres(request, spec.command!);
      } else if (spec.kind === "browser")
        output = await this.runner.browser(request, spec.scenario!);
      else if (spec.kind === "remotion")
        output = await this.runner.remotion(request, spec.remotion!);
      else output = await this.runner.command(request, spec.command!);
    } catch (error) {
      if (error instanceof Blocked) throw error;
      output = { code: 1, stdout: "", stderr: errorText(error), artifacts: [] };
    }
    const report = join(artifactsDir, "execution.json");
    await writeFile(
      report,
      JSON.stringify(
        {
          spec,
          revision: goal.candidateRevision,
          code: output.code,
          stdout: output.stdout,
          stderr: output.stderr,
          environment: output.environment,
        },
        null,
        2,
      ),
    );
    const evidenceIds: string[] = [];
    for (const artifact of [
      { path: report, kind: "report" as const },
      ...output.artifacts,
    ]) {
      const evidence: Evidence = {
        id: id("evidence"),
        goalId: goal.id,
        taskId,
        verificationId: resultId,
        kind: artifact.kind,
        artifactRef: artifact.path,
        contentHash: hash((await readFile(artifact.path)).toString("base64")),
        producer: "runner",
        revision: goal.candidateRevision,
        environmentHash: hash({
          runner: this.runner.constructor.name,
          actual: output.environment,
          platform: process.platform,
          spec,
        }),
        criteriaIds: spec.criteriaIds,
        capturedAt: now(),
        validity: "valid",
      };
      this.store.put("evidence", evidence, "evidence.created");
      evidenceIds.push(evidence.id);
    }
    const result: VerificationResult = {
      id: resultId,
      goalId: goal.id,
      taskId,
      specId: spec.id,
      revision: goal.candidateRevision,
      status: output.code === 0 ? "passed" : "failed",
      command: spec.command,
      exitCode: output.code,
      evidenceIds,
      startedAt,
      endedAt: now(),
      failureIds: [],
      summary: (output.stderr || output.stdout || `Exit ${output.code}`).slice(
        0,
        16000,
      ),
    };
    this.store.put(
      "verifications",
      result,
      result.status === "passed"
        ? "verification.passed"
        : "verification.failed",
    );
    return result;
  }
  async artifactsValid(evidence: Evidence[]): Promise<boolean> {
    for (const e of evidence) {
      try {
        const goal = this.store.get("goals", e.goalId);
        if (!goal) return false;
        await readEvidence(goal, e, 200_000_000);
      } catch {
        return false;
      }
    }
    return true;
  }
}
