import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir,readdir,lstat,copyFile} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {execFileSync} from 'node:child_process';
import {assertAcceptance,assertCandidateRun,parseVisualReview,repository} from './release-policy.mjs';

const marker='<!-- perfect-desktop-visual-review:v1 -->';
const apiRoot=`https://api.github.com/repos/${repository}/`;
export function positiveId(value){const n=Number(value);assert.ok(Number.isSafeInteger(n)&&n>0,'Expected a positive GitHub ID');return n;}
export function publicationInput(event,eventName){
 if(eventName==='issue_comment'){
  assert.equal(event.issue?.number,5);assert.equal(event.comment?.user?.login,'vellxw');assert.equal(event.comment?.author_association,'OWNER');assert.ok(event.comment.body.startsWith(marker));
  const blocks=[...event.comment.body.matchAll(/```json\s*([\s\S]*?)```/g)];assert.equal(blocks.length,1);
  const value=JSON.parse(blocks[0][1]);return {runId:positiveId(value.acceptanceRunId),commentId:positiveId(event.comment.id)};
 }
 assert.equal(eventName,'workflow_dispatch');return {runId:positiveId(event.inputs?.acceptance_run),commentId:positiveId(event.inputs?.review_comment)};
}
export function allowedDownload(url,first=false){
 const u=new URL(url);assert.equal(u.protocol,'https:');assert.ok(!u.username&&!u.password&&!u.port);
 if(first)assert.ok(u.hostname==='api.github.com'||u.hostname==='github.com');
 else assert.ok(u.hostname==='api.github.com'||u.hostname==='github.com'||u.hostname.endsWith('.githubusercontent.com')||u.hostname.endsWith('.blob.core.windows.net'),'Unexpected GitHub artifact redirect');
 return u;
}
async function digest(path){const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');}
async function walk(root){const list=[];for(const entry of await readdir(root,{withFileTypes:true})){const path=join(root,entry.name),s=await lstat(path);assert.ok(!s.isSymbolicLink());if(s.isDirectory())list.push(...await walk(path));else if(s.isFile())list.push(path);else throw Error('Unsupported extracted file');}return list;}
async function unique(root,name){const choices=(await walk(root)).filter(p=>basename(p)===name);assert.equal(choices.length,1,`Expected one ${name}`);return choices[0];}
async function download(url,path,expected,token){
 let current=allowedDownload(url,true),response;
 for(let hop=0;hop<6;hop++){
  response=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(120000),headers:{Accept:'application/octet-stream',...(current.hostname==='api.github.com'&&token?{Authorization:`Bearer ${token}`}:{})}});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();assert.ok(location);current=allowedDownload(new URL(location,current),false);continue;}
  break;
 }
 assert.ok(response?.ok&&response.body,`Binary download failed (${response?.status})`);
 assert.ok(Number(response.headers.get('content-length')??0)<2_000_000_000);
 let length=0;const hash=createHash('sha256');
 const stream=Readable.from((async function*(){for await(const chunk of response.body){length+=chunk.length;assert.ok(length<2_000_000_000);hash.update(chunk);yield chunk;}})());
 await pipeline(stream,createWriteStream(path,{flags:'wx',mode:0o600}));
 assert.equal(hash.digest('hex'),expected,'Downloaded bytes differ from reviewed/tested artifact');
 return length;
}
function extract(zip,directory){
 // Standard library extraction only. No package install, shell or code from artifacts.
 execFileSync('python3',['-c',String.raw`import os,sys,zipfile,pathlib,stat
source,destination=sys.argv[1:];root=pathlib.Path(destination).resolve();root.mkdir(parents=True,exist_ok=False)
with zipfile.ZipFile(source) as archive:
 infos=archive.infolist();assert len(infos)<50000 and sum(i.file_size for i in infos)<2500000000
 seen=set()
 for item in infos:
  p=pathlib.PurePosixPath(item.filename)
  assert not p.is_absolute() and '..' not in p.parts and '\\' not in item.filename and ':' not in item.filename and '\x00' not in item.filename
  key=item.filename.casefold();assert key not in seen;seen.add(key)
  mode=item.external_attr>>16
  assert not stat.S_ISLNK(mode)
  target=root.joinpath(*p.parts);assert target.resolve().is_relative_to(root)
  if item.is_dir():target.mkdir(parents=True,exist_ok=True)
  else:
   assert item.file_size<1600000000;target.parent.mkdir(parents=True,exist_ok=True)
   with archive.open(item) as inp,open(target,'xb') as out:
    import shutil;shutil.copyfileobj(inp,out)
`,zip,directory],{stdio:'inherit',timeout:180000});
}
export async function publishRelease(){
 assert.equal(process.env.GITHUB_REPOSITORY,repository);
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_ACTOR,'vellxw','An explicit owner action is required');
 const token=process.env.GH_TOKEN;assert.ok(token);
 const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
 const {runId,commentId}=publicationInput(event,process.env.GITHUB_EVENT_NAME);
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 async function api(path,{method='GET',body,allow404=false}={}){
  assert.ok(!path.startsWith('/')&&!path.includes('..'));
  const response=await fetch(apiRoot+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2026-03-10'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(allow404&&response.status===404){await response.body?.cancel();return undefined;}
  assert.ok(response.ok,`GitHub ${method} ${path.split('?')[0]} returned ${response.status}`);
  return response.status===204?undefined:await response.json();
 }
 const head=await api('git/ref/heads/main');assert.equal(head.object.sha,sourceCommit,'A newer main candidate exists');
 const run=await api(`actions/runs/${runId}`);assertCandidateRun(run,sourceCommit);
 const listed=[];for(let page=1;page<=10;page++){const batch=await api(`actions/runs/${runId}/artifacts?per_page=100&page=${page}`);listed.push(...batch.artifacts);if(listed.length>=batch.total_count)break;assert.ok(page<10);}
 const root=resolve('test-results/desktop/publication');await mkdir(root,{recursive:true});
 const chosen=new Map();
 for(const name of ['Perfect-V5-Acceptance-Evidence','Perfect-V5-Windows-Installer','Perfect-V5-Windows-Portable']){
  const matches=listed.filter(a=>a.name===name&&!a.expired);assert.equal(matches.length,1,`Missing exact candidate artifact ${name}`);
  const artifact=matches[0];assert.match(artifact.digest??'',/^sha256:[a-f0-9]{64}$/);if(artifact.workflow_run)assert.equal(artifact.workflow_run.head_sha,sourceCommit);
  const archive=join(root,name+'.zip'),directory=join(root,name);
  await download(`${apiRoot}actions/artifacts/${positiveId(artifact.id)}/zip`,archive,artifact.digest.slice(7),token);
  extract(archive,directory);chosen.set(name,{artifact,archive,directory});
 }
 const evidence=chosen.get('Perfect-V5-Acceptance-Evidence');
 const acceptancePath=await unique(evidence.directory,'acceptance.json'),evidenceRoot=resolve(acceptancePath,'..');
 const acceptance=assertAcceptance(JSON.parse(await readFile(acceptancePath,'utf8')),sourceCommit);
 for(const file of acceptance.files){const path=join(evidenceRoot,file.path);assert.equal((await lstat(path)).size,file.bytes);assert.equal(await digest(path),file.sha256,'Evidence content differs from acceptance manifest');}
 const comment=await api(`issues/comments/${commentId}`);
 assert.equal(comment.issue_url,apiRoot+'issues/5');
 const review=parseVisualReview(comment,acceptance,runId,evidence.artifact);
 const installer=await unique(chosen.get('Perfect-V5-Windows-Installer').directory,'Perfect-Harness-Setup-x64.exe');
 const portable=await unique(chosen.get('Perfect-V5-Windows-Portable').directory,'Perfect-Harness-Windows-x64.zip');
 assert.equal(await digest(installer),acceptance.distribution.installerSha256);
 assert.equal(await digest(portable),acceptance.distribution.portableSha256);
 const dist=join(root,'release');await mkdir(dist);
 const exports=new Map([['Perfect-Harness-Setup-x64.exe',installer],['Perfect-Harness-Windows-x64.zip',portable],['Perfect-V5-Evidence.zip',evidence.archive],['acceptance.json',acceptancePath]]);
 for(const file of acceptance.files.filter(f=>f.kind==='video'||['build-manifest.json','windows-installation-report.json','performance-report.json','goal-loop-controller-evidence.json'].includes(f.path)))exports.set(basename(file.path),join(evidenceRoot,file.path));
 const reviewPath=join(dist,'visual-review.json');await writeFile(reviewPath,JSON.stringify({commentId,review,recordedFrom:comment.html_url},null,2));exports.set('visual-review.json',reviewPath);
 const expected=[];for(const [name,path]of exports){assert.match(name,/^[A-Za-z0-9_.-]+$/);expected.push({name,path,sha256:await digest(path),bytes:(await lstat(path)).size});}
 const sums=join(dist,'SHA256SUMS.txt');await writeFile(sums,expected.map(f=>`${f.sha256}  ${f.name}`).join('\n')+'\n');expected.push({name:'SHA256SUMS.txt',path:sums,sha256:await digest(sums),bytes:(await lstat(sums)).size});
 const tag='v'+acceptance.version;
 assert.match(tag,/^v0\.5\.\d+$/);
 const oldTag=await api('git/ref/tags/'+tag,{allow404:true});
 if(oldTag){assert.equal(oldTag.object.type,'commit','Existing annotated tags require separate review');assert.equal(oldTag.object.sha,sourceCommit,'Never move a published tag');}
 const prior=await api('releases/tags/'+tag,{allow404:true});
 if(prior){assert.equal(prior.target_commitish,sourceCommit);assert.equal(prior.draft,true,'Do not overwrite a stable release');}
 const body=`# Perfect Desktop ${acceptance.version}\n\nAplicación gráfica en español sobre el motor Perfect. GUI con mouse y teclado; CLI/TUI conservadas.\n\nCommit: \`${sourceCommit}\`. Instalador y portable son los bytes probados por https://github.com/${repository}/actions/runs/${runId}.\n\nIncluye actualización V4, skills por equipos, modelos configurables, referencias, medios, recuperación y Goal Loop con evidencia. Los videos son grabaciones reales; los providers del escenario de prueba están identificados como sintéticos. No se utilizaron cuentas personales.\n\nWindows se probó en Windows Server 2025, no en la PC Windows 11 del usuario. Perfect permanece sin firma Authenticode: los checksums verifican integridad, no identidad del editor. No desactives SmartScreen ni Defender. Node está incluido; Docker y editores se configuran aparte cuando hacen falta.\n\nCerrá o pausá trabajo antes de actualizar. Instalá Perfect-Harness-Setup-x64.exe, o extraé el portable completo; no copies solo Perfect.exe. La GUI no necesita Windows Terminal.\n\nLos reportes incluyen metodología de rendimiento, timings reales, memoria proporcional y RSS sin ocultar su diferencia. Consulta acceptance.json y visual-review.json para procedencia y revisión de los archivos.\n`;
 assert.equal((await api('git/ref/heads/main')).object.sha,sourceCommit,'Candidate became stale before publication');
 if(!oldTag)await api('git/refs',{method:'POST',body:{ref:'refs/tags/'+tag,sha:sourceCommit}});
 const release=prior??await api('releases',{method:'POST',body:{tag_name:tag,target_commitish:sourceCommit,name:`Perfect Desktop ${acceptance.version}`,draft:true,prerelease:false,make_latest:'false',body}});
 assert.equal(release.draft,true);
 const uploadBase=new URL(release.upload_url.split('{')[0]);assert.equal(uploadBase.origin,'https://uploads.github.com');assert.equal(uploadBase.pathname,`/repos/${repository}/releases/${release.id}/assets`);
 let assets=await api(`releases/${release.id}/assets?per_page=100`);
 assert.ok(assets.every(a=>expected.some(f=>f.name===a.name)),'Existing draft has unexpected assets; do not overwrite it');
 for(const file of expected){
  const present=assets.find(a=>a.name===file.name);
  if(present){assert.equal(present.state,'uploaded');assert.equal(present.size,file.bytes);assert.equal(present.digest,'sha256:'+file.sha256);continue;}
  const url=new URL(uploadBase);url.searchParams.set('name',file.name);
  const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(300000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/octet-stream','Content-Length':String(file.bytes)},body:createReadStream(file.path),duplex:'half'});
  assert.ok(response.ok,`Asset upload ${file.name} failed (${response.status}); draft preserved`);
  const created=await response.json();assert.equal(created.name,file.name);assert.equal(created.size,file.bytes);assert.equal(created.digest,'sha256:'+file.sha256);assets.push(created);
 }
 const verified=join(root,'draft-downloads');await mkdir(verified);
 for(const file of expected){const asset=assets.find(a=>a.name===file.name);await download(`${apiRoot}releases/assets/${positiveId(asset.id)}`,join(verified,file.name),file.sha256,token);}
 assert.equal((await api('git/ref/heads/main')).object.sha,sourceCommit,'A newer main appeared before making the release public');
 await api(`releases/${release.id}`,{method:'PATCH',body:{draft:false,prerelease:false,make_latest:'true',body}});
 const publicDir=join(root,'public-downloads');await mkdir(publicDir);
 try{
  const published=await api('releases/tags/'+tag);assert.equal(published.id,release.id);assert.equal(published.draft,false);assert.equal(published.target_commitish,sourceCommit);
  for(const file of expected){const asset=published.assets.find(a=>a.name===file.name);assert.ok(asset&&asset.digest==='sha256:'+file.sha256);const url=new URL(asset.browser_download_url);assert.equal(url.origin,'https://github.com');assert.equal(url.pathname,`/${repository}/releases/download/${tag}/${file.name}`);await download(url,join(publicDir,file.name),file.sha256);}
  const result={status:'PUBLISHED_AND_PUBLIC_HASH_VERIFIED',version:acceptance.version,sourceCommit,tag,releaseId:release.id,acceptanceRunId:runId,reviewCommentId:commentId,files:expected.map(({path,...f})=>f),nativePostDownloadSmoke:'PENDING_WINDOWS_JOB'};
  await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));
  if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,`version=${acceptance.version}\nsource_commit=${sourceCommit}\nrelease_id=${release.id}\n`,{flag:'a'});
  console.log(JSON.stringify(result,null,2));return result;
 }catch(error){
  await api(`releases/${release.id}`,{method:'PATCH',body:{draft:true}});
  throw new Error(`Published-download verification failed; release returned to draft without replacing tag/assets: ${error instanceof Error?error.message:'unknown'}`);
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await publishRelease();
