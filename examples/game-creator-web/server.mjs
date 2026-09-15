import {build} from 'esbuild';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
await build({entryPoints:['src/app.jsx'],bundle:true,format:'esm',outfile:'public/app.js',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'});
const server=http.createServer(async(req,res)=>{const name=req.url==='/'?'index.html':req.url==='/app.js'?'app.js':null;if(!name){res.writeHead(404);res.end();return;}try{res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');res.end(await readFile('public/'+name));}catch{res.writeHead(500);res.end();}});
server.listen(Number(process.env.PORT??3000),'0.0.0.0');for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
