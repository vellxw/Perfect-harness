import { readFile, writeFile, mkdir, mkdtemp, lstat } from "node:fs/promises";
import { join } from "node:path";
import type { PerfectConfig } from "../../config/schema.js";
import type { Goal, OperationIntent } from "../../domain/model.js";
import type { StateStore, DependencyImage } from "../../ports/state-store.js";
import { safePath, secretContent } from "../../tools/paths.js";
import { processRun, git } from "../git/process.js";
import { GitWorkspace } from "../git/workspace.js";
import { Blocked, hash, id, now } from "../../domain/util.js";

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Blocked("DEPENDENCY_MANIFEST", "Expected a JSON object");
  return value as Record<string, unknown>;
};
export function validateDependencyManifest(value: unknown): boolean {
  const manifest = object(value);
  if (manifest.workspaces || manifest.overrides || manifest.resolutions)
    throw new Blocked(
      "DEPENDENCY_LAYOUT",
      "V1 preparation supports a root npm project without workspaces, overrides or alternate resolutions. Use an explicitly prepared trusted image for other layouts.",
    );
  let needed = false;
  for (const group of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    if (manifest[group] === undefined) continue;
    for (const [name, version] of Object.entries(object(manifest[group]))) {
      if (
        !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name) ||
        typeof version !== "string" ||
        !/^[a-zA-Z0-9.*+^~<>=| -]+$/.test(version)
      )
        throw new Blocked(
          "DEPENDENCY_SOURCE",
          `Only public npm registry version selectors are allowed: ${name}`,
        );
      needed = true;
    }
  }
  return needed;
}
export function validateDependencyLock(value: unknown): void {
  const visit = (node: unknown, depth: number): void => {
    if (depth > 40)
      throw new Blocked(
        "LOCKFILE_DEPTH",
        "Lockfile nesting exceeds the supported limit",
      );
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, item] of Object.entries(node)) {
      if (key === "link" && item === true)
        throw new Blocked(
          "DEPENDENCY_SOURCE",
          "Linked dependencies are not allowed in preparation",
        );
      if (key === "resolved" && typeof item === "string") {
        let url: URL;
        try {
          url = new URL(item);
        } catch {
          throw new Blocked(
            "DEPENDENCY_SOURCE",
            "Non-registry dependency in lockfile",
          );
        }
        if (
          url.protocol !== "https:" ||
          url.hostname !== "registry.npmjs.org" ||
          url.username ||
          url.password ||
          (url.port && url.port !== "443")
        )
          throw new Blocked(
            "DEPENDENCY_SOURCE",
            "Only HTTPS registry.npmjs.org tarballs are allowed",
          );
      }
      visit(item, depth + 1);
    }
  };
  visit(value, 0);
}
export async function dependencyDescriptor(workspace: string): Promise<{
  needed: boolean;
  packageText: string;
  lockText?: string;
  key: string;
}> {
  let packageText: string;
  try {
    packageText = await readFile(
      await safePath(workspace, "package.json"),
      "utf8",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { needed: false, packageText: "", key: hash("no-package") };
    throw error;
  }
  if (packageText.length > 500000 || secretContent(packageText))
    throw new Blocked(
      "DEPENDENCY_MANIFEST",
      "Manifest is oversized or contains a detected secret",
    );
  const needed = validateDependencyManifest(JSON.parse(packageText));
  let lockText: string | undefined;
  try {
    const path = await safePath(workspace, "package-lock.json");
    if ((await lstat(path)).size > 20_000_000)
      throw new Blocked("LOCKFILE_SIZE", "Lockfile exceeds 20 MB");
    lockText = await readFile(path, "utf8");
    validateDependencyLock(JSON.parse(lockText));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    needed,
    packageText,
    lockText,
    key: hash([packageText, lockText ?? null]),
  };
}
export async function preparedImage(
  workspace: string,
  goalId: string,
  baseImage: string,
  store: StateStore,
): Promise<string> {
  const descriptor = await dependencyDescriptor(workspace);
  if (!descriptor.needed) return baseImage;
  const image = store
    .list("dependencyImages", goalId)
    .filter(
      (item) =>
        item.manifestHash === descriptor.key && item.baseImage === baseImage,
    )
    .at(-1);
  if (!image)
    throw new Blocked(
      "DEPENDENCIES_REQUIRED",
      `No approved dependency image matches these manifests. Pause and run perfect prepare ${goalId} --allow-network. Native lifecycle scripts are never executed by preparation.`,
    );
  return image.imageId;
}
const installer = String.raw`
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
await mkdir('/opt/deps',{recursive:true});
await writeFile('/tmp/perfect-user.npmrc','');await writeFile('/tmp/perfect-global.npmrc','');
const manifest=JSON.parse(await readFile('/manifest.json','utf8'));
delete manifest.scripts;delete manifest.publishConfig;delete manifest.config;
await writeFile('/opt/deps/package.json',JSON.stringify(manifest));
let locked=false;try{await copyFile('/lock.json','/opt/deps/package-lock.json');locked=true;}catch(error){if(error.code!=='ENOENT')throw error;}
const child=spawn('npm',[locked?'ci':'install','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org'],{cwd:'/opt/deps',stdio:'inherit',env:{PATH:process.env.PATH,HOME:'/tmp',CI:'1',NPM_CONFIG_IGNORE_SCRIPTS:'true',NPM_CONFIG_CACHE:'/tmp/npm-cache',NPM_CONFIG_USERCONFIG:'/tmp/perfect-user.npmrc',NPM_CONFIG_GLOBALCONFIG:'/tmp/perfect-global.npmrc'}});
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',value=>resolve(value??1));});
await rm('/tmp/npm-cache',{recursive:true,force:true});process.exitCode=code;
`;

/** Explicit user operation. Sends manifests only, never project source, auth files or npmrc. */
export async function prepareDependencies(input: {
  goal: Goal;
  config: PerfectConfig;
  store: StateStore;
  home: string;
  allowNetwork: boolean;
  taskId?: string;
  render?: boolean;
  signal: AbortSignal;
}): Promise<DependencyImage> {
  const { goal, config, store, signal } = input;
  if (!input.allowNetwork)
    throw new Blocked(
      "NETWORK_APPROVAL",
      "Preparation downloads public npm packages. Pass --allow-network explicitly after reviewing the manifests.",
    );
  if (!["PAUSED", "RECEIVED"].includes(goal.state))
    throw new Blocked(
      "PREPARE_STATE",
      "Pause the goal before preparing dependencies",
    );
  const owner = id("prepare");
  store.lock(goal.workspaceId, owner, process.pid);
  const manager = new GitWorkspace(goal.root, config);
  const task = input.taskId ? store.get("tasks", input.taskId) : undefined;
  const workspace = task?.worktreeRef ?? manager.repo;
  let container: string | undefined, intent: OperationIntent | undefined;
  try {
    if (
      input.taskId &&
      (!task ||
        task.goalId !== goal.id ||
        !task.worktreeRef ||
        !["pending", "failed", "blocked"].includes(task.status))
    )
      throw new Blocked(
        "PREPARE_TASK",
        "Select a paused task with an existing managed worktree",
      );
    if (task && !task.ownedFiles.includes("package-lock.json"))
      throw new Blocked(
        "DEPENDENCY_OWNERSHIP",
        "Task preparation requires explicit package-lock.json ownership in its accepted plan. Prepare the integrated candidate instead.",
      );
    const descriptor = await dependencyDescriptor(workspace);
    if (!descriptor.needed)
      throw new Blocked(
        "DEPENDENCIES_EMPTY",
        "This root package declares no external dependencies",
      );
    const baseImage = input.render
      ? config.sandbox.browserImage
      : config.sandbox.image;
    const inspect = await processRun(
      "docker",
      ["image", "inspect", "--format", "{{.Id}}", baseImage],
      { timeoutMs: 10000 },
    );
    const baseId = inspect.stdout.trim();
    if (inspect.code !== 0 || !/^sha256:[a-f0-9]{64}$/.test(baseId))
      throw new Blocked(
        "SANDBOX_IMAGE",
        `Pull the approved image explicitly first: ${baseImage}`,
      );
    await mkdir(join(input.home, "preparations"), {
      recursive: true,
      mode: 0o700,
    });
    const dir = await mkdtemp(join(input.home, "preparations", "npm-"));
    if (/[:,\n]/.test(dir.replace(/^[A-Za-z]:/, "")))
      throw new Blocked("MOUNT_PATH", "Unsupported Docker mount path");
    await writeFile(join(dir, "manifest.json"), descriptor.packageText, {
      mode: 0o644,
    });
    await writeFile(join(dir, "install.mjs"), installer, { mode: 0o644 });
    if (descriptor.lockText)
      await writeFile(join(dir, "lock.json"), descriptor.lockText, {
        mode: 0o644,
      });
    store.put(
      "approvals",
      {
        id: id("approval"),
        goalId: goal.id,
        kind: "network",
        scopeHash: hash({
          manifests: descriptor.key,
          baseId,
          operation: "npm-ignore-scripts",
        }),
        approvedAt: now(),
        actor: "user",
      },
      "dependency.network_authorized",
      "user",
    );
    container = id("perfect-prepare");
    intent = {
      id: id("operation"),
      goalId: goal.id,
      taskId: task?.id,
      kind: "container",
      status: "started",
      resource: container,
      beforeRevision: goal.candidateRevision,
      createdAt: now(),
    };
    store.put("intents", intent, "dependency.preparation_started", "user");
    const args = [
      "create",
      "--pull=never",
      "--name",
      container,
      "--label",
      `perfect.goal=${goal.id}`,
      "--network=bridge",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--pids-limit",
      String(config.sandbox.pids),
      "--memory",
      `${config.sandbox.memoryMb}m`,
      "--cpus",
      String(config.sandbox.cpus),
      "--user=0:0",
      "--env",
      "HOME=/tmp",
      "--env",
      "HTTP_PROXY=",
      "--env",
      "HTTPS_PROXY=",
      "--env",
      "ALL_PROXY=",
      "--env",
      "NODE_OPTIONS=",
      "--volume",
      `${dir}/manifest.json:/manifest.json:ro`,
      "--volume",
      `${dir}/install.mjs:/install.mjs:ro`,
      ...(descriptor.lockText
        ? ["--volume", `${dir}/lock.json:/lock.json:ro`]
        : []),
      baseId,
      "node",
      "/install.mjs",
    ];
    const created = await processRun("docker", args, {
      signal,
      timeoutMs: 30000,
    });
    if (created.code !== 0) throw new Error(created.stderr);
    const installed = await processRun(
      "docker",
      ["start", "--attach", container],
      { signal, timeoutMs: config.limits.timeoutPerTask },
    );
    await writeFile(
      join(dir, "install.log"),
      installed.stdout + "\n" + installed.stderr,
    );
    if (installed.code !== 0)
      throw new Blocked(
        "DEPENDENCY_INSTALL_FAILED",
        `Installation failed; inspect ${join(dir, "install.log")}`,
      );
    const copied = await processRun(
      "docker",
      [
        "cp",
        `${container}:/opt/deps/package-lock.json`,
        join(dir, "generated-lock.json"),
      ],
      { signal, timeoutMs: 15000 },
    );
    if (copied.code !== 0) throw new Error(copied.stderr);
    const generatedPath = await safePath(dir, "generated-lock.json");
    if ((await lstat(generatedPath)).size > 20_000_000)
      throw new Blocked("LOCKFILE_SIZE", "Generated lockfile exceeds limit");
    const lockText = await readFile(generatedPath, "utf8");
    validateDependencyLock(JSON.parse(lockText));
    const tag = `perfect-deps:${hash([goal.id, descriptor.key, baseId]).slice(0, 24)}`;
    const committed = await processRun(
      "docker",
      ["commit", "--change", `LABEL perfect.goal=${goal.id}`, container, tag],
      { signal, timeoutMs: 120000 },
    );
    const imageId = committed.stdout.trim();
    if (committed.code !== 0 || !/^sha256:[a-f0-9]{64}$/.test(imageId))
      throw new Error(`Dependency image commit failed: ${committed.stderr}`);
    // The user explicitly authorizes the lockfile delta; it is confined to managed state.
    const lockPath = await safePath(workspace, "package-lock.json", true);
    await writeFile(lockPath, lockText);
    const image: DependencyImage = {
      id: id("dependency-image"),
      goalId: goal.id,
      manifestHash: hash([descriptor.packageText, lockText]),
      baseImage,
      tag,
      imageId,
      createdAt: now(),
    };
    if (task) {
      const updated = task;
      const revision = await manager.checkpoint(workspace, updated);
      store.put(
        "tasks",
        { ...updated, resultRevision: revision, updatedAt: now() },
        "dependency.task_checkpointed",
        "user",
      );
    } else {
      await git(workspace, ["add", "--", "package-lock.json"]);
      await git(workspace, [
        "commit",
        "--allow-empty",
        "-m",
        "Perfect approved dependency lock",
      ]);
      store.put(
        "goals",
        {
          ...store.get("goals", goal.id)!,
          candidateRevision: await manager.revision(),
          updatedAt: now(),
        },
        "dependency.candidate_updated",
        "user",
      );
    }
    store.put("dependencyImages", image, "dependency.image_prepared", "user");
    return image;
  } finally {
    try {
      if (container && intent) {
        const inspect = await processRun(
          "docker",
          [
            "container",
            "inspect",
            "--format",
            '{{ index .Config.Labels "perfect.goal" }}',
            container,
          ],
          { timeoutMs: 10000 },
        );
        if (inspect.code === 0) {
          if (inspect.stdout.trim() !== goal.id)
            throw new Blocked("RESOURCE_OWNER_MISMATCH", container);
          const removed = await processRun(
            "docker",
            ["rm", "--force", container],
            { timeoutMs: 20000 },
          );
          if (removed.code !== 0)
            throw new Blocked("RESOURCE_STOP_FAILED", container);
        } else if (
          (
            await processRun(
              "docker",
              ["version", "--format", "{{.Server.Version}}"],
              { timeoutMs: 5000 },
            )
          ).code !== 0
        )
          throw new Blocked(
            "RESOURCE_UNKNOWN",
            "Docker is unreachable; cleanup must be reconciled on resume",
          );
        store.put(
          "intents",
          { ...intent, status: "completed" },
          "dependency.preparation_stopped",
          "user",
        );
      }
    } finally {
      store.unlock(goal.workspaceId, owner);
    }
  }
}
