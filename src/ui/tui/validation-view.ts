import type{UiSnapshot}from"../../presentation/protocol.js";
import type{Row}from"./views.js";
import type{StudioIntent}from"./studio-view.js";
import type{ValidationStatus}from"../../validation/center.js";
const label=(s:ValidationStatus)=>({PASS:"Aprobado",FAIL:"Falló",BLOCKED:"Bloqueado",UNCONFIGURED:"Sin configurar",NOT_TESTED:"No probado",NOT_APPLICABLE:"No corresponde"})[s];
export function validationRows(s:UiSnapshot):Row[]{
 const report=s.studio?.validation;
 const result:Row[]=[{id:"validation-check",title:"Revisar configuración local",detail:"Sin inferencias, compras ni uso del escritorio",body:"Detectado/configurado no equivale a autenticado, invocado o verificado. El diagnóstico no consume cuota."},{id:"validation-cancel",title:"Detener pruebas locales",detail:"Cancelar las pruebas activas sin borrar evidencia",body:"Solicita cancelación y conserva resultados parciales."}];
 if(!report)return result;
 result.push({id:"validation-export",title:"Exportar informe saneado",detail:`${report.build.version} · ${report.build.platform} · ${report.build.sourceCommit.slice(0,8)}`,body:"Solo estado y procedencia. No incluye claves, prompts, rutas personales ni logs privados."});
 for(const c of report.checks)result.push({id:"capability:"+c.id,title:c.title,detail:!c.implemented?"Adaptador no implementado":`${label(c.configured)} · resultado: ${label(c.verified)}`,body:[`Implementado: ${c.implemented?"sí":"no"}`,`Detectado: ${label(c.detected)}`,`Configurado: ${label(c.configured)}`,`Autorizado: ${label(c.authorized)}`,`Autenticado: ${label(c.authenticated)}`,`Invocado: ${label(c.invoked)}`,`Verificado: ${label(c.verified)}`,"",c.detail,"",c.next].join("\n"),status:c.verified==="PASS"?"completed":c.verified==="FAIL"?"failed":"waiting"});
 return result;
}
export function validationIntent(s:UiSnapshot,rowId:string):StudioIntent|undefined{
 const action=(command:"validation-check"|"validation-export"|"validation-cancel"):StudioIntent=>({action:{type:"studio",action:{command}}});
 if(rowId==="validation-check"||rowId==="validation-export"||rowId==="validation-cancel")return action(rowId);
 if(!rowId.startsWith("capability:"))return;
 const capability=s.studio?.validation?.checks.find(c=>c.id===rowId.slice(11));if(!capability||!capability.implemented)return;
 if(capability.profileId){
  const p=s.studio!.config.profiles.find(p=>p.id===capability.profileId);if(!p)return;
  const contributor=p.binding.model.includes("contributor");
  return {title:"Probar una ruta real",phrase:"PROBAR",body:`Perfil: ${p.name}\n${p.binding.provider}/${p.binding.model} · ${p.binding.reasoning}\nCuenta: ${p.binding.accountRef}\n\nSe enviarán datos de diagnóstico sintéticos e imágenes de colores, no código de tu proyecto. Consume cuota. Sin fallback ni rutas por consumo. ${contributor?"Esta confirmación autoriza esos datos sintéticos a Contributor; no autoriza tu código privado.":""}`,action:{type:"studio",action:{command:"validation-profile",profileId:p.id,contributorConsent:contributor,confirmation:"PROBAR"}}};
 }
 if(capability.id==="blender")return {title:"Probar Blender local",phrase:"RENDERIZAR",body:"Ejecuta un fixture aislado: fuente editable, reapertura independiente, GLB y render. Requiere las imágenes Docker preparadas; no instala Blender ni usa tu desktop automáticamente.",action:{type:"studio",action:{command:"validation-blender",confirmation:"RENDERIZAR"}}};
 return {notice:capability.next};
}
