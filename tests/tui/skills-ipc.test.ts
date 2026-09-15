import test from"node:test";import assert from"node:assert/strict";import{mkdtemp,mkdir,rm,realpath}from"node:fs/promises";import{join}from"node:path";import{tmpdir}from"node:os";import{EngineClient}from"../../src/presentation/client.js";import type{UiMessage,UiAction,UiSnapshot}from"../../src/presentation/protocol.js";

test("IPC real: selección por hash, conflicto entre ventanas y reinicio conservan política",{timeout:40000},async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),"perfect-skill-ipc-"))),workspace=join(root,"carpeta ñ"),home=join(root,"estado");await mkdir(workspace);
 let client=new EngineClient({workspace,home});
 const wait=async(predicate:(s:UiSnapshot)=>boolean)=>{const end=Date.now()+12000;while(!predicate(client.getSnapshot())){if(Date.now()>end)throw Error("IPC timed out");await new Promise(r=>setTimeout(r,30));}};
 const send=async(action:UiAction)=>{const responses:UiMessage[]=[];const stop=client.onMessage(m=>{if(m.type==="result")responses.push(m);});try{client.dispatch(action);const end=Date.now()+10000;while(!responses.length){if(Date.now()>end)throw Error("Action timed out");await new Promise(r=>setTimeout(r,25));}return responses[0]!;}finally{stop();}};
 try{
  await wait(s=>s.connected);await send({type:"studio",action:{command:"status"}});await wait(s=>Boolean(s.studio));let p=client.getSnapshot().studio!;
  await send({type:"studio",action:{command:"skill-mode",mode:"manual",expectedHash:p.hash}});await wait(s=>s.studio?.config.skills.mode==="manual");p=client.getSnapshot().studio!;const stale=p.hash;
  const skill=p.skills.find(s=>s.id==="perfect-postgres-backend")!;await send({type:"studio",action:{command:"manual-select",releaseId:skill.releaseId,hash:skill.hash,selected:true,expectedEpoch:p.control.epoch,pins:skill.pins,confirmation:"SELECCIONAR"}});await wait(s=>s.studio?.control.manual.length===1);
  p=client.getSnapshot().studio!;await send({type:"studio",action:{command:"assign",expectedHash:p.hash,assignment:{skillId:skill.id,scope:"set",target:"frontend-web",decision:"disable"}}});await wait(s=>s.studio?.hash!==stale);
  const conflict=await send({type:"studio",action:{command:"skill-mode",mode:"off",expectedHash:stale}});assert.equal(conflict.type==="result"&&conflict.ok,false);
  await client.close();client=new EngineClient({workspace,home});await wait(s=>s.connected);await send({type:"studio",action:{command:"status"}});await wait(s=>Boolean(s.studio));
  assert.equal(client.getSnapshot().studio!.config.skills.mode,"manual");assert.equal(client.getSnapshot().studio!.control.manual[0]!.hash,skill.hash);assert.ok(client.getSnapshot().studio!.config.skills.assignments.some(a=>a.target==="frontend-web"&&a.decision==="disable"));
 }finally{await client.close();await rm(root,{recursive:true,force:true,maxRetries:5});}
});
