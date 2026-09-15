import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'perfect-package-'));
const version=JSON.parse(await readFile('package.json','utf8')).version;
const npm=process.env.npm_execpath;
if(!npm)throw Error('Run this check through npm run test:package');
try{
 const packed=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',directory],{encoding:'utf8'}));
 execFileSync(process.execPath,[npm,'install','--prefix',directory,'--ignore-scripts','--no-audit','--no-fund',join(directory,packed[0].filename)],{stdio:'inherit'});
 const root=join(directory,'node_modules','perfect-harness'),binary=join(root,'dist','cli','index.js');
 assert.equal(execFileSync(process.execPath,[binary,'--version'],{encoding:'utf8'}).trim(),version);
 const help=execFileSync(process.execPath,[binary,'--no-ui','--help'],{encoding:'utf8'});
 assert.ok(help.includes('smoke')&&help.includes('resume'));
 assert.equal(JSON.parse(await readFile(join(root,'package.json'),'utf8')).bin.perfect,'dist/cli/index.js');
 await import(pathToFileURL(join(root,'dist','pi-extension','index.js')).href);
 await readFile(join(root,'dist','presentation','worker.js'));
 await readFile(join(root,'dist','ui','tui','app.js'));
 console.log('Clean package installation, classic CLI, Pi extension and TUI worker files passed.');
}finally{await rm(directory,{recursive:true,force:true});}
