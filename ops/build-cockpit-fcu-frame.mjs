// Deterministic registration of an image-generated recess into the original
// cockpit background. SVG preserves the windshield alpha and lower bays;
// adjacent original texture replaces the intentionally removed amber lamp.
import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url),base=await fs.readFile(new URL('public/assets/cockpit-frame.png',root)),patch=await fs.readFile(new URL('public/assets/cockpit-fcu-recess.png',root)),meta=JSON.parse(await fs.readFile(new URL('ops/assets/cockpit-fcu-recess.json',root),'utf8'));
const {width,height,bounds:[left,top,right,bottom]}=meta;
const layout=JSON.parse(await fs.readFile(new URL('game/src/views/fcu-layout.json',root),'utf8'));
if(!(width>0&&height>0&&right>left&&bottom>top))throw new Error('Invalid generated bezel bounds');
// The SVG and live controls share one artboard/layout, wholly inside the
// original flat mounting plate rather than across its sloped left edge.
const {x,y,width:w,height:h}=layout.aperture;
const s=layout.surface,t=layout.targets,m=layout.modes;
// The photographed rim is thicker than its outer bounding rectangle suggests.
// Keep controls inside the measured black interior of the generated source.
const [il,it,ir,ib]=meta.interiorBounds,inner={x:x+(il-left)/(right-left)*w,y:y+(it-top)/(bottom-top)*h,right:x+(ir-left)/(right-left)*w,bottom:y+(ib-top)/(bottom-top)*h};
for(const r of[t,m,layout.interior])if(r.x<inner.x||r.y<inner.y||r.x+r.width>inner.right||r.y+r.height>inner.bottom)throw new Error('FCU control intersects photographed bezel');
if(x<s.x||y<s.y||x+w>s.x+s.width||y+h>s.y+s.height)throw new Error('FCU aperture outside mounting surface');
if(t.x<=x||t.y<=y||t.x+t.width>=x+w||t.y+t.height>=y+h)throw new Error('FCU controls outside aperture');
if(m.x<=x||m.y<=y||m.x+m.width>=x+w||m.y+m.height>=y+h)throw new Error('Mode keys outside aperture');
const e=layout.lampErase;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1585" height="992" viewBox="0 0 1585 992">
<defs><image id="cockpit-source" width="1585" height="992" xlink:href="data:image/png;base64,${base.toString('base64')}"/></defs>
<use xlink:href="#cockpit-source"/>
<!-- Replace the former decorative lamp with adjacent original panel texture.
     This is native SVG composition, with no change to windshield alpha. -->
<svg x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" viewBox="${e.sourceX} ${e.sourceY} ${e.width} ${e.height}" preserveAspectRatio="none" overflow="hidden"><use xlink:href="#cockpit-source"/></svg>
<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${left} ${top} ${right-left} ${bottom-top}" preserveAspectRatio="none" overflow="hidden"><image width="${width}" height="${height}" xlink:href="data:image/png;base64,${patch.toString('base64')}"/></svg>
</svg>\n`;
await fs.writeFile(new URL('public/assets/cockpit-frame-fcu.svg',root),svg);
console.log('Cockpit frame: unchanged original alpha/geometry + authored inset', {x,y,width:w,height:h,bytes:Buffer.byteLength(svg)});
