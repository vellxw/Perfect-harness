import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const suite=process.argv[2];
if(suite&&!/^[a-z][a-z0-9-]*$/.test(suite))throw Error('Invalid test suite');
async function walk(path){const entries=await readdir(path,{withFileTypes:true});const files=[];for(const e of entries){const full=join(path,e.name);if(e.isDirectory())files.push(...await walk(full));else if(/\.test\.tsx?$/.test(e.name))files.push(full);}return files.sort();}
const files=await walk(suite?join('tests',suite):'tests');
if(!files.length)throw Error('No tests found');
const child=spawn(process.execPath,['--experimental-ffi','--import','tsx','--test','--test-concurrency=1',...files],{stdio:'inherit',env:process.env});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
