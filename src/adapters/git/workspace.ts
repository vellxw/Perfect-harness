import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  lstat,
  copyFile,
} from "node:fs/promises";
import { join, resolve, relative, dirname } from "node:path";
import type { PerfectConfig } from "../../config/schema.js";
import type { Goal, Task } from "../../domain/model.js";
import { hash, Blocked } from "../../domain/util.js";
import {
  omitted,
  safePath,
  secretContent,
  relativePath,
} from "../../tools/paths.js";
import { git } from "./process.js";

export interface Manifest {
  files: { path: string; hash: string; size: number }[];
  head: string;
  index: string;
  fingerprint: string;
  skipped: string[];
}
async function walk(root: string, prefix = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(join(root, prefix), {
    withFileTypes: true,
  })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (omitted(path)) continue;
    if (entry.isDirectory()) result.push(...(await walk(root, path)));
    else result.push(path);
  }
  return result.sort();
}
export async function manifest(
  root: string,
  config: PerfectConfig,
): Promise<Manifest> {
  let paths: string[];
  let head = "unborn",
    index = "";
  try {
    await git(root, ["rev-parse", "--git-dir"]);
    paths = (
      await git(root, [
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
      ])
    )
      .split("\0")
      .filter(Boolean);
    head = await git(root, ["rev-parse", "--verify", "HEAD"]).catch(
      () => "unborn",
    );
    index = await git(root, ["ls-files", "--stage", "-z"]);
  } catch {
    paths = await walk(root);
  }
  const files: Manifest["files"] = [],
    skipped: string[] = [];
  let total = 0;
  for (const path of [...new Set(paths)].sort()) {
    if (omitted(path)) {
      skipped.push(path);
      continue;
    }
    try {
      const full = await safePath(root, path);
      const st = await lstat(full);
      if (!st.isFile()) {
        skipped.push(path);
        continue;
      }
      if (st.size > config.limits.maxFileBytes)
        throw new Blocked("FILE_SIZE", path);
      const data = await readFile(full);
      if (secretContent(data.toString("utf8"))) {
        skipped.push(path);
        continue;
      }
      total += data.length;
      if (total > config.limits.maxWorkspaceBytes)
        throw new Blocked(
          "WORKSPACE_SIZE",
          "Snapshot exceeds configured limit",
        );
      files.push({
        path,
        hash: hash(data.toString("base64")),
        size: data.length,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      if (error instanceof Blocked && error.code === "LINK_DENIED") {
        skipped.push(path);
        continue;
      }
      throw error;
    }
  }
  return {
    files,
    head,
    index,
    fingerprint: hash({ files, head, index }),
    skipped,
  };
}
export async function copySnapshot(
  source: string,
  destination: string,
  config: PerfectConfig,
): Promise<Manifest> {
  const snapshot = await manifest(source, config);
  await mkdir(destination, { recursive: true, mode: 0o700 });
  for (const file of snapshot.files) {
    const from = await safePath(source, file.path);
    const to = join(destination, file.path);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  }
  return snapshot;
}
export class GitWorkspace {
  readonly repo: string;
  constructor(
    readonly root: string,
    readonly config: PerfectConfig,
  ) {
    this.repo = join(root, "repo");
  }
  async initialize(
    source: string,
  ): Promise<{
    baseline: string;
    sourceFingerprint: string;
    manifest: Manifest;
  }> {
    const snapshot = await copySnapshot(source, this.repo, this.config);
    await git(this.repo, ["init", "--initial-branch=candidate"]);
    await git(this.repo, ["add", "--all"]);
    await git(this.repo, [
      "commit",
      "--allow-empty",
      "-m",
      "Perfect: sanitized source baseline",
    ]);
    await writeFile(
      join(this.root, "baseline-manifest.json"),
      JSON.stringify(snapshot, null, 2),
    );
    return {
      baseline: await this.revision(),
      sourceFingerprint: snapshot.fingerprint,
      manifest: snapshot,
    };
  }
  async revision(): Promise<string> {
    return git(this.repo, ["rev-parse", "HEAD"]);
  }
  async worktree(task: Task): Promise<string> {
    const path = join(this.root, "worktrees", `${task.id}-${task.attempt}`);
    await mkdir(dirname(path), { recursive: true });
    await git(this.repo, [
      "worktree",
      "add",
      "--detach",
      path,
      task.baseRevision,
    ]);
    return path;
  }
  async checkpoint(worktree: string, task: Task): Promise<string> {
    if (!resolve(worktree).startsWith(`${resolve(this.root)}/worktrees/`))
      throw new Blocked("WORKTREE_DENIED", worktree);
    await git(worktree, ["add", "--all"]);
    await git(worktree, [
      "commit",
      "--allow-empty",
      "-m",
      `Perfect task ${task.id} attempt ${task.attempt}`,
    ]);
    return git(worktree, ["rev-parse", "HEAD"]);
  }
  async integrate(task: Task, commit: string): Promise<string> {
    const before = await this.revision();
    const names = (
      await git(this.repo, [
        "diff",
        "--name-only",
        "-z",
        task.baseRevision,
        commit,
      ])
    )
      .split("\0")
      .filter(Boolean);
    for (const name of names) {
      relativePath(name);
      if (
        ![...task.ownedFiles, ...task.ownedSurfaces].some(
          (s) => name === s || name.startsWith(`${s}/`),
        )
      )
        throw new Blocked("OWNERSHIP_DIFF", name);
    }
    const patch = await git(this.repo, [
      "diff",
      "--binary",
      task.baseRevision,
      commit,
    ]);
    if (!patch) return before;
    try {
      await git(
        this.repo,
        ["apply", "--index", "--3way", "--whitespace=nowarn", "-"],
        `${patch}\n`,
      );
      await git(this.repo, ["commit", "-m", `Perfect integrate ${task.id}`]);
      return this.revision();
    } catch (error) {
      // Destructive reset is confined to our private candidate, never the user's checkout.
      await git(this.repo, ["reset", "--hard", before]);
      throw new Error(`INTEGRATION_CONFLICT: ${String(error)}`);
    }
  }
  async diff(baseline: string): Promise<string> {
    return git(this.repo, ["diff", "--binary", baseline, "HEAD"]);
  }
  async frozenFiles(): Promise<Record<string, string>> {
    const baseline = JSON.parse(
      await readFile(join(this.root, "baseline-manifest.json"), "utf8"),
    ) as Manifest;
    return Object.fromEntries(
      baseline.files
        .filter((f) =>
          /(^|\/)(tests?|references|__snapshots__)\/|\.(test|spec)\.[^.]+$/.test(
            f.path,
          ),
        )
        .map((f) => [f.path, f.hash]),
    );
  }
  async apply(goal: Goal): Promise<void> {
    if (
      resolve(goal.source) === resolve(this.repo) ||
      relative(goal.source, this.root).startsWith("..") === false
    )
      throw new Blocked("APPLY_PATH", "Source/control overlap");
    const current = await manifest(goal.source, this.config);
    if (current.fingerprint !== goal.sourceFingerprint)
      throw new Blocked(
        "SOURCE_CHANGED",
        "Original workspace or index changed; refusing automatic apply",
      );
    const patch = await this.diff(goal.baseline);
    if (!patch) return;
    await git(
      goal.source,
      ["apply", "--check", "--whitespace=nowarn", "-"],
      `${patch}\n`,
    );
    await git(goal.source, ["apply", "--whitespace=nowarn", "-"], `${patch}\n`);
  }
}
