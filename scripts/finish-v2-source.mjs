// One-time source migration: retain the exact typed approval guard while making every criterion readable.
import {readFile,writeFile} from 'node:fs/promises';
const path='src/ui/tui/app.tsx';let source=await readFile(path,'utf8');
const anchor='\nfunction Confirm({';
if(source.includes(anchor)){source=source.slice(0,source.indexOf(anchor))+'\n';source='import {ApprovalDialog as Confirm} from "./approval.js";\n'+source;await writeFile(path,source);}
else if(!source.includes('ApprovalDialog as Confirm'))throw Error('Unexpected approval component shape');
