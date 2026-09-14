import { spawn } from "node:child_process";
import { Blocked } from "../domain/util.js";
import { cleanEnvironment } from "./wire.js";

/** Fixed binaries only. No shell, credentials, inherited stdio or unbounded output. */
export async function nativeProcess(executable:string,args:string[],directory:string,signal:AbortSignal,input?:string):Promise<{code:number;stdout:string;stderr:string}>{
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd:directory,windowsHide:true,shell:false,stdio:["pipe","pipe","pipe"],env:{...cleanEnvironment(directory,{}),WINAPP_CLI_TELEMETRY_OPTOUT:"1",DOTNET_CLI_TELEMETRY_OPTOUT:"1",NO_COLOR:"1"}});
    const buffers:Buffer[]=[];let bytes=0,stderr="",settled=false;
    const timer=setTimeout(()=>stop(new Blocked("DESKTOP_TIMEOUT","La herramienta nativa excedió su tiempo; verificá el resultado antes de repetir")),30000);
    const abort=()=>stop(signal.reason??new Error("Cancelado"));
    function cleanup(){clearTimeout(timer);signal.removeEventListener("abort",abort);}
    function stop(error:unknown){if(settled)return;settled=true;child.kill();cleanup();reject(error);}
    signal.addEventListener("abort",abort,{once:true});
    child.on("error",stop);child.stdout.on("data",(b:Buffer)=>{bytes+=b.length;if(bytes>8_000_000)stop(new Blocked("DESKTOP_OUTPUT_LIMIT","Salida nativa demasiado grande"));else buffers.push(b);});
    child.stderr.on("data",(b:Buffer)=>{stderr=(stderr+b.toString("utf8")).slice(-4000);});
    child.on("close",code=>{if(settled)return;settled=true;cleanup();resolve({code:code??137,stdout:Buffer.concat(buffers).toString("utf8"),stderr});});
    child.stdin.on("error",()=>{});child.stdin.end(input);
  });
}
