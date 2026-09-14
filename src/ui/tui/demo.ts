import type {UiClient} from "../../presentation/client.js";
import {emptySnapshot} from "../../presentation/client.js";
import type {UiMessage,UiAction,UiSnapshot} from "../../presentation/protocol.js";
export function demoSnapshot(scene="running"):UiSnapshot{
 const s=emptySnapshot("C:/Projects/ShopFront");Object.assign(s,{connected:true,demo:true,workspaceName:"ShopFront",sequence:23});s.preferences.ui.onboarded=true;s.preferences.ui.motion="off";
 if(scene==="idle")return s;
 s.goal={id:"demo-checkout",request:"Build the checkout and verify it visually",state:scene==="done"?"DONE":scene==="paused"?"PAUSED":scene==="failed"?"FAILED":scene==="planning"?"PLAN":scene==="repair"?"REPAIR":"EXECUTE",mode:"mock",iteration:scene==="planning"?1:4,maxIterations:10,revision:"f14a86d20fbb54e22f170a80cb10a744ae206c15",privacy:"public",activeMs:143000,reason:scene==="paused"?"Docker is unavailable. Your checkpoint is safe; start Docker and resume.":scene==="failed"?"Repeated contract failure. Inspect the evidence before starting a continuation.":scene==="done"?"All required criteria are covered by current evidence.":undefined};
 s.agents=[
 {id:"demo-planner",role:"planner",model:"grok-4.6",provider:"xai",account:"xai-subscription",status:scene==="planning"?"running":"completed",requested:"xhigh",selected:"xhigh",sent:"xhigh",requests:2,provenance:"mock"},
 {id:"demo-muse",role:"frontend",model:"muse-spark-1.3-contributor-free",provider:"opencode",account:"opencode-contributor",status:scene==="done"?"completed":scene==="paused"?"interrupted":"running",requested:"xhigh",selected:"xhigh",sent:"xhigh",task:"frontend-checkout",requests:5,provenance:"mock"},
 {id:"demo-astra",role:"backend",model:"gpt-6-astra",provider:"openai-codex",account:"chatgpt-pro",status:scene==="concurrent"?"running":"completed",requested:"high",selected:"high",sent:"high",task:"backend-api",requests:4,provenance:"mock"},
 {id:"demo-worker",role:"general",model:"grok-4.6",provider:"xai",account:"xai-subscription",status:scene==="concurrent"?"running":"completed",requested:"medium",selected:"medium",sent:"medium",requests:3,provenance:"mock"},
 {id:"demo-oracle",role:"oracle",model:"gpt-6-astra",provider:"openai-codex",account:"chatgpt-pro",status:scene==="done"?"completed":"idle",requested:"xhigh",selected:"xhigh",requests:scene==="done"?1:0,provenance:"mock"},
 ];
 const events:[string,string,string,string][]=[
 ["planner","Implementation plan ready","8 tasks · 3 parallel groups · acceptance contract approved","completed"],
 ["general","API contracts documented","Shared interfaces are ready for the two specialists","completed"],
 ["backend","Backend implementation complete","42 tests passed · webhook idempotency covered","completed"],
 ["frontend","Building the responsive checkout","src/app/checkout.tsx · isolated working copy","running"],
 ["visual","Mobile overflow detected","390 × 844 · screenshot attached to repair","failed"],
 ["frontend","Repairing the responsive layout","Current candidate remains unverified until checks pass again","running"],
 ];
 if(scene==="done")events.push(["controller","Verification rerun passed","Build · API · browser · visual review","completed"],["oracle","Independent review approved","No blocking findings on the final candidate","completed"],["controller","Evidence Judge: DONE","Verified candidate is ready to inspect and apply","completed"]);
 s.activity=events.map((e,i)=>({id:`demo-event-${i}`,sequence:i+1,time:`2026-09-14T10:${String(14+i).padStart(2,"0")}:00Z`,role:e[0],title:e[1],detail:e[2],status:e[3] as "running"|"completed"|"failed",rawType:"demo.fixture"}));
 if(scene==="planning")s.activity=s.activity.slice(0,1);
 s.plan={id:"demo-plan",hash:"demo-hash",version:2,summary:"Contract-first checkout with parallel implementation and independent verification.",architecture:["Shared contract before frontend/backend execution","Idempotent payment handling with isolated tests","Responsive UI verified at desktop and mobile sizes"],risks:["Payment credentials never enter test fixtures","Contributor content must be public"],criteria:[{id:"responsive",description:"Checkout works without overflow at 390px and 1280px.",kind:"visual"},{id:"api",description:"API rejects duplicated payment events.",kind:"functional"}],approved:true};
 s.tasks=[
 {id:"discover",title:"Discover the source project",status:"accepted",role:"general",dependencies:[],attempt:1,maxAttempts:3,description:"Inspect the project and baseline checks",surfaces:[]},
 {id:"contracts",title:"Define API contracts",status:"accepted",role:"general",dependencies:["discover"],attempt:1,maxAttempts:3,description:"Define stable contracts before parallel work",surfaces:["src/contracts"]},
 {id:"backend-api",title:"Implement checkout service",status:"accepted",role:"backend",dependencies:["contracts"],attempt:1,maxAttempts:3,description:"Idempotent checkout API and tests",surfaces:["src/api"]},
 {id:"frontend-checkout",title:"Build responsive checkout",status:scene==="done"?"accepted":"running",role:"frontend",dependencies:["contracts"],attempt:2,maxAttempts:3,description:"Repair mobile overflow using the captured evidence",surfaces:["src/app/checkout.tsx"]},
 {id:"integrate",title:"Integrate the candidate",status:scene==="done"?"accepted":"pending",role:"integrator",dependencies:["backend-api","frontend-checkout"],attempt:1,maxAttempts:3,description:"Integrate compatible outputs and rerun all required checks",surfaces:[]},
 ];
 s.checks=["Build","TypeScript","API integration","Desktop browser","Mobile visual"].map((title,i)=>({id:`check-${i}`,title,kind:i>2?"browser":"command",status:i===4&&scene!=="done"?"failed":"passed",summary:i===4&&scene!=="done"?"Horizontal overflow: viewport 390, scrollWidth 1200":"All configured checks in this fixture passed",evidenceIds:["demo-evidence"],revision:s.goal!.revision}));
 s.verification={passed:scene==="done"?5:4,total:5};
 s.artifacts=[{id:"demo-evidence",name:"checkout-mobile-390x844.png",kind:"screenshot",revision:s.goal.revision,current:true,hash:"synthetic fixture; no actual screenshot is linked"}];
 s.accounts=[{account:"xai-subscription",tokens:18450,uncertain:1},{account:"chatgpt-pro",tokens:27400,uncertain:0},{account:"opencode-contributor",tokens:31200,uncertain:1}];
 s.diagnostics=[{name:"Node 26.4.0",status:"PASS",detail:"Synthetic diagnostic row, not a machine measurement"},{name:"Pi 0.85.1",status:"PASS",detail:"Synthetic fixture"},{name:"Docker",status:"BLOCKED",detail:"Fixture shows a paused execution; no host fallback"},{name:"Real provider smoke",status:"NOT_TESTED",detail:"No personal credentials are used in demo mode"}];
 s.recentGoals=[{id:s.goal.id,request:s.goal.request,state:s.goal.state}];
 return s;
}
export class DemoClient implements UiClient{
 private state:UiSnapshot;private listeners=new Set<()=>void>();private messages=new Set<(m:UiMessage)=>void>();
 constructor(scene="running"){this.state=demoSnapshot(scene);}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 onMessage=(listener:(m:UiMessage)=>void)=>{this.messages.add(listener);return()=>{this.messages.delete(listener);};};
 dispatch=(action:UiAction)=>{if(action.type==="preferences"){this.state={...this.state,preferences:action.preferences};for(const l of this.listeners)l();return;}for(const l of this.messages)l({type:"result",requestId:"demo",ok:false,message:"Display fixture only. Reopen Perfect without --demo to perform real actions."});};
 close=async()=>{};
 replace(snapshot:UiSnapshot){this.state=snapshot;for(const l of this.listeners)l();}
}
