// Temporary, exact and idempotent migration adjustments. Removed after the prepared commit.
import {readFile,writeFile} from 'node:fs/promises';
const changes=[
 ['src/presentation/client.ts',')),windowsHide:true}', '))}'],
 ['src/presentation/client.ts','new URL("./worker.js",import.meta.url)','new URL(import.meta.url.endsWith(".ts")?"./worker.ts":"./worker.js",import.meta.url)'],
 ['src/presentation/engine.ts','savePolicy(this.home,policy)','savePolicy(policy,this.home)'],
 ['src/presentation/worker.ts','process.disconnect?.();','if(process.connected)process.disconnect?.();'],
 ['src/adapters/sqlite/store.ts','const level = this.depth++, before = this.changed;','const level = this.depth, before = this.changed;'],
 ['src/adapters/sqlite/store.ts','this.db.exec(level ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");','this.db.exec(level ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");\n    this.depth++;'],
 ['src/cli/main.ts','.version("0.1.0")','.version("0.2.0")'],
 ['src/cli/doctor.ts','process.versions.node.split(".")[0] === "24"','process.versions.node.split(".")[0] === "26" && Number(process.versions.node.split(".")[1]) >= 4'],
 ['src/cli/doctor.ts','supported runtime is Node 24 LTS','supported runtime is Node 26.4+ (26.x), pinned for OpenTUI FFI'],
 ['src/adapters/git/workspace.ts','if (!resolve(worktree).startsWith(`${resolve(this.root)}/worktrees/`))','if (relative(join(this.root, "worktrees"), resolve(worktree)).startsWith("..") || relative(join(this.root, "worktrees"), resolve(worktree)) === "")'],
];
for(const [path,before,after] of changes){const source=await readFile(path,'utf8');if(source.includes(after))continue;if(!source.includes(before))throw Error(`Migration precondition missing: ${path} / ${before}`);await writeFile(path,source.replace(before,after));}
