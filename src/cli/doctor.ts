import { access, mkdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import type { PerfectConfig } from '../config/schema.js';
import { PiRuntime } from '../adapters/pi/runtime.js';
import { PI_VERSION } from '../adapters/pi/session.js';
import { processRun } from '../adapters/git/process.js';
import { localPolicy } from '../config/load.js';
import { errorText } from '../domain/util.js';
export interface DoctorCheck {name:string;status:'PASS'|'WARN'|'BLOCKED'|'UNCONFIGURED'|'NOT_TESTED';detail:string}
export async function doctor(home:string,workspace:string,config:PerfectConfig,online=false):Promise<DoctorCheck[]>{
  const checks:DoctorCheck[]=[];
  checks.push({name:'node',status:process.versions.node.split('.')[0]==='24'?'PASS':'BLOCKED',detail:`Node ${process.versions.node}; supported runtime is Node 24 LTS`});
  checks.push({name:'platform',status:process.platform==='linux'?'PASS':'WARN',detail:process.platform==='linux'?'Linux/WSL2 is the validated platform':'Linux/WSL2 is the V1 validated execution platform'});
  if(process.getuid?.()===0)checks.push({name:'user',status:'WARN',detail:'Run Perfect as an unprivileged user; do not run coding agents as host root'});
  const require=createRequire(import.meta.url);
  try{const entry=require.resolve('@earendil-works/pi-coding-agent');const metadata=JSON.parse(await readFile(join(dirname(dirname(entry)),'package.json'),'utf8')) as {version:string};checks.push({name:'pi-sdk',status:metadata.version===PI_VERSION?'PASS':'BLOCKED',detail:`Installed ${metadata.version}, pinned adapter ${PI_VERSION}`});}catch(error){checks.push({name:'pi-sdk',status:'BLOCKED',detail:errorText(error)});}
  try{await access(workspace,constants.R_OK|constants.W_OK);await mkdir(home,{recursive:true,mode:0o700});await access(home,constants.W_OK);checks.push({name:'filesystem',status:'PASS',detail:'Workspace readable/writable; separate local state directory writable'});}catch(error){checks.push({name:'filesystem',status:'BLOCKED',detail:errorText(error)});}
  try{const git=await processRun('git',['--version'],{timeoutMs:5000});checks.push({name:'git',status:git.code===0?'PASS':'BLOCKED',detail:git.stdout.trim()||git.stderr});}catch(error){checks.push({name:'git',status:'BLOCKED',detail:errorText(error)});}
  let docker=false;
  try{const result=await processRun('docker',['version','--format','{{.Server.Version}}'],{timeoutMs:5000});docker=result.code===0;checks.push({name:'sandbox',status:docker?'PASS':'BLOCKED',detail:docker?`Docker daemon ${result.stdout.trim()}`:'Docker daemon unavailable; there is no host-shell fallback'});}catch{checks.push({name:'sandbox',status:'BLOCKED',detail:'Docker is not installed or not reachable'});}
  for(const image of [config.sandbox.image,config.sandbox.browserImage]){
    if(!docker){checks.push({name:`image:${image}`,status:'NOT_TESTED',detail:'Docker unavailable'});continue;}
    const result=await processRun('docker',['image','inspect','--format','{{.Id}}',image],{timeoutMs:5000});checks.push({name:`image:${image}`,status:result.code===0?'PASS':'BLOCKED',detail:result.code===0?result.stdout.trim():`Pull the approved image explicitly: docker pull ${image}`});
  }
  const pi=new PiRuntime(home,config),policy=await localPolicy(home);
  for(const [role,definition] of Object.entries(config.agents)){
    try{
      const runtime=await pi.modelRuntime(definition),model=runtime.getModel(definition.provider,definition.model);
      if(!model){checks.push({name:`route:${role}`,status:'BLOCKED',detail:`Not in installed catalog: ${definition.provider}/${definition.model}`});continue;}
      const native=definition.reasoning==='off'?'off':model.thinkingLevelMap?.[definition.reasoning]??definition.reasoning;
      const supported=definition.reasoning==='off'||model.reasoning&&model.thinkingLevelMap?.[definition.reasoning]!==null&&(!['xhigh','max'].includes(definition.reasoning)||Boolean(model.thinkingLevelMap?.[definition.reasoning]));
      checks.push({name:`route:${role}`,status:supported?'PASS':'BLOCKED',detail:`Catalog only: ${definition.provider}/${definition.model}, requested ${definition.reasoning}, mapped ${native}. Effective inference is not tested.`});
      const auth=await runtime.checkAuth(definition.provider,{signal:AbortSignal.timeout(15000)});
      checks.push({name:`auth:${role}`,status:!auth?'UNCONFIGURED':auth.type!==definition.auth?'BLOCKED':'PASS',detail:auth?`Configured ${auth.type}; required ${definition.auth}. Account ${definition.accountRef}.`:`Run perfect login ${definition.provider}`});
      if(online&&auth){await runtime.getAuth(definition.provider,{signal:AbortSignal.timeout(15000)});checks.push({name:`auth-online:${role}`,status:'PASS',detail:'Credential resolution/refresh succeeded; this does not prove inference access or quota'});}
    }catch(error){checks.push({name:`route:${role}`,status:'BLOCKED',detail:errorText(error)});}
  }
  checks.push({name:'contributor-privacy',status:policy.contributorWorkspaces.includes(resolve(workspace))?'PASS':'WARN',detail:'Muse Contributor requires explicit consent for this workspace AND public goal classification; prompts/responses may be used for training'});
  checks.push({name:'real-provider-inference',status:'NOT_TESTED',detail:'Use perfect smoke. Doctor never sends inference requests.'});
  return checks;
}
