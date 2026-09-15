// Temporary checked source reconciliation. The published release does not depend on this script.
import fs from'node:fs';import path from'node:path';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const change=(p,a,b)=>{const s=fs.readFileSync(p,'utf8');if(s.split(a).length!==2)throw Error('Expected unique source anchor '+p+' '+a.slice(0,110));fs.writeFileSync(p,s.replace(a,b));};
const prepend=(p,s)=>fs.writeFileSync(p,s+fs.readFileSync(p,'utf8'));
const wanted=['src/validation/center.ts','src/cli/skill-studio.ts','tests/skills/validation.test.ts'];
const old=JSON.parse(execFileSync('gh',['api','repos/vellxw/Perfect-harness/git/trees/00bbfff11082708bb021e895cbd9e0b6d2b6d8a8?recursive=1'],{encoding:'utf8'}));if(old.truncated)throw Error('Incomplete source objects');
for(const p of wanted){if(fs.existsSync(p))throw Error('Do not overwrite current source '+p);const entry=old.tree.find(x=>x.path===p);if(!entry||entry.type!=='blob'||entry.mode!=='100644'||entry.size>100000)throw Error('Missing source '+p);const blob=JSON.parse(execFileSync('gh',['api','repos/vellxw/Perfect-harness/git/blobs/'+entry.sha],{encoding:'utf8'}));const bytes=Buffer.from(blob.content,'base64');if(createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex')!==entry.sha)throw Error('Blob mismatch');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);}
// Fix runtime preparation discovered by the actual Linux Blender build.
change('scripts/prepare-blender.mjs','libgomp1 libfontconfig1 &&','libgomp1 libfontconfig1 libxkbcommon0 libwayland-client0 libwayland-cursor0 libwayland-egl1 libxrandr2 libxcursor1 libxinerama1 libdecor-0-0 libdbus-1-3 &&');
change('scripts/prepare-blender.mjs',"const expected=entry[0][1].toLowerCase();","const expected=entry[0][1].toLowerCase();if(expected!=='da4e69b06b75b9e642d106496c50e7e240218b411d2f6e18271c1d1d819cef91')throw Error('El manifiesto oficial difiere del checksum revisado para Blender 4.5.13');");
// Crash-safe evaluation recovery; active time, budgets and completed pairs never reset.
change('src/skills/experiments.ts','export interface TrialRecord {','export interface TrialRecord {\n  activeMs?:number;');
change('src/skills/experiments.ts','  const deadline = AbortSignal.any([','  const remainingMs=trial.spec.timeoutMs-(trial.activeMs??0);\n  if(remainingMs<=0)throw new Blocked("EVAL_TIMEOUT","Presupuesto temporal agotado; no se reinicia al reanudar");\n  const activeStart=performance.now();\n  const deadline = AbortSignal.any([');
change('src/skills/experiments.ts','      AbortSignal.timeout(trial.spec.timeoutMs),','      AbortSignal.timeout(remainingMs),');
change('src/skills/experiments.ts','  } finally {\n    clearInterval(timer);\n  }','  } finally {\n    clearInterval(timer);\n    const final=store.get("skillTrials",trial.id)!;store.put("skillTrials",{...final,activeMs:(final.activeMs??0)+(performance.now()-activeStart)},"skill.trial_time_recorded");\n  }');
change('src/skills/experiments.ts','            if (lease) owner.release(lease.id);','            if (lease) {await input.runner.recover(goal.id);owner.release(lease.id);}');
// Review one profile's actual route without changing user's assignments or global config.
prepend('src/cli/smoke.ts','import type{AgentProfile,StudioConfig}from"../skills/model.js";\nimport{SkillsRegistry}from"../skills/registry.js";\nimport{hash}from"../domain/util.js";\n');
change('src/cli/smoke.ts','  roles?: Role[];','  roles?: Role[];\n  profile?:AgentProfile;\n  studioConfig?:StudioConfig;');
change('src/cli/smoke.ts','  const runtime = new PiRuntime(input.home, input.config),','  if(input.profile&&input.studioConfig){\n    const registry=new SkillsRegistry(input.store),record=registry.get(goal.source,input.config),cfg=structuredClone(input.studioConfig);cfg.skills.mode="off";\n    input.store.put("studios",{...record,config:cfg,hash:hash(cfg)},"smoke.profile_snapshot_created");\n    goal.studioSnapshotId=registry.snapshot(goal,input.config).id;input.store.put("goals",goal,"smoke.profile_bound");\n  }\n  const runtime = new PiRuntime(input.home, input.config),');
change('src/cli/smoke.ts','    try {\n      const result = await executor.invoke(','    try {\n      const visual=(input.profile?.binding.capabilities??input.config.agents[role].capabilities).includes("image");\n      const result = await executor.invoke(');
change('src/cli/smoke.ts','          role,\n          workspace: source,','          role,\n          profileId:input.profile?.id,\n          workspace: source,');
change('src/cli/smoke.ts','            "Connectivity smoke test only. Call list_files once. Identify the solid color in each of the two attached images, in order, and submit the JSON result. Do not modify files.",','            visual?"Connectivity smoke test only. Call list_files once. Identify the solid color in each of the two attached images, in order, and submit the JSON result. Do not modify files.":"Connectivity smoke only. Call list_files once, then submit ok true, firstColor blue, secondColor red, and a summary. No images were sent; do not claim visual verification.",');
change('src/cli/smoke.ts','          images: [','          images: visual ? [');
change('src/cli/smoke.ts','              source: "image-2",\n            },\n          ],','              source: "image-2",\n            },\n          ] : undefined,');
change('src/cli/smoke.ts','          "Inferencia real, respuesta estructurada, herramienta observada y prueba de imagen aprobadas. Los metadatos no informados siguen siendo desconocidos.",','          visual?"Inferencia real, respuesta estructurada, herramienta observada y prueba de imagen aprobadas. Los metadatos no informados siguen siendo desconocidos.":"Inferencia real y herramienta observada. El perfil no usa imágenes; no se comprobó visión. Los metadatos ausentes permanecen desconocidos.",');
// Center imported source has strictly whitelisted reports, no personal token exports.
prepend('src/skills/admin.ts','import{inspectLocal,latestValidation,exportValidation,smokeProfile,smokeBlender,type LocalValidationReport}from"../validation/center.js";\nimport{recoverTrial}from"./trial-recovery.js";\n');
change('src/skills/admin.ts','export interface StudioPanelSnapshot {','export interface StudioPanelSnapshot {\n  validation?:LocalValidationReport;');
change('src/skills/admin.ts','      control: control(this.store, workspace),','      control: control(this.store, workspace),\n      validation:latestValidation(this.store,workspace),');
change('src/skills/actions.ts','export const StudioActionSchema = z.discriminatedUnion("command", [',`export const StudioActionSchema = z.discriminatedUnion("command", [
 z.object({command:z.literal("validation-check")}).strict(),
 z.object({command:z.literal("validation-export")}).strict(),
 z.object({command:z.literal("validation-cancel")}).strict(),
 z.object({command:z.literal("validation-profile"),profileId:Key,contributorConsent:z.boolean().default(false),confirmation:z.literal("PROBAR")}).strict(),
 z.object({command:z.literal("validation-blender"),confirmation:z.literal("RENDERIZAR")}).strict(),
 z.object({command:z.literal("trial-recover"),trialId:z.string(),confirmation:z.literal("RECUPERAR")}).strict(),`);
change('src/skills/admin.ts','    switch (action.command) {',`    switch (action.command) {
      case "trial-recover": {const result=await recoverTrial(this.store,new PreparedDockerRunner(base,this.store,join(this.home,"sandbox")),base,workspace,action.trialId,action.confirmation);return {message:result.message,content:JSON.stringify(result,null,2)};}
      case "validation-check": return {message:"Diagnóstico sin inferencias terminado",content:JSON.stringify(await inspectLocal(this.store,this.home,workspace,base),null,2)};
      case "validation-export": {const result=await exportValidation(this.store,this.home,workspace);return {message:"Informe saneado guardado. No es una atestación independiente.",content:JSON.stringify(result.report,null,2),path:result.path};}
      case "validation-cancel": for(const item of this.executions.values())item.abort.abort();return {message:"Cancelación solicitada; se conservan evidencias y consumo."};
      case "validation-profile":
      case "validation-blender": {
        if(this.executions.size)throw new Blocked("VALIDATION_BUSY","Ya hay una prueba activa");
        const abort=new AbortController(),combined=AbortSignal.any([signal,abort.signal]);
        const promise=action.command === "validation-profile"?smokeProfile(this.store,this.home,workspace,base,action.profileId,action.contributorConsent,combined):smokeBlender(this.store,this.home,workspace,base,combined);
        this.executions.set("validation",{abort,promise});try{const result=await promise;return {message:"Prueba local terminada; revisá el estado de cada comprobación",content:JSON.stringify(result,null,2)};}finally{this.executions.delete("validation");}
      }`);
change('src/presentation/engine.ts','          if (action.action.command === "trial-run") {','          if (["trial-run","validation-profile","validation-blender"].includes(action.action.command)) {');
change('src/presentation/engine.ts','              "Evaluación iniciada. /evaluaciones permite ver progreso o cancelar sin bloquear la interfaz.";','              "Prueba iniciada sin bloquear la interfaz. /evaluaciones y /validacion muestran progreso, evidencia y cancelación.";');
prepend('src/cli/main.ts','import{registerSkillStudio}from"./skill-studio.js";\n');
change('src/cli/main.ts','  registerSkills(program, context);','  registerSkills(program, context);\n  registerSkillStudio(program,context);');
change('src/cli/skill-studio.ts',' const validation=program.command("validacion")',' root.command("recuperar <trialId>").requiredOption("--yes","Reconciliar procesos detenidos sin repetir escrituras inciertas").action((trialId:string)=>run(async()=>({command:"trial-recover",trialId,confirmation:"RECUPERAR"})));\n const validation=program.command("validacion")');
// Local diagnostic and trial recovery panels remain outside agent tool surfaces.
change('src/presentation/protocol.ts','export type Screen =','export type Screen =\n  | "local-validation"');
prepend('src/ui/tui/studio-view.ts','import{validationRows,validationIntent}from"./validation-view.js";\n');
change('src/ui/tui/studio-view.ts','export const studioScreens = [','export const studioScreens = [\n  "local-validation",');
change('src/ui/tui/studio-view.ts','  const cfg = p.config,','  if(screen === "local-validation")return validationRows(s);\n  const cfg = p.config,');
change('src/ui/tui/studio-view.ts','  const c = p.config,','  if(screen === "local-validation")return validationIntent(s,id);\n  if(screen === "trial-detail"&&id === "trial-recover")return confirmed({command:"trial-recover",trialId:subject,confirmation:"RECUPERAR"},"Recuperar evaluación interrumpida","Solo se reconcilian procesos detenidos y recursos propios. No se roban locks ni se repiten llamadas inciertas. Cuotas e intentos se conservan.","RECUPERAR");\n  const c = p.config,');
change('src/ui/tui/studio-view.ts','  return result;','  if(screen === "trial-detail"){const trial=p.trials.find(t=>t.trialId===subject);if(trial&&["running","interrupted","cancelled"].includes(trial.status))result.push(row("trial-recover","Recuperar tras cierre del proceso","Solo si el controlador anterior terminó; requiere reconfirmar después"));}\n  return result;');
change('src/ui/tui/studio-view.ts','  if (name === "evaluaciones")','  if(name === "validacion")return {screen:"local-validation",action:action({command:"status"})};\n  if (name === "evaluaciones")');
change('src/ui/tui/views.ts','export const commands: PaletteItem[] = [','export const commands: PaletteItem[] = [\n  {name:"validacion",description:"Cuentas, editores y pruebas locales verificables"},');
change('src/i18n/es.ts','const screenNames: Readonly<Record<string, string>> = {','const screenNames: Readonly<Record<string, string>> = {\n  "local-validation":"Validación local",');
// Packaging version from a single manifest; no independently hardcoded launcher version.
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));pkg.version='0.4.0';pkg.scripts.build='tsc -p tsconfig.build.json && node scripts/build-info.mjs';fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));lock.version=pkg.version;lock.packages[''].version=pkg.version;fs.writeFileSync('package-lock.json',JSON.stringify(lock,null,2)+'\n');
change('build/windows/perfect.iss','AppVersion=0.3.0','AppVersion={#AppVersion}');
change('build/windows/perfect.iss','[Setup]','#ifndef AppVersion\n  #error "AppVersion must come from package.json through package-windows.ps1"\n#endif\n[Setup]');
change('scripts/package-windows.ps1',"$sourcePath = (Resolve-Path (Join-Path $root 'src\\windows\\Perfect.cs')).Path",`$sourceOriginal = (Resolve-Path (Join-Path $root 'src\\windows\\Perfect.cs')).Path
$sourcePath = Join-Path $root 'release\\Perfect.generated.cs'
$sourceText = [IO.File]::ReadAllText($sourceOriginal) -replace '(?<=AssemblyVersion\\(")[^\"]+(?="\\))', "$version.0" -replace '(?<=AssemblyFileVersion\\(")[^\"]+(?="\\))', "$version.0"
[IO.File]::WriteAllText($sourcePath,$sourceText)`);
change('scripts/package-windows.ps1','  & $iscc.FullName "/DPayload=$out" "/DOutput=$root\\release"','  & $iscc.FullName "/DPayload=$out" "/DOutput=$root\\release" "/DAppVersion=$version"');
change('scripts/package-windows.ps1',"$files = Get-ChildItem $out -Recurse -File",`$identity=Get-Content "$out\\app\\dist\\build-info.json" -Raw | ConvertFrom-Json
if($identity.version -ne $version -or $identity.sourceCommit -notmatch '^[a-f0-9]{40}$'){throw 'Missing exact build provenance'}
$identity | ConvertTo-Json -Depth 5 | Set-Content "$out\\build-manifest.json" -Encoding utf8NoBOM
Remove-Item $sourcePath -Force
$files = Get-ChildItem $out -Recurse -File`);
change('scripts/package-windows.ps1',"@{version=$version;node=(&", "@{version=$version;sourceCommit=$identity.sourceCommit;node=(&");
console.log('Final validation center, explicit local smoke, crash recovery and single-source version metadata wired.');
