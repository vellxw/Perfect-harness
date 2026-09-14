import {createTestRenderer} from '@opentui/core/testing';
import {createRoot} from '@opentui/react';
import {createElement} from 'react';
import {Resvg} from '@resvg/resvg-js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {App} from '../dist/ui/tui/app.js';
import {DemoClient} from '../dist/ui/tui/demo.js';
const output=resolve(process.argv[2]??'test-results/integrations-ui');await mkdir(output,{recursive:true});
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const rgba=c=>{const b=c?.buffer;if(!b||b.length!==4)throw Error('RGBA nativo no compatible');return `rgba(${b[0]},${b[1]},${b[2]},${b[3]/255})`;};
const captured=[];
for(const [name,cols,rows,pending]of [['integraciones',120,36,false],['permiso-pendiente',120,36,true],['integraciones-compactas',80,24,true]]){
 const test=await createTestRenderer({width:cols,height:rows}),root=createRoot(test.renderer),client=new DemoClient('idle');
 if(pending)client.getSnapshot().integrations={connections:[{id:'github',title:'GitHub oficial',kind:'github',enabled:true,configHash:'config-fixture',catalogHash:'catalog-fixture',authorized:true,tools:12,roles:['general','backend'],pending:1,status:'autorizada'},{id:'navegador',title:'Navegador interactivo',kind:'browser',enabled:true,configHash:'browser-fixture',authorized:true,tools:12,roles:['frontend','general'],pending:0,status:'aislada · lista'}],windows:[],pending:[{id:'demo-operacion',serverId:'github',tool:'create_pull_request',digest:'demostracion-sin-permiso-real',state:'pending',effect:'write',role:'general',runId:'ejecucion-demostracion',expiresAt:'2026-09-14T23:59:00Z',arguments:JSON.stringify({owner:'ejemplo',repo:'proyecto',head:'perfect/cambio',base:'main',title:'Propuesta de prueba'},null,2)}]};
 root.render(createElement(App,{client,initialScreen:'integrations',onExit:()=>{}}));await new Promise(r=>setTimeout(r,100));await test.renderOnce();
 const frame=test.captureCharFrame(),spans=test.captureSpans();await writeFile(join(output,name+'.txt'),frame);
 const cw=10,ch=20,pad=24,label=30,width=cols*cw+pad*2,height=rows*ch+pad*2+label;
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#050507"/><text x="24" y="20" font-family="monospace" font-size="11" fill="#8994ac">PERFECT · renderizador OpenTUI real · datos sintéticos DEMO · ${cols}×${rows}</text>`;
 for(const [r,line]of spans.lines.entries()){let column=0;for(const span of line.spans){const x=pad+column*cw,y=pad+label+r*ch;svg+=`<rect x="${x}" y="${y}" width="${span.width*cw}" height="${ch}" fill="${rgba(span.bg)}"/><text xml:space="preserve" x="${x}" y="${y+15}" fill="${rgba(span.fg)}" font-family="DejaVu Sans Mono,Cascadia Mono,Consolas,monospace" font-size="16" font-weight="${span.attributes&1?700:400}" textLength="${Math.max(1,span.width*cw)}" lengthAdjust="spacingAndGlyphs">${escape(span.text)}</text>`;column+=span.width;}}
 svg+='</svg>';await writeFile(join(output,name+'.png'),new Resvg(svg,{font:{loadSystemFonts:true}}).render().asPng());
 console.log(name+'\n'+frame);captured.push({name,columns:cols,rows,source:'OpenTUI captureSpans rasterizado; no captura de escritorio',data:'DEMO sintético; ningún token ni cuenta real'});
 root.unmount();test.renderer.destroy();
}
await writeFile(join(output,'provenance.json'),JSON.stringify({sourceCommit:process.env.GITHUB_SHA??'local-no-publicado',node:process.version,platform:process.platform,captured},null,2));
