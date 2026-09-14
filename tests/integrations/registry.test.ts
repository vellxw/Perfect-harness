import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IntegrationRegistry } from "../../src/integrations/registry.js";
import { validateGithub } from "../../src/integrations/github.js";
import { IntegrationSchema, type OperationScope } from "../../src/integrations/types.js";
import { cleanEnvironment, validateEndpoint, validateInput, boundedResult, confinedFetch } from "../../src/integrations/wire.js";

const config=IntegrationSchema.parse({id:"github",title:"GitHub",kind:"github",repositories:["vellxw/Perfect-harness"],roles:["general"],enabled:true,writeMode:"confirm"});
const scope:OperationScope={workspace:"/project",goalId:"goal-1",taskId:"task-1",runId:"run-1",revision:"abc",role:"general",model:"test-model",readOnly:false,privateData:true};
test("permisos GitHub: repositorio exacto, herramientas conocidas, ramas acotadas",()=>{
  assert.equal(config.kind,"github");if(config.kind!=="github")return;
  assert.equal(validateGithub(config,"get_file_contents",{owner:"vellxw",repo:"Perfect-harness",path:"README.md"}),"read");
  assert.throws(()=>validateGithub(config,"get_file_contents",{owner:"other",repo:"private"}),/GITHUB_REPOSITORY_DENIED/);
  assert.throws(()=>validateGithub(config,"merge_pull_request",{owner:"vellxw",repo:"Perfect-harness"}),/GITHUB_TOOL_DENIED/);
  assert.throws(()=>validateGithub(config,"push_files",{owner:"vellxw",repo:"Perfect-harness",branch:"main",files:[]}),/GITHUB_BRANCH/);
  assert.throws(()=>validateGithub(config,"search_code",{query:"repo:vellxw/Perfect-harness hello OR repo:other/private"}),/GITHUB_SEARCH_SCOPE/);
  assert.throws(()=>validateGithub(config,"push_files",{owner:"vellxw",repo:"Perfect-harness",branch:"perfect/fix",files:[{path:".github/workflows/publish.yml",content:"x"}]}),/GITHUB_PROTECTED_PATH/);
  assert.equal(validateGithub(config,"create_pull_request",{owner:"vellxw",repo:"Perfect-harness",head:"perfect/fix",base:"main",title:"Corregir"}),"write");
});
test("aprobaciones MCP exactas, de un solo uso y revocables; resultado incierto persistente",async()=>{
  const home=await mkdtemp(join(tmpdir(),"perfect-mcp-reg-"));let db=new IntegrationRegistry(home);
  try{
    const record=db.save(scope.workspace,config);
    const op=db.begin(scope,record,"schema-1","create_branch",{branch:"perfect/a"},"write",true);
    assert.equal(op.state,"pending");
    assert.throws(()=>db.decide(scope.workspace,op.id,"wrong",true),/MCP_APPROVAL_STALE/);
    db.decide(scope.workspace,op.id,op.digest,true);
    await db.wait(op,new AbortController().signal,()=>{});
    db.claim(op.id,op.digest);
    assert.throws(()=>db.claim(op.id,op.digest),/MCP_APPROVAL_USED/);
    db.uncertain(op.id,"Interrupción de red");db.close();db=new IntegrationRegistry(home);
    assert.equal(db.operation(op.id)?.state,"unknown");
    assert.throws(()=>db.begin({...scope,runId:"run-2"},record,"schema-1","create_branch",{branch:"perfect/a"},"write",true),/MCP_OUTCOME_UNKNOWN/);
    db.reconcile(scope.workspace,op.id,op.digest);
    const next=db.begin(scope,record,"schema-1","create_branch",{branch:"perfect/a"},"write",true);
    db.decide(scope.workspace,next.id,next.digest,true);db.claim(next.id,next.digest);db.finish(next.id,{content:[{type:"text",text:"created"}]});
    const replay=db.begin({...scope,runId:"run-3"},record,"schema-1","create_branch",{branch:"perfect/a"},"write",true);
    assert.equal(replay.id,next.id);assert.equal(replay.state,"completed");
    const waiting=db.begin(scope,record,"schema-1","add_issue_comment",{body:"hello"},"write",true);db.setEnabled(scope.workspace,"github",false);
    assert.equal(db.operation(waiting.id)?.state,"denied");assert.throws(()=>db.decide(scope.workspace,waiting.id,waiting.digest,true));
  }finally{db.close();await rm(home,{recursive:true,force:true});}
});
test("catálogo MCP requiere revisión tras cambio de esquema o de configuración",async()=>{
 const home=await mkdtemp(join(tmpdir(),"perfect-mcp-catalog-")),db=new IntegrationRegistry(home);
 try{
  const r=db.save(scope.workspace,config);db.observeCatalog(scope.workspace,"github",r.configHash,{hash:"a",tools:[],checkedAt:new Date().toISOString()});db.authorizeCatalog(scope.workspace,"github","a");
  assert.equal(db.summaries(scope.workspace)[0]?.authorized,true);
  db.observeCatalog(scope.workspace,"github",r.configHash,{hash:"b",tools:[],checkedAt:new Date().toISOString()});assert.equal(db.summaries(scope.workspace)[0]?.authorized,false);
  assert.throws(()=>db.authorizeCatalog(scope.workspace,"github","a"),/MCP_CATALOG_CHANGED/);
 }finally{db.close();await rm(home,{recursive:true,force:true});}
});
test("entorno MCP no hereda credenciales ajenas ni opciones de ejecución",()=>{
 const env=cleanEnvironment("/isolated",{SERVICE_TOKEN:"MY_TOKEN"},{PATH:"/usr/bin",HOME:"/private",OPENAI_API_KEY:"never",NODE_OPTIONS:"--evil",MY_TOKEN:"scoped"});
 assert.equal(env.HOME,"/isolated");assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.NODE_OPTIONS,"");assert.equal(env.SERVICE_TOKEN,"scoped");
 assert.throws(()=>cleanEnvironment("/isolated",{NODE_OPTIONS:"MY_TOKEN"},{MY_TOKEN:"x"}),/MCP_ENV_DENIED/);
});
test("esquemas externos y argumentos inválidos no llegan a las herramientas",()=>{
 assert.throws(()=>validateInput({name:"a",inputSchema:{$ref:"https://evil/schema"}},{}),/MCP_SCHEMA_REF/);
 assert.throws(()=>validateInput({name:"a",inputSchema:{type:"object",properties:{n:{type:"integer"}},required:["n"]}},{n:"wrong"}),/MCP_ARGUMENT_SCHEMA/);
 assert.equal(boundedResult({content:[{type:"text",text:"\x1b[2JEspañol"}]}).content[0]?.type,"text");
 assert.throws(()=>boundedResult({content:[{type:"image",data:"aGVsbG8=",mimeType:"image/png"}]}));
});
test("transporte HTTP bloquea cambio de origen antes de enviar y no sigue redirecciones",async()=>{
 const endpoint=validateEndpoint({type:"http",url:"https://service.example/mcp",headers:{},allowLoopback:false});let requests=0;
 const fetcher=confinedFetch(endpoint,new AbortController().signal,async()=>{requests++;return new Response(null,{status:302,headers:{location:"https://evil.example"}});});
 await assert.rejects(fetcher("https://evil.example/mcp",{}),/MCP_ORIGIN_CHANGED/);assert.equal(requests,0);
 await assert.rejects(fetcher(endpoint,{}),/MCP_REDIRECT_DENIED/);assert.equal(requests,1);
 assert.throws(()=>validateEndpoint({type:"http",url:"http://192.168.1.10/mcp",headers:{},allowLoopback:true}),/MCP_ENDPOINT/);
});
