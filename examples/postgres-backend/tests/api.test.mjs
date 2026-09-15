import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {migrate} from '../src/migrate.ts';
import {createApp} from '../src/server.ts';
const url=process.env.DATABASE_URL;
if(process.env.PERFECT_EPHEMERAL_DATABASE!=='1'||!url)throw Error('Solo correr contra la base temporal identificada del harness');
test('API real, migraciones idempotentes, concurrencia, persistencia y rollback PostgreSQL',async()=>{
 await migrate(url);await migrate(url);
 let app=createApp(url);
 try{
  const invalid=await app.inject({method:'POST',url:'/reservations',payload:{slot:'',customer:'Ana'}});assert.equal(invalid.statusCode,400);
  const replies=await Promise.all(Array.from({length:8},(_,i)=>app.inject({method:'POST',url:'/reservations',payload:{slot:'10:00',customer:'Persona '+i}})));
  assert.equal(replies.filter(r=>r.statusCode===201).length,1);assert.equal(replies.filter(r=>r.statusCode===409).length,7);
  const injected="O'Connor'); DROP TABLE reservations; --";
  assert.equal((await app.inject({method:'POST',url:'/reservations',payload:{slot:'11:00',customer:injected}})).statusCode,201);
  await app.close();app=createApp(url);
  const list=(await app.inject({method:'GET',url:'/reservations'})).json();assert.equal(list.length,2);assert.equal(list[1].customer,injected);
  const pool=new pg.Pool({connectionString:url,max:1});
  try{
   assert.equal((await pool.query('SELECT * FROM schema_migrations')).rows.length,2);
   const client=await pool.connect();try{await client.query('BEGIN');await client.query('INSERT INTO reservations(slot,customer) VALUES($1,$2)',['12:00','Rollback']);await client.query('ROLLBACK');}finally{client.release();}
   assert.equal((await pool.query('SELECT * FROM reservations WHERE slot=$1',['12:00'])).rowCount,0);
   assert.equal((await pool.query('SELECT version()')).rows[0].version.startsWith('PostgreSQL 18'),true);
  }finally{await pool.end();}
 }finally{await app.close();}
});
