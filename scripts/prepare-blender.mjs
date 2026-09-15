import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';import {tmpdir}from'node:os';import{createHash}from'node:crypto';import{spawn}from'node:child_process';
if(!process.argv.includes('--allow-network'))throw Error('Preparación explícita: revisá el script y pasá --allow-network. Descarga Blender oficial y bibliotecas del sistema; no configura editores personales.');
const version='4.5.13',filename=`blender-${version}-linux-x64.tar.xz`,base='https://download.blender.org/release/Blender4.5/',manifestUrl=base+`blender-${version}.sha256`;
const dir=await mkdtemp(join(tmpdir(),'perfect-blender-prepare-'));
const run=(command,args)=>new Promise((res,rej)=>{const c=spawn(command,args,{shell:false,stdio:'inherit'});c.once('error',rej);c.once('exit',code=>code===0?res():rej(Error(command+' exit '+code)));});
const download=(url,path,limit)=>run('curl',['--fail','--location','--proto','=https','--proto-redir','=https','--tlsv1.2','--connect-timeout','20','--max-time','300','--max-filesize',String(limit),url,'--output',path]);
try{
 const manifestPath=join(dir,'official.sha256');await download(manifestUrl,manifestPath,100000);
 const text=await readFile(manifestPath,'utf8'),entries=text.split(/\r?\n/).map(l=>/^([a-fA-F0-9]{64})\s+\*?(.+?)\s*$/.exec(l)).filter(Boolean),entry=entries.filter(m=>m[2]===filename);
 if(entry.length!==1)throw Error('La lista oficial no identifica el archivo exacto');const expected=entry[0][1].toLowerCase();
 const pinIndex=process.argv.indexOf('--sha256');if(pinIndex>=0&&process.argv[pinIndex+1]!==expected)throw Error('El checksum oficial no coincide con el pin aprobado');
 const archive=join(dir,'blender.tar.xz');await download(base+filename,archive,500000000);const actual=createHash('sha256').update(await readFile(archive)).digest('hex');if(actual!==expected)throw Error('La descarga no coincide con el checksum oficial');
 await writeFile(join(dir,'Dockerfile'),`FROM node:24-bookworm-slim\nRUN apt-get update && apt-get install -y --no-install-recommends xz-utils libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libsm6 libgl1 libegl1 libgomp1 libfontconfig1 && rm -rf /var/lib/apt/lists/*\nCOPY blender.tar.xz /tmp/blender.tar.xz\nRUN echo '${expected}  /tmp/blender.tar.xz' | sha256sum -c - && mkdir -p /opt/blender && tar -xJf /tmp/blender.tar.xz --strip-components=1 -C /opt/blender && rm /tmp/blender.tar.xz && /opt/blender/blender --version\nLABEL perfect.blender.version='${version}' perfect.blender.archive.sha256='${expected}'\n`);
 await run('docker',['build','--tag',`perfect-blender:${version}`,dir]);const out=resolve('test-results/blender-preparation');await mkdir(out,{recursive:true});await writeFile(join(out,'official.sha256'),text);await writeFile(join(out,'source.json'),JSON.stringify({version,url:base+filename,manifestUrl,expected,actual,manifestSha256:createHash('sha256').update(text).digest('hex'),trust:'Checksum publicado por Blender obtenido por HTTPS; no equivale a una firma digital.',image:`perfect-blender:${version}`,license:'GPL; licencia y fuentes oficiales dentro de la distribución Blender. No se incluye en el instalador de Perfect.'},null,2));
 console.log('BLENDER_OFFICIAL_SHA256='+expected);
}finally{await rm(dir,{recursive:true,force:true,maxRetries:5});}
