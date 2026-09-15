import {
  resolveUserReferences,
  copyGoalReferences,
} from "../tools/references.js";
import { SkillsRegistry } from "../skills/registry.js";
import { mkdir, realpath } from "node:fs/promises";
import { join, resolve, relative, sep } from "node:path";
import type { Goal, Privacy } from "../domain/model.js";
import type { PerfectConfig } from "../config/schema.js";
import type { StateStore } from "../ports/state-store.js";
import { GitWorkspace } from "../adapters/git/workspace.js";
import { secretContent } from "../tools/paths.js";
import { hash, id, now, Blocked } from "../domain/util.js";

export async function createGoal(
  input: {
    request: string;
    source: string;
    home: string;
    config: PerfectConfig;
    privacy: Privacy;
    mode?: "real" | "mock";
    workMode?: string;
    referenceIds?: string[];
  },
  store: StateStore,
): Promise<Goal> {
  if (secretContent(input.request))
    throw new Blocked(
      "SECRET_CONTENT",
      "Remove credentials from the goal before submitting it",
    );
  if (!input.request.trim()) throw new Error("A nonempty goal is required");
  const source = await realpath(input.source),
    home = resolve(input.home);
  if (
    home === source ||
    (!relative(source, home).startsWith(`..${sep}`) &&
      relative(source, home) !== "..")
  )
    throw new Blocked(
      "CONTROL_PATH",
      "Perfect state must be outside the source workspace",
    );
  const goalId = id("goal"),
    workspaceId = `workspace-${hash(source).slice(0, 24)}`,
    root = join(home, "projects", workspaceId, "goals", goalId);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const owner = id("snapshot");
  store.lock(workspaceId, owner, process.pid);
  try {
    const workspace = new GitWorkspace(root, input.config),
      snapshot = await workspace.initialize(source);
    const references = await resolveUserReferences(
      home,
      source,
      input.referenceIds ?? [],
      input.privacy ?? "private",
    );
    await copyGoalReferences(home, root, references);
    const goal: Goal = {
      references,
      id: goalId,
      schemaVersion: 1,
      originalRequest: input.request,
      state: "RECEIVED",
      workspaceId,
      source,
      root,
      baseline: snapshot.baseline,
      sourceFingerprint: snapshot.sourceFingerprint,
      candidateRevision: snapshot.baseline,
      criteria: [],
      configSnapshot: input.config,
      configSnapshotHash: hash(input.config),
      iteration: 0,
      plannerCalls: 0,
      oracleCalls: 0,
      providerRequests: 0,
      noProgress: 0,
      activeMs: 0,
      privacyClass: input.privacy,
      mode: input.mode ?? "real",
      createdAt: now(),
      updatedAt: now(),
    };
    goal.studioSnapshotId = new SkillsRegistry(store).snapshot(
      goal,
      input.config,
      input.workMode,
    ).id;
    store.put("goals", goal, "goal.created");
    store.event(goal.id, "workspace.snapshotted", {
      head: snapshot.manifest.head,
      files: snapshot.manifest.files.length,
      skipped: snapshot.manifest.skipped,
    });
    return goal;
  } finally {
    store.unlock(workspaceId, owner);
  }
}
