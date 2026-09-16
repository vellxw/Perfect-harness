import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readdir,lstat,mkdir,readFile,copyFile,writeFile} from 'node:fs/promises';
import {join,resolve,relative,basename} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {assertAcceptance,requiredGates} from './release-policy.mjs';

const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const input=resolve(process.argv[2]??'candidate-artifacts'),out=resolve(process.argv[3]??'test-results/desktop/final');
const gates=JSON.parse(process.env.PERFECT_GATE_RESULTS??'{}');
assert.deepEqual(Object.keys(gates).sort(),[...requiredGates].sort());
for(const key of requiredGates)assert.equal(gates[key],'success',key+' did not pass');
const files=[];
async function walk(root){const found=[];for(const entry of await readdir(root,{withFileTypes:true})){const p=join(root,entry.name);const st=await lstat(p);assert.ok(!st.isSymbolicLink());if(st.isDirectory())found.push(...await walk(p));else if(st.isFile())found.push(p);else throw Error('Unsupported artifact type');}return found;}
async function digest(path){const h=createHash('sha256');for await(const data of createReadStream(path))h.update(data);return h.digest('hex');}
async function json(path){assert.ok((await lstat(path)).size<30_000_000);return JSON.parse(await readFile(path,'utf8'));}
async function unique(root,suffix){const candidates=(await walk(root)).filter(p=>p.replaceAll('\\','/').endsWith(suffix));assert.equal(candidates.length,1,'Expected one '+suffix);return candidates[0];}
async function include(path,name,kind,extra={}){assert.match(name,/^[A-Za-z0-9_./-]+$/);const dest=join(out,name);await mkdir(resolve(dest,'..'),{recursive:true});await copyFile(path,dest);files.push({path:name,kind,bytes:(await lstat(dest)).size,sha256:await digest(dest),...extra});return dest;}
await mkdir(out,{recursive:true});
const installerRoot=join(input,'Perfect-V5-Windows-Installer'),portableRoot=join(input,'Perfect-V5-Windows-Portable');
const windows=await json(await unique(installerRoot,'windows-package/report.json'));
const manifest=await json(await unique(installerRoot,'build-manifest.json'));
assert.equal(manifest.sourceCommit,sourceCommit);assert.equal(windows.sourceCommit,sourceCommit);assert.equal(windows.status,'PASS');
const installer=await unique(installerRoot,'Perfect-Harness-Setup-x64.exe'),portable=await unique(portableRoot,'Perfect-Harness-Windows-x64.zip');
assert.equal(await digest(installer),windows.installerSha256);assert.equal(await digest(portable),windows.portableSha256);
const perfRoot=join(input,'v5-performance-evidence'),loopRoot=join(input,'v5-goal-loop-evidence'),winRoot=join(input,'Perfect-V5-Windows-Evidence');
const performance=await json(join(perfRoot,'report.json')),goalLoop=await json(join(loopRoot,'result.json'));
await include(await unique(installerRoot,'build-manifest.json'),'build-manifest.json','report');
await include(await unique(installerRoot,'windows-package/report.json'),'windows-installation-report.json','report');
await include(join(perfRoot,'report.json'),'performance-report.json','report');
await include(join(loopRoot,'controller-evidence.json'),'goal-loop-controller-evidence.json','report');
await include(join(loopRoot,'result.json'),'goal-loop-result.json','report');
const videoInputs=[
 {path:await unique(winRoot,'A-uso-diario.mp4'),name:'videos/A-uso-diario.mp4',scenario:'daily',minimum:60},
 {path:await unique(loopRoot,'.webm'),name:'videos/B-goal-loop.webm',scenario:'goal-loop',minimum:1},
 {path:await unique(winRoot,'C-instalacion-y-actualizacion.mp4'),name:'videos/C-instalacion-y-actualizacion.mp4',scenario:'upgrade',minimum:1},
 {path:await unique(perfRoot,'.webm'),name:'videos/D-motion-y-rendimiento.webm',scenario:'motion',minimum:60},
];
for(const video of videoInputs){
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',video.path],{encoding:'utf8',maxBuffer:2_000_000,timeout:30000}));
 const stream=probe.streams.find(s=>s.codec_type==='video'),duration=Number(probe.format.duration);assert.ok(stream&&duration>=video.minimum,'Incomplete video '+video.name);assert.ok(stream.width>=800&&stream.height>=550);
 const decoded=spawnSync('ffmpeg',['-v','error','-xerror','-i',video.path,'-map','0:v:0','-f','null','-'],{encoding:'utf8',timeout:600000,maxBuffer:4_000_000});assert.equal(decoded.status,0,decoded.stderr);
 const file=await include(video.path,video.name,'video',{scenario:video.scenario,durationSeconds:duration,width:stream.width,height:stream.height,codec:stream.codec_name,frameRate:stream.avg_frame_rate,inspection:'Fully decoded, visual review PENDING. Original capture timing; no interpolation or edited speed.'});
 for(const [i,ratio]of[0.01,0.25,0.5,0.75,0.98].entries()){
  const name=`review-frames/${video.scenario}-${i}.png`,dest=join(out,name);await mkdir(resolve(dest,'..'),{recursive:true});
  execFileSync('ffmpeg',['-v','error','-y','-ss',String(Math.min(duration-0.01,Math.max(0,duration*ratio))),'-i',file,'-frames:v','1','-vf','scale=min(1280\\,iw):-2',dest],{timeout:30000});
  files.push({path:name,kind:'video-frame',bytes:(await lstat(dest)).size,sha256:await digest(dest),video:video.name,timestampSeconds:duration*ratio});
 }
}
for(const [id,root]of[['desktop',join(input,'v5-desktop-ubuntu-24.04')],['windows',winRoot],['loop',loopRoot],['performance',perfRoot]]){
 const images=(await walk(root)).filter(p=>p.endsWith('.png')&&!/failure/i.test(p));
 for(const [i,path]of images.slice(0,70).entries())await include(path,`screenshots/${id}-${String(i).padStart(2,'0')}-${basename(path).replace(/[^A-Za-z0-9_.-]/g,'_')}`,'screenshot',{originArtifact:id});
}
assert.ok(files.filter(f=>f.kind==='screenshot').length>=8);
const acceptance={schemaVersion:1,sourceCommit,version:manifest.version,status:'AUTOMATED_PASS_VISUAL_REVIEW_REQUIRED',gates,windows,performance,goalLoop,distribution:{installerSha256:windows.installerSha256,portableSha256:windows.portableSha256},files,reviewInstructions:'Open the screenshots and videos. Record an explicit version/hash-bound visual review; generation or successful decoding is NOT visual approval.'};
assertAcceptance(acceptance,sourceCommit);
await writeFile(join(out,'acceptance.json'),JSON.stringify(acceptance,null,2));
await writeFile(join(out,'README-REVIEW.txt'),'Perfect Desktop V5\nSource: '+sourceCommit+'\nAutomated gates passed. Visual review is still required.\nVideos are original 1x captures; PNG frames are extracted only to assist review.\nProviders in the goal-loop scenario are explicitly synthetic. Windows is the hosted Server 2025 runner, not the personal Windows 11 PC.\n');
console.log(JSON.stringify({sourceCommit,version:manifest.version,status:acceptance.status,screenshots:files.filter(f=>f.kind==='screenshot').length,videos:videoInputs.map(v=>v.name),directory:relative(process.cwd(),out)},null,2));
