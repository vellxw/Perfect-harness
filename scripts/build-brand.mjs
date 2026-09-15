import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Resvg} from '@resvg/resvg-js';
import assert from 'node:assert/strict';
const output=resolve(process.argv[2]??'assets/brand');await mkdir(output,{recursive:true});
const master=await readFile('assets/brand/perfect-symbol.svg','utf8'),small=await readFile('assets/brand/perfect-symbol-small.svg','utf8');
const sizes=[16,20,24,32,40,48,64,128,256];const images=[];
for(const size of [...sizes,1024]){const png=new Resvg(size<=32?small:master,{fitTo:{mode:'width',value:size}}).render().asPng();await writeFile(join(output,`perfect-${size}.png`),png);if(size<=256)images.push({size,png});}
const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);let offset=header.length;
for(const [{size,png},i] of images.map((image,index)=>[image,index])){const p=6+i*16;header[p]=size===256?0:size;header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(png.length,p+8);header.writeUInt32LE(offset,p+12);offset+=png.length;}
const ico=Buffer.concat([header,...images.map(i=>i.png)]);assert.equal(ico.readUInt16LE(4),9);await writeFile(join(output,'perfect.ico'),ico);
const wallpaper=await readFile('assets/brand/perfect-wallpaper.svg','utf8');await writeFile(join(output,'perfect-wallpaper.png'),new Resvg(wallpaper,{fitTo:{mode:'width',value:1920}}).render().asPng());
console.log('Reproducible SVG → PNG/ICO brand assets generated. No font files or external images are bundled.');
