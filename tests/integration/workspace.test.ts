import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitWorkspace, manifest } from "../../src/adapters/git/workspace.js";
import { git } from "../../src/adapters/git/process.js";
import { defaultConfig } from "../../src/config/schema.js";
import { makeGoal, makeTask } from "../fixtures/domain.js";

test("managed worktrees preserve dirty source and staging; apply refuses divergence", async () => {
  const root = await mkdtemp(join(tmpdir(), "perfect-workspace-")),
    source = join(root, "source"),
    control = join(root, "control"),
    cfg = defaultConfig();
  try {
    await mkdir(join(source, "src"), { recursive: true });
    await writeFile(join(source, "src", "app.txt"), "base");
    await git(source, ["init"]);
    await git(source, ["add", "."]);
    await git(source, ["commit", "-m", "baseline"]);
    await writeFile(join(source, "src", "app.txt"), "staged");
    await git(source, ["add", "."]);
    await writeFile(join(source, "src", "app.txt"), "unstaged");
    await writeFile(join(source, "untracked.txt"), "preserve");
    await writeFile(join(source, ".env"), "PRIVATE=value");
    const before = await manifest(source, cfg),
      workspace = new GitWorkspace(control, cfg),
      snapshot = await workspace.initialize(source);
    assert.equal(
      await readFile(join(workspace.repo, "src", "app.txt"), "utf8"),
      "unstaged",
    );
    await assert.rejects(() => readFile(join(workspace.repo, ".env")));
    const task = makeTask({
      id: "worker-a",
      attempt: 1,
      baseRevision: snapshot.baseline,
    });
    const tree = await workspace.worktree(task);
    await writeFile(join(tree, "src", "added.txt"), "new");
    const checkpoint = await workspace.checkpoint(tree, task);
    const revision = await workspace.integrate(task, checkpoint);
    assert.equal((await manifest(source, cfg)).fingerprint, before.fingerprint);
    const goal = {
      ...makeGoal(),
      source,
      root: control,
      baseline: snapshot.baseline,
      candidateRevision: revision,
      sourceFingerprint: snapshot.sourceFingerprint,
    };
    const index = await git(source, ["ls-files", "--stage"]);
    await workspace.apply(goal);
    assert.equal(
      await readFile(join(source, "src", "added.txt"), "utf8"),
      "new",
    );
    assert.equal(await git(source, ["ls-files", "--stage"]), index);
    await writeFile(join(source, "untracked.txt"), "changed");
    await assert.rejects(() => workspace.apply(goal), /SOURCE_CHANGED/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("apply rejects unverified candidate edits even when the original remains unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "perfect-apply-")),
    source = join(root, "source"),
    cfg = defaultConfig();
  try {
    await mkdir(source);
    await writeFile(join(source, "README.md"), "original");
    await git(source, ["init"]);
    const workspace = new GitWorkspace(join(root, "control"), cfg),
      snapshot = await workspace.initialize(source);
    const goal = {
      ...makeGoal(),
      source,
      root: workspace.root,
      baseline: snapshot.baseline,
      candidateRevision: snapshot.baseline,
      sourceFingerprint: snapshot.sourceFingerprint,
    };
    await writeFile(join(workspace.repo, "README.md"), "unreviewed change");
    await assert.rejects(workspace.apply(goal), /CANDIDATE_CHANGED/);
    assert.equal(await readFile(join(source, "README.md"), "utf8"), "original");
    await git(workspace.repo, ["add", "."]);
    await git(workspace.repo, ["commit", "-m", "unreviewed checkpoint"]);
    await assert.rejects(workspace.apply(goal), /CANDIDATE_CHANGED/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
