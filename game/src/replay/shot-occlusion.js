// A compact semantic-box index for candidate scoring. Traverse cells along a
// ray instead of scanning the rectangular area of a long-lens sight line.
export function createShotOcclusionIndex(boxes,size=400){
 const cells=new Map();for(const b of boxes)for(let x=Math.floor(b.min[0]/size);x<=Math.floor(b.max[0]/size);x++)for(let z=Math.floor(b.min[2]/size);z<=Math.floor(b.max[2]/size);z++){const k=x+':'+z;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(b);}
 return(a,b)=>{
  let x=Math.floor(a[0]/size),z=Math.floor(a[2]/size);const ex=Math.floor(b[0]/size),ez=Math.floor(b[2]/size),dx=b[0]-a[0],dz=b[2]-a[2],sx=Math.sign(dx),sz=Math.sign(dz),tx=dx?Math.abs(size/dx):Infinity,tz=dz?Math.abs(size/dz):Infinity,result=new Set();
  let nx=dx?((x+(sx>0?1:0))*size-a[0])/dx:Infinity,nz=dz?((z+(sz>0?1:0))*size-a[2])/dz:Infinity;
  for(let n=0;n<256;n++){
   for(const box of cells.get(x+':'+z)||[])result.add(box);if(x===ex&&z===ez)break;
   if(nx<nz){x+=sx;nx+=tx;}else if(nz<nx){z+=sz;nz+=tz;}else{x+=sx;z+=sz;nx+=tx;nz+=tz;}
  }
  return result;
 };
}
