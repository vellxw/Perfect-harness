import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {DesktopSession,listDesktopWindows,bindDesktopWindow,revokeDesktopWindow} from '../src/integrations/desktop/session.ts';
import {hash} from '../src/domain/util.ts';
import {saveCredential,loadCredential} from '../src/integrations/credentials.ts';
if(process.platform!=='win32')throw Error('Este smoke exige Windows real');
const fixture=process.env.PERFECT_DESKTOP_FIXTURE;if(!fixture)throw Error('Falta la ventana de prueba compilada');
const out=resolve(process.env.PERFECT_ARTIFACT_DIR??'test-results/desktop');await mkdir(out,{recursive:true});
const home=await mkdtemp(join(tmpdir(),'perfect-desktop-smoke-'));
const child=spawn(fixture,[],{stdio:'ignore',windowsHide:false});
let session,grant;const report={node:process.version,platform:process.platform,mode:'Ventana WinForms sintética; herramientas nativas reales, sin modelos ni cuentas',checks:[],status:'RUNNING'};
const parse=r=>JSON.parse(r.content.find(c=>c.type==='text').text);
try{
 await saveCredential(home,'PERFECT_SYNTHETIC_KEY','prueba-local-sin-cuenta-ñ');assert.equal(await loadCredential(home,'PERFECT_SYNTHETIC_KEY'),'prueba-local-sin-cuenta-ñ');report.checks.push('DPAPI roundtrip');
 let window;
 for(let n=0;n<40&&!window;n++){await delay(200);window=(await listDesktopWindows(home,AbortSignal.timeout(5000))).find(w=>w.pid===child.pid);}
 if(!window)throw Error('La ventana de prueba no aparece entre procesos visibles no elevados. No se relajará la protección para hacer pasar la prueba.');
 grant=await bindDesktopWindow(home,window.handle,hash(window),2,10);
 const scope={workspace:home,goalId:'desktop-smoke',runId:'desktop-smoke-run',revision:'test',role:'general',model:'synthetic-no-inference',readOnly:false,privateData:true};
 session=new DesktopSession(home,grant,scope,new AbortController().signal);
 let snapshot=parse(await session.call('desktop_snapshot',{}));assert.equal(snapshot.window.handle,window.handle);report.checks.push('Identidad HWND/PID/inicio/nonce y parada global activa');
 const field=snapshot.elements.find(e=>e.selector==='MessageInput');assert.ok(field,'Campo UIA no encontrado');
 const previous=snapshot.snapshot;
 let result=await session.call('desktop_set_value',{snapshot:snapshot.snapshot,ref:field.ref,value:'Integración real: español ñ'});
 snapshot=JSON.parse(result.content.at(-1).text);
 await assert.rejects(session.call('desktop_invoke',{snapshot:previous,ref:field.ref}),/DESKTOP_STALE_SNAPSHOT/);report.checks.push('Referencia obsoleta rechazada');
 const button=snapshot.elements.find(e=>e.selector==='ApplyButton');assert.ok(button);
 result=await session.call('desktop_invoke',{snapshot:snapshot.snapshot,ref:button.ref});snapshot=JSON.parse(result.content.at(-1).text);
 assert.match(JSON.stringify(snapshot),/Recibido: Integración real: español ñ/);report.checks.push('Escritura UIA e invocación reales');
 const image=await session.call('desktop_screenshot',{});const pixels=image.content.find(c=>c.type==='image');assert.ok(pixels);await writeFile(join(out,'desktop-window.png'),Buffer.from(pixels.data,'base64'));report.checks.push('Captura WGC de la ventana autorizada');
 await writeFile(join(out,'snapshot.json'),JSON.stringify(snapshot,null,2));
 await revokeDesktopWindow(home,grant);await assert.rejects(session.call('desktop_snapshot',{}));report.checks.push('Revocación bloquea nuevas acciones');
 report.status='PASSED';
}catch(error){report.status='FAILED';report.error=error instanceof Error?error.stack:String(error);process.exitCode=1;}
finally{await session?.close();if(grant)await revokeDesktopWindow(home,grant).catch(()=>{});child.kill();await delay(250);await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await rm(home,{recursive:true,force:true}).catch(()=>{});}
