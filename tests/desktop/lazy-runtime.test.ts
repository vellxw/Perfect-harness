import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

test("importar adaptador y versión para Desktop no inicializa el SDK ni proveedores", () => {
  const runtime = pathToFileURL(resolve("src/adapters/pi/runtime.ts")).href;
  const session = pathToFileURL(resolve("src/adapters/pi/session.ts")).href;
  const script = `
    import { registerHooks } from 'node:module';
    import assert from 'node:assert/strict';
    registerHooks({ resolve(specifier, context, next) {
      if (specifier.startsWith('@earendil-works/')) throw Error('SDK_EAGER_LOAD: '+specifier);
      return next(specifier, context);
    }});
    const adapter=await import(${JSON.stringify(runtime)});
    const version=await import(${JSON.stringify(session)});
    assert.equal(typeof adapter.PiRuntime, 'function');
    assert.equal(adapter.parseRetryAfter('2'), 2000);
    assert.equal(version.PI_VERSION, '0.85.1');
    assert.equal(typeof version.openSession, 'function');
    console.log('LAZY_ADAPTER_IMPORT_PASS');
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], { encoding: "utf8", timeout: 15000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.match(result.stdout, /LAZY_ADAPTER_IMPORT_PASS/);
});
