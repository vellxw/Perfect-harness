import fs from 'node:fs';
const filename='scripts/desktop/connect-production.mjs',original=fs.readFileSync(filename,'utf8');
let source=original;
const line=source.split('\n').find(l=>l.startsWith("change('src/application/agent-executor.ts','    if (canReadImages)"));
if(!line)throw Error('Missing planned reference-service insertion');
const anchor='      ...(definition.capabilities.includes("image")';
const insertion=`      ...(goal.references?.length ? { readReference: async (referenceId: string, offset: number) => {
        signal.throwIfAborted();
        const { reference, bytes } = await readGoalReference(goal, referenceId);
        if (reference.kind === "image") {
          if (!definition.capabilities.includes("image")) throw new Blocked("REFERENCE_VISION_REQUIRED", "El perfil no admite imágenes");
          return {name: reference.name, sha256: reference.sha256, mimeType: reference.mimeType, data: bytes.toString("base64")};
        }
        const text = bytes.toString("utf8");
        return {name: reference.name, sha256: reference.sha256, mimeType: reference.mimeType, text: text.slice(offset, offset + 16000), ...(offset + 16000 < text.length ? {nextOffset:offset + 16000} : {})};
      }} : {}),
`+anchor;
source=source.replace(line,`change('src/application/agent-executor.ts',${JSON.stringify(anchor)},${JSON.stringify(insertion)});`);
// Whitespace-only differences in formatting do not change the selected source tokens.
const originalChange=source.split('\n').find(l=>l.startsWith('const change='));
if(!originalChange)throw Error('Missing source transformer');
source=source.replace(originalChange,`const change=(p,a,b)=>{const s=fs.readFileSync(p,'utf8');if(s.split(a).length===2){fs.writeFileSync(p,s.replace(a,b));return;}const escaped=a.trim().split(/\\s+/).map(part=>part.replace(/[.*+?^$\u007b\u007d()|[\\]\\\\]/g,'\\\\$&'));const pattern=new RegExp(escaped.join('\\\\s+'),'g');const hits=[...s.matchAll(pattern)];if(hits.length!==1)throw Error('Nonunique source tokens '+p+' '+a.slice(0,120));const m=hits[0];fs.writeFileSync(p,s.slice(0,m.index)+b.trim()+s.slice(m.index+m[0].length));};`);
try { fs.writeFileSync(filename,source); await import('./connect-production.mjs'); }
finally { fs.writeFileSync(filename,original); }
