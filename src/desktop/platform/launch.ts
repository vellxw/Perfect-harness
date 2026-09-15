import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

/** CLI entry only; standard CLI commands continue to use their existing implementation. */
export async function launchDesktop(options: {
  home: string;
  workspace: string;
}): Promise<void> {
  const packageRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  const markerPath = join(packageRoot, "desktop-launch.json");
  let executable: string, args: string[];
  try {
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    if (
      marker.schemaVersion !== 1 ||
      marker.relativeExecutable !== "../../Perfect.exe"
    )
      throw new Error("Manifiesto de escritorio no válido");
    executable = resolve(packageRoot, marker.relativeExecutable);
    args = [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const desktop = resolve(packageRoot, "desktop");
    const electronPackage = JSON.parse(
      await readFile(
        join(packageRoot, "node_modules", "electron", "package.json"),
        "utf8",
      ),
    );
    if (!electronPackage.version)
      throw Error("Primero ejecutá npm run build:desktop y prepará Electron");
    executable = join(
      packageRoot,
      "node_modules",
      "electron",
      "dist",
      process.platform === "win32" ? "electron.exe" : "electron",
    );
    args = [desktop];
  }
  await access(executable);
  await new Promise<void>((resolveLaunch, reject) => {
    const child = spawn(
      executable,
      [...args, "--home", options.home, "--workspace", options.workspace],
      { detached: true, stdio: "ignore", shell: false, windowsHide: false },
    );
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolveLaunch();
    });
  });
}
