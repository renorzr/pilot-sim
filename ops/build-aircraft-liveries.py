#!/usr/bin/env python3
"""Deterministic UV1 paint artwork. Requires CairoSVG, Pillow and toktx 4.4.2.
PNG/SVG are authoring inputs; runtime uses one mipmapped KTX2 atlas per aircraft.
No reference photograph or third-party aircraft texture is distributed.
"""
import argparse, hashlib, json, math, pathlib, shutil, subprocess
import cairosvg
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--toktx', default='toktx')
parser.add_argument('--output-dir', type=pathlib.Path, default=ROOT/'public/assets/aircraft/liveries')
args = parser.parse_args()
layout = json.loads((ROOT/'ops/assets/aircraft/uv1.json').read_text())
out = args.output_dir
out.mkdir(parents=True, exist_ok=True)
WHITE, NAVY, TEAL = '#f1f6f8', '#1d3c52', '#219fa9'
US_NAVY, RED = '#101e38', '#c72732'

def rect(x, y, w, h, fill, **attrs):
    return f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" fill="{fill}" '+ ' '.join(f'{k}="{v}"' for k,v in attrs.items())+'/>'

def text(x, y, value, size, fill, spacing=0):
    return f'<text x="{x:g}" y="{y:g}" font-family="DejaVu Sans" font-size="{size:g}" font-weight="bold" letter-spacing="{spacing:g}" fill="{fill}">{value}</text>'

def panel(name, content, color=WHITE):
    x,y,w,h=layout['regions'][name]
    # Solid gutters prevent adjacent island colours bleeding into mip levels.
    return rect(x-16,y-16,w+32,h+32,color)+f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{content}</svg>'

def fuselage(side, historical):
    # Profile's cylindrical centre is Y=1.05, radius=1.98. Paint follows angle,
    # not screen projection, so both hemispheres meet exactly at crown/belly.
    w,h=1984,448
    yf=lambda y:math.acos(max(-1,min(1,(y-1.05)/1.98)))/math.pi*h
    xf=lambda z:(z+16.5)/37.57*w if side=='left' else (21.07-z)/37.57*w
    if historical:
        line=yf(.64)
        content=rect(0,line,w,h-line,US_NAVY)+rect(0,line-12,w,5,RED)+rect(0,line-7,w,7,'#ffffff')
        content+=text(min(xf(-10),xf(-1.0)),yf(2.24),'US AIRWAYS',39,US_NAVY,3)
        content+=text(min(xf(12),xf(15.1)),yf(1.82),'N106US',16,US_NAVY,1)
        # Small US flag aft, above the cheatline.
        fx=min(xf(10.4),xf(11.1));fy=yf(2.05)
        content+=rect(fx,fy,30,17,'#fff')
        for row in range(7):content+=rect(fx,fy+row*2.4,30,1.2,RED)
        content+=rect(fx,fy,12,9,US_NAVY)
    else:
        y1=math.acos(-.18)/math.pi*h;y2=math.acos(-.32)/math.pi*h;y3=math.acos(-.39)/math.pi*h
        x1=min(xf(-12.3),xf(15.6));x2=max(xf(-12.3),xf(15.6))
        content=rect(x1,y1,x2-x1,y2-y1,NAVY)+rect(x1,y2,x2-x1,y3-y2,TEAL)
        content+=text(min(xf(-9.6),xf(-4.1)),yf(2.12),'YUNJI AIR',38,NAVY)
        content+=text(min(xf(12.8),xf(14.6)),yf(1.72),'YJ-320',14,NAVY)
    return panel('fuselage-'+side,content)

def tail(side,historical):
    w,h=416,640;content=''
    # Full-height fin/rudder share aircraft-space projection: artwork stays
    # continuous at the hinge and is not mirrored on the starboard side.
    if historical:
        content+=rect(0,0,w,94,RED)+rect(0,94,w,18,'#ffffff')
        for i in range(6):
            yy=208+i*26;xx=134+i*7
            content+=f'<path d="M {xx} {yy} h {170-i*7} v 11 H {xx} Z" fill="#fff"/>'
        content+=rect(134,208,65,66,US_NAVY)
        # Stylised white star field, redrawn from the period identity.
        for row in range(3):
            for col in range(4):content+=f'<circle cx="{141+col*14}" cy="{216+row*18}" r="2.4" fill="#fff"/>'
    else:
        for yy,x,width,c in [(290,140,150,TEAL),(220,174,132,TEAL),(160,204,105,WHITE)]:
            content+=f'<path d="M{x} {yy} l{width} -30 v-36 l-{width} 30 Z" fill="{c}"/>'
    return panel('tail-'+side,content,US_NAVY if historical else NAVY)

manifest={'uvLayout':layout['version'],'revision':1,'liveries':{}}
for key,historical in [('yunji',False),('us-airways-n106us-2009',True)]:
    folder=out/key/'v1';folder.mkdir(parents=True,exist_ok=True)
    parts=[rect(0,0,2048,2048,WHITE)]
    for side in ['left','right']:
        parts.extend([fuselage(side,historical),tail(side,historical)])
        parts.append(panel('engine-'+side,'',US_NAVY if historical else WHITE))
        parts.append(panel('wingtip-'+side,rect(0,0,480,18,RED if historical else TEAL),US_NAVY if historical else NAVY))
        for face in ['top','bottom']:parts.append(panel('wing-'+side+'-'+face,''))
    svg='<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="0 0 2048 2048">'+''.join(parts)+'</svg>'
    (folder/'paint.svg').write_text(svg+'\n')
    textures={}
    for size in [2048,4096]:
        png=folder/f'paint-{size}.png';ktx=folder/f'paint-{size}.ktx2'
        cairosvg.svg2png(bytestring=svg.encode(),write_to=str(png),output_width=size,output_height=size)
        with Image.open(png) as im:im.convert('RGB').save(png)
        subprocess.run([args.toktx,'--t2','--encode','uastc','--uastc_quality','2','--zcmp','18','--genmipmap','--assign_oetf','srgb','--assign_primaries','bt709',str(ktx),str(png)],check=True)
        textures[str(size)]={'path':f'assets/aircraft/liveries/{key}/v1/{ktx.name}','sha256':hashlib.sha256(ktx.read_bytes()).hexdigest(),'bytes':ktx.stat().st_size,'width':size,'height':size}
    manifest['liveries'][key]={'revision':1,'textures':textures}
    print(key, {k:v['bytes'] for k,v in textures.items()})
# A labelled, unpainted template is for authors; it is never loaded at runtime.
template=rect(0,0,2048,2048,'#ddd')
for name,(x,y,w,h) in layout['regions'].items():
    template+=rect(x,y,w,h,'#fff',stroke='#345',**{'stroke-width':2})+text(x+10,y+24,name,18,'#345')
(out/'a320-uv1-template.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048">'+template+'</svg>\n')
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
if out.resolve()==(ROOT/'public/assets/aircraft/liveries').resolve():
    (ROOT/'game/src/aircraft/livery-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    # Pin the matching local transcoder; staged authoring cannot change runtime.
    version=json.loads((ROOT/'game/node_modules/three/package.json').read_text())['version']
    destination=ROOT/'public/assets/aircraft/basis'/('three-'+version);destination.mkdir(parents=True,exist_ok=True)
    for name in ['basis_transcoder.js','basis_transcoder.wasm']:
        shutil.copyfile(ROOT/'game/node_modules/three/examples/jsm/libs/basis'/name,destination/name)
