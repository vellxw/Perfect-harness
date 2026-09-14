import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { chromium, type Browser, type Page, type ElementHandle } from "playwright";
import { randomUUID } from "node:crypto";
import { BrowserSchemas, BROWSER_TOOLS, type BrowserTool } from "./tools.js";

/** Runs only in the dedicated browser container. It never sees project files or credentials. */
export class InteractiveBrowser {
  private browser?:Browser;
  private page?:Page;
  private snapshotId="";
  private observedAt=0;
  private elements=new Map<string,{handle:ElementHandle;signature:string}>();
  private messages:{type:string;text:string}[]=[];
  private actions=0;
  constructor(private origin:string,private maxActions=100){
    const parsed=new URL(origin);
    if(parsed.hostname!=="perfect-app.test"||parsed.protocol!=="http:"||parsed.pathname!=="/")throw Error("Origen del navegador interno inválido");
  }
  async start(width=1280,height=800,path="/"):Promise<unknown>{
    this.browser=await chromium.launch({headless:true});
    const context=await this.browser.newContext({viewport:{width,height},locale:"es-AR",timezoneId:"UTC",deviceScaleFactor:1,acceptDownloads:false,serviceWorkers:"block"});
    await context.route("**/*",async route=>{const url=new URL(route.request().url());if(url.origin===this.origin)await route.continue();else await route.abort("blockedbyclient");});
    context.on("page",page=>{if(this.page&&page!==this.page)void page.close();});
    this.page=await context.newPage();
    this.page.on("console",m=>{this.messages.push({type:m.type(),text:m.text().slice(0,2000)});if(this.messages.length>200)this.messages.shift();});
    this.page.on("pageerror",e=>{this.messages.push({type:"pageerror",text:e.message.slice(0,2000)});if(this.messages.length>200)this.messages.shift();});
    this.page.on("dialog",dialog=>{void dialog.dismiss();});
    this.page.setDefaultTimeout(10000);
    return this.navigate(path);
  }
  private requirePage():Page{if(!this.page||this.page.isClosed())throw Error("Navegador cerrado; iniciá otra sesión");return this.page;}
  private mutate():void{if(++this.actions>this.maxActions)throw Error("BROWSER_ACTION_LIMIT: límite de interacciones agotado");}
  private signature(handle:ElementHandle):Promise<string>{return handle.evaluate(e=>JSON.stringify({tag:e.tagName,type:e.getAttribute("type"),text:(e.textContent??"").slice(0,160),name:e.getAttribute("aria-label")??e.getAttribute("name"),href:e.getAttribute("href"),disabled:e.hasAttribute("disabled")}));}
  async snapshot():Promise<unknown>{
    const page=this.requirePage();
    for(const e of this.elements.values())await e.handle.dispose().catch(()=>{});
    this.elements.clear();this.snapshotId=randomUUID();this.observedAt=Date.now();
    const refs:{ref:string;tag:string;role:string|null;label:string;type:string|null}[]=[];
    const handles=await page.$$("a,button,input,textarea,select,[role=button],[role=link],[role=checkbox],[contenteditable=true]");
    for(const handle of handles.slice(0,250)){
      const box=await handle.boundingBox();if(!box||box.width<=0||box.height<=0){await handle.dispose();continue;}
      const meta=await handle.evaluate(e=>({tag:e.tagName.toLowerCase(),role:e.getAttribute("role"),type:e.getAttribute("type"),label:(e.getAttribute("aria-label")??e.getAttribute("placeholder")??e.textContent??"").slice(0,160)}));
      if(meta.type==="password"||meta.type==="file"||await handle.evaluate(e=>Boolean(e.closest("[data-perfect-private]")))){await handle.dispose();continue;}
      const ref=`e${refs.length}`;this.elements.set(ref,{handle,signature:await this.signature(handle)});refs.push({ref,...meta});
    }
    for(const h of handles.slice(250))await h.dispose();
    const dimensions=await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
    return {snapshot:this.snapshotId,url:page.url(),title:await page.title(),...dimensions,elements:refs,accessibility:(await page.locator("body").ariaSnapshot()).slice(0,16000),actions:this.actions,maxActions:this.maxActions,untrusted:true};
  }
  private async element(snapshot:string,ref:string):Promise<ElementHandle>{
    if(snapshot!==this.snapshotId||Date.now()-this.observedAt>90000)throw Error("BROWSER_STALE_SNAPSHOT: observá nuevamente antes de actuar");
    const item=this.elements.get(ref);if(!item||!await item.handle.evaluate(e=>e.isConnected)||await this.signature(item.handle)!==item.signature)throw Error("BROWSER_STALE_ELEMENT: el elemento cambió desde la observación");
    return item.handle;
  }
  async navigate(path:string):Promise<unknown>{
    this.mutate();const url=new URL(path,this.origin);
    if(!path.startsWith("/")||path.startsWith("//")||url.origin!==this.origin)throw Error("BROWSER_ORIGIN: solo rutas de la aplicación aislada");
    await this.requirePage().goto(url.href,{waitUntil:"domcontentloaded",timeout:30000});return this.snapshot();
  }
  async call(name:BrowserTool,raw:unknown):Promise<{content:({type:"text";text:string}|{type:"image";data:string;mimeType:string})[]}>{
    const args=BrowserSchemas[name].parse(raw) as Record<string,unknown>;
    const page=this.requirePage();let result:unknown;
    if(name==="browser_snapshot")result=await this.snapshot();
    else if(name==="browser_console")result={messages:this.messages,untrusted:true};
    else if(name==="browser_screenshot")return {content:[{type:"text",text:JSON.stringify({url:page.url(),snapshot:this.snapshotId,untrusted:true})},{type:"image",data:(await page.screenshot({type:"png",fullPage:false,mask:[page.locator('input[type="password"],[data-perfect-private]')]})).toString("base64"),mimeType:"image/png"}]};
    else if(name==="browser_navigate")result=await this.navigate(String(args.path));
    else if(name==="browser_close"){await this.close();result={closed:true};}
    else if(name==="browser_resize"){this.mutate();await page.setViewportSize({width:Number(args.width),height:Number(args.height)});result=await this.snapshot();}
    else if(name==="browser_scroll"){this.mutate();await page.mouse.wheel(0,Number(args.deltaY));await page.waitForTimeout(80);result=await this.snapshot();}
    else {
      this.mutate();const handle=await this.element(String(args.snapshot),String(args.ref));
      if(name==="browser_click")await handle.click();
      else if(name==="browser_fill")await handle.fill(String(args.value));
      else if(name==="browser_select")await handle.selectOption(args.values as string[]);
      else if(name==="browser_press")await handle.press(args.key==="Space"?" ":String(args.key));
      else throw Error("Herramienta desconocida");
      await page.waitForTimeout(80);result=await this.snapshot();
    }
    return {content:[{type:"text",text:JSON.stringify(result)}]};
  }
  async close():Promise<void>{await this.browser?.close();this.page=undefined;this.browser=undefined;this.elements.clear();}
}
export async function serveBrowser():Promise<void>{
  const origin=process.env.PERFECT_BROWSER_ORIGIN;
  if(!origin)throw Error("Este servidor solo se inicia mediante el navegador aislado de Perfect");
  const browser=new InteractiveBrowser(origin,Number(process.env.PERFECT_BROWSER_MAX_ACTIONS??100));
  const server=new McpServer({name:"perfect-isolated-browser",version:"0.3.0"});
  for(const tool of BROWSER_TOOLS.filter(t=>t.name!=="browser_open")){
    const name=tool.name as BrowserTool;
    server.registerTool(name,{description:tool.description,inputSchema:BrowserSchemas[name]},async(args)=>{
      try{return await browser.call(name,args);}catch(error){return {isError:true,content:[{type:"text" as const,text:error instanceof Error?error.message:String(error)}]};}
    });
  }
  await browser.start(Number(process.env.PERFECT_BROWSER_WIDTH??1280),Number(process.env.PERFECT_BROWSER_HEIGHT??800),process.env.PERFECT_BROWSER_PATH??"/");
  const transport=new StdioServerTransport();
  transport.onclose=()=>{void browser.close().finally(()=>process.exit(0));};
  process.on("SIGTERM",()=>{void browser.close().finally(()=>process.exit(0));});
  process.stdin.on("end",()=>{void browser.close().finally(()=>process.exit(0));});
  await server.connect(transport);
}
if(process.env.PERFECT_BROWSER_ORIGIN)void serveBrowser().catch(e=>{console.error(String(e));process.exitCode=1;});
