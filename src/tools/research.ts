import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Blocked } from '../domain/util.js';

function publicAddress(address:string):boolean {
  if(isIP(address)===6)return !/^(::|fc|fd|fe8|fe9|fea|feb|ff)/i.test(address)&&!address.toLowerCase().includes('ffff:');
  const p=address.split('.').map(Number),a=p[0]!,b=p[1]!;
  return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19)));
}
/** Opt-in public documentation only. No cookies, authorization or arbitrary local endpoints. */
export async function fetchReference(raw:string,allowedHosts:string[],signal:AbortSignal):Promise<string>{
  let url=new URL(raw);
  for(let redirect=0;redirect<4;redirect++){
    if(url.protocol!=='https:'||url.port&&url.port!=='443'||url.username||url.password||!allowedHosts.includes(url.hostname)||isIP(url.hostname))throw new Blocked('RESEARCH_HOST',url.hostname);
    const addresses=await lookup(url.hostname,{all:true});
    if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Blocked('RESEARCH_ADDRESS','Private or ambiguous destination');
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),headers:{Accept:'text/plain,text/html,application/json','User-Agent':'PerfectHarness/0.1 documentation fetch'}});
    if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw new Error('Redirect without location');url=new URL(location,url);continue;}
    if(!response.ok)throw new Error(`Documentation HTTP ${response.status}`);
    const reader=response.body?.getReader();if(!reader)return '';
    const chunks:Uint8Array[]=[];let size=0;
    try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>200000)throw new Blocked('RESEARCH_SIZE','Reference exceeds 200 KB');chunks.push(next.value);}}
    finally{await reader.cancel();}
    return `UNTRUSTED DOCUMENTATION FROM ${url.href}\n${Buffer.concat(chunks).toString('utf8')}`;
  }
  throw new Error('Too many documentation redirects');
}
