import { mkdir, readFile, writeFile, chmod, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ConfigSchema, defaultConfig, type PerfectConfig } from "./schema.js";
import { hash, Blocked } from "../domain/util.js";
export const homeDir = () =>
  resolve(
    process.env.PERFECT_HOME ??
      join(homedir(), ".local", "share", "perfect-harness"),
  );
export interface LocalPolicy {
  trustedConfigs: Record<string, string>;
  contributorWorkspaces: string[];
  allowApply: boolean;
}
export async function localPolicy(home = homeDir()): Promise<LocalPolicy> {
  try {
    return JSON.parse(
      await readFile(join(home, "policy.json"), "utf8"),
    ) as LocalPolicy;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return { trustedConfigs: {}, contributorWorkspaces: [], allowApply: false };
  }
}
export async function savePolicy(
  policy: LocalPolicy,
  home = homeDir(),
): Promise<void> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  await writeFile(join(home, "policy.json"), JSON.stringify(policy, null, 2), {
    mode: 0o600,
  });
  await chmod(join(home, "policy.json"), 0o600);
}
export async function loadConfig(
  workspace: string,
  home = homeDir(),
): Promise<PerfectConfig> {
  let content: string;
  try {
    content = await readFile(join(workspace, "perfect.config.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return defaultConfig();
    throw e;
  }
  const config = ConfigSchema.parse(JSON.parse(content));
  const policy = await localPolicy(home);
  if (
    policy.trustedConfigs[await realpath(resolve(workspace))] !== hash(config)
  )
    throw new Blocked(
      "CONFIG_APPROVAL",
      "Run perfect trust-config after reviewing perfect.config.json",
    );
  return config;
}
