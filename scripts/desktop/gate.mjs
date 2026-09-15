import {_electron as electron} from 'playwright';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import assert from 'node:assert/strict';
const root=await mkdtemp(join(tmpdir(),'perfect-desktop-gate-')),workspace=join(root,'proyecto español'),home=join(root,'state');await mkdir(workspace);await mkdir(home);
const args=[resolve('desktop'),'--home',home,'--workspace',workspace];
const app=await electron.launch({args,timeout:30000});const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.getByText('Motor conectado',{exact:true}).waitFor({timeout:30000});
 await page.getByRole('textbox',{name:'¿Qué querés construir?'}).fill('Crear un saludo local probado');
 await page.getByRole('button',{name:'Construir ↗'}).click();
 await page.getByText('PAUSED',{exact:false}).waitFor({timeout:30000});
 const isolation=await page.evaluate(()=>({require:typeof window.require,process:typeof window.process,node:typeof window.perfect.boot,keys:Object.keys(window.perfect)}));
 assert.equal(isolation.require,'undefined');assert.equal(isolation.process,'undefined');assert.equal(isolation.node,'function');assert.deepEqual(errors,[]);
 const snapshot=await page.evaluate(()=>window.perfect.boot());assert.equal(snapshot.snapshot.goal.mode,'real');assert.equal(snapshot.snapshot.goal.state,'PAUSED');
 await page.screenshot({path:'test-results/desktop/gate.png'});
 await writeFile('test-results/desktop/gate.json',JSON.stringify({version:app.process().spawnargs,isolation,node:process.version,platform:process.platform,sourceCommit:process.env.GITHUB_SHA,goal:{state:snapshot.snapshot.goal.state,requests:snapshot.snapshot.agents.reduce((n,a)=>n+a.requests,0)},errors},null,2));
}finally{await app.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:250});}
console.log('Desktop gate: real Electron window + real Node engine + isolated renderer + safely paused goal without accounts.');
