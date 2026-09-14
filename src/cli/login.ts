import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import type { PerfectConfig } from '../config/schema.js';
import { PiRuntime } from '../adapters/pi/runtime.js';
import { Blocked } from '../domain/util.js';

async function answer(message:string,secret:boolean,signal?:AbortSignal):Promise<string>{
  if(!secret){const rl=createInterface({input:process.stdin,output:process.stdout});try{return await rl.question(`${message}: `,{signal});}finally{rl.close();}}
  process.stdout.write(`${message}: `);
  const muted=new Writable({write(_chunk,_encoding,callback){callback();}});
  const rl=createInterface({input:process.stdin,output:muted,terminal:Boolean(process.stdin.isTTY)});
  try{return await rl.question('',{signal});}finally{rl.close();process.stdout.write('\n');}
}
export async function login(home:string,config:PerfectConfig,provider:string,account?:string,keyEnv?:string):Promise<void>{
  const definitions=Object.values(config.agents).filter(d=>d.provider===provider&&(!account||d.accountRef===account));
  const definition=definitions[0];if(!definition)throw new Blocked('PROVIDER_UNKNOWN',provider);
  if(definition.auth==='mock')throw new Blocked('MOCK_AUTH','A mock provider has no account login');
  if(!account&&new Set(definitions.map(d=>d.accountRef)).size>1)throw new Blocked('ACCOUNT_REQUIRED','Select the configured account with --account');
  const runtime=await new PiRuntime(home,config).modelRuntime(definition);
  const controller=new AbortController(),cancel=()=>controller.abort(new Error('Login cancelled'));process.once('SIGINT',cancel);
  try{
    await runtime.login(provider,definition.auth,{
      signal:controller.signal,
      notify:event=>{
        if(event.type==='auth_url')console.log(`Open: ${event.url}\n${event.instructions??''}`);
        else if(event.type==='device_code')console.log(`Open: ${event.verificationUri}\nDevice code: ${event.userCode}`);
        else console.log(event.message);
      },
      prompt:async prompt=>{
        if(prompt.type==='secret'&&keyEnv){const value=process.env[keyEnv];if(!value)throw new Blocked('KEY_ENV_EMPTY',keyEnv);return value;}
        if(prompt.type==='select'){
          console.log(prompt.options.map((option,index)=>`${index+1}. ${option.label}${option.description?` — ${option.description}`:''}`).join('\n'));
          const value=await answer(prompt.message,false,prompt.signal);const selected=prompt.options.find(o=>o.id===value)??prompt.options[Number(value)-1];if(!selected)throw new Error('Invalid selection');return selected.id;
        }
        return answer(prompt.message,prompt.type==='secret',prompt.signal);
      },
    });
    console.log(`Authentication saved locally for ${definition.accountRef}. No token was added to the repository.`);
  }finally{process.removeListener('SIGINT',cancel);}
}
