import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import {useKeyboard,useRenderer,useTerminalDimensions} from "@opentui/react";
import type {TextareaRenderable} from "@opentui/core";
import type {UiClient} from "../../presentation/client.js";
import {text,type UiAction,type Screen,type AuthMessage,type Motion} from "../../presentation/protocol.js";
import {glass as g,roles,stateIcon,stateColor} from "./theme/tokens.js";
import {TopBar,CurrentGoal,AgentRail,AgentStrip,Plate,Document,SecretEntry} from "./components.js";
import {commands,filterCommands,viewRows,viewportRows,wrapLines,type Row} from "./views.js";

interface DocumentState {title:string;content:string;path?:string;}
interface Confirmation {title:string;body:string;phrase:string;action?:UiAction;local?:()=>void;}
export interface AppProps {client:UiClient;initialScreen?:Screen;onExit:()=>void;openExternal?:(path:string)=>Promise<void>;}
const screens:Screen[]=["agents","plan","tasks","verify","artifacts","diff","routing","cost","logs","doctor","settings","projects"];
const help=`PERFECT · KEYBOARD\n\nEnter             Submit a goal or selected action\nShift+Enter       New line (when terminal reports modifiers)\nCtrl+J            Portable new line\n/                 Search commands\nCtrl+K            Quick actions\nTab               Switch between activity and composer\nUp / Down         Select an item in the focused panel\nPageUp / PageDown Scroll details or activity\nEnter on a row    Inspect details\nAlt+A / Alt+P     Agents / Plan\nAlt+V / Alt+D     Verification / Diff\nEsc               Close an overlay or return to composer\nCtrl+C            Close safely; active work is paused first\n\nARTIFACTS\nEnter inspects text. O opens a verified image/video. C copies its verified path. Traces and other files are never auto-executed.\n\nAPPROVALS\n/approve shows the exact plan and criteria before confirmation. /apply requires DONE and the same verified candidate. /abort preserves checkpoints.\n\nPRIVACY\nGoals are private by default. /public affects the next goal only. Contributor requires separate workspace consent. No fallback changes a model or billing mode silently.\n\nTERMINAL MATERIAL\nTranslucency and Acrylic come from the terminal window. This application does not pretend to draw pixel-level blur or refraction in text cells.`;
export function App({client,initialScreen="home",onExit,openExternal}:AppProps){
 const s=useSyncExternalStore(client.subscribe,client.getSnapshot,client.getSnapshot),renderer=useRenderer(),{width,height}=useTerminalDimensions();
 const compact=width<100||height<30,rail=width>=130&&height>=30;
 const [screen,setScreen]=useState<Screen>(initialScreen),[selected,setSelected]=useState(0),[focus,setFocus]=useState<"composer"|"feed">("composer");
 const [query,setQuery]=useState(""),[quick,setQuick]=useState(false),[paletteIndex,setPaletteIndex]=useState(0);
 const [document,setDocument]=useState<DocumentState>(),[offset,setOffset]=useState(0),[confirmation,setConfirmation]=useState<Confirmation>();
 const [toast,setToast]=useState(""),[auth,setAuth]=useState<AuthMessage>(),[publicGoal,setPublicGoal]=useState(false),[closing,setClosing]=useState(false);
 const input=useRef<TextareaRenderable|null>(null),history=useRef<string[]>([]),historyIndex=useRef(0),toastTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const motion=s.preferences.ui.motion;
 const notify=useCallback((message:string)=>{setToast(text(message,500));if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(""),5500);},[]);
 useEffect(()=>()=>{if(toastTimer.current)clearTimeout(toastTimer.current);},[]);
 const showDocument=useCallback((title:string,content:string,path?:string)=>{setDocument({title,content,path});setOffset(0);},[]);
 useEffect(()=>client.onMessage(message=>{
  if(message.type==="fault")notify(message.message);
  if(message.type==="auth"){setAuth(message);setScreen("login");}
  if(message.type==="result"){
   notify(message.message);
   if(message.content!==undefined)showDocument(message.operation?"Evidence":"Candidate diff",message.content,message.path);
   else if(message.path&&message.operation==="inspect")showDocument("Verified artifact",`${message.message}\n\n${message.path}\n\nUse O in /artifacts to open an image or video.`,message.path);
   if(message.path&&message.operation==="copy"){const copied=renderer.copyToClipboardOSC52(message.path);notify(copied?"Verified artifact path copied":"Clipboard unavailable; the path is shown instead");if(!copied)showDocument("Artifact path",message.path);}
   if(message.path&&message.operation==="open"){if(openExternal)void openExternal(message.path).catch(error=>notify(String(error)));else notify("External opening is unavailable in this renderer");}
  }
 }),[client,notify,showDocument,renderer,openExternal]);
 useEffect(()=>{if(s.connected&&!s.demo&&!s.preferences.ui.onboarded&&initialScreen==="home"){setScreen("doctor");client.dispatch({type:"doctor",online:false});}},[s.connected,client,initialScreen,s.demo,s.preferences.ui.onboarded]);
 const paletteOpen=quick||query.startsWith("/")&&!query.includes(" ");
 const palette=useMemo(()=>quick?commands.filter(c=>["pause","resume","approve","retry","diff","reverify","abort","apply"].includes(c.name)):filterCommands(query),[query,quick]);
 const rows=useMemo(()=>viewRows(s,screen),[s,screen]);
 const rowHeight=compact?2:3,visibleRows=Math.max(1,Math.floor((height-14)/rowHeight));
 const activeSelected=Math.min(Math.max(0,selected),Math.max(0,rows.length-1));
 const shown=viewportRows(rows,screen==="home"&&focus==="composer"?rows.length-1:activeSelected,visibleRows);
 const mutate=(action:UiAction)=>{client.dispatch(action);};
 const requireGoal=()=>{if(!s.goal){notify("Start or select a goal first");return undefined;}return s.goal;};
 const setComposer=(value:string)=>{input.current?.setText(value);setQuery(value);};
 const clearComposer=()=>setComposer("");
 const navigate=(next:Screen)=>{setScreen(next);setSelected(0);setDocument(undefined);setOffset(0);setQuick(false);if(next!=="home")setFocus("feed");};
 const requestContributor=()=>setConfirmation({title:"Muse Contributor · data sharing",phrase:"SHARE",body:`Contributor requests may be used for training. Only enable this for public code you are authorized to share. Secrets and confidential projects remain prohibited.\n\nWorkspace:\n${s.workspace}\n\nType SHARE to enable consent for this workspace. Use /contributor revoke to revoke it.`,action:{type:"contributor",allow:true}});
 const command=(name:string,rest="")=>{
  setQuick(false);
  if(screens.includes(name as Screen)){navigate(name as Screen);if(name==="doctor")mutate({type:"doctor",online:false});if(name==="diff"){const goal=requireGoal();if(goal)mutate({type:"diff",goalId:goal.id});}return;}
  const goal=s.goal;
  switch(name){
   case "home":navigate("home");setFocus("composer");break;
   case "goal":if(!rest.trim()){setComposer("/goal ");setFocus("composer");return;}if(s.busy){notify("An execution is active. Pause it before starting another goal.");return;}mutate({type:"goal",description:rest,public:publicGoal});setPublicGoal(false);navigate("home");setFocus("composer");break;
   case "pause":case "resume":case "reverify":if(requireGoal())mutate({type:name,goalId:goal!.id});break;
   case "approve":if(requireGoal()&&s.plan)setConfirmation({title:"Approve implementation plan",phrase:"APPROVE",body:`Plan v${s.plan.version}\n${s.plan.summary}\n\nACCEPTANCE CRITERIA\n${s.plan.criteria.map(c=>`• ${c.description}`).join("\n")}\n\n${s.plan.risks.join("\n")}\n\nThis approves this exact plan, not future scope changes.`,action:{type:"approve",goalId:goal!.id,planHash:s.plan.hash}});else notify("No plan is ready for approval");break;
   case "abort":if(requireGoal())setConfirmation({title:"Abort this goal?",phrase:"ABORT",body:"The current execution will stop. Checkpoints and evidence are preserved. This does not delete your work.",action:{type:"abort",goalId:goal!.id,confirmation:"ABORT"}});break;
   case "apply":if(requireGoal())setConfirmation({title:"Apply verified changes?",phrase:"APPLY",body:`Candidate ${goal!.revision}\n\nThis writes the verified delta into the original workspace. Perfect will refuse if the goal is not DONE, the candidate changed, or your original checkout diverged.\n\n${s.workspace}`,action:{type:"apply",goalId:goal!.id,revision:goal!.revision,confirmation:"APPLY"}});break;
   case "retry":if(!rest){navigate("tasks");notify("Select a failed task, then press R to retry");}else if(requireGoal())mutate({type:"retry",goalId:goal!.id,taskId:rest.trim()});break;
   case "workspace":if(!rest){notify("Use /workspace followed by a folder path");setComposer("/workspace ");return;}mutate({type:"workspace",path:rest.replace(/^"(.*)"$/, "$1")});navigate("home");break;
   case "login":if(["xai","openai-codex","opencode"].includes(rest)){navigate("login");setAuth(undefined);mutate({type:"login",provider:rest as "xai"|"openai-codex"|"opencode"});}else{navigate("settings");notify("Choose a provider to connect");}break;
   case "contributor":if(rest==="revoke")mutate({type:"contributor",allow:false});else requestContributor();break;
   case "public":setConfirmation({title:"Public processing for the next goal",phrase:"PUBLIC",body:"Declare the next goal and its source suitable for public/Contributor processing. This does not enable Contributor consent by itself. Never use it for private client code, secrets or personal data.",local:()=>{setPublicGoal(true);notify("Next goal: public. Workspace consent is still required.");}});break;
   case "private":setPublicGoal(false);notify("Next goal: private");break;
   case "prepare":if(requireGoal())setConfirmation({title:"Prepare dependencies with network access",phrase:"DOWNLOAD",body:"Download public npm packages from the candidate manifests into an isolated image. No npm lifecycle scripts or private registry credentials are allowed. Pause the goal first. The UI will show the result when preparation finishes.",action:{type:"prepare",goalId:goal!.id,allowNetwork:true,render:rest==="render"}});break;
   case "help":showDocument("Perfect · keyboard and safety",help);break;
   case "exit":setClosing(true);onExit();break;
   default:notify(`Unknown command /${name}. Type / to browse actions.`);
  }
 };
 const submit=()=>{
  if(paletteOpen){const item=palette[Math.min(paletteIndex,palette.length-1)];if(item){if(item.args){setComposer(`/${item.name} `);setQuick(false);}else{clearComposer();command(item.name);}}return;}
  const value=(input.current?.plainText??query).trim();if(!value)return;
  if(value.length>100000){notify("Prompt exceeds the 100,000 character limit");return;}
  if(history.current.at(-1)!==value)history.current=[...history.current.slice(-49),value];historyIndex.current=history.current.length;
  clearComposer();
  if(value.startsWith("/")){const split=value.indexOf(" ");command(value.slice(1,split<0?undefined:split),split<0?"":value.slice(split+1));}else command("goal",value);
 };
 const activate=(row:Row|undefined)=>{
  if(!row)return;
  if(screen==="projects"){mutate({type:"select",goalId:row.id});navigate("home");return;}
  if(screen==="artifacts"&&s.goal){mutate({type:"artifact",goalId:s.goal.id,evidenceId:row.id,operation:"inspect"});return;}
  if(screen==="settings"){
   const prefs=structuredClone(s.preferences);
   if(row.id==="motion"){const modes:Motion[]=["auto","full","reduced","off"];prefs.ui.motion=modes[(modes.indexOf(prefs.ui.motion)+1)%modes.length]!;mutate({type:"preferences",preferences:prefs});return;}
   if(row.id==="contrast"){prefs.ui.contrast=prefs.ui.contrast==="normal"?"high":"normal";mutate({type:"preferences",preferences:prefs});return;}
   if(row.id==="transparent"){prefs.ui.transparent=!prefs.ui.transparent;mutate({type:"preferences",preferences:prefs});return;}
   if(row.id.startsWith("login-")){command("login",row.id.slice(6));return;}
   if(row.id==="contributor"){requestContributor();return;}
   if(row.id==="doctor"){command("doctor");return;}
  }
  showDocument(row.title,row.body);
 };
 useKeyboard(key=>{
  if(confirmation||auth?.promptId)return;
  if(key.ctrl&&key.name==="c"){key.preventDefault();if(!closing){setClosing(true);onExit();}return;}
  if(key.name==="escape"){key.preventDefault();if(document){setDocument(undefined);return;}if(quick){setQuick(false);return;}if(paletteOpen){clearComposer();return;}if(screen==="login"){mutate({type:"auth-cancel"});setAuth(undefined);}navigate("home");setFocus("composer");return;}
  if(key.ctrl&&key.name==="k"){key.preventDefault();setQuick(v=>!v);setPaletteIndex(0);return;}
  if(key.meta&&["a","p","v","d"].includes(key.name)){key.preventDefault();command(({a:"agents",p:"plan",v:"verify",d:"diff"} as Record<string,string>)[key.name]!);return;}
  if(key.name==="tab"){key.preventDefault();setFocus(f=>f==="composer"?"feed":"composer");if(focus==="composer")setSelected(Math.max(0,rows.length-1));return;}
  if(document){
   if(["up","down","pageup","pagedown","home","end"].includes(key.name)){key.preventDefault();const total=wrapLines(document.content,width-14).length;setOffset(n=>key.name==="home"?0:key.name==="end"?Math.max(0,total-height+12):Math.max(0,Math.min(Math.max(0,total-1),n+({up:-1,down:1,pageup:-(height-12),pagedown:height-12}[key.name]??0))));}
   if(key.name==="n"||key.name==="p"){key.preventDefault();const lines=wrapLines(document.content,width-14),starts=lines.map((l,i)=>l.startsWith("diff --git")?i:-1).filter(i=>i>=0),next=key.name==="n"?starts.find(i=>i>offset):starts.findLast(i=>i<offset);if(next!==undefined)setOffset(next);}
   return;
  }
  if(paletteOpen){if(key.name==="up"||key.name==="down"){key.preventDefault();setPaletteIndex(n=>Math.max(0,Math.min(palette.length-1,n+(key.name==="up"?-1:1))));}if(key.name==="return"){key.preventDefault();submit();}return;}
  if(screen==="login"&&auth?.url&&key.name==="o"){key.preventDefault();if(openExternal)void openExternal(auth.url).catch(error=>notify(String(error)));return;}
  if(screen==="doctor"&&key.name==="c"&&!s.preferences.ui.onboarded){key.preventDefault();const prefs=structuredClone(s.preferences);prefs.ui.onboarded=true;mutate({type:"preferences",preferences:prefs});navigate("settings");return;}
  if(focus==="feed"||screen!=="home"){
   if(["up","down","pageup","pagedown","home","end"].includes(key.name)){key.preventDefault();setSelected(n=>key.name==="home"?0:key.name==="end"?Math.max(0,rows.length-1):Math.max(0,Math.min(rows.length-1,n+({up:-1,down:1,pageup:-visibleRows,pagedown:visibleRows}[key.name]??0))));}
   if(key.name==="return"){key.preventDefault();activate(rows[activeSelected]);}
   if(screen==="artifacts"&&["o","c"].includes(key.name)&&s.goal&&rows[activeSelected]){key.preventDefault();mutate({type:"artifact",goalId:s.goal.id,evidenceId:rows[activeSelected]!.id,operation:key.name==="o"?"open":"copy"});}
   if(screen==="tasks"&&key.name==="r"&&s.goal&&rows[activeSelected]){key.preventDefault();mutate({type:"retry",goalId:s.goal.id,taskId:rows[activeSelected]!.id});}
   if(screen==="plan"&&key.name==="a"){key.preventDefault();command("approve");}
  }else if(key.meta&&["up","down"].includes(key.name)){key.preventDefault();historyIndex.current=Math.max(0,Math.min(history.current.length,historyIndex.current+(key.name==="up"?-1:1)));setComposer(history.current[historyIndex.current]??"");}
 });
 const showList=screen!=="home"&&screen!=="login";
 const modalRows=viewportRows(rows,activeSelected,Math.max(1,Math.floor((height-15)/2)));
 const paletteRows=viewportRows(palette,Math.min(paletteIndex,Math.max(0,palette.length-1)),Math.max(1,Math.min(9,height-14)));
 const border=focus==="composer"?g.edge:g.border,muted=s.preferences.ui.contrast==="high"?g.secondary:g.muted;
 return <box width="100%" height="100%" flexDirection="column" backgroundColor={s.preferences.ui.transparent?"transparent":g.void} paddingX={width>=100?1:0}>
  <box flexDirection="column" flexGrow={1} border borderStyle="rounded" borderColor={g.edge} backgroundColor={s.preferences.ui.transparent?"transparent":g.surface}>
   <TopBar snapshot={s} compact={compact}/>
   <CurrentGoal snapshot={s} compact={compact}/>
   {!rail&&width>=100&&s.goal&&<AgentStrip agents={s.agents}/>}
   <box flexDirection="row" flexGrow={1} paddingX={2} minHeight={2}>
    <box flexDirection="column" flexGrow={1} overflow="hidden" paddingRight={rail?2:0}>
     <box height={2} flexDirection="row" justifyContent="space-between"><text fg={muted}>{s.goal?"ACTIVITY":"START WITH A GOAL"}</text><text fg={muted}>{focus==="feed"?"↑↓ select · Enter inspect":"Tab to inspect"}</text></box>
     {!rows.length&&screen==="home"?<box flexDirection="column" flexGrow={1} justifyContent="center" paddingBottom={2}><text fg={g.highlight}>Plan clearly. Build carefully. Verify the result.</text><box height={1}/><text fg={g.secondary}>Your code stays in its original folder until you apply a verified result.</text><box height={1}/><text fg={muted}>/workspace choose folder     /doctor setup     /login connect</text></box>:shown.rows.map((row,i)=><box key={row.id} flexDirection="column" height={rowHeight} flexShrink={0} backgroundColor={focus==="feed"&&shown.offset+i===activeSelected?g.focused:"transparent"} paddingX={1} onMouseDown={()=>{setFocus("feed");setSelected(shown.offset+i);}}>
      <text fg={g.text} height={1}><span fg={stateColor(row.status)}>{stateIcon(row.status)} </span><span fg={roles[s.activity.find(a=>a.id===row.id)?.role??""]?.color??g.text}>{row.title}</span></text>
      <text fg={g.secondary} height={1}>  {row.detail||"Enter to inspect"}</text>
     </box>)}
    </box>
    {rail&&<AgentRail agents={s.agents} motion={motion} rows={Math.max(8,height-17)}/>}
   </box>
   <box flexDirection="column" paddingX={2} paddingTop={1} flexShrink={0}>
    {toast&&<text fg={g.warning} height={compact?1:2}>{toast}</text>}
    <box border borderStyle="rounded" borderColor={border} paddingX={1} flexDirection="row" height={compact?3:4} backgroundColor={s.preferences.ui.transparent?"transparent":g.raised}>
     <text fg={g.highlight} width={2}>›</text>
     <textarea id="composer" ref={input} flexGrow={1} focused={focus==="composer"&&screen==="home"&&!document&&!confirmation&&!auth?.promptId&&!quick&&!closing} placeholder={s.busy?"Working…  / for actions":"Ask Perfect what to build…  / for actions"} placeholderColor={muted} textColor={g.text} backgroundColor="transparent" focusedBackgroundColor="transparent" keyBindings={[{name:"return",action:"submit"},{name:"return",shift:true,action:"newline"},{name:"j",ctrl:true,action:"newline"}]} onSubmit={submit} onContentChange={()=>{setQuery((input.current?.plainText??"").slice(0,100001));setPaletteIndex(0);}}/>
    </box>
    <box height={2} flexDirection="row" justifyContent="space-between" alignItems="center"><text fg={muted}>/agents  /plan  /verify  /diff{width>=100?"    Ctrl+K actions":""}</text><text fg={publicGoal?g.warning:muted}>{closing?"Pausing safely…":!s.connected?"engine offline":`${publicGoal?"PUBLIC":"PRIVATE"} · ${s.version}`}</text></box>
   </box>
  </box>
  {showList&&<Plate title={screen==="verify"?"Verification · current candidate":screen.charAt(0).toUpperCase()+screen.slice(1)} width={width} height={height} motion={motion} footer={screen==="artifacts"?"↑↓ select · Enter inspect · O open image/video · C copy path":screen==="plan"?"↑↓ tasks · Enter details · A approve exact plan":screen==="doctor"&&!s.preferences.ui.onboarded?"C continue to provider setup · Esc return":"↑↓ select · Enter details · Esc close"}>
   {screen==="plan"&&s.plan&&<box height={4} flexDirection="column"><text fg={g.text}>{s.plan.summary}</text><text fg={s.plan.approved?g.success:g.warning}>Plan v{s.plan.version} · {s.plan.approved?"approved":"approval required"} · {s.plan.criteria.length} criteria</text><text fg={muted}>All dependencies are listed; shared children are not duplicated.</text></box>}
   {!rows.length&&<text fg={g.secondary}>{screen==="doctor"?"Checking this computer…":"Nothing has been recorded here yet."}</text>}
   {modalRows.rows.map((row,i)=><box key={row.id} height={2} flexShrink={0} flexDirection="column" backgroundColor={modalRows.offset+i===activeSelected?g.focused:"transparent"} onMouseDown={()=>{setSelected(modalRows.offset+i);}}>
    <text fg={g.text}><span fg={stateColor(row.status)}>{modalRows.offset+i===activeSelected?"›":stateIcon(row.status)} </span>{row.title}</text><text fg={g.secondary}>  {row.detail}</text>
   </box>)}
   <box flexGrow={1}/>
  </Plate>}
  {screen==="login"&&<Plate title="Connect your provider" width={width} height={height} motion={motion} footer="Credentials stay outside Git and are never shown in telemetry.">
   <text fg={g.text}>{auth?.provider??"Preparing authentication…"}</text><box height={1}/><text fg={g.secondary}>{auth?.message??"Use /login xai, /login openai-codex or /login opencode."}</text>
   {auth?.url&&<box flexDirection="column" paddingY={1}><text fg={g.accent}>{text(auth.url,2000)}</text><text fg={g.muted}>O open the authorization page in your browser</text></box>}
   {auth?.code&&<text fg={g.highlight}>Device code: {auth.code}</text>}
   {auth?.options?.map((o,i)=><text key={o.id} fg={g.secondary}>{i+1}. {o.label}</text>)}
   {auth?.promptId&&(auth.secret?<SecretEntry key={auth.promptId} onSubmit={value=>{mutate({type:"auth-answer",promptId:auth.promptId!,value});setAuth({...auth,promptId:undefined});}} onCancel={()=>{mutate({type:"auth-cancel"});setAuth(undefined);navigate("home");}}/>:<input key={auth.promptId} focused placeholder="Paste the authorization value and press Enter" onSubmit={value=>{mutate({type:"auth-answer",promptId:auth.promptId!,value});setAuth({...auth,promptId:undefined});}}/>)}
   {auth?.done&&<text fg={g.muted}>Esc returns to Perfect. /doctor checks the configured connection.</text>}<box flexGrow={1}/>
  </Plate>}
  {paletteOpen&&!confirmation&&<Plate title={quick?"Quick actions":"Commands"} width={width} height={height} motion={motion} footer="Type to filter · ↑↓ select · Enter run · Esc close">
   {paletteRows.rows.map((item,i)=><box key={item.name} height={2} flexShrink={0} flexDirection="row" backgroundColor={paletteRows.offset+i===Math.min(paletteIndex,palette.length-1)?g.focused:"transparent"}><text fg={g.highlight} width={17}>{paletteRows.offset+i===paletteIndex?"›":" "} /{item.name}</text><text fg={g.secondary} flexGrow={1}>{item.description}</text></box>)}<box flexGrow={1}/>
  </Plate>}
  {document&&!confirmation&&<Plate title={document.title} width={width} height={height} motion={motion} footer="↑↓ / PgUp PgDn scroll · N/P next/previous diff file · Esc close"><Document content={document.content} width={width-14} height={height-12} offset={offset}/></Plate>}
  {confirmation&&<Confirm confirmation={confirmation} width={width} height={height} motion={motion} onCancel={()=>setConfirmation(undefined)} onConfirm={()=>{if(confirmation.action)mutate(confirmation.action);confirmation.local?.();setConfirmation(undefined);}}/>}
 </box>;
}
function Confirm({confirmation:c,width,height,motion,onCancel,onConfirm}:{confirmation:Confirmation;width:number;height:number;motion:Motion;onCancel:()=>void;onConfirm:()=>void}){
 const [value,setValue]=useState("");
 useKeyboard(key=>{if(key.name==="escape"){key.preventDefault();onCancel();}});
 return <Plate title={c.title} width={width} height={height} motion={motion} footer="Esc cancels · Confirmation is bound to the exact plan/candidate">
  <Document content={c.body} width={width-14} height={Math.max(3,height-17)}/>
  <text fg={g.warning}>Type {c.phrase} to confirm</text>
  <box height={3} border borderStyle="rounded" borderColor={g.edge} paddingX={1}><input focused value={value} placeholder={c.phrase} onInput={setValue} onSubmit={input=>{if(input===c.phrase)onConfirm();}}/></box>
 </Plate>;
}
