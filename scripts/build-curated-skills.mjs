// Maintainer operation: fetch fixed public text files only, verify Git blob IDs,
// preserve upstream licenses and emit a reproducible, lazy resource library.
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sources=[
 {id:'perfect-tdd-matt',repo:'mattpocock/skills',commit:'3cca18b368ae95cdbdebbff572ccafa662551015',prefix:'skills/engineering/tdd/',license:'MIT',sets:['general','backend'],triggers:[],description:'TDD de Matt Pocock adaptado al contrato aprobado. Carga manual: upstream desactiva la invocación automática.',intro:'Usá el contrato aceptado en lugar de repetir preguntas ya resueltas. Consultá references/upstream/SKILL.md. Todas las rutas relativas de ese recurso se resuelven bajo references/upstream/. No redefine el Planner, los permisos ni DONE. Esta adaptación conserva la selección manual indicada por upstream.'},
 {id:'perfect-react-vercel',repo:'vercel-labs/agent-skills',commit:'063bee94c3f4df8453406c830b0a7df0f2860278',prefix:'skills/react-best-practices/',license:'MIT',sets:['frontend-web'],triggers:['rendimiento react','react performance','waterfall','bundle react','server component'],description:'Reglas React de Vercel bajo demanda, priorizadas por problema observado. No impone optimización prematura ni cambios de framework.',intro:'Consultá references/upstream/SKILL.md como índice, y solo las reglas pertinentes en references/upstream/rules/. Evitá cargar AGENTS.md completo cuando basta una regla. Las decisiones del proyecto y pruebas del harness prevalecen. No modificá el diseño ni introduzcas servicios para cumplir una recomendación de rendimiento.'},
 {id:'perfect-impeccable-polish',repo:'pbakaus/impeccable',commit:'2149fcce39a90bb409df5f16515f316a76dc6199',paths:['.agent/skills/impeccable/reference/polish.md','.agent/skills/impeccable/reference/layout.md','.agent/skills/impeccable/reference/typography.md'],license:'Apache-2.0',sets:['frontend-web'],triggers:['pulir interfaz','polish','refinamiento visual','jerarquia visual'],description:'Refinamiento visual con módulos seleccionados de Impeccable. Respeta la referencia aprobada, sin hooks ni ejecutables de la colección.',intro:'Consultá references/polish.md, references/layout.md o references/typography.md según el problema. Sus preferencias estéticas son sugerencias subordinadas al brief. No llames agentes, hooks ni herramientas de Impeccable; usá únicamente las herramientas autorizadas de Perfect. Los enlaces a módulos no incluidos son referencias externas, no instrucciones de instalarlos.'},
];
const digest=(b)=>createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');
async function fetchBytes(url,max=8_000_000){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{'User-Agent':'Perfect-curated-build'}});if(!r.ok)throw Error(`${r.status} ${url}`);const b=Buffer.from(await r.arrayBuffer());if(b.length>max)throw Error('oversize');return b;}
const output=[];
for(const source of sources){
 const tree=JSON.parse((await fetchBytes(`https://api.github.com/repos/${source.repo}/git/trees/${source.commit}?recursive=1`)).toString());if(tree.truncated)throw Error('Truncated source tree');
 const entries=tree.tree.filter(e=>e.type==='blob'&&(source.prefix?e.path.startsWith(source.prefix):source.paths.includes(e.path)));
 const notices=tree.tree.filter(e=>e.type==='blob'&&/^(LICENSE(?:\.md|\.txt)?|NOTICE(?:\.md|\.txt)?)$/.test(e.path));
 if(!entries.length||entries.length+notices.length>124)throw Error('Invalid package size '+source.id);
 const files={};
 for(const entry of [...entries,...notices]){
  if(!['100644','100755'].includes(entry.mode)||entry.size>1_000_000)throw Error('Unsafe entry');
  if(!/\.(?:md|txt|json|css)$/.test(entry.path)&&!notices.includes(entry))continue;
  const bytes=await fetchBytes(`https://raw.githubusercontent.com/${source.repo}/${source.commit}/${entry.path}`,1_000_000);
  if(digest(bytes)!==entry.sha)throw Error('Git integrity mismatch '+entry.path);
  const name=notices.includes(entry)?entry.path:source.prefix?'references/upstream/'+entry.path.slice(source.prefix.length):'references/'+entry.path.split('/').at(-1);
  files[name]=bytes.toString('base64');
 }
 if(source.id==='perfect-react-vercel'){
  const body=Buffer.from(files['references/upstream/SKILL.md'],'base64').toString();
  if(!/^license:\s*MIT\s*$/m.test(body))throw Error('Upstream MIT declaration changed');
  files['LICENSE-DECLARATION.txt']=Buffer.from('The pinned upstream SKILL.md explicitly declares license: MIT. Author metadata: Vercel. Preserve this attribution and the original metadata. Repository: https://github.com/'+source.repo+'\nCommit: '+source.commit+'\n').toString('base64');
 }else if(!notices.some(n=>n.path.startsWith('LICENSE')))throw Error('License missing');
 const detail=`---\nname: ${source.id}\ndescription: ${JSON.stringify(source.description)}\nlicense: ${source.license}\nmetadata:\n  version: "1.0.0"\n---\n\n# ${source.id}\n\n${source.intro}\n\nOrigen: https://github.com/${source.repo}\nVersión fijada: ${source.commit}\n\nLos recursos originales se conservan íntegros y en su idioma. La adaptación cambia selección, entrada y vinculación a herramientas, no atribuye autoridad a instrucciones externas.\n`;
 files['SKILL.md']=Buffer.from(detail).toString('base64');
 files['ADAPTATION.md']=Buffer.from(`# Adaptación Perfect\n${source.intro}\n\nSource ${source.repo}@${source.commit}\nOriginal resources are unchanged. No upstream executable, hook or install script is bundled.\n`).toString('base64');
 output.push({id:source.id,repo:source.repo,commit:source.commit,license:source.license,sets:source.sets,triggers:source.triggers,files});
 console.log(source.id,Object.keys(files).length,'files',source.license,source.commit);
}
await mkdir('src/skills',{recursive:true});
const code=`// Generated from fixed public source trees by scripts/build-curated-skills.mjs.\nimport { releaseFromFiles } from './importer.js';\nimport type { SkillRelease } from './model.js';\nconst sources = ${JSON.stringify(output,null,2)};\nexport function curatedSkills(): SkillRelease[] {\n return sources.map(s=>releaseFromFiles({files:Object.fromEntries(Object.entries(s.files).map(([name,data])=>[name,Buffer.from(data,'base64')])),provenance:{kind:'builtin',source:'https://github.com/'+s.repo,commit:s.commit,license:s.license,redistribution:'allowed',reviewedBy:'project-maintainers',adaptation:'Entrada española controlada, módulos originales y licencias preservados; no hooks ni instaladores'},defaultSets:s.sets,triggers:s.triggers,privacy:'public',packageId:s.id}));\n}\n`;
await writeFile('src/skills/curated.ts',code);
await mkdir('docs/skills',{recursive:true});
await writeFile('docs/skills/upstream-lock.json',JSON.stringify(output.map(({files,...s})=>({...s,files:Object.fromEntries(Object.entries(files).map(([name,b64])=>[name,createHash('sha256').update(Buffer.from(b64,'base64')).digest('hex')]))})),null,2)+'\n');
