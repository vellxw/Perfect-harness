import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DesktopAPI, DesktopEnvelope, DesktopEvent } from "../contracts/protocol.js";
const api:DesktopAPI={
 boot:()=>ipcRenderer.invoke('perfect:boot'),
 request:(request:DesktopEnvelope)=>ipcRenderer.invoke('perfect:request',request),
 onEvent:(listener:(event:DesktopEvent)=>void)=>{const handle=(_event:unknown,payload:DesktopEvent)=>listener(payload);ipcRenderer.on('perfect:event',handle);return()=>ipcRenderer.removeListener('perfect:event',handle);},
 droppedFiles:async(files:File[])=>{const paths=files.slice(0,16).map(file=>webUtils.getPathForFile(file)).filter(Boolean);return ipcRenderer.invoke('perfect:drop',paths);},
};
contextBridge.exposeInMainWorld('perfect',Object.freeze(api));
