import {useState} from "react";
import {useKeyboard} from "@opentui/react";
import type {Motion,UiAction} from "../../presentation/protocol.js";
import {Plate,Document} from "./components.js";
import {wrapLines} from "./views.js";
import {glass as g} from "./theme/tokens.js";
export function ApprovalDialog({confirmation:c,width,height,motion,onCancel,onConfirm}:{confirmation:{title:string;body:string;phrase:string;action?:UiAction;local?:()=>void};width:number;height:number;motion:Motion;onCancel:()=>void;onConfirm:()=>void}){
 const [value,setValue]=useState(""),[offset,setOffset]=useState(0);
 const visible=Math.max(3,height-18),total=wrapLines(c.body,width-14).length,maxOffset=Math.max(0,total-visible);
 useKeyboard(key=>{
  if(key.name==="escape"){key.preventDefault();onCancel();}
  if(key.name==="pageup"||key.name==="pagedown"){key.preventDefault();setOffset(n=>Math.max(0,Math.min(maxOffset,n+(key.name==="pageup"?-visible:visible))));}
  if(key.ctrl&&key.name==="home"){key.preventDefault();setOffset(0);}
  if(key.ctrl&&key.name==="end"){key.preventDefault();setOffset(maxOffset);}
 });
 return <Plate title={c.title} width={width} height={height} motion={motion} footer="PgUp/PgDn read · Esc cancel · Exact plan/candidate only">
  <Document content={c.body} width={width-14} height={visible} offset={offset}/>
  <text fg={g.muted}>Lines {Math.min(offset+1,total)}–{Math.min(offset+visible,total)} / {total}</text>
  <text fg={g.warning}>Type {c.phrase} to confirm</text>
  <box height={3} border borderStyle="rounded" borderColor={g.edge} paddingX={1} flexShrink={0}><input focused value={value} placeholder={c.phrase} onInput={setValue} onSubmit={input=>{if(input===c.phrase)onConfirm();}}/></box>
 </Plate>;
}
