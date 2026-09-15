import fs from 'node:fs';
const filename='scripts/desktop/connect-production.mjs';
const original=fs.readFileSync(filename,'utf8');
let source=original;
const imageTarget=source.split('\n').find(line=>line.startsWith("change('src/application/agent-executor.ts','    if (canReadImages)"));
if(!imageTarget)throw Error('Missing planned reference-service insertion');
const imageAnchor='      ...(definition.capabilities.includes("image")';
const imageInsertion=`      ...(goal.references?.length ? { readReference: async (referenceId: string, offset: number) => {
        signal.throwIfAborted();
        const { reference, bytes } = await readGoalReference(goal, referenceId);
        if (reference.kind === "image") {
          if (!definition.capabilities.includes("image")) throw new Blocked("REFERENCE_VISION_REQUIRED", "El perfil no admite imágenes");
          return {name: reference.name, sha256: reference.sha256, mimeType: reference.mimeType, data: bytes.toString("base64")};
        }
        const text = bytes.toString("utf8");
        return {name: reference.name, sha256: reference.sha256, mimeType: reference.mimeType, text: text.slice(offset, offset + 16000), ...(offset + 16000 < text.length ? {nextOffset:offset + 16000} : {})};
      }} : {}),
`+imageAnchor;
source=source.replace(imageTarget,`change('src/application/agent-executor.ts',${JSON.stringify(imageAnchor)},${JSON.stringify(imageInsertion)});`);
const grantsTarget=source.split('\n').find(line=>line.startsWith("change('src/desktop/main/index.ts','        grantedPaths.clear();"));
if(!grantsTarget)throw Error('Missing workspace grant revocation insertion');
const grantsAnchor='      grantedPaths.clear();';
const grantsInsertion=`      grantedPaths.clear();
      recentPaths=[...new Set([workspace,...recentPaths])].slice(0,12);
      void writeFile(join(home,"desktop-recent.json"),JSON.stringify(recentPaths),{mode:0o600});`;
source=source.replace(grantsTarget,`change('src/desktop/main/index.ts',${JSON.stringify(grantsAnchor)},${JSON.stringify(grantsInsertion)});`);
try {
  fs.writeFileSync(filename,source);
  await import('./connect-production.mjs');
} finally {
  fs.writeFileSync(filename,original);
}
