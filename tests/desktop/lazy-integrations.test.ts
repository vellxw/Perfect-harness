import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

test("la lista de integraciones no carga transportes, credenciales ni controladores de escritorio", () => {
  const moduleUrl = pathToFileURL(resolve("src/integrations/admin.ts")).href;
  const script = `
    import { registerHooks } from 'node:module';
    import { mkdtemp, realpath, rm } from 'node:fs/promises';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import assert from 'node:assert/strict';
    const loaded=[];
    const hook=registerHooks({resolve(specifier,context,next){
      const answer=next(specifier,context); loaded.push(answer.url);
      if(/\\/integrations\\/(?:agent-session|wire|credentials)\\.[tj]s$|\\/integrations\\/(?:desktop|browser)\\/|\\/@modelcontextprotocol\\//.test(answer.url))
        throw Error('EAGER_INTEGRATION_LOAD: '+answer.url);
      return answer;
    }});
    const home=await realpath(await mkdtemp(join(tmpdir(),'perfect-lazy-integrations-')));
    let admin;
    try {
      const {IntegrationAdmin}=await import(${JSON.stringify(moduleUrl)});
      admin=new IntegrationAdmin(home);
      assert.deepEqual(admin.snapshot(home).connections,[]);
      assert.equal((await admin.perform(home,{command:'refresh'},new AbortController().signal)).message,'Integraciones actualizadas');
      const stop=await admin.perform(home,{command:'stop-desktop'},new AbortController().signal);
      assert.equal(stop.message,'Control de escritorio revocado');
      await assert.rejects(()=>admin.credential(home,'not-configured','synthetic-unused-key'));
      const aborted=AbortSignal.abort(new Error('cancel-before-load'));
      await assert.rejects(()=>admin.perform(home,{command:'probe',id:'not-configured'},aborted),/cancel-before-load/);
      console.log('LAZY_INTEGRATIONS_PASS',loaded.length);
    } finally {admin?.close();hook.deregister();await rm(home,{recursive:true,force:true,maxRetries:5});}
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    { encoding: "utf8", timeout: 20000, windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.match(result.stdout, /LAZY_INTEGRATIONS_PASS/);
});
