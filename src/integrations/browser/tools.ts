import { z } from "zod";
import { CommandSchema } from "../../domain/model.js";
import type { CatalogTool, Effect } from "../types.js";
const observed = { snapshot: z.string().uuid(), ref: z.string().regex(/^e[0-9]{1,4}$/) };
export const BrowserSchemas = {
  browser_open: z.object({server:CommandSchema,port:z.number().int().min(1024).max(65535),path:z.string().default("/"),width:z.number().int().min(240).max(1920).default(1280),height:z.number().int().min(240).max(1080).default(800)}).strict(),
  browser_snapshot:z.object({}).strict(),
  browser_navigate:z.object({path:z.string().max(2048)}).strict(),
  browser_click:z.object(observed).strict(),
  browser_fill:z.object({...observed,value:z.string().max(10000)}).strict(),
  browser_select:z.object({...observed,values:z.array(z.string().max(500)).min(1).max(20)}).strict(),
  browser_press:z.object({...observed,key:z.enum(["Enter","Tab","Escape","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Backspace","Space"])}).strict(),
  browser_scroll:z.object({deltaY:z.number().int().min(-3000).max(3000)}).strict(),
  browser_resize:z.object({width:z.number().int().min(240).max(1920),height:z.number().int().min(240).max(1080)}).strict(),
  browser_screenshot:z.object({}).strict(),
  browser_console:z.object({}).strict(),
  browser_close:z.object({}).strict(),
};
export type BrowserTool = keyof typeof BrowserSchemas;
const descriptions:Record<BrowserTool,string> = {
  browser_open:"Iniciar la aplicación de esta tarea en Docker y abrir un navegador aislado. Solo acepta un comando permitido en una copia saneada, no una URL externa ni el perfil personal.",
  browser_snapshot:"Observar la página actual: estructura accesible, texto y referencias a elementos. Una observación no equivale a una prueba aprobada.",
  browser_navigate:"Navegar a una ruta de la aplicación aislada, conservando la sesión.",
  browser_click:"Pulsar un elemento observado. Requiere la referencia y el identificador de la última observación.",
  browser_fill:"Completar un campo observado. No permite campos de contraseña ni carga de archivos.",
  browser_select:"Elegir opciones de un selector observado.",
  browser_press:"Pulsar una tecla permitida sobre un elemento observado.",
  browser_scroll:"Desplazar verticalmente la página aislada.",
  browser_resize:"Cambiar la ventana del navegador para inspección adaptable.",
  browser_screenshot:"Capturar los píxeles reales de la ventana actual; campos privados enmascarados.",
  browser_console:"Leer errores de página y consola de esta sesión aislada.",
  browser_close:"Cerrar el navegador de esta ejecución y sus contenedores.",
};
export const BROWSER_TOOLS:CatalogTool[]=Object.entries(BrowserSchemas).map(([name,schema])=>({name,description:descriptions[name as BrowserTool],inputSchema:z.toJSONSchema(schema) as Record<string,unknown>}));
export function browserEffect(tool:string):Effect|undefined{
  if(!Object.hasOwn(BrowserSchemas,tool))return undefined;
  return ["browser_snapshot","browser_screenshot","browser_console"].includes(tool)?"read":"interactive";
}
