import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineBroker } from "../../src/desktop/main/broker.js";

async function fixture(script: string) {
  const root = await mkdtemp(join(tmpdir(), "perfect-broker-"));
  const home = join(root, "home"); await mkdir(home);
  await writeFile(join(root, "entry.js"), script);
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  const broker = new EngineBroker(process.execPath, join(root, "worker.js"), home, root);
  broker.on("event", () => {});
  return { root, home, broker };
}
test("engine waits for explicit listener-ready before sending initialization", async () => {
  const f = await fixture(`
    process.channel.ref();
    await new Promise(r=>setTimeout(r,250));
    process.on('message',m=>{
      if(m.type==='initialize')process.send({type:'snapshot',snapshot:{protocol:1,workspace:m.options.workspace,connected:true,tasks:[],agents:[],activity:[],artifacts:[],checks:[]}});
      if(m.type==='query')process.send({type:'desktop-result',requestId:m.requestId,ok:true,data:{received:true}});
      if(m.type==='shutdown')process.disconnect();
    });
    process.send({type:'desktop-ready',protocol:1,pid:process.pid});
  `);
  try {
    f.broker.start();
    await assert.rejects(() => f.broker.request("query", { kind: "metrics" }), /no está conectado/);
    await f.broker.ready(4000);
    assert.equal(f.broker.connected, true);
    const result = await f.broker.request("query", { kind: "metrics" }) as { data: { received: boolean } };
    assert.equal(result.data.received, true);
    await f.broker.close();
    const file = (await readdir(f.home)).find(n => n.startsWith("desktop-startup-"))!;
    const log = await readFile(join(f.home, file), "utf8");
    assert.match(log, /listener-ready/); assert.match(log, /initialized/);
  } finally { await f.broker.close(); await rm(f.root, { recursive: true, force: true, maxRetries: 5 }); }
});
test("startup faults are preserved and do not masquerade as connected or retry an action", async () => {
  const f = await fixture(`process.send({type:'desktop-startup-failed',message:'MODULE_NOT_FOUND password=secret-test'},()=>process.disconnect());`);
  try {
    f.broker.start();
    await assert.rejects(() => f.broker.ready(4000), /MODULE_NOT_FOUND/);
    assert.equal(f.broker.connected, false);
    assert.equal(f.broker.startupFailure?.includes("secret-test"), false);
    await assert.rejects(() => f.broker.request("action", {}), /MODULE_NOT_FOUND/);
  } finally { await f.broker.close(); await rm(f.root, { recursive: true, force: true, maxRetries: 5 }); }
});
