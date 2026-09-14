import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { splitArguments } from '../cli/shell.js';

/** Thin presentation adapter: all scheduling, state and policies remain in the application. */
export default function perfectExtension(pi:ExtensionAPI):void{
  const cli=fileURLToPath(new URL('../cli/index.js',import.meta.url));
  const children=new Set<ReturnType<typeof spawn>>();
  const invoke=async(args:string[],ctx:ExtensionCommandContext)=>{
    const allowed=new Set(['goal','status','plan','tasks','agents','routing','cost','pause','resume','abort','retry','logs','diff','doctor','approve-plan']);
    if(!allowed.has(args[0]??'')){ctx.ui.notify('Use the standalone CLI for login, consent, configuration and applying changes.','warning');return;}
    if(args.includes('--watch')||args.includes('--follow')){ctx.ui.notify('Use a terminal for streaming status/logs.','warning');return;}
    ctx.ui.notify(`Perfect ${args[0]} started. Status remains available in the standalone CLI.`,'info');
    const child=spawn(process.execPath,[cli,'--workspace',ctx.cwd,...args],{stdio:['ignore','pipe','pipe']});children.add(child);
    let stdout='',stderr='';
    child.stdout?.on('data',(chunk:Buffer)=>{stdout=(stdout+chunk.toString()).slice(-60000);});child.stderr?.on('data',(chunk:Buffer)=>{stderr=(stderr+chunk.toString()).slice(-16000);});
    try{const code=await new Promise<number>((resolve,reject)=>{child.once('error',reject);child.once('close',value=>resolve(value??130));});ctx.ui.notify((stdout||stderr||`Perfect exited ${code}`).slice(-16000),code===0?'info':code===2?'warning':'error');}
    catch(error){ctx.ui.notify(error instanceof Error?error.message:String(error),'error');}finally{children.delete(child);}
  };
  pi.registerCommand('goal',{description:'Create an independently audited Perfect Harness goal',handler:async(args,ctx)=>{if(!args.trim()){ctx.ui.notify('Usage: /goal <description>','warning');return;}await invoke(['goal','--',args],ctx);}});
  pi.registerCommand('perfect',{description:'Perfect status, tasks, routing, pause, resume and inspection',handler:async(args,ctx)=>{try{await invoke(splitArguments(args.trim()||'status'),ctx);}catch(error){ctx.ui.notify(error instanceof Error?error.message:String(error),'error');}}});
  pi.on('session_shutdown',async()=>{for(const child of children)child.kill('SIGINT');await Promise.all([...children].map(child=>new Promise<void>(resolve=>{if(child.exitCode!==null){resolve();return;}child.once('close',()=>resolve());const timer=setTimeout(()=>{child.kill('SIGTERM');resolve();},10000);timer.unref();})));});
}
