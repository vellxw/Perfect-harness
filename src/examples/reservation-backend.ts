export const backendApp=String.raw`
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const SLOTS=['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00'];
export function createApp({database=':memory:'}={}){
  const db=new DatabaseSync(database,{timeout:3000});
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS reservations(id INTEGER PRIMARY KEY,slot TEXT NOT NULL UNIQUE,name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80));');
  const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
  const server=createServer(async(req,res)=>{
    try{
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET'&&path==='/api/slots'){
        const booked=new Set(db.prepare('SELECT slot FROM reservations').all().map(r=>r.slot));return send(res,200,SLOTS.map(slot=>({id:slot,available:!booked.has(slot)})));
      }
      if(req.method==='GET'&&path==='/api/reservations')return send(res,200,db.prepare('SELECT id,slot,name FROM reservations ORDER BY id').all());
      if(req.method==='POST'&&path==='/api/reservations'){
        if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'JSON required'});
        let body='';for await(const chunk of req){body+=chunk.toString();if(body.length>8192)return send(res,413,{error:'Body too large'});}
        let value;try{value=JSON.parse(body);}catch{return send(res,400,{error:'Invalid JSON'});}
        if(!value||typeof value.name!=='string'||value.name.trim().length<2||value.name.trim().length>80||!SLOTS.includes(value.slot))return send(res,400,{error:'Invalid name or slot'});
        try{const result=db.prepare('INSERT INTO reservations(slot,name) VALUES(?,?)').run(value.slot,value.name.trim());return send(res,201,{id:Number(result.lastInsertRowid),slot:value.slot,name:value.name.trim()});}
        catch(error){if(error.errcode===2067||String(error.message).includes('UNIQUE constraint'))return send(res,409,{error:'Slot already reserved'});throw error;}
      }
      const assets={'/':['index.html','text/html'],'/style.css':['style.css','text/css'],'/app.js':['app.js','text/javascript']};
      const asset=assets[path];if(req.method==='GET'&&asset){const data=await readFile(join(process.cwd(),'public',asset[0]));res.writeHead(200,{'content-type':asset[1]+'; charset=utf-8','x-content-type-options':'nosniff'});res.end(data);return;}
      send(res,404,{error:'Not found'});
    }catch(error){console.error(error.message);if(!res.headersSent)send(res,500,{error:'Internal error'});else res.end();}
  });
  let closed=false;
  return{server,close:()=>new Promise((resolve,reject)=>{if(closed){resolve();return;}closed=true;server.close(error=>{db.close();error?reject(error):resolve();});})};
}
`;
export const backendStart=String.raw`
import {createApp} from './app.mjs';
const app=createApp({database:process.env.DB_FILE??'/tmp/perfect-reservations.sqlite'});
app.server.listen(Number(process.env.PORT??3000),'0.0.0.0',()=>console.log('Reservation server ready'));
process.on('SIGTERM',()=>{app.close().finally(()=>process.exit());});
`;
