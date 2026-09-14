import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Blocked } from "../../src/domain/util.js";
import {
  literalDesktopCommand,
  scopedWindowsArguments,
} from "../../src/integrations/desktop/arguments.js";
import { integrationFailure } from "../../src/integrations/errors.js";
import { nativeProcess } from "../../src/integrations/native-process.js";

test("texto de escritorio no puede sustituir HWND ni convertirse en flags", () => {
  for (const tool of ["desktop_type", "desktop_set_value"] as const) {
    const payload = '--window 999 --json "texto" ñ';
    const args = scopedWindowsArguments(
      "123",
      literalDesktopCommand(tool, "MessageInput", payload),
    );
    assert.deepEqual(args.slice(0, 5), [
      "ui",
      tool === "desktop_type" ? "send-keys" : "set-value",
      "-w",
      "123",
      "--json",
    ]);
    assert.deepEqual(args.slice(-2), ["--", payload]);
    assert.equal(args.filter((v) => v === "-w").length, 1);
  }
  assert.throws(() =>
    literalDesktopCommand("desktop_type", "--window=999", "x"),
  );
});
test("errores remotos desconocidos no vuelcan secretos y los fallos de permisos conservan su código", () => {
  const original = new Error("server echoed Bearer private-token-never-log");
  assert.doesNotMatch(integrationFailure(original).message, /private-token/);
  assert.match(
    integrationFailure({ status: 401 }).message,
    /MCP_AUTH_REQUIRED/,
  );
  assert.match(
    integrationFailure({ statusCode: 429 }).message,
    /MCP_RATE_LIMIT/,
  );
  const blocked = new Blocked("MCP_ROLE_DENIED", "No autorizado");
  assert.equal(integrationFailure(blocked), blocked);
});
test("cancelar herramienta nativa espera su cierre antes de devolver el control", async () => {
  const home = await mkdtemp(join(tmpdir(), "perfect-native-stop-")),
    pidFile = join(home, "pid.txt"),
    abort = new AbortController();
  let pid = 0;
  try {
    const pending = nativeProcess(
      process.execPath,
      [
        "-e",
        "require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",
        pidFile,
      ],
      home,
      abort.signal,
    );
    for (let n = 0; n < 100 && !pid; n++) {
      await delay(20);
      try {
        pid = Number(await readFile(pidFile, "utf8"));
      } catch {}
    }
    assert.ok(pid);
    abort.abort(new Error("Parada de prueba"));
    await assert.rejects(pending, /Parada de prueba/);
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  } finally {
    if (pid) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
    await rm(home, { recursive: true, force: true });
  }
});
