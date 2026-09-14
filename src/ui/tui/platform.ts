import {spawn} from "node:child_process";
import {isAbsolute,extname} from "node:path";
/** A user-clicked auth URL or an engine-verified media path, never a command string. */
export async function openExternal(value:string):Promise<void>{
 const isUrl=/^https:\/\//i.test(value);
 if(isUrl){const url=new URL(value);if(url.username||url.password||!['auth.x.ai','accounts.x.ai','x.ai','grok.com','auth.openai.com','chatgpt.com','platform.openai.com','opencode.ai'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw new Error("Unapproved authentication origin; inspect the URL and open it manually.");}
 else if(!isAbsolute(value)||![".png",".jpg",".jpeg",".webp",".mp4"].includes(extname(value).toLowerCase()))throw new Error("Only verified image/video files can be opened by the UI");
 if(/[\x00-\x1f]/.test(value))throw new Error("Invalid external resource");
 const executable=process.platform==="win32"?"explorer.exe":process.platform==="darwin"?"open":"xdg-open";
 const args=process.platform==="darwin"?["--",value]:[value];
 await new Promise<void>((resolveOpen,reject)=>{const child=spawn(executable,args,{stdio:"ignore",windowsHide:true,shell:false,detached:process.platform!=="win32"});child.once("error",reject);child.once("spawn",()=>{child.unref();resolveOpen();});});
}
