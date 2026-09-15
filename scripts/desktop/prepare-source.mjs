// Temporary compatibility gate transformation; publish the resulting source/lockfile only after validation.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const change=(p,a,b)=>{const s=fs.readFileSync(p,'utf8');if(s.split(a).length!==2)throw Error('Anchor not unique '+p+' '+a);fs.writeFileSync(p,s.replace(a,b));};
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));pkg.version='0.5.0';pkg.description='Agentes con evidencia, interfaz gráfica y controles por equipo';pkg.scripts['build:desktop']='npm run build && node scripts/desktop/build.mjs';pkg.scripts['test:desktop']='node scripts/desktop/gate.mjs';fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
const npm=process.platform==='win32'?'npm.cmd':'npm';execFileSync(npm,['install','--save-dev','--save-exact','electron@44.3.0','react-dom@19.2.0','@types/react-dom@19.2.0','@types/three@0.180.0','@electron/packager@18.4.4','@electron/fuses@1.8.0'],{stdio:'inherit',shell:process.platform==='win32'});
change('src/desktop/main/index.ts',"join(homedir(),'.perfect')","process.env.PERFECT_HOME??join(homedir(),'.local','share','perfect-harness')");
change('src/desktop/main/index.ts','let window:BrowserWindow,broker:EngineBroker,preview:WebContentsView|undefined,previewOrigin:string|undefined;','let window:BrowserWindow,broker:EngineBroker,preview:WebContentsView|undefined;');
change('src/desktop/main/index.ts','preview=undefined;previewOrigin=undefined;','preview=undefined;');change('src/desktop/main/index.ts','detachPreview();previewOrigin=info.origin;','detachPreview();');
change('src/desktop/main/index.ts','systemReducedMotion:nativeTheme.shouldUseReducedMotion','systemReducedMotion:false');
change('src/desktop/main/index.ts',', Menu, nativeTheme, clipboard',', Menu, clipboard');
change('src/desktop/main/broker.ts',"const m=raw as UiMessage & {type:string;requestId?:string;ok?:boolean;data?:unknown;message?:string};","const m=raw as UiMessage | {type:'desktop-result';requestId:string;ok:boolean;data?:unknown;message?:string};");
change('src/desktop/main/broker.ts',"if(m.requestId&&this.waiting.has(m.requestId)&&(m.type==='result'||m.type==='desktop-result'))","if((m.type==='result'||m.type==='desktop-result')&&this.waiting.has(m.requestId))");
fs.appendFileSync('.gitignore','\n# Desktop compiled output\n/desktop/\n/desktop-package/\n');
console.log('Compatibility candidate prepared; no branch/ref update is performed by this script.');
