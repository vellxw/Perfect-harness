import { dirname, join } from "node:path";
import { z } from "zod";
import { nativeProcess } from "../native-process.js";
import { Blocked } from "../../domain/util.js";
import type { WindowGrant } from "../types.js";

/** Independently query UIA rather than trusting the known inaccurate WinApp 0.6 IsPassword field. */
export async function assertNonPasswordControl(guardPath:string,directory:string,grant:WindowGrant,element:{name?:string;x?:number;y?:number;width?:number;height?:number},signal:AbortSignal):Promise<void>{
  if(![element.x,element.y,element.width,element.height].every(Number.isFinite))throw new Blocked("DESKTOP_ELEMENT_BOUNDS","No se puede verificar el control observado");
  const response=await nativeProcess(join(dirname(guardPath),"Perfect.DesktopElementGuard.exe"),[],directory,signal,JSON.stringify({handle:grant.handle,pid:grant.pid,name:element.name??"",x:element.x,y:element.y,width:element.width,height:element.height})+"\n");
  let raw:unknown;try{raw=JSON.parse(response.stdout);}catch{throw new Blocked("DESKTOP_PASSWORD_DENIED","La comprobación nativa de privacidad no devolvió datos válidos");}
  const parsed=z.object({ok:z.literal(true),element:z.object({isPassword:z.boolean(),isEnabled:z.boolean(),isOffscreen:z.boolean(),processId:z.number().int()})}).safeParse(raw);
  if(response.code!==0||!parsed.success||parsed.data.element.isPassword||!parsed.data.element.isEnabled||parsed.data.element.isOffscreen||parsed.data.element.processId!==grant.pid)throw new Blocked("DESKTOP_PASSWORD_DENIED","El campo es privado, cambió o no se pudo verificar directamente mediante UI Automation");
}
