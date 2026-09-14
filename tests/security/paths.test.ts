import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, link, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileBroker } from '../../src/tools/file-broker.js';
import { SqliteStore } from '../../src/adapters/sqlite/store.js';
import { OwnershipManager } from '../../src/application/ownership.js';
import { makeTask } from '../fixtures/domain.js';

test('broker rejects secrets, traversal, symlinks, hardlinks, protected verifiers and out-of-ownership writes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'perfect-security-')),store=new SqliteStore(':memory:');
  try{
    await mkdir(join(root,'src'));await writeFile(join(root,'.env'),'TOKEN=secret');await writeFile(join(root,'src','safe.txt'),'original');
    await symlink(join(root,'.env'),join(root,'src','link'));await link(join(root,'src','safe.txt'),join(root,'src','hardlink'));
    const ownership=new OwnershipManager(store),lease=ownership.acquire(makeTask(),root,60000);
    const broker=new FileBroker(root,{readOnly:false,protectedPaths:['references'],maxFileBytes:1000,frozenFiles:{'src/test.mjs':'frozen'}},ownership,lease.id);
    await assert.rejects(()=>broker.read('.env'),/SECRET/);
    await assert.rejects(()=>broker.read('../outside'),/PATH_DENIED/);
    await assert.rejects(()=>broker.read('src/link'),/LINK_DENIED/);
    await assert.rejects(()=>broker.read('src/hardlink'),/LINK_DENIED/);
    await assert.rejects(()=>broker.write('other/file','x'),/OWNERSHIP/);
    await assert.rejects(()=>broker.write('src/test.mjs','x'),/FROZEN/);
    await assert.rejects(()=>broker.write('references/target.png','x'),/PROTECTED/);
    const saved=await broker.write('src/new.txt','ok');assert.equal((await broker.read('src/new.txt')).content,'ok');
    await assert.rejects(()=>broker.write('src/new.txt','changed','wrong'),/STALE/);
    await broker.write('src/new.txt','updated',saved.hash);
    const readonly=new FileBroker(root,{readOnly:true,protectedPaths:[],maxFileBytes:1000,frozenFiles:{}});
    await assert.rejects(()=>readonly.write('src/new.txt','no'),/READ_ONLY/);
  }finally{store.close();await rm(root,{recursive:true,force:true});}
});
