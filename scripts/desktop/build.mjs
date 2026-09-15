import {build} from 'esbuild';
import {mkdir,writeFile,copyFile,readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const output=resolve('desktop');await mkdir(output,{recursive:true});const pkg=JSON.parse(await readFile('package.json','utf8'));
await build({entryPoints:['src/desktop/main/index.ts'],bundle:true,platform:'node',format:'cjs',target:'node24',outfile:join(output,'main.cjs'),external:['electron'],logLevel:'info',metafile:true});
await build({entryPoints:['src/desktop/preload/index.ts'],bundle:true,platform:'node',format:'cjs',target:'node24',outfile:join(output,'preload.cjs'),external:['electron'],logLevel:'info'});
const renderer=await build({entryPoints:{renderer:'src/desktop/renderer/index.tsx'},bundle:true,platform:'browser',format:'esm',target:'chrome140',outdir:output,chunkNames:'chunks/[name]-[hash]',splitting:true,jsx:'automatic',jsxImportSource:'react',minify:true,metafile:true,define:{'process.env.NODE_ENV':'"production"'},logLevel:'info'});
const forbidden=Object.keys(renderer.metafile.inputs).filter(p=>/node_modules\/(?:electron|@earendil|@opentui)|src\/(?:application|adapters|config)\//.test(p));if(forbidden.length)throw Error('Node/core code in renderer: '+forbidden.join(','));
await writeFile(join(output,'index.html'),'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Perfect Harness</title><link rel="stylesheet" href="renderer.css"></head><body><div id="root"></div><script type="module" src="renderer.js"></script></body></html>');
await writeFile(join(output,'package.json'),JSON.stringify({name:'perfect-desktop',version:pkg.version,main:'main.cjs',description:'Perfect Harness Desktop',author:'Perfect Harness contributors'},null,2));
await writeFile(join(output,'engine-dev.json'),JSON.stringify({node:process.execPath}));await mkdir(join(output,'assets'),{recursive:true});
for(const name of ['perfect-symbol.svg','perfect.ico','perfect-256.png'])await copyFile(join('assets/brand',name),join(output,'assets',name));
await mkdir('test-results/desktop',{recursive:true});await writeFile('test-results/desktop/bundle.json',JSON.stringify({node:process.version,rendererBytes:(await Promise.all((await readdir(output)).filter(n=>/\.(js|css)$/.test(n)).map(n=>readFile(join(output,n))))).reduce((a,b)=>a+b.length,0),coreModulesInRenderer:forbidden,rendererInputs:Object.keys(renderer.metafile.inputs)},null,2));

await writeFile(join(output,'build-info.json'),JSON.stringify({version:pkg.version,sourceCommit:process.env.GITHUB_SHA??(await import('node:child_process')).execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}));
