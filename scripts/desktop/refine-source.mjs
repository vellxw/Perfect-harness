import fs from 'node:fs';
const change=(path,before,after)=>{const source=fs.readFileSync(path,'utf8');if(source.split(before).length!==2)throw Error('Nonunique repair anchor: '+path+' '+before);fs.writeFileSync(path,source.replace(before,after));};
change('src/desktop/renderer/ui.tsx','{render(item,start+i)}</div>)}</div>;}','{render(item,start+i)}</div>)}</div></div>;}');
change('src/desktop/renderer/ui.tsx','onClose();}}><div className="modal-header">','onClose();}}}><div className="modal-header">');
change('src/desktop/renderer/ui.tsx','finally{setPending(false);}}><div className="modal-body">','finally{setPending(false);}}}><div className="modal-body">');
change('src/desktop/renderer/ui.tsx','const el=ref.current;el?.showModal();const active=document.activeElement;','const el=ref.current;const active=document.activeElement;el?.showModal();');
change('src/desktop/renderer/index.tsx','notify(String(error));}}><textarea','notify(String(error));}}}><textarea');
change('src/desktop/renderer/index.tsx','useRef<ReturnType<typeof setTimeout>>()','useRef<ReturnType<typeof setTimeout>|undefined>(undefined)');
change('src/desktop/renderer/index.tsx','Empty,VirtualList,label','Empty,label');
change('src/desktop/renderer/work.tsx','label,Detail,jsonResult','label,jsonResult');
change('src/desktop/renderer/integrations.tsx','Row,splitLines,options','Row,splitLines');
change('src/desktop/renderer/trials.tsx','Row,Modal,Status,options','Row,Modal,options');
change('src/desktop/renderer/index.tsx','<button key={p.id} onClick={()=>navigate(p.id)}><span>{p.name}</span>','<button key={p.id} aria-label={p.name} onClick={()=>navigate(p.id)}><span>{p.name}</span>');
// The palette exposes unique accessible labels; exact matching prevents Habilidades matching Estudio de habilidades.
change('scripts/desktop/ui-e2e.mjs',"getByRole('button',{name,exact:false})","getByRole('button',{name,exact:true})");
console.log('Repaired JSX/focus and unique palette labels. Functional assertions are unchanged.');
