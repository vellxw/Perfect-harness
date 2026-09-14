import { Blocked } from "../domain/util.js";
import { relativePath, sensitive, secretContent } from "../tools/paths.js";
import type { Effect, IntegrationConfig, TransportConfig } from "./types.js";
export const GITHUB_ENDPOINT = "https://api.githubcopilot.com/mcp/";
export const GITHUB_READ_TOOLS = new Set([
  "get_file_contents", "get_commit", "list_commits", "list_branches", "list_tags", "get_tag", "list_issues", "issue_read", "list_pull_requests", "pull_request_read", "list_releases", "get_latest_release", "get_release_by_tag", "actions_list", "actions_get", "get_job_logs", "search_code", "search_issues", "search_pull_requests",
]);
export const GITHUB_WRITE_TOOLS = new Set(["create_branch", "push_files", "create_or_update_file", "create_pull_request", "add_issue_comment"]);
export function githubTransport(config:Extract<IntegrationConfig,{kind:"github"}>):TransportConfig{
  return {type:"http",url:GITHUB_ENDPOINT,bearerEnv:config.tokenEnv,allowLoopback:false,headers:{"X-MCP-Readonly":config.writeMode==="deny"?"true":"false","X-MCP-Lockdown":"true","X-MCP-Toolsets":"repos,issues,pull_requests,actions"}};
}
export function githubEffect(config:Extract<IntegrationConfig,{kind:"github"}>,tool:string):Effect|undefined{
  if(GITHUB_READ_TOOLS.has(tool))return "read";
  if(config.writeMode==="confirm"&&GITHUB_WRITE_TOOLS.has(tool))return "write";
  return undefined;
}
function requiredString(args:Record<string,unknown>,key:string):string{
  const value=args[key];if(typeof value!=="string"||!value.trim())throw new Blocked("GITHUB_SCOPE",`Falta ${key} explícito`);return value;
}
function branchAllowed(value:string,prefix:string):void{
  if(!value.startsWith(prefix)||value.length<=prefix.length||value.length>180||!/^[A-Za-z0-9_/-]+$/.test(value)||value.includes("//")||value.endsWith("/"))throw new Blocked("GITHUB_BRANCH",`Solo se puede publicar en ramas nuevas bajo ${prefix}`);
}
/** Known operations are scoped independently of server annotations and credential breadth. */
export function validateGithub(config:Extract<IntegrationConfig,{kind:"github"}>,tool:string,args:Record<string,unknown>):Effect{
  const effect=githubEffect(config,tool);if(!effect)throw new Blocked("GITHUB_TOOL_DENIED",`Herramienta no autorizada: ${tool}`);
  const repos=config.repositories.map(r=>r.toLowerCase());
  if(tool.startsWith("search_")){
    const q=requiredString(args,"query");const match=/^repo:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s+(.+)$/.exec(q);
    if(!match||!repos.includes(match[1]!.toLowerCase())||/(?:\b(?:repo|org|user|owner):|\b(?:OR|NOT)\b|[()\\\x00-\x1f])/i.test(match[2]!))throw new Blocked("GITHUB_SEARCH_SCOPE","La búsqueda debe comenzar por un único repo:propietario/repositorio autorizado, sin OR, negaciones ni calificadores que amplíen el ámbito");
  }else{
    const repo=`${requiredString(args,"owner")}/${requiredString(args,"repo")}`.toLowerCase();if(!repos.includes(repo))throw new Blocked("GITHUB_REPOSITORY_DENIED",`Repositorio fuera de la lista autorizada: ${repo}`);
  }
  if(effect==="write"){
    if(["create_branch","push_files","create_or_update_file"].includes(tool))branchAllowed(requiredString(args,"branch"),config.branchPrefix);
    if(tool==="create_pull_request")branchAllowed(requiredString(args,"head"),config.branchPrefix);
    if(args.force===true||args.force_push===true)throw new Blocked("GITHUB_FORCE_DENIED","No se permite force-push");
    if(tool==="push_files"||tool==="create_or_update_file"){
      const files=tool==="push_files"?args.files:[{path:args.path,content:args.content}];
      if(!Array.isArray(files)||!files.length||files.length>100)throw new Blocked("GITHUB_FILES","Lista de archivos inválida");
      for(const raw of files){
        if(!raw||typeof raw!=="object")throw new Blocked("GITHUB_FILES","Entrada inválida");
        const file=raw as Record<string,unknown>;const path=relativePath(String(file.path??""));
        if(sensitive(path)||/^(?:\.github|references|__snapshots__)(?:\/|$)/.test(path))throw new Blocked("GITHUB_PROTECTED_PATH",path);
        if(typeof file.content!=="string"||file.content.length>1_500_000)throw new Blocked("GITHUB_CONTENT","Contenido inválido o demasiado grande");
        const content=tool==="create_or_update_file"?Buffer.from(file.content,"base64").toString("utf8"):file.content;
        if(secretContent(content))throw new Blocked("GITHUB_SECRET","Se detectó contenido sensible en el cambio; no se publicará");
      }
    }
  }
  return effect;
}
