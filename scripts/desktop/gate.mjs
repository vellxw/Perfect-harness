import {_electron as electron} from 'playwright';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import assert from 'node:assert/strict';
const root=await mkdtemp(join(tmpdir(),'perfect-desktop-gate-')),workspace=join(root,'proyecto español'),home=join(root,'state');await mkdir(workspace);await mkdir(home);await mkdir('test-results/desktop',{recursive:true});
const args=[resolve('desktop'),'--home',home,'--workspace',workspace];
const app=await electron.launch({args,timeout:30000});const page=await app.firstWindow();const errors=[],consoleErrors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
try{
 const deadline=Date.now()+30000;let boot;
 do{boot=await page.evaluate(()=>window.perfect?.boot());if(boot?.connected)break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<deadline);
 assert.equal(boot?.connected,true,'The real Node engine must complete its handshake');
 await page.locator('.connection').filter({hasText:'Motor conectado'}).waitFor({timeout:10000});
 await page.getByRole('textbox',{name:'¿Qué querés construir?'}).fill('Crear un saludo local probado');
 await page.getByRole('button',{name:'Construir ↗'}).click();
 await page.getByText('PAUSED',{exact:false}).waitFor({timeout:30000});
 const isolation=await page.evaluate(()=>({require:typeof window.require,process:typeof window.process,node:typeof window.perfect.boot,keys:Object.keys(window.perfect)}));
 assert.equal(isolation.require,'undefined');assert.equal(isolation.process,'undefined');assert.equal(isolation.node,'function');assert.deepEqual(errors,[]);
 const snapshot=await page.evaluate(()=>window.perfect.boot());assert.equal(snapshot.snapshot.goal.mode,'real');assert.equal(snapshot.snapshot.goal.state,'PAUSED');
 await page.screenshot({path:'test-results/desktop/gate.png'});
 await writeFile('test-results/desktop/gate.json',JSON.stringify({version:app.process().spawnargs,isolation,node:process.version,platform:process.platform,sourceCommit:process.env.GITHUB_SHA,goal:{state:snapshot.snapshot.goal.state,requests:snapshot.snapshot.agents.reduce((n,a)=>n+a.requests,0)},errors,consoleErrors},null,2));
}catch(error){
 await page.screenshot({path:'test-results/desktop/gate-failure.png'}).catch(()=>{});
 const diagnostics={error:String(error),url:page.url(),body:await page.locator('body').innerText().catch(()=>''),boot:await page.evaluate(()=>window.perfect?.boot()).catch(e=>String(e)),errors,consoleErrors};
 console.error(JSON.stringify(diagnostics,null,2));await writeFile('test-results/desktop/gate-failure.json',JSON.stringify(diagnostics,null,2));throw error;
}finally{await app.close();await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:250});}
console.log('Desktop gate: real Electron window + real Node engine + isolated renderer + safely paused goal without accounts.');
