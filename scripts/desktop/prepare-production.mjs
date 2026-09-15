import fs from 'node:fs';
const filename='scripts/desktop/connect-production.mjs';
const original=fs.readFileSync(filename,'utf8');
let source=original;
const target=source.split('\n').find(line=>line.startsWith("change('src/application/agent-executor.ts','    if (canReadImages)"));
if(!target)throw Error('Missing planned reference-service insertion');
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
source=source.replace(target,`change('src/application/agent-executor.ts',${JSON.stringify(anchor)},${JSON.stringify(insertion)});`);
try {
  fs.writeFileSync(filename,source);
  await import('./connect-production.mjs');
} finally {
  fs.writeFileSync(filename,original);
}
