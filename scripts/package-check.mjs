import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'perfect-package-'));
try{
 const packed=JSON.parse(execFileSync('npm',['pack','--json','--pack-destination',directory],{encoding:'utf8'}));
 execFileSync('npm',['install','--prefix',directory,'--no-audit','--no-fund',join(directory,packed[0].filename)],{stdio:'inherit'});
 const root=join(directory,'node_modules','perfect-harness'),binary=join(root,'dist','cli','index.js');
 assert.equal(execFileSync(process.execPath,[binary,'--version'],{encoding:'utf8'}).trim(),'0.1.0');
 const help=execFileSync(process.execPath,[binary,'--help'],{encoding:'utf8'});assert.ok(help.includes('smoke'));assert.ok(help.includes('resume'));
 assert.equal(JSON.parse(await readFile(join(root,'package.json'),'utf8')).bin.perfect,'dist/cli/index.js');
 await import(pathToFileURL(join(root,'dist','pi-extension','index.js')).href);
 console.log('Clean package installation, CLI and Pi extension import passed.');
}finally{await rm(directory,{recursive:true,force:true});}
