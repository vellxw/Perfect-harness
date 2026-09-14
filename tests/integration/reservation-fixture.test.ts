import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {backendApp} from '../../src/examples/reservation-backend.js';
import {reservationTests} from '../../src/examples/reservation-tests.js';
import {processRun} from '../../src/adapters/git/process.js';

test('authored reservation fixture independently satisfies the API contract',async()=>{
  const root=await mkdtemp(join(tmpdir(),'perfect-fixture-'));
  try{await mkdir(join(root,'backend'));await mkdir(join(root,'tests'));await writeFile(join(root,'backend','app.mjs'),backendApp);await writeFile(join(root,'tests','reservations.test.mjs'),reservationTests);const result=await processRun(process.execPath,['--test','tests/reservations.test.mjs'],{cwd:root,env:{PATH:process.env.PATH,HOME:'/tmp'},timeoutMs:20000});assert.equal(result.code,0,`${result.stdout}\n${result.stderr}`);}
  finally{await rm(root,{recursive:true,force:true});}
});
