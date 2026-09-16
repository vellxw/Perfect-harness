import { lstat, readFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const profileGuid = "{35455046-4543-4454-a822-5f92b3030200}";
export type LegacyCleanupResult = "absent" | "not-owned" | "unsafe" | "removed";

/** A V4 compatibility operation, never a generic file or registry command.
 * Only the single original Terminal fragment belonging to this installation
 * can be removed. User Terminal settings, projects and credentials are untouched.
 * Paths are provided by the native bootstrap, never by a renderer request. */
export async function removeLegacyTerminalProfile(
  localAppData: string,
  executable: string,
): Promise<LegacyCleanupResult> {
  let directory = resolve(localAppData);
  try {
    for (const part of ["", "Microsoft", "Windows Terminal", "Fragments", "PerfectHarness"]) {
      if (part) directory = join(directory, part);
      const stat = await lstat(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) return "unsafe";
    }
    const path = join(directory, "PerfectHarness.json");
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 128000) return "unsafe";
    const bytes = await readFile(path);
    if (bytes.length !== before.size) return "unsafe";
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString("utf8")); } catch { return "not-owned"; }
    if (!parsed || typeof parsed !== "object") return "not-owned";
    const profiles = (parsed as Record<string, unknown>).profiles;
    if (!Array.isArray(profiles) || profiles.length !== 1) return "not-owned";
    const profile = profiles[0] as Record<string, unknown> | undefined;
    if (!profile || typeof profile !== "object" || profile.guid !== profileGuid || profile.name !== "Perfect Harness") return "not-owned";
    const expected = `"${resolve(executable)}" --tui-child`.toLowerCase();
    if (typeof profile.commandline !== "string" || profile.commandline.toLowerCase() !== expected) return "not-owned";
    const after = await lstat(path);
    if (after.isSymbolicLink() || !after.isFile() || after.nlink !== 1 || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs) return "unsafe";
    await unlink(path);
    return "removed";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
}
