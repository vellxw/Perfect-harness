import { app } from "electron";
import { join } from "node:path";
import { homedir } from "node:os";
import { removeLegacyTerminalProfile } from "../platform/legacy-terminal-profile.js";

// Inno preserves V4 UninstallRun records across an in-place upgrade. The old
// record invokes this executable with --remove-profile and waits for its exit.
// Handle that one bounded compatibility operation BEFORE loading the GUI/core,
// taking a single-instance lock, creating userData, or spawning any workers.
if (process.argv.includes("--remove-profile")) {
  if (process.platform !== "win32" || !app.isPackaged || process.argv.length !== 2) {
    app.exit(2);
  } else {
    const timeout = setTimeout(() => app.exit(1), 10000);
    void removeLegacyTerminalProfile(
      process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
      process.execPath,
    ).then(() => {
      clearTimeout(timeout);
      app.exit(0);
    }, () => {
      clearTimeout(timeout);
      // Do not start a GUI, display private paths or leave the uninstaller
      // waiting for a hidden application on an unsuccessful cleanup.
      app.exit(1);
    });
  }
} else {
  // esbuild includes the existing main entry in this CJS bundle; it is not
  // evaluated at all on the legacy cleanup path. Normal startup retains its
  // pre-ready scheme registration and all existing security settings.
  void import("./index.js").catch(() => app.exit(1));
}
