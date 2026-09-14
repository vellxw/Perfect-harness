import type { UiSnapshot, Screen, UiAction } from "../../presentation/protocol.js";
import type { StudioAction } from "../../skills/actions.js";
import type { Row } from "./views.js";
import { splitArguments } from "../../cli/shell.js";
import { text } from "../../presentation/protocol.js";

export interface StudioIntent { screen?: Screen; subject?: string; title?: string; body?: string; phrase?: string; action?: UiAction; notice?: string; composer?: string; editProfile?: string }
const action = (a: StudioAction): UiAction => ({ type: "studio", action: a });
export const studioScreens = ["skills", "teams", "profiles", "modes", "skill-detail", "team-detail", "profile-detail"] as const;
export const studioLabels: Record<string, string> = { skills: "Habilidades", teams: "Equipos", profiles: "Perfiles y modelos", modes: "Modos de trabajo", "skill-detail": "Habilidad · disponibilidad y ámbitos", "team-detail": "Equipo · miembros y acceso", "profile-detail": "Perfil · modelo y conocimientos" };
const row = (id: string, title: string, detail: string, body = detail, enabled?: boolean): Row => ({ id, title: text(title, 140), detail: text(detail, 240), body: text(body, 200000), status: enabled === undefined ? "info" : enabled ? "completed" : "waiting" });
const HELP = "HABILIDADES POR EQUIPOS\n\nEl interruptor general bloquea todas las lecturas. Manual permite cargas explícitas; automático selecciona dentro del equipo. Global significa disponible para todos, no cargada siempre. Una exclusión vence a una asignación global.\n\n/skills · /equipos · /perfiles · /modos\n/skill-importar /ruta/manifiesto.json\n/equipo id Nombre del equipo\n/crear-skill Describí el procedimiento y su equipo\n/juegos · /motion\n\nLas activaciones de sesiones anteriores se conservan. Un cambio de ajustes pausa la sesión activa; para adoptar perfiles nuevos en una goal en pausa usá /adoptar-perfiles y después /reanudar. No se reescribe el historial ni se concede gasto o herramientas.\n\nLos modelos actuales se auditan en /modelos. /perfiles permite modificarlos para nuevas ejecuciones.\n\nImportación pública: manifiesto con repository, commit SHA completo, path, licenseFiles, defaultSets, triggers y localOnly. No instala hooks ni ejecutables. Transitions gratuito es local; Dashi espera licencia. Superpowers sigue apagado salvo decisión expresa.";
export function studioRows(s: UiSnapshot, screen: string, subject = ""): Row[] {
  const p = s.studio;
  if (!p) return [row("studio-load", "Cargar habilidades y equipos", "Lee ajustes locales; no hace inferencias")];
  const cfg = p.config, result: Row[] = [];
  if (screen === "skills") {
    result.push(row("master", "Sistema de habilidades", p.masterEnabled ? "Habilitado · Enter apaga para todas las carpetas" : "Apagado · ninguna skill llega a los agentes", HELP, p.masterEnabled));
    result.push(row("skill-mode", "Selección de esta carpeta", ({off:"Desactivada",manual:"Manual", "auto-curated":"Automática dentro de equipos"})[cfg.skills.mode] + " · Enter cambia", HELP));
    result.push(row("package:superpowers", "Superpowers", cfg.skills.disabledPackages.includes("superpowers") ? "Desactivado · incluye hooks y subskills" : "Paquete permitido; solo contenido importado y revisado", HELP, !cfg.skills.disabledPackages.includes("superpowers")));
    for (const skill of p.skills) result.push(row(`skill:${skill.releaseId}`, skill.name, `${skill.status} · ${skill.defaultSets.join(", ")}`, JSON.stringify(skill,null,2), skill.enabled && !cfg.skills.disabledPackages.includes(skill.packageId)));
    result.push(row("creator", "Crear una habilidad", "Procedimiento enfocado, casos de prueba y aprobación separada", HELP));
    for (const c of p.candidates) if (c.id !== "superpowers") result.push(row(`candidate:${c.id}`, c.id, c.status, `${c.reason}\n\n${c.source}\n\nNo equivale a una skill instalada o probada.`));
    result.push(row("help", "Cómo importar y asignar", "Formato, permisos y desactivación", HELP));
  } else if (screen === "teams") {
    for (const set of cfg.sets) result.push(row(`team:${set.id}`, set.name, `${cfg.profiles.filter(p=>p.setIds.includes(set.id)).length} perfiles · ${set.enabled?"habilitado":"desactivado"}`, JSON.stringify(set,null,2), set.enabled));
    result.push(row("team-new", "Crear equipo", "/equipo id Nombre del equipo", HELP));
  } else if (screen === "profiles") {
    for (const profile of cfg.profiles) result.push(row(`profile:${profile.id}`, profile.name, `${profile.binding.model} · ${profile.binding.reasoning} · ${profile.setIds.join(", ")}`, JSON.stringify(profile,null,2), profile.enabled));
  } else if (screen === "modes") {
    for (const mode of cfg.modes) result.push(row(`mode:${mode.id}`, mode.name, `${cfg.activeMode===mode.id?"Seleccionado":"Disponible"} · ${mode.profiles.length} perfiles`, `${mode.instruction}\n\n${JSON.stringify(mode.defaults,null,2)}\n\nCambiar el modo no altera objetivos previos.`, cfg.activeMode===mode.id));
  } else if (screen === "skill-detail") {
    const skill = p.skills.find(v=>v.releaseId===subject); if(!skill)return [row("help","Versión no disponible","Volvé a /skills")];
    result.push(row("inspect", "Inspeccionar versión y licencia", `${skill.hash.slice(0,16)} · ${skill.license}`, JSON.stringify(skill,null,2)));
    result.push(row("skill-toggle",skill.enabled?"Desactivar habilidad":"Habilitar habilidad",skill.reviewed?"Conserva ámbitos y exclusiones":"Requiere revisar y aprobar la versión",HELP,skill.enabled));
    result.push(row("skill-evaluate","Evaluar estructura","Sin inferencias; no demuestra mejora del modelo"));
    const assigned=(scope:string,target?:string)=>cfg.skills.assignments.find(a=>a.skillId===skill.id&&a.scope===scope&&a.target===target)?.decision??"inherit";
    const label=(decision:string)=>({inherit:"Heredar",enable:"Activar",disable:"Desactivar"})[decision]??decision;
    result.push(row("assign:global", "Disponibilidad global", `${label(assigned("global"))} · Enter cambia`, "Se ofrece a todos los perfiles salvo exclusiones; no fuerza su carga."));
    for(const set of cfg.sets) result.push(row(`assign:set:${set.id}`,set.name,label(assigned("set",set.id)),"Una exclusión de equipo prevalece sobre activación global."));
    for(const profile of cfg.profiles) result.push(row(`assign:profile:${profile.id}`,`Perfil · ${profile.name}`,label(assigned("profile",profile.id)),"La exclusión de su equipo permanece vigente."));
  } else if (screen === "team-detail") {
    const set=cfg.sets.find(v=>v.id===subject);if(!set)return [];
    result.push(row("team-toggle",set.enabled?"Desactivar equipo":"Activar equipo",set.name,HELP,set.enabled));
    result.push(row("team-rename","Renombrar equipo",set.name));
    for(const profile of cfg.profiles)result.push(row(`membership:${profile.id}`,profile.name,profile.setIds.includes(set.id)?"Miembro · Enter quitar":"No pertenece · Enter añadir",JSON.stringify(profile,null,2),profile.setIds.includes(set.id)));
  } else if (screen === "profile-detail") {
    const profile=cfg.profiles.find(v=>v.id===subject);if(!profile)return [];
    result.push(row("profile-toggle",profile.enabled?"Desactivar perfil":"Activar perfil",`${profile.role} · ${profile.readOnly?"solo lectura":"escritura controlada"}`,JSON.stringify(profile,null,2),profile.enabled));
    result.push(row("binding-edit","Cambiar proveedor/modelo/reasoning",`${profile.binding.provider}/${profile.binding.model}`,"Conserva equipos y permisos. Una ruta incompatible se bloquea; no hay fallback."));
    result.push(row("model-catalog","Consultar catálogo de modelos","No hace inferencias; acceso de cuenta se comprueba antes de ejecutar"));
    for(const set of cfg.sets)result.push(row(`profile-set:${set.id}`,set.name,profile.setIds.includes(set.id)?"Asignado · Enter quitar":"No asignado · Enter añadir",HELP,profile.setIds.includes(set.id)));
    result.push(row("profile-inspect","Detalles del perfil",profile.id,JSON.stringify(profile,null,2)));
  }
  return result;
}
function confirmed(a: StudioAction, title: string, body: string, phrase="APLICAR"): StudioIntent {return {title,body,phrase,action:action(a)};}
export function studioRowIntent(s: UiSnapshot, screen: string, subject: string, id: string): StudioIntent | undefined {
  const p=s.studio;if(!p)return {action:action({command:"status"})};
  const c=p.config,expectedHash=p.hash;
  if(screen==="skills"){
    if(id==="master")return p.masterEnabled?{action:action({command:"master",enabled:false})}:confirmed({command:"master",enabled:true,confirmation:"ACTIVAR"},"Activar habilidades","Se conservan los permisos y exclusiones de cada carpeta.","ACTIVAR");
    if(id==="skill-mode")return {action:action({command:"skill-mode",mode:({off:"manual",manual:"auto-curated","auto-curated":"off"} as const)[c.skills.mode],expectedHash})};
    if(id==="package:superpowers"){const enabled=c.skills.disabledPackages.includes("superpowers");return enabled?confirmed({command:"package",id:"superpowers",enabled,expectedHash,confirmation:"ACTIVAR"},"Permitir Superpowers","Puede agregar procesos y contexto. Esto solo permite versiones importadas/revisadas; no instala ni activa hooks.","ACTIVAR"):{action:action({command:"package",id:"superpowers",enabled,expectedHash})};}
    if(id.startsWith("skill:"))return {screen:"skill-detail",subject:id.slice(6)};
    if(id==="creator")return {composer:"/crear-skill "};
  }
  if(screen==="teams"){
    if(id==="team-new")return {composer:"/equipo "};
    if(id.startsWith("team:"))return {screen:"team-detail",subject:id.slice(5)};
  }
  if(screen==="profiles"&&id.startsWith("profile:"))return {screen:"profile-detail",subject:id.slice(8)};
  if(screen==="modes"&&id.startsWith("mode:")){const mode=c.modes.find(m=>m.id===id.slice(5))!;return confirmed({command:"mode",modeId:mode.id,expectedHash},`Seleccionar ${mode.name}`,mode.instruction+"\n\nAfecta nuevas ejecuciones; no cambia la goal anterior.");}
  if(screen==="skill-detail"){
    const skill=p.skills.find(v=>v.releaseId===subject);if(!skill)return;
    if(id==="inspect")return {action:action({command:"inspect",releaseId:skill.releaseId})};
    if(id==="skill-evaluate")return {action:action({command:"evaluate",releaseId:skill.releaseId,partition:"development"})};
    if(id==="skill-toggle")return skill.reviewed?{action:action({command:"selection",skillId:skill.id,enabled:!skill.enabled,hash:skill.hash})}:confirmed({command:"approve",releaseId:skill.releaseId,hash:skill.hash,confirmation:"APROBAR"},"Aprobar la habilidad revisada",`Revisá primero su contenido y licencia.\n${skill.name}\n${skill.hash}\n${skill.license}\n\nNo autoriza scripts ni demuestra calidad de inferencia.","APROBAR");
    if(id.startsWith("assign:")){
      const [,scope,target]=id.split(":");if(!["global","set","profile"].includes(scope!))return;
      const old=c.skills.assignments.find(a=>a.skillId===skill.id&&a.scope===scope&&a.target===target)?.decision??"inherit";
      return {action:action({command:"assign",assignment:{skillId:skill.id,scope:scope as "global"|"set"|"profile",target,decision:({inherit:"enable",enable:"disable",disable:"inherit"}as const)[old]},expectedHash})};
    }
  }
  if(screen==="team-detail"){
    const set=c.sets.find(v=>v.id===subject);if(!set)return;
    if(id==="team-toggle")return {action:action({command:"set",set:{...set,enabled:!set.enabled},expectedHash})};
    if(id==="team-rename")return {composer:`/equipo ${set.id} ${set.name}`};
    if(id.startsWith("membership:")){
      const profile=c.profiles.find(p=>p.id===id.slice(11));if(!profile)return;
      const setIds=profile.setIds.includes(set.id)?profile.setIds.filter(x=>x!==set.id):[...profile.setIds,set.id];
      if(!setIds.length)return {notice:"Un perfil necesita al menos un equipo."};
      return confirmed({command:"profile",profile:{...profile,setIds},expectedHash},"Cambiar los conocimientos del perfil",`${profile.name}\nEquipos: ${setIds.join(", ")}\nNo cambia modelo ni permisos.`);
    }
  }
  if(screen==="profile-detail"){
    const profile=c.profiles.find(v=>v.id===subject);if(!profile)return;
    if(id==="binding-edit")return {editProfile:profile.id};
    if(id==="model-catalog")return {action:action({command:"catalog",profileId:profile.id,query:""})};
    if(id==="profile-toggle")return {action:action({command:"profile",profile:{...profile,enabled:!profile.enabled},expectedHash})};
    if(id.startsWith("profile-set:")){
      const setId=id.slice(12),setIds=profile.setIds.includes(setId)?profile.setIds.filter(x=>x!==setId):[...profile.setIds,setId];
      if(!setIds.length)return {notice:"Un perfil necesita al menos un equipo."};
      return confirmed({command:"profile",profile:{...profile,setIds},expectedHash},"Cambiar equipo del perfil",`${profile.name}\nEquipos: ${setIds.join(", ")}`);
    }
  }
  return;
}
export function studioCommand(name: string, rest: string, s: UiSnapshot): StudioIntent | undefined {
  const names: Record<string,Screen>={skills:"skills",habilidades:"skills",equipos:"teams",teams:"teams",perfiles:"profiles",profiles:"profiles",modos:"modes",modes:"modes"};
  if(names[name])return {screen:names[name],action:action({command:"status"})};
  if(["juegos","motion"].includes(name)) {
    if(!s.studio)return {screen:"modes",action:action({command:"status"}),notice:"Seleccioná el modo en la lista."};
    const modeId=name==="juegos"?"game-creator":"motion-studio";
    return confirmed({command:"mode",modeId,expectedHash:s.studio.hash},"Cambiar modo de trabajo",`Modo: ${modeId}. Conserva los objetivos anteriores y sus límites.`);
  }
  if(name==="crear-skill")return rest.trim()?{action:{type:"create-skill",description:rest.trim()},screen:"home"}:{composer:"/crear-skill ",notice:"Describí el procedimiento, su equipo y cómo verificarlo."};
  if(name==="adoptar-perfiles"){
    if(!s.studio||!s.goal)return {notice:"Seleccioná una goal en pausa y abrí /skills primero."};
    return confirmed({command:"adopt",goalId:s.goal.id,expectedHash:s.studio.hash,confirmation:"APLICAR"},"Reiniciar con ajustes actuales","Solo objetivos en pausa. Se conservan criterios, intentos y evidencia; las nuevas sesiones usan perfiles y skills actuales. No cambia el modo de un plan aceptado.");
  }
  if(name==="equipo"){
    if(!s.studio)return {screen:"teams",action:action({command:"status"})};
    let args:string[];try{args=splitArguments(rest);}catch{return {notice:"Comillas incompletas"};}
    const [id,...label]=args;
    if(!id||!label.length)return {composer:"/equipo ",notice:"Formato: /equipo id Nombre del equipo"};
    return {action:action({command:"set",set:{id,name:label.join(" "),enabled:s.studio.config.sets.find(s=>s.id===id)?.enabled??true},expectedHash:s.studio.hash}),screen:"teams"};
  }
  if(name==="skill-importar")return {notice:"Usá la CLI: perfect habilidades importar manifiesto.json --si. La importación pública requiere commit exacto; luego revisá el contenido en /skills."};
  return;
}
