import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { UnityPolicySchema, UNITY_PIN } from "../../src/integrations/unity/schema.js";
import { unityEffect, validateUnityCall, validateUnityWorkspace } from "../../src/integrations/unity/policy.js";
import { UnityLease } from "../../src/integrations/unity/lease.js";
import { unityPreset } from "../../src/integrations/unity/registration.js";

const policy=UnityPolicySchema.parse({projectPath:"/synthetic/managed",projectName:"Juego",editorPid:process.pid,endpoint:"http://127.0.0.1:18888/mcp",profileIds:["gameplay"],writeMode:"confirm",trustedProject:true,descriptorPath:"/private/descriptor.json",descriptorFingerprint:"a".repeat(64),sourceCommit:UNITY_PIN});
test("Unity limita cada llamada, no confía en groups ni annotations y no expone capturas del escritorio",()=>{
 assert.equal(unityEffect(policy,"compile_status"),"read");
 for(const name of ["execute_code","menu_execute","reflect_invoke","tool_install","asset_delete","unknown"])assert.equal(unityEffect(policy,name),undefined);
 assert.equal(unityEffect({...policy,writeMode:"deny"},"scene_save"),undefined);
 assert.throws(()=>validateUnityCall(policy,"capture_screenshot",{view:"inspector"}),/CAPTURE_SCOPE/);
 assert.throws(()=>validateUnityCall(policy,"capture_screenshot",{view:"game",save_path:"C:/Desktop/x.png"}),/CAPTURE_SCOPE/);
 assert.throws(()=>validateUnityCall(policy,"scene_save",{path:"../../secret"}),/SKILL_PATH/);
 assert.throws(()=>validateUnityCall(policy,"scene_save",{path:"Packages/test"}),/ASSET_SCOPE/);
 assert.throws(()=>UnityPolicySchema.parse({...policy,endpoint:"http://0.0.0.0:18888/mcp"}));
 const c=unityPreset(policy);assert.equal(c.kind,"mcp");if(c.kind==="mcp")assert.equal(c.tools.execute_code,undefined);
});
test("Unity no presta editor a otro perfil ni permite dos escritores o robo de lock",async()=>{
 const home=await realpath(await mkdtemp(join(tmpdir(),"perfect-unity-")));
 try{
  const p={...policy,projectPath:home};
  await assert.rejects(()=>validateUnityWorkspace(p,{profileId:"backend",cwd:home,readOnly:true},"read"),/PROFILE_DENIED/);
  await assert.rejects(()=>validateUnityWorkspace(p,{profileId:"gameplay",cwd:home,readOnly:true},"write"),/READ_ONLY/);
  const first=new UnityLease(home,p,"run-1"),second=new UnityLease(home,p,"run-2");
  await first.acquire();await assert.rejects(()=>second.acquire(),/WRITER_BUSY/);await first.close();await second.acquire();second.markUncertain();await second.close();
  await assert.rejects(()=>new UnityLease(home,p,"run-3").acquire(),/WRITER_BUSY/);
 }finally{await rm(home,{recursive:true,force:true,maxRetries:5});}
});
