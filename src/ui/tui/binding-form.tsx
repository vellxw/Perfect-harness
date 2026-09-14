import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { AgentProfile } from "../../skills/model.js";
import { BindingSchema } from "../../skills/model.js";
import type { Motion } from "../../presentation/protocol.js";
import { Plate } from "./components.js";
import { glass as g } from "./theme/tokens.js";

const fields=[{key:"provider",label:"Proveedor"},{key:"model",label:"Modelo exacto"},{key:"reasoning",label:"Razonamiento"},{key:"accountRef",label:"Cuenta local"},{key:"auth",label:"Autenticación"},{key:"billingMode",label:"Facturación"}] as const;
export function BindingForm({profile,width,height,motion,onSave,onCancel}:{profile:AgentProfile;width:number;height:number;motion:Motion;onSave:(binding:AgentProfile["binding"])=>void;onCancel:()=>void}){
 const [value,setValue]=useState({...profile.binding}),[selected,setSelected]=useState(0),[editing,setEditing]=useState(false),[error,setError]=useState("");
 const save=()=>{const result=BindingSchema.safeParse(value);if(!result.success){setError("Revisá los campos. auth: oauth/api_key · billing: subscription/free/metered.");return;}onSave(result.data);};
 useKeyboard(key=>{
   if(key.name==="escape"){key.preventDefault();if(editing)setEditing(false);else onCancel();return;}
   if(editing)return;
   if(key.name==="down"||key.name==="up"){key.preventDefault();setSelected(n=>Math.max(0,Math.min(fields.length,n+(key.name==="down"?1:-1))));}
   if(key.name==="return"){key.preventDefault();if(selected===fields.length)save();else setEditing(true);}
 });
 const field=fields[Math.min(selected,fields.length-1)]!;
 return <Plate title={`Modelo · ${profile.name}`} width={width} height={height} motion={motion} footer="↑↓ campo · Enter editar · Esc volver · Guardar pide confirmación">
   {editing?<box flexDirection="column" gap={1}>
     <text fg={g.highlight}>{field.label}</text>
     <input key={field.key} focused value={String(value[field.key])} onSubmit={answer=>{if(typeof answer==="string"){setValue(v=>({...v,[field.key]:answer.trim()}));setEditing(false);setError("");}}}/>
     <text fg={g.muted}>El nombre exacto se comprueba contra Pi. La cuenta debe estar conectada localmente.</text>
   </box>:<box flexDirection="column" gap={0}>
     {fields.map((f,i)=><box key={f.key} flexDirection="row" height={2} backgroundColor={i===selected?g.focused:"transparent"}><text fg={g.secondary} width={20}>{i===selected?"› ":"  "}{f.label}</text><text fg={g.text}>{String(value[f.key])}</text></box>)}
     <text fg={selected===fields.length?g.highlight:g.secondary}>{selected===fields.length?"› ":"  "}Revisar y guardar</text>
     <text fg={g.muted}>No cambia equipos ni permisos. Sin fallback ni gasto habilitado automáticamente.</text>
   </box>}
   {error&&<text fg={g.danger}>{error}</text>}
 </Plate>;
}
