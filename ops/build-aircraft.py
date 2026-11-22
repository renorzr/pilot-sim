#!/usr/bin/env python3
"""Original Skyline 320 exterior. Run: blender -b --python ops/build-aircraft.py
All geometry is authored here; no third-party aircraft meshes/textures are used.
Logical asset coordinates: X right, Y up, nose -Z; Blender uses (X,-Z,Y).
"""
import bpy, math, json, pathlib, argparse, sys
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[1]
args=argparse.ArgumentParser();args.add_argument('--output-dir',type=pathlib.Path,default=ROOT/'public/assets/aircraft')
OUT=args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []).output_dir;OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials):bpy.data.materials.remove(m)
def V(p):return (p[0],-p[2],p[1])
def material(name,color,metal=0,rough=.4,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 if emission:n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
M={
 'white':material('Pearl white enamel',(.88,.92,.94),.18,.28),
 'navy':material('Skyline midnight blue',(.012,.045,.085),.27,.32),
 'teal':material('Skyline ocean teal',(.015,.36,.40),.28,.30),
 'wing':material('Airframe silver grey',(.53,.61,.66),.46,.36),
 'rubber':material('Tyre rubber',(.011,.015,.019),.02,.82),
 'glass':material('Blue black glazing',(.018,.055,.080),.72,.17),
 'metal':material('Brushed titanium',(.48,.56,.64),.87,.22),
 'graphite':material('Fan and mechanical graphite',(.040,.058,.073),.64,.40),
 'red':material('Red navigation',(.85,.015,.018),.05,.24,2.5),
 'green':material('Green navigation',(.015,.70,.20),.05,.24,2.5),
 'lamp':material('White lighting',(.94,.96,1),.05,.20,3),
}
def empty(name,pos=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=V(pos);o.parent=parent;return o
AIR=empty('Skyline320');BODY=empty('Airframe');BODY.parent=AIR
parts=[]
def mesh(name,vertices,faces,mat,parent=BODY,smooth=False):
 g=bpy.data.meshes.new(name);g.from_pydata([V(p) for p in vertices],[],faces);g.materials.append(M[mat] if isinstance(mat,str) else mat);g.update();o=bpy.data.objects.new(name,g);bpy.context.collection.objects.link(o);o.parent=parent
 for f in g.polygons:f.use_smooth=smooth
 parts.append(o);return o

def box(name,center,size,mat,parent=BODY,bevel=0):
 x,y,z=center;w,h,d=[s/2 for s in size];p=[(x+i*w,y+j*h,z+k*d)for i,j,k in[(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]];o=mesh(name,p,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,parent)
 if bevel:
  mod=o.modifiers.new('Small manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=2;mod.affect='EDGES';bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

def tube(name,a,b,r,mat,parent=BODY,segments=12,r2=None):
 a=Vector(a);b=Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,1,0)))
 if u.length<.01:u=axis.cross(Vector((1,0,0)))
 u.normalize();v=axis.cross(u);verts=[]
 for p,rr in [(a,r),(b,r if r2 is None else r2)]:
  for i in range(segments):verts.append(tuple(p+rr*(math.cos(i*math.tau/segments)*u+math.sin(i*math.tau/segments)*v)))
 faces=[(i,(i+1)%segments,(i+1)%segments+segments,i+segments)for i in range(segments)];faces+=[tuple(reversed(range(segments))),tuple(range(segments,segments*2))];return mesh(name,verts,faces,mat,parent,True)

def loft(name,rings,mat,parent=BODY,segments=72,assign=None):
 # rings: z, x-radius, y-radius, center-y
 verts=[]
 for z,rx,ry,cy in rings:
  for i in range(segments):q=i*math.tau/segments;verts.append((rx*math.sin(q),cy+ry*math.cos(q),z))
 faces=[]
 for j in range(len(rings)-1):
  for i in range(segments):a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
 faces.extend([tuple(reversed(range(segments))),tuple(range((len(rings)-1)*segments,len(rings)*segments))]);o=mesh(name,verts,faces,mat,parent,True)
 if assign:
  for k in ['navy','teal','wing']:o.data.materials.append(M[k])
  for j in range(len(rings)-1):
   for i in range(segments):
    z=(rings[j][0]+rings[j+1][0])/2;c=math.cos((i+.5)*math.tau/segments);idx=0
    # Retain the side cheatlines; the complete belly uses body-white enamel.
    if -12.3<z<15.6:idx=1 if -.32<c<-.18 else 2 if -.39<c<=-.32 else 0
    o.data.polygons[j*segments+i].material_index=idx
 return o
ST=[(-16.5,.015,.018,-.35),(-16.20,.48,.40,-.25),(-15.72,.98,.86,-.05),(-15.02,1.37,1.29,.08),(-14.15,1.71,1.68,.16),(-13.05,1.93,1.93,.18),(-11.8,1.975,1.98,.18),(10.9,1.975,1.98,.18),(12.7,1.87,1.88,.23),(14.2,1.61,1.67,.36),(16.1,1.16,1.23,.57),(18,.66,.76,.84),(19.6,.27,.37,1.06),(20.6,.07,.13,1.16),(21.07,.005,.008,1.17)]
ST=[(z,rx,1.68 if z==12.7 else 1.40 if z==14.2 else 1.15 if z==16.1 else ry,cy+.87)for z,rx,ry,cy in ST]

def profile(z):
 for i in range(len(ST)-1):
  if ST[i][0]<=z<=ST[i+1][0]:
   a,b=ST[i],ST[i+1];t=(z-a[0])/(b[0]-a[0]);return[a[j]+(b[j]-a[j])*t for j in range(1,4)]
 return ST[0][1:] if z<ST[0][0] else ST[-1][1:]
# Dense stations form a smooth, shaped nose and an upswept tail, not a cylinder.
rings=[]
for i in range(len(ST)-1):
 a,b=ST[i],ST[i+1];n=max(3,round((b[0]-a[0])*3))
 for k in range(n):
  z=a[0]+(b[0]-a[0])*k/n;rx,ry,cy=profile(z);rings.append((z,rx,ry,cy))
rings.append(ST[-1]);loft('Fuselage shaped pressure shell',rings,'white',segments=80,assign=True)
# Smooth fuselage normals are averaged at circumferential seams. All adjacent
# stations are source-authored, with small nose/tail radial intervals.
def skin(z,y,side,offset=.014):
 rx,ry,cy=profile(z);return(side*(rx*math.sqrt(max(0,1-((y-cy)/ry)**2))+offset),y,z)
def rounded_rect(z,y,w,h,r=.07,steps=4):
 out=[]
 for cz,cy,start in[(z-w/2+r,y-h/2+r,math.pi),(z+w/2-r,y-h/2+r,-math.pi/2),(z+w/2-r,y+h/2-r,0),(z-w/2+r,y+h/2-r,math.pi/2)]:
  for j in range(steps+1):q=start+j*math.pi/2/steps;out.append((cz+r*math.cos(q),cy+r*math.sin(q)))
 return out
for side in[-1,1]:
 for i in range(43):
  z=-11.0+i*.55
  if any(abs(z-d)<.57 for d in [-11.55,11.5])or abs(z+.9)<.26 or abs(z-.35)<.26:continue
  p=rounded_rect(z,1.57,.24,.34,.075);mesh('Cabin window', [skin(zz,yy,side,.020)for zz,yy in p],[tuple(range(len(p)))],'glass')
 for z,label in [(-11.6,'Forward entry'),(11.5,'Aft entry'),(-.9,'Overwing exit'),(.35,'Overwing exit')]:
  h=1.95 if 'entry'in label else 1.10;w=.83 if 'entry'in label else.53;cy=1.09 if 'entry'in label else 1.42;p=rounded_rect(z,cy,w,h,.12)
  for j in range(len(p)):
   tube(label+' frame',skin(*p[j],side,.025),skin(*p[(j+1)%len(p)],side,.025),.011,'wing',segments=5)
  tube(label+' handle',skin(z-.13,1.09,side,.04),skin(z+.13,1.09,side,.04),.015,'metal',segments=6)
 # Each cockpit pane follows a separate curved patch, retaining white mullions.
 for pane in [[(-14.9,.12),(-14.9,.79),(-14.10,1.02),(-14.10,.15)],[(-14.0,.72),(-14.0,1.10),(-13.14,1.18),(-13.14,.79)],[(-13.04,.81),(-13.04,1.18),(-12.67,1.18),(-12.67,.86)]]:
  pts=[];faces=[];sub=8
  for i in range(sub+1):
   u=i/sub
   for j in range(sub+1):
    v=j/sub;z=(pane[0][0]*(1-v)+pane[1][0]*v)*(1-u)+(pane[3][0]*(1-v)+pane[2][0]*v)*u;q=(pane[0][1]*(1-v)+pane[1][1]*v)*(1-u)+(pane[3][1]*(1-v)+pane[2][1]*v)*u;rx,ry,cy=profile(z);pts.append((side*(rx+.027)*math.sin(q),cy+(ry+.027)*math.cos(q),z))
  for i in range(sub):
   for j in range(sub):a=i*(sub+1)+j;faces.append((a,a+1,a+sub+2,a+sub+1))
  mesh('Flight deck windshield pane',pts,faces,'glass',smooth=True)
# Radome joint, landing lights and small Pitot/antenna silhouette details.
for i in range(80):
 q=i*math.tau/80;q2=(i+1)*math.tau/80;rx,ry,cy=profile(-15.05);tube('Radome joint',(rx*math.sin(q),cy+ry*math.cos(q),-15.05),(rx*math.sin(q2),cy+ry*math.cos(q2),-15.05),.007,'wing',segments=4)
for side in[-1,1]:tube('Pitot probe',(side*1.67,.62,-14.25),(side*1.75,.61,-15.0),.018,'metal',segments=8)
# Original livery titles are conformed to the pressure shell, then converted to
# ordinary triangles so the runtime needs no fonts, canvas or external images.
font=bpy.data.fonts.load('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
def title(text,side,zstart,y,size):
 curve=bpy.data.curves.new('Skyline title','FONT');curve.body=text;curve.font=font;curve.size=size;curve.resolution_u=3;obj=bpy.data.objects.new('Livery '+text,curve);bpy.context.collection.objects.link(obj);bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH');verts=[]
 for p in obj.data.vertices:
  z=zstart-side*p.co.x;yy=y+p.co.y;verts.append(skin(z,yy,side,.026))
 faces=[tuple(p.vertices)for p in obj.data.polygons];bpy.data.objects.remove(obj,do_unlink=True);return mesh('Livery '+text,verts,faces,'navy')
for side in[-1,1]:title('YUNJI AIR',side,-4.1 if side==1 else-9.6,2.12,.68);title('YJ-320',side,14.6 if side==1 else 12.8,1.72,.24)
# The fairing wraps the lower pressure shell, using its current raised datum.
# Its crown is buried inside the fuselage, rather than a flattened canoe below
# it. The exposed centreline belly is only .24 m below the pressure shell.
FAIRING=[(-4.6,1.35,1.26,.53),(-3.4,1.70,1.42,.52),(-1.8,2.02,1.47,.39),(0,2.14,1.50,.35),(2.6,2.18,1.52,.35),(4.2,2.09,1.49,.38),(5.6,1.90,1.43,.46),(7.3,1.65,1.28,.51),(8,1.30,1.05,.60)]
fairing_rings=[]
for a,b in zip(FAIRING,FAIRING[1:]):
 # Cosine easing gives both ends of each shoulder a continuous tangent and
 # cannot overshoot the authored width / underside-clearance envelope.
 n=max(4,math.ceil((b[0]-a[0])/.20))
 for k in range(n):
  t=k/n;f=(1-math.cos(t*math.pi))/2
  fairing_rings.append((a[0]+(b[0]-a[0])*t,*(a[j]+(b[j]-a[j])*f for j in range(1,4))))
fairing_rings.append(FAIRING[-1])
loft('Wing body canoe fairing',fairing_rings,'white',segments=64)
WS=[(1.30,-3.2,3.0,-.43),(4.0,-2.0,3.3,-.24),(8.0,0,4.0,.04),(12.0,2.0,4.9,.33),(16.70,4.9,6.3,.69)]
def wing_at(x):
 x=abs(x)
 for i in range(len(WS)-1):
  if WS[i][0]<=x<=WS[i+1][0]:a,b=WS[i],WS[i+1];t=(x-a[0])/(b[0]-a[0]);return tuple(a[j]+(b[j]-a[j])*t for j in range(1,4))
 return WS[-1][1:] if x>WS[-1][0] else WS[0][1:]
def foil(t):return .10*(.2969*math.sqrt(max(0,t))-.126*t-.3516*t*t+.2843*t**3-.1036*t**4)/.2
# Airfoil skins, shortened where hinged trailing surfaces occupy the planform.
def wing_surface(name,side,xs,lo,hi,mat,parent=BODY,pivot=(0,0,0)):
 steps=16;verts=[]
 for x in xs:
  lead,trail,y=wing_at(x);chord=trail-lead
  for upper in[True,False]:
   for j in range(steps+1):t=lo+(hi-lo)*j/steps;v=(side*x,y+(foil(t)*chord*(1 if upper else-1)),lead+chord*t);verts.append(tuple(v[k]-pivot[k]for k in range(3)))
 row=2*(steps+1);faces=[]
 for i in range(len(xs)-1):
  for upper in range(2):
   for j in range(steps):a=i*row+upper*(steps+1)+j;b=(i+1)*row+upper*(steps+1)+j;faces.append((a,b,b+1,a+1)if upper==0 else(a,a+1,b+1,b))
 for i in range(len(xs)-1):
  for j in[0,steps]:a=i*row+j;b=(i+1)*row+j;faces.append((a,a+steps+1,b+steps+1,b))
 faces.extend([tuple(range(0,steps+1))+tuple(reversed(range(steps+1,row))),tuple(range((len(xs)-1)*row,(len(xs)-1)*row+steps+1))+tuple(reversed(range((len(xs)-1)*row+steps+1,len(xs)*row)))])
 return mesh(name,verts,faces,mat,parent,True)
for side,label in[(-1,'L'),(1,'R')]:
 xs=[1.3+i*(15.4/28)for i in range(29)];wing_surface('Main wing '+label,side,xs,.12,.72,'white')
 slatPivot=(side*8.0,.04,0);slat=empty('Slat_'+label,slatPivot,BODY);wing_surface('Leading edge slat '+label,side,xs,0,.115,'white',slat,slatPivot)
 # Dark anti-slip root walkway is a distinct shallow top-side panel.
 for xx in[2.0,2.5,3.0]:
  lead,trail,y=wing_at(xx);box('Wing root walkway',(side*xx,y+.13,(lead+trail)/2),(.35,.015,2.4),'wing')
 for j,(xa,xb)in enumerate([(1.32,7.7),(7.78,11.9)]):
  mid=(xa+xb)/2;lead,trail,y=wing_at(mid);pivot=(side*mid,y,lead+(trail-lead)*.72);g=empty(f'Flap_{label}_{j}',pivot,BODY);wing_surface('Double slotted flap '+label,side,[xa+(xb-xa)*i/12 for i in range(13)],.725,1,'wing',g,pivot)
  # Visible second element and flap-track canoes give depth on deployment.
  for x in([4.2,7.4]if j==0 else[10.8]):
   l,t,yy=wing_at(x);loft('Flap track boat',[(-.8,.02,.02,0),(-.3,.16,.16,0),(.8,.17,.14,0),(1.8,.025,.025,0)],'wing',segments=16).location=V((side*x,yy-.25,t-.3))
 xa,xb=12.02,16.7;mid=(xa+xb)/2;l,t,y=wing_at(mid);pivot=(side*mid,y,l+(t-l)*.72);g=empty('Aileron_'+label,pivot,BODY);wing_surface('Outboard aileron',side,[xa+(xb-xa)*i/10 for i in range(11)],.725,1,'wing',g,pivot)
 for j,(xa,xb)in enumerate([(3.0,5.7),(5.9,8.7),(8.9,11.6)]):
  mid=(xa+xb)/2;l,t,y=wing_at(mid);pivot=(side*mid,y+foil(.53)*(t-l)+.012,l+(t-l)*.53);g=empty(f'Spoiler_{label}_{j}',pivot,BODY);verts=[]
  for x,c in[(xa,.53),(xb,.53),(xb,.70),(xa,.70)]:ll,tt,yy=wing_at(x);verts.append(tuple(v-pivot[k]for k,v in enumerate((side*x,yy+foil(c)*(tt-ll)+.015,ll+(tt-ll)*c))))
  mesh('Spoiler panel',verts,[(0,1,2,3)],'wing',g)
 # Swept sharklet with a thickened leading edge and original teal tip.
 p=[(side*16.67,.69,4.9),(side*17.28,1.5,5.48),(side*17.9,2.28,6.00),(side*17.86,2.29,6.64),(side*17.12,1.28,6.73),(side*16.7,.69,6.3)]
 mesh('Sharklet '+label,p,[(0,1,2,3,4,5)],'navy');tube('Sharklet leading edge',p[0],(side*17.86,2.28,6.00),.045,'teal',segments=10)
 # wingtip nav lamps, strobes and landing lights.
 tube('Nav_'+label,(side*16.72,.72,5.45),(side*16.83,.74,5.43),.085,'red'if side<0 else'green',segments=12)
 tube('Strobe_'+label,(side*16.75,.73,6.07),(side*16.85,.75,6.07),.065,'lamp',segments=12)
 tube('Landing_'+label,(side*3.0,-.4,-2.66),(side*3.0,-.4,-2.79),.11,'lamp',segments=16)
# Stabilizers have tapered airfoil thickness and separately hinged elevators.
for side,label in[(-1,'L'),(1,'R')]:
 p=[(side*.65,1.15,12.65),(side*5.95,1.73,16.0),(side*5.95,1.73,17.4),(side*.65,1.15,16.3)];mesh('Horizontal stabilizer '+label,p,[(0,1,2,3)],'wing')
 pivot=(side*3.2,1.44,15.5);g=empty('Elevator_'+label,pivot,BODY);p=[(side*.7,1.15,15.35),(side*5.93,1.73,17.0),(side*5.91,1.73,17.65),(side*.7,1.15,16.55)];mesh('Elevator surface '+label,[tuple(v-pivot[k]for k,v in enumerate(q))for q in p],[(0,1,2,3)],'white',g)
# Vertical fin, dorsal fillet and a distinct rudder.
fin=[(-.16,1.7,12.1),(-.10,8.96,17.45),(-.07,8.96,18.55),(-.14,2.0,18.2),(.16,1.7,12.1),(.10,8.96,17.45),(.07,8.96,18.55),(.14,2.0,18.2)]
mesh('Vertical stabilizer',fin,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'navy',smooth=True)
g=empty('Rudder',(0,2.0,18.15),BODY);p=[(-.07,0,0),(-.06,6.9,.40),(-.04,6.9,1.11),(-.05,0,1.55),(.07,0,0),(.06,6.9,.40),(.04,6.9,1.11),(.05,0,1.55)];mesh('Rudder trailing surface',p,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'navy',g)
for side in[-1,1]:
 # Stylised original wing/cloud motif, not an airline trademark.
 for y,z,w in[(5.7,16.0,1.7),(6.5,16.65,1.45),(7.2,17.2,1.15)]:
  p=[(side*.18,y,z),(side*.18,y+.26,z+w),(side*.18,y+.65,z+w+.15),(side*.18,y+.33,z+.28)];mesh('Skyline tail sweep',p,[(0,1,2,3)],'teal'if y<7 else'white')
# Nacelles are hollow spun profiles with visible inlet lips, fan blades and aft
# nozzles. Fan disks are not painted on the front of a solid cylinder.
for side,label in[(-1,'L'),(1,'R')]:
 eng=empty('Engine_'+label,(side*5.35,-.98,-3.1),BODY)
 tube('Engine pylon',(side*5.35,-.20,-1.8),(side*5.35,-.55,-3.15),.22,'wing',segments=12)
 box('Pylon fairing',(side*5.35,-.3,-1.65),(.38,.43,2.45),'white',bevel=.14)
 loft('Nacelle outer '+label,[(-1.80,1.025,1.025,0),(-1.66,1.10,1.10,0),(-1.28,1.14,1.14,0),(-.35,1.12,1.12,0),(.60,1.01,1.01,0),(1.25,.90,.90,0)],'white',eng,segments=72)
 loft('Polished inlet lip '+label,[(-1.80,1.025,1.025,0),(-1.86,.94,.94,0),(-1.79,.85,.85,0),(-1.60,.825,.825,0)],'metal',eng,segments=72)
 loft('Inlet acoustic barrel '+label,[(-1.60,.825,.825,0),(-1.28,.79,.79,0),(-.99,.76,.76,0)],'graphite',eng,segments=64)
 # Remove loft cap faces on hollow inlet shells.
 for obj in list(eng.children):
  if obj.type=='MESH'and('Nacelle outer'in obj.name or'lip'in obj.name or'acoustic'in obj.name):
   g=obj.data;faces=[tuple(p.vertices)for p in g.polygons if len(p.vertices)==4];verts=[p.co.copy()for p in g.vertices];ng=bpy.data.meshes.new(g.name+' open');ng.from_pydata(verts,[],faces);[ng.materials.append(m)for m in g.materials];ng.update();obj.data=ng
   for f in ng.polygons:f.use_smooth=True
 fan=empty('Fan_'+label,(0,0,-1.00),eng)
 tube('Fan backing',(0,0,.04),(0,0,.10),.775,'graphite',fan,segments=64)
 for i in range(28):
  q=i*math.tau/28;p=[]
  for rr,ang,z in[(.19,q,.00),(.75,q+.14,.02),(.775,q+.25,.02),(.35,q+.32,-.015),(.19,q+.22,-.03)]:p.append((rr*math.cos(ang),rr*math.sin(ang),z))
  mesh('Swept fan blade',p,[(0,1,2,3,4)],'metal',fan)
 loft('Fan spinner',[(-.25,.015,.015,0),(-.12,.12,.12,0),(.06,.22,.22,0),(.22,.24,.24,0)],'metal',fan,segments=40)
 rev=empty('Reverse_'+label,(0,0,.5),eng)
 loft('Aft translating cowl',[(0,1.015,1.015,0),(.40,.96,.96,0),(.78,.88,.88,0)],'white',rev,segments=64)
 for i in range(24):
  q=i*math.tau/24;tube('Reverser cascade vane',(.93*math.cos(q),.93*math.sin(q),.53),(.88*math.cos(q+.07),.88*math.sin(q+.07),1.20),.024,'graphite',eng,segments=5)
 loft('Exhaust nozzle',[(1.1,.72,.72,0),(1.65,.59,.59,0),(1.86,.53,.53,0)],'metal',eng,segments=64)
 loft('Exhaust core cone',[(1.50,.36,.36,0),(1.9,.20,.20,0),(2.21,.015,.015,0)],'graphite',eng,segments=40)
# Gear nodes remain outside the Airframe node for controlled visual strut motion.
GEAR=empty('Undercarriage',parent=AIR)
def tyre(name,center,radius,width,parent):
 # Cross-section around the wheel X axle: broad tread, rounded sidewalls.
 x,y,z=center;profile=[(-width*.5,.75),(-width*.48,.90),(-width*.32,1),(width*.32,1),(width*.48,.90),(width*.5,.75)];verts=[];n=40
 for ax,rr in profile:
  for j in range(n):q=j*math.tau/n;verts.append((x+ax,y+radius*rr*math.cos(q),z+radius*rr*math.sin(q)))
 faces=[]
 for i in range(len(profile)-1):
  for j in range(n):a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,b+n,a+n))
 mesh(name+' tyre',verts,faces,'rubber',parent,True)
 tube(name+' alloy hub',(x-width*.52,y,z),(x+width*.52,y,z),radius*.49,'metal',parent,segments=24)
 for i in range(8):q=i*math.tau/8;tube(name+' hub bolt',(x+width*.53,y+radius*.3*math.cos(q),z+radius*.3*math.sin(q)),(x+width*.55,y+radius*.3*math.cos(q),z+radius*.3*math.sin(q)),.029,'graphite',parent,segments=6)
for side,label in[(-1,'L'),(1,'R')]:
 pivot=(side*3.0,-.5,2.5);g=empty('MainGear_'+label,pivot,GEAR);wc=(side*2.6,-2.15,2.5);local=tuple(wc[i]-pivot[i]for i in range(3));tube('Main oleo leg',(0,0,0),(local[0],local[1]+.25,0),.12,'wing',g,segments=16);tube('Polished main piston',(local[0],-.8,0),(local[0],local[1]+.1,0),.078,'metal',g,segments=16);tube('Main gear side brace',(side*-.9,.1,-.65),(local[0],local[1]+.55,0),.065,'metal',g,segments=12)
 wheels=empty('MainWheels_'+label,local,g)
 for dx in[-.25,.25]:tyre('Main wheel',(dx,0,0),.65,.35,wheels)
 # Follow the actual lower wing skin; the old low, broad rectangular door
 # and bay were suspended below the wing and amplified the slab silhouette.
 def bay_skin(x,z,offset):
  lead,trail,yy=wing_at(x);t=max(0,min(1,(z-lead)/(trail-lead)))
  return(side*x,yy-foil(t)*(trail-lead)-offset,z)
 door_pivot=bay_skin(2.92,2.0,.018);door=empty('MainDoor_'+label,door_pivot,GEAR)
 door_points=[bay_skin(x,z,.018) for x,z in [(2.12,.80),(2.92,.80),(2.92,2.82),(2.12,2.82)]]
 mesh('Main bay door',[tuple(p[i]-door_pivot[i] for i in range(3)) for p in door_points],[(0,1,2,3)],'white',door)
 # A narrow shadow seam surrounds the closed door instead of a floating bay.
 bay_points=[bay_skin(x,z,.012) for x,z in [(2.10,.78),(2.94,.78),(2.94,2.84),(2.10,2.84)]]
 mesh('Main dark gear bay',bay_points,[(0,1,2,3)],'graphite')
pivot=(0,-.45,-11.5);ng=empty('NoseGear',pivot,GEAR);steer=empty('NoseSteering',(0,0,0),ng);tube('Nose oleo',(0,0,0),(0,-1.65,-.8),.092,'wing',steer,segments=16);tube('Nose polished piston',(0,-1.10,-.5),(0,-1.95,-.8),.057,'metal',steer,segments=16);tube('Nose diagonal brace',(0,0,.48),(0,-1.3,-.68),.055,'metal',steer,segments=12);w=empty('NoseWheels',(0,-1.95,-.8),steer)
for side in[-1,1]:tyre('Nose wheel',(side*.24,0,0),.4,.22,w)
for side,label in[(-1,'L'),(1,'R')]:
 d=empty('NoseDoor_'+label,(side*.34,-.88,-11.7),GEAR);box('Nose bay door',(side*.15,0,0),(.30,.035,1.55),'white',d,bevel=.02)
# Antennas and lights give front/rear views credible small-scale detail.
for z in[-6.0,3.7,9.0]:tube('Dorsal antenna',(0,3.00,z),(0,3.45,z+.18),.035,'wing',segments=8,r2=.008)
for name,y,z in[('Beacon_top',3.06,.2),('Beacon_bottom',-.99,.2)]:tube(name,(0,y,z),(0,y+.045,z),.09,'red',segments=16)
tube('Tail position lamp',(0,2.04,20.84),(0,2.04,21.04),.055,'lamp',segments=12)
# Correct every closed mesh winding after conversion to logical coordinates.
# Two-sided flat airfoils/spoilers are deliberately retained as thin surfaces.
for obj in parts:
 if obj.type!='MESH':continue
 bpy.context.view_layer.objects.active=obj;obj.select_set(True)
 # Recalculate outward normals for closed pieces, retaining authored smoothness.
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');obj.select_set(False)
# Export +Y-up glTF, carrying semantic animation node names.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'skyline-320.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False)
# Native model preview: original asset under neutral daylight, no edited raster.
world=bpy.data.worlds.new('Studio world');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.22,.28,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='AREA',location=(25,-25,35));light=bpy.context.object;light.data.energy=5200;light.data.shape='DISK';light.data.size=30
bpy.ops.object.light_add(type='AREA',location=(-25,5,20));bpy.context.object.data.energy=3700;bpy.context.object.data.size=25
bpy.ops.object.camera_add(location=V((48,25,-43)));cam=bpy.context.object;target=Vector(V((0,0,1)));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=52;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1400;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False;scene.view_settings.view_transform='AgX';scene.render.filepath=str(OUT/'skyline-320-preview.png');bpy.ops.render.render(write_still=True)
# Recompute mesh bounds and triangle budget from final exported source objects.
bpy.context.view_layer.update();tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in parts if o.type=='MESH');report={'triangles':tris,'materials':len(M),'meshObjects':len(parts),'logicalCoordinateFrame':'X right, Y up, nose -Z','dimensionsM':{'length':37.57,'span':35.8,'tailHeightAboveGround':11.76},'contacts':{'main':[{'x':x,'y':-2.8,'z':2.5}for x in[-2.85,-2.35,2.35,2.85]],'nose':[{'x':-.24,'y':-2.8,'z':-12.3},{'x':.24,'y':-2.8,'z':-12.3}]},'originalAsset':True};(OUT/'skyline-320-metadata.json').write_text(json.dumps(report,indent=2)+'\n');print('AIRCRAFT_REPORT',json.dumps(report))
