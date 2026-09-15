import {createTestRenderer} from '@opentui/core/testing';
import {createRoot} from '@opentui/react';
import {createElement} from 'react';
import {setImmediate as tick} from 'node:timers/promises';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {App} from '../dist/ui/tui/app.js';
import {DemoClient,demoSnapshot} from '../dist/ui/tui/demo.js';
import {orderedTasks,viewportRows} from '../dist/ui/tui/views.js';
const output=process.argv[2]??'test-results/performance';await mkdir(output,{recursive:true});
const start=performance.now(),test=await createTestRenderer({width:160,height:45,kittyKeyboard:true}),root=createRoot(test.renderer),client=new DemoClient('idle');
root.render(createElement(App,{client,onExit:()=>{}}));await new Promise(r=>setTimeout(r,100));await test.renderOnce();
const startup=performance.now()-start;
const samples=[];
for(let i=0;i<50;i++){const t=performance.now();test.mockInput.pressKey('a');await tick();await test.renderOnce();samples.push(performance.now()-t);}
assert.match(test.captureCharFrame(),/aaaaaaaaaa/);
const cpu=process.cpuUsage(),beforeMemory=process.memoryUsage().heapUsed;await new Promise(r=>setTimeout(r,1000));const idleCpu=process.cpuUsage(cpu);
const state=demoSnapshot('concurrent');state.activity=Array.from({length:20000},(_,i)=>({...state.activity[i%state.activity.length],id:`stress-${i}`,sequence:i,title:`Stress event ${i}`}));state.tasks=Array.from({length:500},(_,i)=>({...state.tasks[0],id:`task-${i}`,dependencies:i?[`task-${i-1}`]:[]}));
const updatesStart=performance.now();for(let i=0;i<1000;i++)client.replace({...state,sequence:i});await tick();await test.renderOnce();const updates=performance.now()-updatesStart;
const sortStart=performance.now();const tasks=orderedTasks(state.tasks);const dagMs=performance.now()-sortStart;assert.equal(tasks.length,500);assert.equal(viewportRows(state.activity,19999,10).rows.length,10);
const memoryAfter=process.memoryUsage().heapUsed;
for(let i=0;i<12;i++){test.resize(i%2?80:160,i%2?24:45);await tick();await test.renderOnce();assert.match(test.captureCharFrame(),/Perfect/);}
const sorted=[...samples].sort((a,b)=>a-b),report={platform:process.platform,node:process.version,opentui:'0.5.9',data:'synthetic fixture; real native renderer',measurement:'test renderer input dispatch → explicitly rendered frame, not OS photon/input latency',inputMs:{median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)},startupMs:{including100msSettling:startup},idle:{intervalMs:1000,cpuMs:(idleCpu.user+idleCpu.system)/1000},stress:{events:20000,tasks:500,updates:1000,coalescedUpdateMs:updates,dagMs,heapDeltaBytes:memoryAfter-beforeMemory},targets:'16ms input / 50ms state-to-screen are design targets; these numbers are observations, not certified end-to-end guarantees'};
await writeFile(join(output,'native-benchmark.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
root.unmount();test.renderer.destroy();
