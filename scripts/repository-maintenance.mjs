import {readFile,writeFile} from 'node:fs/promises';
import {z} from 'zod';
import {ConfigSchema,defaultConfig} from '../src/config/schema.ts';
// One-time, reviewable repository maintenance. No credentials or external repository access.
async function replaceOnce(path,before,after){const text=await readFile(path,'utf8');if(!text.includes(before))throw Error('Expected source fragment missing in '+path);if(text.indexOf(before)!==text.lastIndexOf(before))throw Error('Ambiguous source replacement in '+path);await writeFile(path,text.replace(before,after));}
await replaceOnce('src/examples/reservation-tests.ts',"const slots=await(await fetch(app.url+'/api/slots')).json();assert.ok(slots.length>=4);assert.ok(slots.every(s=>typeof s.id==='string'&&s.available===true));","const response=await fetch(app.url+'/api/slots');const slots=await response.json();const diagnostic=JSON.stringify({node:process.version,status:response.status,slots});assert.equal(response.status,200,diagnostic);assert.ok(Array.isArray(slots),diagnostic);assert.ok(slots.length>=4,diagnostic);assert.ok(slots.every(s=>typeof s.id==='string'&&s.available===true),diagnostic);");
await writeFile('perfect.config.example.json',JSON.stringify(defaultConfig(),null,2)+'\n');
await writeFile('perfect.config.schema.json',JSON.stringify(z.toJSONSchema(ConfigSchema),null,2)+'\n');
