import {_electron as electron} from 'playwright';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import assert from 'node:assert/strict';
const root=await mkdtemp(join(tmpdir(),'perfect-desktop-ui-')),workspace=join(root,'Proyecto español'),home=join(root,'state'),out=resolve('test-results/desktop');await mkdir(workspace);await mkdir(home);await mkdir(out,{recursive:true});
await writeFile(join(workspace,'README.md'),'# Proyecto de prueba\nArchivo público sintético.\n');
const app=await electron.launch({args:[resolve('desktop'),'--home',home,'--workspace',workspace],recordVideo:{dir:join(out,'video'),size:{width:1440,height:900}},timeout:30000});
const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(String(e)));let success=false;
const screenshot=async name=>page.screenshot({path:join(out,name+'.png')});
const go=async name=>{await page.getByRole('button',{name:'Abrir comandos y navegación'}).click();await page.getByRole('textbox',{name:'Buscar sección'}).fill(name);await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{name,exact:true}).waitFor();};
try{
 await page.locator('.connection').filter({hasText:'Motor conectado'}).waitFor({timeout:30000});
 await page.getByRole('heading',{name:'¿Qué querés construir?'}).waitFor();await screenshot('home');
 await go('Habilidades');await page.getByRole('switch',{name:'Sistema de habilidades'}).waitFor();
 await page.getByLabel('Modo de habilidades',{exact:true}).selectOption('manual');
 // The count is already zero before the change: wait for the committed mode,
 // not merely a label that can describe the previous automatic snapshot.
 await page.waitForFunction(async()=>{const b=await window.perfect.boot();return b.snapshot?.studio?.config.skills.mode==='manual';});
 await page.waitForFunction(()=>document.querySelector('select[aria-label="Modo de habilidades"]')?.value==='manual');
 await page.getByText('0 versiones seleccionadas',{exact:true}).waitFor();await screenshot('skills-manual-empty');
 await page.getByLabel('Buscar habilidad').fill('postgres');
 await page.getByRole('button',{name:'Seleccionar',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Confirmación').fill('SELECCIONAR');
 await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();
 await page.getByText('1 versiones seleccionadas',{exact:true}).waitFor();await screenshot('skills-selected');
 await go('Equipos');await page.getByRole('button',{name:'Crear equipo',exact:true}).click();
 await page.getByLabel('Identificador (sin espacios)').fill('equipo-prueba');await page.getByLabel('Nombre del equipo',{exact:true}).fill('Equipo de prueba');
 await page.getByRole('button',{name:'Guardar equipo',exact:true}).click();await page.getByText('Equipo de prueba',{exact:true}).waitFor();await screenshot('teams');
 await go('Perfiles y modelos');await page.getByRole('button',{name:'Cambiar modelo',exact:true}).first().click();await page.getByLabel('Modelo exacto').waitFor();await screenshot('model-picker');await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
 await go('Modos de trabajo');await screenshot('modes');
 await go('Estudio de habilidades');await page.getByRole('button',{name:'Crear habilidad',exact:true}).click();await page.getByLabel('Identificador de la habilidad').fill('skill-demo');await screenshot('skill-creator');await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.getByRole('button',{name:'Nueva comparación A/B'}).click();await page.getByRole('heading',{name:'Contrato de evaluación A/B'}).waitFor();await screenshot('evaluation-builder');await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
 await go('Integraciones');await page.getByRole('button',{name:'GitHub',exact:true}).click();await screenshot('github-dialog');await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
 await go('Archivos');await page.getByRole('button',{name:'README.md',exact:true}).click();await page.getByText('Archivo público sintético.',{exact:false}).waitFor();await screenshot('files');
 await go('Ajustes');await page.getByLabel('Movimiento',{exact:true}).selectOption('off');await screenshot('settings');
 await page.getByRole('button',{name:'Inicio de Perfect'}).click();
 await page.getByRole('textbox',{name:'¿Qué querés construir?'}).fill('Crear un saludo local probado');await page.getByRole('button',{name:'Construir ↗'}).click();
 await page.locator('.goal .status').filter({hasText:'En pausa'}).waitFor({timeout:30000});await screenshot('goal-blocked');
 const isolation=await page.evaluate(()=>({node:typeof window.process,require:typeof window.require,keys:Object.keys(window.perfect)}));assert.equal(isolation.node,'undefined');assert.equal(isolation.require,'undefined');
 const boot=await page.evaluate(()=>window.perfect.boot());assert.equal(boot.snapshot.goal.state,'PAUSED');assert.equal(boot.snapshot.goal.mode,'real');assert.equal(boot.snapshot.accounts.reduce((n,a)=>n+a.tokens,0),0);
 assert.deepEqual(errors,[]);success=true;
 await writeFile(join(out,'ui-e2e.json'),JSON.stringify({passed:true,platform:process.platform,node:process.version,sourceCommit:boot.buildId,kind:'real Electron + real core, no provider calls',isolation,errors,checks:['startup','strict-manual-selection','team-create','model-form','modes','creator','evaluation-builder','github-form','files','preferences','safe-goal-pause']},null,2));
}catch(error){await screenshot('failure').catch(()=>{});const diagnostic={error:String(error),body:await page.locator('body').innerText().catch(()=>''),errors};console.error(JSON.stringify(diagnostic,null,2));await writeFile(join(out,'failure.json'),JSON.stringify(diagnostic,null,2));throw error;}
finally{await app.close();if(success){const {SqliteStore}=await import('../../dist/adapters/sqlite/store.js');const db=new SqliteStore(join(home,'state.sqlite'));try{assert.ok(db.list('studios').some(s=>s.config.sets.some(t=>t.id==='equipo-prueba')));assert.ok(db.list('studios').some(s=>s.config.skills.mode==='manual'));assert.equal(JSON.parse(await readFile(join(home,'ui.json'),'utf8')).ui.motion,'off');}finally{db.close();}}await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:250});}
