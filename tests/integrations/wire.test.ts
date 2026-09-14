import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,rm } from "node:fs/promises";
import { join,resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { McpServer,WebStandardStreamableHTTPServerTransport,fromJsonSchema } from "@modelcontextprotocol/server";
import { McpConnection } from "../../src/integrations/wire.js";

test("MCP real por stdio: catálogo, llamada, recursos, esquema y cancelación",async()=>{
 const home=await mkdtemp(join(tmpdir(),"perfect-real-mcp-"));const abort=new AbortController();
 const connection=await McpConnection.open({type:"stdio",command:process.execPath,args:[resolve("tests/fixtures/mcp-server.mjs")],envRefs:{},trustLocalProcess:true},home,abort.signal);
 try{
  const catalog=await connection.catalog(abort.signal);assert.equal(catalog.server?.name,"perfect-test-server");
  const echo=catalog.tools.find(t=>t.name==="echo")!;
  const result=await connection.call(echo,{text:"Español íntegro: ñ y á"},abort.signal,5000);
  assert.deepEqual(result.content,[{type:"text",text:"Español íntegro: ñ y á"}]);
  await assert.rejects(connection.call(echo,{wrong:1},abort.signal,5000),/MCP_ARGUMENT_SCHEMA/);
  const resource=await connection.readResource("test://docs/public/manual",["test://docs/public/"],abort.signal);
  assert.match(JSON.stringify(resource),/Guía pública/);
  await assert.rejects(connection.readResource("test://docs/public/../private",["test://docs/public/"],abort.signal),/MCP_RESOURCE_SCOPE/);
  const waiting=connection.call(catalog.tools.find(t=>t.name==="wait")!,{},abort.signal,20000);
  setTimeout(()=>abort.abort(),75);
  await assert.rejects(waiting);
 }finally{await connection.close();await rm(home,{recursive:true,force:true});}
});
test("MCP real Streamable HTTP: sesión nativa y autenticación solo en el origen aprobado",async()=>{
 const home=await mkdtemp(join(tmpdir(),"perfect-http-mcp-"));
 const mcp=new McpServer({name:"perfect-http-test",version:"1.0.0"});
 mcp.registerTool("answer",{inputSchema:fromJsonSchema({type:"object",properties:{},additionalProperties:false})},async()=>({content:[{type:"text",text:"Conexión HTTP real"}]}));
 const transport=new WebStandardStreamableHTTPServerTransport({enableJsonResponse:true});await mcp.connect(transport);
 const received:string[]=[];
 const server=createServer(async(req,res)=>{
  try{
   received.push(req.headers.authorization??"");
   if(req.method==="GET"){res.writeHead(405);res.end();return;}
   let body="";for await(const b of req)body+=String(b);
   const response=await transport.handleRequest(new Request(`http://127.0.0.1${req.url}`,{method:req.method,headers:Object.fromEntries(Object.entries(req.headers).filter((x):x is [string,string]=>typeof x[1]==="string")),...(body?{body}:{})}));
   res.writeHead(response.status,Object.fromEntries(response.headers.entries()));res.end(await response.text());
  }catch(error){res.writeHead(500);res.end(String(error));}
 });
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address();assert.ok(address&&typeof address!=="string");
 const old=process.env.PERFECT_TEST_MCP_TOKEN;process.env.PERFECT_TEST_MCP_TOKEN="synthetic-no-account";
 let connection:McpConnection|undefined;
 try{
  connection=await McpConnection.open({type:"http",url:`http://127.0.0.1:${address.port}/mcp`,allowLoopback:true,headers:{},bearerEnv:"PERFECT_TEST_MCP_TOKEN"},home,new AbortController().signal);
  const catalog=await connection.catalog(new AbortController().signal);const result=await connection.call(catalog.tools[0]!,{},new AbortController().signal,5000);
  assert.match(JSON.stringify(result),/Conexión HTTP real/);assert.ok(received.length>=3);assert.ok(received.every(v=>v==="Bearer synthetic-no-account"));
 }finally{await connection?.close();await mcp.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));if(old===undefined)delete process.env.PERFECT_TEST_MCP_TOKEN;else process.env.PERFECT_TEST_MCP_TOKEN=old;await rm(home,{recursive:true,force:true});}
});
