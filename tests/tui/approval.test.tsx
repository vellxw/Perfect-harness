import test from "node:test";
import assert from "node:assert/strict";
import {createTestRenderer} from "@opentui/core/testing";
import {createRoot} from "@opentui/react";
import {ApprovalDialog} from "../../src/ui/tui/approval.js";
test("long plan approval can be read completely at 80x24 before typed confirmation",async()=>{
 const t=await createTestRenderer({width:80,height:24,kittyKeyboard:true}),root=createRoot(t.renderer);let approved=false;
 const body=Array.from({length:60},(_,i)=>`Criterion ${i+1}: preserve this acceptance condition.`).join("\n");
 root.render(<ApprovalDialog confirmation={{title:"Exact plan",body,phrase:"APPROVE"}} width={80} height={24} motion="off" onCancel={()=>{}} onConfirm={()=>{approved=true;}}/>);
 const flush=async()=>{await new Promise(r=>setTimeout(r,60));await t.renderOnce();};
 try{await flush();assert.match(t.captureCharFrame(),/Criterion 1:/);t.mockInput.pressKey("END",{ctrl:true});await flush();assert.match(t.captureCharFrame(),/Criterion 60:/);t.mockInput.pressKey("RETURN");await flush();assert.equal(approved,false);await t.mockInput.typeText("APPROVE");t.mockInput.pressKey("RETURN");await flush();assert.equal(approved,true);}finally{root.unmount();t.renderer.destroy();}
});
