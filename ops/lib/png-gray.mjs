import {inflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
// Offline inspection of the generated 8-bit grayscale water masks.
export function decodeGrayPng(bytes){
 assert.equal(bytes.subarray(1,4).toString(),'PNG');let width,height;const chunks=[];
 for(let at=8;at<bytes.length;){const n=bytes.readUInt32BE(at),type=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,at+8+n);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],0);assert.equal(data[12],0);}if(type==='IDAT')chunks.push(data);at+=12+n;}
 const raw=inflateSync(Buffer.concat(chunks)),pixels=new Uint8Array(width*height);assert.equal(raw.length,(width+1)*height);
 const paeth=(a,b,c)=>{const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c;};
 for(let y=0;y<height;y++){const filter=raw[y*(width+1)];assert(filter<=4);for(let x=0;x<width;x++){const i=y*width+x,a=x?pixels[i-1]:0,b=y?pixels[i-width]:0,c=x&&y?pixels[i-width-1]:0;pixels[i]=(raw[y*(width+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
 return{width,height,pixels};
}
