import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRun, Evidence, Goal } from "../domain/model.js";
import { hash, id, now } from "../domain/util.js";
import type { IntegrationObservation } from "../ports/integrations.js";
import type { StateStore } from "../ports/state-store.js";
import { imageMime } from "../tools/evidence.js";

/** Controller-produced observations. Empty criterion coverage means these cannot satisfy Judge alone. */
export async function recordIntegrationEvidence(
  store: StateStore,
  goal: Goal,
  run: AgentRun,
  observation: IntegrationObservation,
): Promise<void> {
  const directory = join(goal.root, "artifacts", "integrations");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = {
    server: observation.server,
    tool: observation.tool,
    operationId: observation.operationId,
    argumentHash: observation.argumentHash,
    elapsedMs: observation.elapsedMs,
    untrusted: true,
    acceptedByJudge: false,
  };
  const artifacts: {
    kind: Evidence["kind"];
    extension: string;
    bytes: Buffer;
  }[] = [];
  const blocks = [];
  for (const block of observation.response.content) {
    if (block.type === "image") {
      const bytes = Buffer.from(block.data, "base64"),
        mime = imageMime(bytes);
      artifacts.push({
        kind: "screenshot",
        extension:
          mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp",
        bytes,
      });
      blocks.push({
        type: "image",
        mimeType: mime,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
      });
    } else blocks.push(block);
  }
  artifacts.push({
    kind: "report",
    extension: "json",
    bytes: Buffer.from(
      JSON.stringify(
        { ...metadata, response: { ...observation.response, content: blocks } },
        null,
        2,
      ),
    ),
  });
  for (const artifact of artifacts) {
    const evidenceId = id("evidence"),
      path = join(directory, `${evidenceId}.${artifact.extension}`);
    await writeFile(path, artifact.bytes, { flag: "wx", mode: 0o600 });
    store.put(
      "evidence",
      {
        id: evidenceId,
        goalId: goal.id,
        taskId: run.taskId,
        runId: run.id,
        kind: artifact.kind,
        artifactRef: path,
        contentHash: createHash("sha256").update(artifact.bytes).digest("hex"),
        producer: "controller",
        revision: run.inputRevision,
        environmentHash: hash({
          integration: observation.server,
          tool: observation.tool,
        }),
        criteriaIds: [],
        capturedAt: now(),
        validity: "valid",
      },
      "integration.evidence_recorded",
      "controller",
    );
  }
}
