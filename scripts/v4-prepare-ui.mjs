import fs from 'node:fs';
let script=fs.readFileSync('scripts/v4-wire-ui.mjs','utf8');
const line=script.split('\n').find(l=>l.startsWith("change('src/ui/tui/app.tsx','  const [screen,"));
if(!line)throw Error('Missing UI state patch');
script=script.replace(line,`change('src/ui/tui/app.tsx','  const [screen, setScreen] = useState<Screen>(initialScreen),','  const [studioSubject, setStudioSubject] = useState("");\\n  const [bindingProfile, setBindingProfile] = useState<string>();\\n  const [screen, setScreen] = useState<Screen>(initialScreen),');`);
fs.writeFileSync('scripts/v4-wire-ui.mjs',script);
await import('./v4-wire-ui.mjs');
