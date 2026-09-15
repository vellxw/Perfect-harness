export const blenderCollectDriver = String.raw`
import {spawn} from 'node:child_process';import {readFile,writeFile,lstat,mkdir} from 'node:fs/promises';
const spec=JSON.parse(await readFile('/spec.json','utf8'));await mkdir('/workspace/output',{recursive:true});
const command=['--background','--factory-startup','--disable-autoexec','--offline-mode','--threads','2','--python-exit-code','1','--python',spec.stage==='produce'?'/input/'+spec.script:'/driver/verify.py','--','--output','/workspace/output'];
let log='';const code=await new Promise((resolve,reject)=>{const p=spawn('/opt/blender/blender',command,{env:{PATH:'/usr/bin:/bin',HOME:'/tmp',TMPDIR:'/tmp',PYTHONNOUSERSITE:'1',BLENDER_USER_CONFIG:'/tmp/config',BLENDER_USER_SCRIPTS:'/tmp/scripts',OMP_NUM_THREADS:'2'},stdio:['ignore','pipe','pipe']});for(const stream of[p.stdout,p.stderr])stream.on('data',b=>{log=(log+b).slice(-64000)});p.once('error',reject);p.once('close',code=>resolve(code??137));});
if(code){console.error(log);process.exit(Number(code)||1);}
const names=spec.stage==='produce'?[spec.sourceFile]:['asset.glb','preview.png','verification.json'];const files={};let total=0;
for(const name of names){const path='/workspace/output/'+name,s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size<8||s.size>spec.maxBytes||(total+=s.size)>spec.maxBytes)throw Error('Invalid/oversized output '+name);files[name]=(await readFile(path)).toString('base64');}
console.log('PERFECT_BLENDER_PACKAGE:'+JSON.stringify({files,log}));
`;
export const blenderVerificationDriver = String.raw`
import bpy, json, os, math
from mathutils import Vector
with open('/spec.json') as f:spec=json.load(f)
bpy.ops.wm.open_mainfile(filepath='/input/'+spec['sourceFile'],load_ui=False,use_scripts=False)
scene=bpy.context.scene
meshes=[o for o in scene.objects if o.type=='MESH' and len(o.data.vertices)>0]
if not meshes:raise RuntimeError('Source contains no usable mesh')
if sum(len(o.data.vertices) for o in meshes)>1000000:raise RuntimeError('Geometry budget exceeded')
for o in meshes:
 if not all(math.isfinite(v) for row in o.matrix_world for v in row):raise RuntimeError('Nonfinite transform')
 for vertex in o.data.vertices:
  if not all(math.isfinite(v) for v in vertex.co):raise RuntimeError('Nonfinite geometry')
for image in bpy.data.images:
 if image.source=='FILE' and not image.packed_file:raise RuntimeError('External texture requires packing')
points=[o.matrix_world@Vector(corner) for o in meshes for corner in o.bound_box]
lo=Vector(tuple(min(p[i] for p in points)for i in range(3)));hi=Vector(tuple(max(p[i] for p in points)for i in range(3)))
if (hi-lo).length<0.000001 or (hi-lo).length>100000:raise RuntimeError('Degenerate/unbounded geometry')
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.export_scene.gltf(filepath='/workspace/output/asset.glb',export_format='GLB',use_selection=True,export_apply=True)
if not scene.camera:
 center=(lo+hi)*0.5;size=max((hi-lo).length,1)
 bpy.ops.object.camera_add(location=center+Vector((size,-size,size*.65)))
 camera=bpy.context.object;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=50;scene.camera=camera
if not any(o.type=='LIGHT' for o in scene.objects):
 bpy.ops.object.light_add(type='AREA',location=(hi.x+3,lo.y-3,hi.z+5));bpy.context.object.data.energy=700;bpy.context.object.data.size=5
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16
scene.render.resolution_x=spec['width'];scene.render.resolution_y=spec['height'];scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath='/workspace/output/preview.png'
bpy.ops.render.render(write_still=True)
report={'blender':bpy.app.version_string,'sourceReopened':True,'meshCount':len(meshes),'vertices':sum(len(o.data.vertices)for o in meshes),'bounds':[list(lo),list(hi)],'export':'asset.glb','width':spec['width'],'height':spec['height'],'validator':'trusted-controller-script-separate-process'}
with open('/workspace/output/verification.json','w')as f:json.dump(report,f)
`;
export const glbBrowserDriver = String.raw`
import {chromium} from 'playwright';import{readFile,writeFile}from'node:fs/promises';
const spec=JSON.parse(await readFile('/spec.json','utf8'));const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:spec.width,height:spec.height},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());const files={'/':'index.html','/three.module.js':'three.module.js','/three.core.js':'three.core.js','/GLTFLoader.js':'GLTFLoader.js','/BufferGeometryUtils.js':'BufferGeometryUtils.js','/asset.glb':'asset.glb'};const name=files[u.pathname];if(u.hostname!=='perfect-asset.test'||!name){await route.abort();return;}await route.fulfill({status:200,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.html')?'text/html':'model/gltf-binary',body:await readFile('/input/'+name)});});
 await page.goto('http://perfect-asset.test/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.assetResult||window.assetError,null,{timeout:30000});
 const result=await page.evaluate(()=>({result:window.assetResult,error:window.assetError}));if(result.error||errors.length)throw Error(result.error||errors.join('; '));
 if(!result.result.meshes||result.result.nonBackground<20)throw Error('GLB loader produced empty render');
 await page.screenshot({path:'/output/runtime.png'});
 const preview=(await readFile('/input/preview.png')).toString('base64');const stats=await page.evaluate(async data=>{const i=new Image();i.src='data:image/png;base64,'+data;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let min=255,max=0;for(let p=0;p<d.length;p+=4){const v=(d[p]+d[p+1]+d[p+2])/3;min=Math.min(min,v);max=Math.max(max,v);}return{width:i.width,height:i.height,range:max-min};},preview);
 if(stats.width!==spec.width||stats.height!==spec.height||stats.range<5)throw Error('Blender PNG missing, undecodable or blank');
 await writeFile('/output/runtime-report.json',JSON.stringify({loader:'Three.js GLTFLoader',renderer:'Chromium WebGL SwiftShader',...result.result,preview:stats,errors},null,2));console.log('GLB_RUNTIME_VERIFIED');
}finally{await browser.close();}
`;
export const glbViewerHtml = `<!doctype html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three.module.js"}}</script><style>body{margin:0;background:#101522}canvas{display:block}</style></head><body><script type="module">
import * as THREE from 'three';import {GLTFLoader} from '/GLTFLoader.js';
try{
 const model=await new GLTFLoader().loadAsync('/asset.glb');const scene=new THREE.Scene();scene.background=new THREE.Color('#101522');scene.add(model.scene);
 const box=new THREE.Box3().setFromObject(model.scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());let meshes=0;model.scene.traverse(o=>{if(o.isMesh)meshes++;});if(!meshes||!Number.isFinite(size.length())||size.length()<=0)throw Error('No usable geometry');
 const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.01,Math.max(1000,size.length()*100));const d=Math.max(size.length(),1)*1.5;camera.position.copy(center).add(new THREE.Vector3(d,-d,d*.75));camera.up.set(0,1,0);camera.lookAt(center);
 scene.add(new THREE.HemisphereLight(0xffffff,0x303050,3));const key=new THREE.DirectionalLight(0xffffff,4);key.position.set(d,d,d);scene.add(key);
 const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(innerWidth,innerHeight);document.body.appendChild(r.domElement);r.render(scene,camera);
 const gl=r.getContext(),pixels=new Uint8Array(innerWidth*innerHeight*4);gl.readPixels(0,0,innerWidth,innerHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let changed=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-pixels[0])+Math.abs(pixels[i+1]-pixels[1])+Math.abs(pixels[i+2]-pixels[2])>15)changed++;
 window.assetResult={meshes,bounds:[box.min.toArray(),box.max.toArray()],nonBackground:changed,three:THREE.REVISION};
}catch(e){window.assetError=String(e);}
</script></body></html>`;
