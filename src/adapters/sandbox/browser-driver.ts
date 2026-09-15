// .app is HSTS-preloaded in Chromium. Use a reserved testing hostname instead.
export const SANDBOX_APP_HOST = "perfect-app.test";
export const browserDriver = String.raw`
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
const spec=JSON.parse(await readFile('/spec.json','utf8'));
const base='http://${SANDBOX_APP_HOST}:'+spec.port,failures=[],captures=[],comparisons=[],measurements=[];
let ready=false;
for(let n=0;n<120;n++){
  try{const response=await fetch(base+spec.readyPath,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,250));
}
if(!ready)throw Error('Runtime did not become healthy');
const browser=await chromium.launch({headless:true});
try{
  for(const viewport of spec.viewports){
    const label=viewport.width+'x'+viewport.height;
    const context=await browser.newContext({viewport,deviceScaleFactor:1,locale:'en-US',timezoneId:'UTC',colorScheme:'light'});
    await context.tracing.start({screenshots:true,snapshots:true,sources:false});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    try{
      await page.goto(base+spec.path,{waitUntil:'networkidle',timeout:30000});await page.evaluate(()=>document.fonts.ready);
      for(const action of spec.actions){
        const locator=page.locator(action.selector);
        if(action.type==='click')await locator.click();
        if(action.type==='fill')await locator.fill(action.value);
        if(action.type==='expectText')await page.waitForFunction(a=>document.querySelector(a.selector)?.textContent?.includes(a.value),action,{timeout:10000});
        if(action.type==='expectVisible')await locator.waitFor({state:'visible',timeout:10000});
      }
      const dimensions=await page.evaluate(()=>({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,height:window.innerHeight}));measurements.push({viewport:label,...dimensions});
      if(dimensions.scrollWidth>dimensions.width+1)failures.push('Horizontal overflow at '+label);
      for(const frame of spec.frames.length?spec.frames:[null]){
        if(frame!==null)await page.evaluate(f=>{if(typeof window.__perfectSeek!=='function')throw Error('Animation requires window.__perfectSeek(frame)');return window.__perfectSeek(f);},frame);
        const name=label+(frame===null?'':'-frame-'+frame)+'.png';await page.screenshot({path:'/output/'+name,fullPage:true,animations:frame===null?'disabled':'allow'});captures.push(name);
      }
      if(errors.length>spec.maxConsoleErrors)failures.push('Console errors at '+label+': '+errors.join('; '));
    }catch(error){
      failures.push(label+': '+error.message);
      try{const name=label+'-error.png';await page.screenshot({path:'/output/'+name,fullPage:true});captures.push(name);}catch{}
    }finally{await context.tracing.stop({path:'/output/'+label+'.trace.zip'});await context.close();}
  }
  for(let i=0;i<Math.min(captures.length,spec.targetFiles.length);i++){
    const actual=(await readFile('/output/'+captures[i])).toString('base64'),target=(await readFile('/targets/'+i+'.png')).toString('base64');
    const context=await browser.newContext(),page=await context.newPage();
    try{
      const metric=await page.evaluate(async({actual,target})=>{
        const load=data=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src='data:image/png;base64,'+data;});
        const a=await load(actual),b=await load(target);if(a.width!==b.width||a.height!==b.height)return{sameDimensions:false,actual:[a.width,a.height],target:[b.width,b.height]};
        const pixels=image=>{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,image.width,image.height).data;};
        const x=pixels(a),y=pixels(b);let difference=0,changed=0;
        for(let p=0;p<x.length;p+=4){let d=0;for(let c=0;c<4;c++)d+=Math.abs(x[p+c]-y[p+c]);difference+=d;if(d>32)changed++;}
        return{sameDimensions:true,normalizedMeanAbsoluteError:difference/(x.length*255),changedPixelFraction:changed/(x.length/4)};
      },{actual,target});comparisons.push({actual:captures[i],target:spec.targetFiles[i],...metric});
    }finally{await context.close();}
  }
}finally{await browser.close();}
const report={failures,captures,comparisons,measurements};await writeFile('/output/browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));process.exitCode=failures.length?1:0;
`;
