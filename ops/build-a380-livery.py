#!/usr/bin/env python3
"""Original YUNJI A380 paint, in its own immutable UV1 atlas."""
import argparse,json,pathlib,subprocess,hashlib,math
import cairosvg
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--toktx',default='toktx');args=p.parse_args()
layout=json.loads((ROOT/'ops/assets/aircraft/a380-uv1.json').read_text());folder=ROOT/'public/assets/aircraft/liveries/yunji-a380/v1';folder.mkdir(parents=True,exist_ok=True)
WHITE,NAVY,TEAL='#f1f6f8','#1d3c52','#219fa9'
def rect(x,y,w,h,color):return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{color}"/>'
def text(x,y,value,size,color):return f'<text x="{x}" y="{y}" font-family="DejaVu Sans" font-weight="bold" font-size="{size}" fill="{color}">{value}</text>'
def panel(name,content,color=WHITE):
 x,y,w,h=layout['regions'][name];return rect(x-16,y-16,w+32,h+32,color)+f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{content}</svg>'
parts=[rect(0,0,2048,2048,WHITE)]
for side in ['left','right']:
 xf=lambda z:(z+32)/72.7*1984 if side=='left'else(40.7-z)/72.7*1984
 yf=lambda y:math.acos(max(-1,min(1,(y-.5)/4.15)))/math.pi*448
 a,b=sorted([xf(-28),xf(31)]);y1,y2,y3=yf(-.35),yf(-.8),yf(-1.05)
 content=rect(a,y1,b-a,y2-y1,NAVY)+rect(a,y2,b-a,y3-y2,TEAL)
 content+=text(min(xf(-21),xf(-8)),yf(1.15),'YUNJI AIR',39,NAVY)+text(min(xf(26),xf(32)),yf(1.4),'YJ-380',19,NAVY)
 parts.append(panel('fuselage-'+side,content))
 # Swept mountain/wing motif, shared across fin and moving rudder.
 content='<path d="M 25 500 L 195 195 L 375 500 L 295 500 L 195 330 L 95 500 Z" fill="#fff"/>'+text(119,566,'YJ',68,'#fff')
 parts.append(panel('tail-'+side,content,TEAL))
 parts.append(panel('engine-'+side,rect(0,155,480,35,NAVY)+rect(0,190,480,13,TEAL)+text(145,126,'YUNJI',39,NAVY)))
 parts.append(panel('wingtip-'+side,'',TEAL))
 for face in ['top','bottom']:parts.append(panel('wing-'+side+'-'+face,''))
svg='<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048">'+''.join(parts)+'</svg>'
(folder/'paint.svg').write_text(svg+'\n');textures={}
for size in [2048,4096]:
 png=folder/f'paint-{size}.png';ktx=folder/f'paint-{size}.ktx2';cairosvg.svg2png(bytestring=svg.encode(),write_to=str(png),output_width=size,output_height=size)
 with Image.open(png)as im:im.convert('RGB').save(png)
 subprocess.run([args.toktx,'--t2','--encode','uastc','--uastc_quality','2','--zcmp','18','--genmipmap','--assign_oetf','srgb','--assign_primaries','bt709',str(ktx),str(png)],check=True)
 textures[str(size)]={'path':f'assets/aircraft/liveries/yunji-a380/v1/{ktx.name}','sha256':hashlib.sha256(ktx.read_bytes()).hexdigest(),'bytes':ktx.stat().st_size,'width':size,'height':size}
manifest={'uvLayout':'a380-uv1','liveries':{'yunji-a380':{'revision':1,'textures':textures}}}
for path in [ROOT/'game/src/aircraft/a380-livery-manifest.json',ROOT/'public/assets/aircraft/liveries/a380-manifest.json']:path.write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
