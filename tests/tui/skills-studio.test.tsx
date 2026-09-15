import test from"node:test";import assert from"node:assert/strict";
import{createTestRenderer}from"@opentui/core/testing";import{createRoot}from"@opentui/react";
import{App}from"../../src/ui/tui/app.js";import{GuidedForm}from"../../src/ui/tui/form.js";import{DemoClient}from"../../src/ui/tui/demo.js";import{SqliteStore}from"../../src/adapters/sqlite/store.js";import{StudioAdmin}from"../../src/skills/admin.js";import{defaultConfig}from"../../src/config/schema.js";import type{Screen}from"../../src/presentation/protocol.js";

for(const [width,height]of[[80,24],[100,30],[120,36],[160,45]])for(const screen of["skills","teams","profiles","modes","skill-trials","local-validation"]as Screen[]){
 test(`pantalla V4 ${screen} ${width}×${height} renderiza sin perder cierre`,async()=>{
  const store=new SqliteStore(":memory:"),client=new DemoClient("running");client.getSnapshot().studio=new StudioAdmin(store,"/synthetic/state").panel("/synthetic/project",defaultConfig());const ui=await createTestRenderer({width:width!,height:height!,kittyKeyboard:true}),root=createRoot(ui.renderer);
  try{root.render(<App client={client} initialScreen={screen} onExit={()=>{}}/>);await new Promise(r=>setTimeout(r,70));await ui.renderOnce();const frame=ui.captureCharFrame();assert.match(frame,/Esc/);assert.equal(frame.includes("Ask Perfect"),false);assert.ok(frame.trim().length>200);}
  finally{root.unmount();ui.renderer.destroy();store.close();}
 });
}
test("formulario guiado 80×24 permite llegar al último campo y confirmar con teclado",async()=>{
 const ui=await createTestRenderer({width:80,height:24,kittyKeyboard:true}),root=createRoot(ui.renderer);let saved:Record<string,string>|undefined;
 const fields=Array.from({length:12},(_,i)=>({key:"field-"+i,label:"Campo "+(i+1),initial:i===11?"Español ñ á":"valor"}));
 try{
  root.render(<GuidedForm spec={{title:"Formulario largo",fields,submit:v=>{saved=v;}}} width={80} height={24} motion="off" onCancel={()=>{}}/>);
  const flush=async()=>{await new Promise(r=>setTimeout(r,35));await ui.renderOnce();};await flush();
  for(let i=0;i<12;i++){ui.mockInput.pressKey("ARROW_DOWN");await flush();}
  assert.match(ui.captureCharFrame(),/Revisar y continuar/);ui.mockInput.pressKey("RETURN");await flush();assert.equal(saved?.["field-11"],"Español ñ á");
 }finally{root.unmount();ui.renderer.destroy();}
});
