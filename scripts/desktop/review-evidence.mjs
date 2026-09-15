import { readFile, writeFile, readdir, mkdir, lstat } from 'node:fs/promises';
import { resolve, join, relative, dirname } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Losslessly repackage actual captured PNG pixels into inspectable PDF pages.
// No redraws, generated UI, image filters, OCR, visual approval or source mutation.
const [inputPath, outputPath, sourceSha, runId] = process.argv.slice(2);
if (!inputPath || !outputPath || !/^[a-f0-9]{40}$/.test(sourceSha ?? '') || !/^\d+$/.test(runId ?? '')) throw Error('Expected capture directory, PDF output, source SHA and run ID');
const root = resolve(inputPath), output = resolve(outputPath);
const entries = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw Error('Evidence symlink is not allowed');
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && entry.name.endsWith('.png')) {
      const stat = await lstat(path);
      if (stat.size > 15_000_000) throw Error('Capture exceeds review size limit');
      entries.push(path);
    }
  }
}
await walk(root);entries.sort();
if (!entries.length || entries.length > 200) throw Error('Expected 1..200 captured PNGs');
function paeth(a,b,c) {
  const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c);
  return pa<=pb && pa<=pc ? a : pb<=pc ? b : c;
}
function png(bytes) {
  if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Invalid PNG signature');
  let width, height, channels, color, palette, transparency;
  const compressed=[];
  for(let offset=8;offset<bytes.length;) {
    const size=bytes.readUInt32BE(offset), type=bytes.toString('ascii',offset+4,offset+8);
    if(offset+12+size>bytes.length) throw Error('Truncated PNG chunk');
    const data=bytes.subarray(offset+8,offset+8+size);
    if(type==='IHDR') {
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);color=data[9];
      if(data[8]!==8 || data[10]!==0 || data[11]!==0 || data[12]!==0) throw Error('Only noninterlaced 8-bit original PNG captures are supported');
      channels=({0:1,2:3,3:1,4:2,6:4})[color];
      if(!channels || width<1 || height<1 || width*height>20_000_000)throw Error('Invalid image dimensions/color type');
    } else if(type==='IDAT')compressed.push(data);
    else if(type==='PLTE')palette=data;
    else if(type==='tRNS')transparency=data;
    offset+=size+12;if(type==='IEND')break;
  }
  const stride=width*channels, filtered=inflateSync(Buffer.concat(compressed),{maxOutputLength:(stride+1)*height});
  if(filtered.length!==(stride+1)*height)throw Error('Unexpected decoded PNG size');
  const pixels=Buffer.alloc(stride*height), rgb=Buffer.alloc(width*height*3), alpha=Buffer.alloc(width*height,255);
  let hasAlpha=false;
  for(let y=0;y<height;y++) {
    const filter=filtered[y*(stride+1)];
    if(filter>4)throw Error('Unsupported PNG row filter');
    for(let x=0;x<stride;x++) {
      const a=x>=channels?pixels[y*stride+x-channels]:0, b=y?pixels[(y-1)*stride+x]:0, c=y && x>=channels?pixels[(y-1)*stride+x-channels]:0;
      const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
      pixels[y*stride+x]=(filtered[y*(stride+1)+1+x]+predictor)&255;
    }
  }
  for(let i=0;i<width*height;i++) {
    const p=i*channels;let r,g,b,a=255;
    if(color===6){r=pixels[p];g=pixels[p+1];b=pixels[p+2];a=pixels[p+3];}
    else if(color===2){r=pixels[p];g=pixels[p+1];b=pixels[p+2];}
    else if(color===0 || color===4){r=g=b=pixels[p];if(color===4)a=pixels[p+1];}
    else {const index=pixels[p];if(!palette||index*3+2>=palette.length)throw Error('PNG palette index invalid');r=palette[index*3];g=palette[index*3+1];b=palette[index*3+2];a=transparency?.[index]??255;}
    rgb[i*3]=r;rgb[i*3+1]=g;rgb[i*3+2]=b;alpha[i]=a;if(a!==255)hasAlpha=true;
  }
  return {width,height,rgb,alpha:hasAlpha?alpha:undefined};
}
const objects=[null, null, null, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')], pages=[], provenance=[];
const add = value => {objects.push(Buffer.isBuffer(value)?value:Buffer.from(value));return objects.length-1;};
function stream(dict, bytes) {return Buffer.concat([Buffer.from(`<< ${dict} /Length ${bytes.length} >>\nstream\n`),bytes,Buffer.from('\nendstream')]);}
const escape = text => text.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)').replace(/[^\x20-\x7e]/g,'?');
for (const path of entries) {
  const bytes=await readFile(path), image=png(bytes), filename=relative(root,path).replaceAll('\\','/'), hash=createHash('sha256').update(bytes).digest('hex');
  const mask=image.alpha?add(stream(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,deflateSync(image.alpha))):undefined;
  const imageId=add(stream(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ${mask?`/SMask ${mask} 0 R`:''}`,deflateSync(image.rgb)));
  const width=image.width/2,height=image.height/2;
  const caption=`Capture: ${filename}`;
  const text=`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q\nBT /F1 8 Tf 8 ${height+34} Td (${escape(caption)}) Tj 0 -11 Td (source ${sourceSha} / run ${runId}) Tj 0 -11 Td (Original PNG pixels / independent review pending / sha256 ${hash.slice(0,24)}) Tj ET`;
  const content=add(stream('',Buffer.from(text)));
  const page=add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height+48}] /Resources << /Font << /F1 3 0 R >> /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${content} 0 R >>`);
  pages.push(page);provenance.push({filename,sha256:hash,width:image.width,height:image.height,page:pages.length-1});
}
objects[1]=Buffer.from('<< /Type /Catalog /Pages 2 0 R >>');
objects[2]=Buffer.from(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map(p=>`${p} 0 R`).join(' ')}] >>`);
const chunks=[Buffer.from('%PDF-1.4\n%\xff\xff\xff\xff\n','binary')], offsets=[0];let length=chunks[0].length;
for(let i=1;i<objects.length;i++){offsets[i]=length;const item=Buffer.concat([Buffer.from(`${i} 0 obj\n`),objects[i],Buffer.from('\nendobj\n')]);chunks.push(item);length+=item.length;}
const xref=length;
chunks.push(Buffer.from(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
await mkdir(dirname(output),{recursive:true});await writeFile(output,Buffer.concat(chunks));
await writeFile(output+'.json',JSON.stringify({sourceCommit:sourceSha,workflowRun:runId,pages:provenance,inspection:'Not yet reviewed; this is a lossless evidence container, not an approval'},null,2));
// Let an authorized reviewer expose this immutable evidence commit on a separate
// review branch. No source branch, tag or release is changed automatically.
if(process.env.PERFECT_STAGE_REVIEW==='1') {
  const api=(endpoint,body)=>JSON.parse(execFileSync('gh',['api','--method','POST','repos/vellxw/Perfect-harness/'+endpoint,'--input','-'],{input:JSON.stringify(body),encoding:'utf8',maxBuffer:10_000_000}));
  const pdf=api('git/blobs',{encoding:'base64',content:(await readFile(output)).toString('base64')}).sha;
  const metadata=api('git/blobs',{encoding:'utf-8',content:await readFile(output+'.json','utf8')}).sha;
  const tree=api('git/trees',{tree:[{path:'review.pdf',mode:'100644',type:'blob',sha:pdf},{path:'provenance.json',mode:'100644',type:'blob',sha:metadata}]}).sha;
  const commit=api('git/commits',{message:`Actual Desktop captures for review / source ${sourceSha} / run ${runId}`,tree,parents:[]}).sha;
  console.log('REVIEW_COMMIT='+commit);console.log('REVIEW_PAGES='+pages.length);
}
console.log(JSON.stringify({sourceSha,runId,images:provenance,pdf:output},null,2));
