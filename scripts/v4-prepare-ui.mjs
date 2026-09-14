import fs from 'node:fs';
let script=fs.readFileSync('scripts/v4-wire-ui.mjs','utf8');
function replaceLine(prefix,next){const line=script.split('\n').find(l=>l.startsWith(prefix));if(!line)throw Error('Missing patch: '+prefix);script=script.replace(line,next);}
replaceLine("change('src/ui/tui/app.tsx','  const [screen,",`change('src/ui/tui/app.tsx','  const [screen, setScreen] = useState<Screen>(initialScreen),','  const [studioSubject, setStudioSubject] = useState("");\\n  const [bindingProfile, setBindingProfile] = useState<string>();\\n  const [screen, setScreen] = useState<Screen>(initialScreen),');`);
const old='  snapshot(\n    goal: Pick<Goal, "id" | "source">,\n    base: PerfectConfig,\n  ): StudioSnapshot {';
const next=old.replace('    base: PerfectConfig,','    base: PerfectConfig,\n    modeOverride?: string,');
replaceLine("change('src/skills/registry.ts','    base: PerfectConfig,",`change('src/skills/registry.ts',${JSON.stringify(old)},${JSON.stringify(next)});`);
fs.writeFileSync('scripts/v4-wire-ui.mjs',script);
await import('./v4-wire-ui.mjs');
const fix=(path,before,after)=>{const text=fs.readFileSync(path,'utf8');if(text.split(before).length!==2)throw Error('Fix anchor missing: '+path);fs.writeFileSync(path,text.replace(before,after));};
fix('src/cli/skills.ts','return result;','return;');
fix('src/skills/admin.ts','this.store.events(key, 0, 1000)','this.store.events(key, 0)');
fix('src/skills/admin.ts','Blocked, hash, id, now','Blocked, id, now');
