import {createCliRenderer} from "@opentui/core";
import {createRoot} from "@opentui/react";
import type {Screen,Motion} from "../../presentation/protocol.js";
import {EngineClient,type UiClient} from "../../presentation/client.js";
import {DemoClient} from "./demo.js";
import {App} from "./app.js";
import {openExternal} from "./platform.js";
export interface TuiOptions {home?:string;workspace?:string;demo?:string;screen?:Screen;motion?:Motion;}
export async function startTui(options:TuiOptions={}):Promise<void>{
 const client:UiClient=options.demo?new DemoClient(options.demo):new EngineClient({home:options.home,workspace:options.workspace});
 const renderer=await createCliRenderer({exitOnCtrlC:false,targetFps:30,useMouse:true});
 const root=createRoot(renderer);
 let closing=false;
 await new Promise<void>((resolveClose,reject)=>{
  const close=async()=>{if(closing)return;closing=true;try{await client.close();root.unmount();renderer.destroy();process.removeListener("SIGTERM",terminate);process.removeListener("SIGHUP",terminate);resolveClose();}catch(error){root.unmount();renderer.destroy();reject(error);}};
  const terminate=()=>{void close();};
  process.once("SIGTERM",terminate);process.once("SIGHUP",terminate);
  if(options.motion){const prefs=structuredClone(client.getSnapshot().preferences);prefs.ui.motion=options.motion;if(options.demo)client.dispatch({type:"preferences",preferences:prefs});else{const unsubscribe=client.subscribe(()=>{unsubscribe();client.dispatch({type:"preferences",preferences:prefs});});}}
  root.render(<App client={client} initialScreen={options.screen} onExit={()=>{void close();}} openExternal={openExternal}/>);
 });
}
