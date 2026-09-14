import { lstat, realpath } from 'node:fs/promises';
import { resolve, relative, sep, join } from 'node:path';
import { Blocked } from '../domain/util.js';
export function relativePath(path:string):string{
  if(!path||path.startsWith('/')||path.includes('\\')||path.includes(':')||/[\x00-\x1f\x7f]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Blocked('PATH_DENIED',path);
  return path;
}
export function sensitive(path:string):boolean{
  const parts=path.toLowerCase().split('/');
  return parts.some(p=>p==='.git'||p==='.pi'||p==='.perfect'||p==='.ssh'||p==='.aws'||p==='.npmrc'||p==='.pypirc'||p.startsWith('.env')||['secrets','credentials','credentials.json','auth.json','id_rsa','id_ed25519'].includes(p)||/\.(pem|p12|pfx|key)$/.test(p));
}
export const omitted=(path:string)=>sensitive(path)||path.split('/').some(p=>['node_modules','.next','.cache','dist','coverage','test-results','playwright-report','.venv','venv'].includes(p));
export async function safePath(root:string,path:string,allowMissing=false):Promise<string>{
  relativePath(path);const base=await realpath(root);const destination=resolve(base,path);
  if(relative(base,destination).startsWith(`..${sep}`)||destination===base)throw new Blocked('PATH_DENIED',path);
  let current=base;
  for(const part of path.split('/')){
    current=join(current,part);
    try{const st=await lstat(current);if(st.isSymbolicLink()||(st.isFile()&&st.nlink>1))throw new Blocked('LINK_DENIED',path);}
    catch(e){if(allowMissing&&(e as NodeJS.ErrnoException).code==='ENOENT')break;throw e;}
  }
  return destination;
}
export function secretContent(content:string):boolean{
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16})\b/.test(content);
}
