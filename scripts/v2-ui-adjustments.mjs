// Temporary exact adjustments discovered by the first real compatibility/test runs.
import {readFile,writeFile} from 'node:fs/promises';
let path='src/ui/tui/app.tsx',source=await readFile(path,'utf8');
source=source.replaceAll('onSubmit={(value) => {\n                  mutate({','onSubmit={(value) => {\n                  if (typeof value !== "string") return;\n                  mutate({');
await writeFile(path,source);
