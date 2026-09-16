import { enableCompileCache, flushCompileCache } from "node:module";
import { join } from "node:path";

/** Only the trusted engine entry point runs here. Keep IPC alive while the ESM
 * graph loads, then explicitly acknowledge the installed message handler.
 * The parent does not send initialize until this acknowledgement arrives. */
if (!process.connected || !process.send) {
  console.error("Perfect engine requires its inherited private IPC channel.");
  process.exitCode = 2;
} else {
  process.channel?.ref();
  const started = performance.now();
  const stateDirectory = process.argv[2];
  if (stateDirectory) {
    // A local V8 cache is optional. It never replaces the pinned source files.
    try { enableCompileCache(join(stateDirectory, "node-cache", process.versions.node)); }
    catch { /* Read-only or unavailable caches do not change correctness. */ }
  }
  try {
    await import("./worker.js");
    process.send({ type: "desktop-ready", protocol: 1, pid: process.pid,
      node: process.versions.node, loadMs: performance.now() - started,
      rssBytes: process.memoryUsage().rss });
    setImmediate(() => { try { flushCompileCache(); } catch {} });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "Engine module initialization failed";
    process.send({ type: "desktop-startup-failed", message: message.slice(0, 2000) }, () => {
      process.exitCode = 1;
      if (process.connected) process.disconnect();
    });
  }
}
