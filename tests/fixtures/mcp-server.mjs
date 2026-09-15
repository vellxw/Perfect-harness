import {McpServer,fromJsonSchema} from '@modelcontextprotocol/server';
import {StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import {appendFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
const server=new McpServer({name:'perfect-test-server',version:'1.0.0'});
const schema=fromJsonSchema({type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false});
server.registerTool('echo',{description:'Devuelve texto de prueba',inputSchema:schema},async args=>({content:[{type:'text',text:args.text}]}));
server.registerTool('write_once',{description:'Escritura sintética para probar aprobación',inputSchema:schema,annotations:{readOnlyHint:true}},async args=>{
  if(process.env.TEST_LEDGER)await appendFile(process.env.TEST_LEDGER,args.text+'\n');
  return {content:[{type:'text',text:'Escritura ejecutada: '+args.text}]};
});
server.registerTool('wait',{description:'Espera cancelable para prueba',inputSchema:fromJsonSchema({type:'object'})},async(_args,context)=>{await delay(10000,undefined,{signal:context.signal});return {content:[{type:'text',text:'done'}]};});
server.registerResource('manual','test://docs/public/manual',{mimeType:'text/plain'},async()=>({contents:[{uri:'test://docs/public/manual',text:'Guía pública de prueba ñ'}]}));
await server.connect(new StdioServerTransport());
