import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, rm, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig } from "../../src/config/schema.js";
import { SqliteStore } from "../../src/adapters/sqlite/store.js";
import { createGoal } from "../../src/application/goals.js";
import { GitWorkspace } from "../../src/adapters/git/workspace.js";
import { prepareDependencies } from "../../src/adapters/sandbox/dependencies.js";
import { PreparedDockerRunner } from "../../src/adapters/sandbox/prepared-runner.js";
import { VerificationService } from "../../src/adapters/verification/service.js";
import { VerificationSpecSchema } from "../../src/domain/model.js";

test("PostgreSQL real aislado: Fastify, SQL, concurrencia, reinicio API y rollback; nunca SQLite",{skip:process.env.PERFECT_TEST_DOCKER!=="1",timeout:420000},async()=>{
 const root=await mkdtemp(join(tmpdir(),"perfect-pg-")),home=join(root,"state"),source=join(root,"source"),config=defaultConfig();
 await cp(resolve("examples/postgres-backend"),source,{recursive:true});
 const store=new SqliteStore(join(home,"state.sqlite"));
 const runner=new PreparedDockerRunner(config,store,join(home,"sandbox"));
 let goalId:string|undefined;
 try{
  const goal=await createGoal({request:"Probar backend PostgreSQL propio",source,home,config,privacy:"public",mode:"mock"},store);goalId=goal.id;
  await prepareDependencies({goal,config,store,home,allowNetwork:true,signal:AbortSignal.timeout(180000)});
  const current=store.get("goals",goal.id)!;
  const spec=VerificationSpecSchema.parse({id:"postgres",title:"API con PostgreSQL",kind:"postgres",criteriaIds:["backend"],command:{executable:"npm",args:["test"],cwd:".",timeoutMs:120000}});
  const result=await new VerificationService(store,runner).run(current,new GitWorkspace(goal.root,config).repo,spec,AbortSignal.timeout(150000));
  assert.equal(result.status,"passed",result.summary);assert.match(result.summary,/PostgreSQL/);
  assert.equal(store.list("intents",goal.id).filter(i=>i.status!=="completed").length,0);
  if(process.env.PERFECT_ARTIFACT_DIR){const dir=resolve(process.env.PERFECT_ARTIFACT_DIR,"postgres");await mkdir(dir,{recursive:true});await writeFile(join(dir,"result.json"),JSON.stringify(result,null,2));}
 }finally{if(goalId)await runner.recover(goalId);store.close();await rm(root,{recursive:true,force:true,maxRetries:5});}
});
