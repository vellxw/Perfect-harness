import {useEffect,useRef,useState,type ReactNode} from "react";
import {useKeyboard,usePaste} from "@opentui/react";
import type {UiAgent,UiSnapshot,Motion} from "../../presentation/protocol.js";
import {glass as g,roles,stateColor,stateIcon} from "./theme/tokens.js";
import {useSpinner,motionEnabled,useEntrance} from "./motion.js";
import {wrapLines} from "./views.js";

export function Status({state,motion}:{state:string;motion:Motion}){const live=/running|EXECUTE|REPAIR|VERIFY|PLAN|DISCOVER|REVIEW|JUDGE/.test(state),spinner=useSpinner(live,motionEnabled(motion));return <text fg={stateColor(state)}>{live?spinner:stateIcon(state)} {state.toLowerCase()}</text>;}
export function TopBar({snapshot:s,compact}:{snapshot:UiSnapshot;compact:boolean}){return <box height={3} flexDirection="row" alignItems="center" justifyContent="space-between" paddingX={1} flexShrink={0}>
 <text fg={g.text}><span fg={g.highlight}>◈ </span><strong>Perfect</strong><span fg={g.muted}> / </span><span fg={g.secondary}>{s.workspaceName.slice(0,compact?20:40)}</span></text>
 <box flexDirection="row" gap={2}><Status state={s.goal?.state??"idle"} motion={s.preferences.ui.motion}/>{!compact&&<text fg={g.muted}>{s.agents.filter(a=>a.status==="running").length} active · checks {s.verification.passed}/{s.verification.total}</text>}{s.demo&&<text fg={g.warning}>DEMO</text>}</box>
 </box>;}
export function CurrentGoal({snapshot:s,compact}:{snapshot:UiSnapshot;compact:boolean}){const goal=s.goal;return <box flexDirection="column" paddingX={2} paddingBottom={1} gap={compact?0:1} flexShrink={0}>
 <text fg={g.muted}>{goal?"CURRENT GOAL":"YOUR NEXT IDEA"}</text>
 <text fg={g.text} maxHeight={compact?2:3}><strong>{goal?.request??"What do you want to build?"}</strong></text>
 {goal?<box flexDirection="row" justifyContent="space-between"><text fg={g.secondary}>Iteration <span fg={g.text}>{goal.iteration} / {goal.maxIterations}</span><span fg={g.muted}> · {goal.privacy} · {goal.revision.slice(0,8)}</span></text><text fg={g.secondary}>Verification <span fg={g.highlight}>{s.verification.passed} / {s.verification.total}</span></text></box>:<text fg={g.secondary}>{s.connected?"Describe a goal below. Perfect plans, builds and verifies it.":"Connecting to the local engine…"}</text>}
 {goal?.reason&&<text fg={goal.state==="DONE"?g.success:g.warning} maxHeight={compact?2:3}>{goal.reason}</text>}
 {s.demo&&<text fg={g.muted}>Synthetic display data · no accounts, code changes or inference calls</text>}
 </box>;}
export function AgentRail({agents,motion,rows}:{agents:UiAgent[];motion:Motion;rows:number}){const visible=agents.filter(a=>a.status!=="idle"||["planner","frontend","backend","oracle"].includes(a.role));return <box width={27} border={["left"]} borderColor={g.border} paddingLeft={2} paddingRight={1} flexDirection="column" flexShrink={0}>
 <text fg={g.muted}>AGENTS</text><box height={1}/>
 {visible.slice(0,Math.max(2,Math.floor((rows-4)/4))).map(a=><box key={a.id} flexDirection="column" height={4} flexShrink={0}>
 <text fg={roles[a.role]?.color??g.text}><strong>{roles[a.role]?.name??a.role}</strong></text>
 <Status state={a.status} motion={motion}/><text fg={g.muted}>{a.selected} · {a.requests} requests</text>
 </box>)}
 <box flexGrow={1}/><text fg={g.muted}>/agents for routing</text>
 </box>;}
export function AgentStrip({agents}:{agents:UiAgent[]}){return <box height={2} paddingX={2} flexDirection="row" gap={3} flexShrink={0}>{agents.filter(a=>["planner","frontend","backend","oracle"].includes(a.role)).map(a=><text key={a.id} fg={stateColor(a.status)}>{stateIcon(a.status)} {roles[a.role]?.name??a.role}</text>)}</box>;}
export function Plate({title,children,width,height,motion,footer}:{title:string;children:ReactNode;width:number;height:number;motion:Motion;footer?:string}){const alpha=useEntrance(title,motionEnabled(motion));return <box position="absolute" left={2} top={3} width={Math.max(30,width-6)} height={Math.max(8,height-6)} border borderStyle="rounded" borderColor={alpha<0.65?g.border:g.edge} backgroundColor={g.raised} paddingX={2} paddingY={1} flexDirection="column" zIndex={20}>
 <box height={2} flexShrink={0} flexDirection="row" justifyContent="space-between"><text fg={g.text}><strong>{title}</strong></text><text fg={g.muted}>Esc close</text></box>
 {children}
 {footer&&<text fg={g.muted} height={1}>{footer}</text>}
 </box>;}
export function Document({content,width,height,offset=0}:{content:string;width:number;height:number;offset?:number}){const lines=wrapLines(content,width);return <box flexDirection="column" flexGrow={1} overflow="hidden">{lines.slice(offset,offset+Math.max(1,height)).map((line,i)=><text height={1} key={`${offset+i}`} fg={line.startsWith("+")?g.success:line.startsWith("-")?g.danger:line.startsWith("@@")?g.accent:g.secondary}>{line||" "}</text>)}</box>;}
/** Secret text never enters a visible input buffer, snapshot, event log or renderer. */
export function SecretEntry({onSubmit,onCancel}:{onSubmit:(value:string)=>void;onCancel:()=>void}){
 const value=useRef("");const [length,setLength]=useState(0);
 useEffect(()=>()=>{value.current="";},[]);
 useKeyboard(key=>{if(key.name==="escape"){key.preventDefault();value.current="";onCancel();return;}if(key.ctrl&&key.name==="c"){key.preventDefault();value.current="";onCancel();return;}if(key.name==="return"){key.preventDefault();const answer=value.current;value.current="";setLength(0);onSubmit(answer);return;}if(key.name==="backspace"){key.preventDefault();value.current=value.current.slice(0,-1);setLength(value.current.length);return;}if(!key.ctrl&&!key.meta&&key.sequence&&!/[\x00-\x1f\x7f]/.test(key.sequence)){key.preventDefault();value.current=(value.current+key.sequence).slice(0,100000);setLength(value.current.length);}});
 usePaste(event=>{const bytes=event as unknown as {bytes?:Uint8Array;data?:Uint8Array};const data=bytes.bytes??bytes.data;if(data){value.current=(value.current+new TextDecoder().decode(data).replace(/[\r\n]/g,"")).slice(0,100000);setLength(value.current.length);}});
 return <box border borderStyle="rounded" borderColor={g.edge} paddingX={1} height={3}><text fg={g.text}>{length?"•".repeat(Math.min(length,48)):"Paste your key. It will not be displayed."}</text></box>;
}
