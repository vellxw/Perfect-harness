import { app, BrowserWindow, WebContentsView, ipcMain, protocol, dialog, shell, session, Menu, nativeTheme, clipboard, powerMonitor } from "electron";
import { readFile, realpath, mkdir, writeFile, lstat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { homedir } from "node:os";
import { z } from "zod";
import { EngineBroker } from "./broker.js";
import { APP_ORIGIN, EnvelopeSchema, parseRange, approvedNavigation, type DesktopBoot } from "../contracts/protocol.js";

protocol.registerSchemesAsPrivileged([{scheme:'perfect',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,codeCache:true}}]);
app.setName('Perfect Harness');
const argument=(name:string)=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
const home=resolve(argument('--home')??join(homedir(),'.perfect'));
app.setPath('userData',join(home,'desktop-shell'));
if(!app.requestSingleInstanceLock()){app.quit();}else{void launch().catch(async error=>{await app.whenReady();dialog.showErrorBox('No se pudo abrir Perfect',String(error));app.exit(1);});}
let window:BrowserWindow,broker:EngineBroker,preview:WebContentsView|undefined,previewOrigin:string|undefined;
const sessionId=randomUUID(),consumed=new Set<string>(),pendingActions=new Set<string>(),grantedPaths=new Set<string>(),authUrls=new Set<string>();
const media=new Map<string,{path:string;mime:string;size:number;sha256:string}>();
let closing=false,workspace='';
const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.glb':'model/gltf-binary','.css':'text/css','.js':'text/javascript','.html':'text/html','.svg':'image/svg+xml'};
function assertSender(event:{sender:Electron.WebContents;senderFrame:Electron.WebFrameMain|null}){
 if(!window||event.sender!==window.webContents||!event.senderFrame||event.senderFrame!==window.webContents.mainFrame||!event.senderFrame.url.startsWith(APP_ORIGIN+'/'))throw Error('Emisor IPC no autorizado');
}
function detachPreview(){if(preview){window.contentView.removeChildView(preview);preview.webContents.close();preview=undefined;previewOrigin=undefined;}if(window&&!window.isDestroyed())window.webContents.send('perfect:event',{type:'preview',open:false});}
async function launch(){
 await mkdir(home,{recursive:true,mode:0o700});
 const root=app.isPackaged?join(process.resourcesPath,'engine'):resolve(app.getAppPath(),'..');
 const dev=app.isPackaged?undefined:JSON.parse(await readFile(join(app.getAppPath(),'engine-dev.json'),'utf8')) as {node:string};
 const node=app.isPackaged?join(root,'runtime',process.platform==='win32'?'node.exe':'node'):dev!.node;
 let recent:{workspace?:string}={};try{recent=JSON.parse(await readFile(join(home,'desktop.json'),'utf8'));}catch{}
 workspace=await realpath(argument('--workspace')??recent.workspace??homedir());
 await app.whenReady();
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Perfect',submenu:[{role:'about'},{type:'separator'},{role:'quit'}]},{label:'Editar',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'Ver',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}]));
 const assetsRoot=app.getAppPath();
 protocol.handle('perfect',async request=>{
  try{
   const url=new URL(request.url);
   if(url.host==='app'){
    let path=decodeURIComponent(url.pathname);if(path==='/')path='/index.html';
    if(!/^\/(?:index\.html|renderer(?:-[A-Za-z0-9]+)?\.(?:js|css)|chunks\/[A-Za-z0-9_.-]+\.js|assets\/[a-z0-9_.-]+)$/.test(path))return new Response('No disponible',{status:404});
    const bytes=await readFile(join(assetsRoot,path));
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':mime[extname(path)]??'application/octet-stream','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' perfect: data:; media-src perfect:; connect-src 'self' perfect:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff'}});
   }
   if(url.host==='media'){
    const entry=media.get(url.pathname.slice(1));if(!entry)return new Response('No autorizado',{status:403});
    const stat=await lstat(entry.path);if(stat.isSymbolicLink()||stat.nlink!==1||stat.size!==entry.size)throw Error('Recurso alterado');
    const bytes=await readFile(entry.path);if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Hash de recurso alterado');
    const r=parseRange(request.headers.get('range'),bytes.length);
    return new Response(new Uint8Array(bytes.subarray(r.start,r.end+1)),{status:r.partial?206:200,headers:{'Content-Type':entry.mime,'Accept-Ranges':'bytes','Content-Length':String(r.end-r.start+1),...(r.partial?{'Content-Range':`bytes ${r.start}-${r.end}/${bytes.length}`} : {}),'Content-Security-Policy':"default-src 'none'",'Access-Control-Allow-Origin':APP_ORIGIN,'X-Content-Type-Options':'nosniff'}});
   }
   return new Response('No autorizado',{status:403});
  }catch{return new Response('Recurso no disponible o alterado',{status:416});}
 });
 const secure={nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false};
 window=new BrowserWindow({width:1440,height:900,minWidth:860,minHeight:580,title:'Perfect Harness',backgroundColor:'#080a10',autoHideMenuBar:true,show:false,icon:join(assetsRoot,'assets','perfect.ico'),...(process.platform==='win32'?{backgroundMaterial:'mica' as const}:{}),webPreferences:{...secure,preload:join(assetsRoot,'preload.cjs')}});
 const defaultSession=window.webContents.session;defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));defaultSession.setPermissionCheckHandler(()=>false);
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(APP_ORIGIN+'/'))event.preventDefault();});
 defaultSession.on('will-download',event=>event.preventDefault());
 window.webContents.on('context-menu',(_event,params)=>{const items:Electron.MenuItemConstructorOptions[]=[];if(params.selectionText)items.push({role:'copy'});if(params.isEditable)items.push({role:'cut'},{role:'paste'},{role:'selectAll'});if(items.length)Menu.buildFromTemplate(items).popup({window});});
 broker=new EngineBroker(node,join(root,'dist','desktop','engine','worker.js'),home,workspace);
 broker.on('event',event=>{
  if(event.type==='engine'&&event.message.type==='auth'&&event.message.url){try{const u=new URL(event.message.url);if(u.protocol==='https:'&&!u.username&&!u.password)authUrls.add(u.href);}catch{}}
  if(event.type==='engine'&&event.message.type==='snapshot'&&event.message.snapshot.workspace!==workspace){workspace=event.message.snapshot.workspace;media.clear();grantedPaths.clear();detachPreview();void writeFile(join(home,'desktop.json'),JSON.stringify({workspace}),{mode:0o600});}
  if(!window.isDestroyed())window.webContents.send('perfect:event',event);
 });
 ipcMain.handle('perfect:boot',event=>{assertSender(event);return {protocol:1,sessionId,workspaceId:broker.workspaceId,version:app.getVersion(),buildId:process.env.GITHUB_SHA??'local',snapshot:broker.snapshot,connected:broker.connected,systemReducedMotion:nativeTheme.shouldUseReducedMotion,platform:process.platform} satisfies DesktopBoot;});
 ipcMain.handle('perfect:drop',async(event,raw)=>{
  assertSender(event);const paths=z.array(z.string().min(1).max(4096)).max(16).parse(raw);const checked:string[]=[];
  for(const p of paths){const st=await lstat(p);if(st.isSymbolicLink()||!st.isFile()||st.size>25_000_000||/(?:^|[\\/])(?:\.env|\.ssh|credentials|auth\.json)/i.test(p))throw Error('Adjunto privado o incompatible');checked.push(await realpath(p));}
  const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Cancelar','Seleccionar archivos'],defaultId:0,cancelId:0,message:'Seleccionar estos archivos locales',detail:checked.join('\n')+'\nNo se enviarán a ningún modelo automáticamente.'});if(answer.response!==1)return[];for(const p of checked)grantedPaths.add(p);return checked;
 });
 ipcMain.handle('perfect:request',async(event,raw)=>{
  assertSender(event);const envelope=EnvelopeSchema.parse(raw);
  try{
   if(envelope.sessionId!==sessionId||envelope.workspaceId!==broker.workspaceId)throw Error('Sesión o carpeta obsoleta: actualizá antes de actuar');
   if(consumed.has(envelope.requestId))throw Error('Solicitud duplicada; no se repitió');if(consumed.size>=10000)throw Error('Reabrí después de pausar para renovar la sesión');consumed.add(envelope.requestId);
   const p=envelope.payload;let data:unknown;
   if(envelope.operation==='choose-workspace'||envelope.operation==='choose-resource'){
    const input=z.object({directory:z.boolean().default(false)}).parse(p??{});const directory=envelope.operation==='choose-workspace'||input.directory;
    const result=await dialog.showOpenDialog(window,{properties:[directory?'openDirectory':'openFile'],title:directory?'Elegir carpeta':'Seleccionar recurso para revisar'});const path=result.canceled?undefined:result.filePaths[0];
    if(path){const canonical=await realpath(path);grantedPaths.add(canonical);if(envelope.operation==='choose-workspace')await broker.request('action',{type:'workspace',path:canonical});data={path:canonical};}
   }else if(envelope.operation==='action'){
    const a=z.object({type:z.string()}).passthrough().parse(p);
    for(const path of collectSensitivePaths(a))if(!grantedPaths.has(path))throw Error('Elegí el recurso con el diálogo nativo antes de utilizarlo');
    const fingerprint=createHash('sha256').update(JSON.stringify(a)).digest('hex');if(pendingActions.has(fingerprint))throw Error('La misma acción ya está en curso');pendingActions.add(fingerprint);
    try{data=await broker.request('action',a,envelope.requestId);}finally{pendingActions.delete(fingerprint);}
   }else if(envelope.operation==='external-auth'){
    const u=z.object({url:z.string()}).strict().parse(p).url;if(!authUrls.has(u))throw Error('URL no emitida por el flujo de autenticación');const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Cancelar','Abrir navegador'],defaultId:0,cancelId:0,message:'Continuar autenticación',detail:new URL(u).origin});if(answer.response===1)await shell.openExternal(u);
   }else if(envelope.operation==='copy'){
    clipboard.writeText(z.object({text:z.string().max(100000)}).strict().parse(p).text);
   }else if(envelope.operation==='metrics')data={app:app.getAppMetrics(),version:app.getVersion(),enginePid:undefined};
   else if(envelope.operation==='restart-engine')throw Error('Pausá y cerrá Perfect para recuperar el motor sin duplicar ejecución');
   else if(envelope.operation==='preview-layout'){
    const box=z.object({x:z.number().int().min(0),y:z.number().int().min(0),width:z.number().int().min(0).max(4000),height:z.number().int().min(0).max(4000),visible:z.boolean()}).strict().parse(p);
    if(preview){const [w,h]=window.getContentSize();preview.setBounds({x:Math.min(box.x,w),y:Math.min(box.y,h),width:Math.min(box.width,Math.max(0,w-box.x)),height:Math.min(box.height,Math.max(0,h-box.y))});preview.setVisible(box.visible);}
   }else{
    const result=await broker.request('query',{...(p&&typeof p==='object'?p:{}),kind:envelope.operation},envelope.requestId) as {data?:unknown};data=result.data;
    if(envelope.operation==='media'){
     const item=z.object({path:z.string(),extension:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),size:z.number().max(150000000),evidenceId:z.string(),revision:z.string(),current:z.boolean()}).parse(data);
     const cache=join(home,'desktop-media');if(await realpath(join(item.path,'..'))!==await realpath(cache))throw Error('Recurso fuera del almacén privado');const token=randomUUID();media.set(token,{...item,mime:mime[item.extension]??'application/octet-stream'});data={url:`perfect://media/${token}`,mime:mime[item.extension],evidenceId:item.evidenceId,revision:item.revision,current:item.current};
    }else if(envelope.operation==='preview-stop'){detachPreview();}
    else if(envelope.operation==='preview-start'){
     const info=z.object({url:z.string().url(),origin:z.string().url(),revision:z.string(),notice:z.string()}).passthrough().parse(data);const u=new URL(info.url);if(u.hostname!=='127.0.0.1'||u.protocol!=='http:')throw Error('Preview fuera de loopback');detachPreview();previewOrigin=info.origin;
     const isolated=session.fromPartition('perfect-preview-'+randomUUID());isolated.setPermissionRequestHandler((_w,_p,c)=>c(false));isolated.setPermissionCheckHandler(()=>false);isolated.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!approvedNavigation(details.url,info.origin)}));isolated.on('will-download',e=>e.preventDefault());
     preview=new WebContentsView({webPreferences:{...secure,session:isolated}});preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));preview.webContents.on('will-navigate',(e,url)=>{if(!approvedNavigation(url,info.origin))e.preventDefault();});window.contentView.addChildView(preview);preview.setBounds({x:16,y:160,width:window.getContentSize()[0]-32,height:window.getContentSize()[1]-190});await preview.webContents.loadURL(info.url);window.webContents.send('perfect:event',{type:'preview',open:true,url:info.url});
    }
   }
   return {ok:true,requestId:envelope.requestId,data};
  }catch(error){return {ok:false,requestId:envelope.requestId,message:error instanceof Error?error.message:'Acción no completada'};}
 });
 app.on('second-instance',()=>{if(window.isMinimized())window.restore();window.focus();});
 powerMonitor.on('suspend',()=>{const goal=broker.snapshot?.goal;if(goal&&broker.snapshot?.busy)void broker.request('action',{type:'pause',goalId:goal.id}).catch(()=>{});detachPreview();void broker.request('query',{kind:'preview-stop'}).catch(()=>{});});
 window.on('close',event=>{if(closing)return;event.preventDefault();void (async()=>{if(broker.snapshot?.busy){const result=await dialog.showMessageBox(window,{type:'question',buttons:['Seguir trabajando','Pausar y salir'],defaultId:0,cancelId:0,message:'Hay trabajo activo',detail:'Perfect conservará checkpoints y esperará la parada del motor.'});if(result.response!==1)return;}try{await broker.close();detachPreview();closing=true;window.destroy();app.quit();}catch(e){dialog.showErrorBox('Cierre pendiente',String(e));}})();});
 app.on('before-quit',event=>{if(!closing){event.preventDefault();window.close();}});
 broker.start();await window.loadURL(APP_ORIGIN+'/index.html');window.show();
}
function collectSensitivePaths(a:Record<string,unknown>):string[]{const paths:string[]=[];const visit=(v:unknown)=>{if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(['path','directory','casesFile','descriptorPath'].includes(k)&&typeof x==='string')paths.push(x);else if(x&&typeof x==='object')visit(x);}};visit(a);return paths;}
