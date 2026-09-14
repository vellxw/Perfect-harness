import fs from 'node:fs';
let script=fs.readFileSync('scripts/v4-wire-ui.mjs','utf8');
function replaceLine(prefix,next){const line=script.split('\n').find(l=>l.startsWith(prefix));if(!line)throw Error('Missing patch: '+prefix);script=script.replace(line,next);}
replaceLine("change('src/ui/tui/app.tsx','  const [screen,",`change('src/ui/tui/app.tsx','  const [screen, setScreen] = useState<Screen>(initialScreen),','  const [studioSubject, setStudioSubject] = useState("");\\n  const [bindingProfile, setBindingProfile] = useState<string>();\\n  const [screen, setScreen] = useState<Screen>(initialScreen),');`);
replaceLine("change('src/skills/registry.ts','    base: PerfectConfig,",`change('src/skills/registry.ts','  snapshot(goal: Pick<Goal, "id" | "source">, base: PerfectConfig): StudioSnapshot {','  snapshot(goal: Pick<Goal, "id" | "source">, base: PerfectConfig, modeOverride?: string): StudioSnapshot {');`);
fs.writeFileSync('scripts/v4-wire-ui.mjs',script);
await import('./v4-wire-ui.mjs');
