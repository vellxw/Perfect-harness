export const reservationGoal='Build a responsive reservation app with a native Node.js 24 HTTP API, SQLite persistence and protection against concurrent double booking. Preserve and pass the existing tests. Use the planner, a general worker, frontend specialist, backend specialist, independent Oracle review, browser verification and an evidence Judge. Serve on PORT (default 3000). The UI must let a visitor select an available slot, enter their name and reserve it; success text must include Reservation confirmed. No external dependencies are necessary.';
export const reservationTests=String.raw`
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../backend/app.mjs';
async function start(database){const app=createApp({database});await new Promise(r=>app.server.listen(0,'0.0.0.0',r));return {...app,url:'http://127.0.0.1:'+app.server.address().port};}
const post=(url,body)=>fetch(url+'/api/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
test('API validation, concurrent uniqueness and persistence after restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'reservations-test-'));const database=join(dir,'state.sqlite');let app=await start(database);
  try{
    const slots=await(await fetch(app.url+'/api/slots')).json();assert.ok(slots.length>=4);assert.ok(slots.every(s=>typeof s.id==='string'&&s.available===true));
    assert.equal((await post(app.url,{slot:slots[0].id,name:''})).status,400);
    assert.equal((await post(app.url,{slot:'invalid',name:'Test Visitor'})).status,400);
    assert.equal((await post(app.url,{slot:slots[0].id,name:123})).status,400);
    const attempts=await Promise.all(Array.from({length:8},()=>post(app.url,{slot:slots[0].id,name:'Test Visitor'})));
    assert.equal(attempts.filter(r=>r.status===201).length,1);assert.equal(attempts.filter(r=>r.status===409).length,7);
    const before=await(await fetch(app.url+'/api/reservations')).json();assert.equal(before.length,1);
    await app.close();app=await start(database);
    const after=await(await fetch(app.url+'/api/reservations')).json();assert.equal(after.length,1);assert.equal(after[0].name,'Test Visitor');
    const remaining=await(await fetch(app.url+'/api/slots')).json();assert.equal(remaining.find(s=>s.id===slots[0].id).available,false);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
`;
