#!/usr/bin/env python3
"""Original A380-800 game exterior; shared mesh tools, independent airframe/UVs.
Overall dimensions follow Airbus facts/planning documents. Surface construction
and articulation are authored visual estimates, not manufacturer CAD.
"""
import bpy, math, json, pathlib, argparse, sys
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'ops'))
from aircraft_geometry import AircraftGeometry,V,material
parser=argparse.ArgumentParser();parser.add_argument('--output-dir',type=pathlib.Path,default=ROOT/'public/assets/aircraft');parser.add_argument('--skip-preview',action='store_true')
options=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);OUT=options.output_dir;OUT.mkdir(parents=True,exist_ok=True)
D=globals().get('AIRCRAFT_DEFINITION') or json.loads((ROOT/'game/src/aircraft/definitions/a380.json').read_text());UV=json.loads((ROOT/D['authoring']['uvContract']).read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials):bpy.data.materials.remove(m)
M={'paint':material('Livery paint a380-uv1',(1,1,1),.18,.28),'wing':material('A380 airframe alloy',(.57,.64,.68),.42,.35),'rubber':material('Tyre rubber',(.012,.017,.023),.02,.8),'glass':material('Blue black glazing',(.019,.064,.088),.6,.16),'metal':material('Machined alloy',(.52,.59,.64),.8,.23),'graphite':material('Fan and mechanical graphite',(.035,.048,.059),.55,.4),'red':material('Red navigation',(.85,.02,.02),.05,.24,2.5),'green':material('Green navigation',(.02,.7,.15),.05,.24,2.5),'lamp':material('White lighting',(.96,.98,1),.05,.2,3)}
g=AircraftGeometry(M);empty=g.empty;mesh=g.mesh;tube=g.tube;loft=g.loft;box=g.box
AIR=empty('Skyline380');BODY=empty('Airframe',parent=AIR);g.body=BODY
ST=D['authoring']['fuselageStations'];WS=D['authoring']['wingStations']
def interpolate(st,x):
 for a,b in zip(st,st[1:]):
  if a[0]<=x<=b[0]:
   t=(x-a[0])/(b[0]-a[0]);return tuple(a[j]+(b[j]-a[j])*t for j in range(1,len(a)))
 return st[0][1:] if x<st[0][0] else st[-1][1:]
def profile(z):return interpolate(ST,z)
rings=[]
for a,b in zip(ST,ST[1:]):
 for j in range(max(3,math.ceil((b[0]-a[0])/.5))):
  z=a[0]+(b[0]-a[0])*j/max(3,math.ceil((b[0]-a[0])/.5));rings.append((z,*profile(z)))
rings.append(ST[-1]);loft('Double deck pressure shell',rings,'paint',segments=64)
def skin(z,y,side,offset=.02):
 rx,ry,cy=profile(z);return(side*(rx*math.sqrt(max(0,1-((y-cy)/ry)**2))+offset),y,z)
def rounded_rect(z,y,w,h,r=.09):
 p=[]
 for zz,yy,start in[(z-w/2+r,y-h/2+r,math.pi),(z+w/2-r,y-h/2+r,-math.pi/2),(z+w/2-r,y+h/2-r,0),(z-w/2+r,y+h/2-r,math.pi/2)]:
  for j in range(4):q=start+j*math.pi/6;p.append((zz+r*math.cos(q),yy+r*math.sin(q)))
 return p
for side in [-1,1]:
 for y,doors,start,count in [(.35,[-24,-12,0,14,27],-23,74),(2.55,[-22,-8,11,25],-21,68)]:
  for i in range(count):
   z=start+i*.66
   if any(abs(z-door)<.62 for door in doors):continue
   p=rounded_rect(z,y,.28,.39);mesh('Upper deck window' if y>2 else 'Main deck window',[skin(zz,yy,side,.025)for zz,yy in p],[tuple(range(len(p)))],'glass')
  for z in doors:
   p=rounded_rect(z,y-.43,.92,1.85,.14)
   for j in range(len(p)):tube('Entry door seam',skin(*p[j],side,.03),skin(*p[(j+1)%len(p)],side,.03),.012,'wing',segments=4)
   tube('Entry door handle',skin(z-.14,y-.37,side,.05),skin(z+.14,y-.37,side,.05),.018,'metal',segments=6)
 # Distinct forward windshield patches beneath the prominent upper forehead.
 for pane in [[(-30.4,.55),(-29.4,.82),(-29.2,1.9),(-30.25,1.65)],[(-29.25,.83),(-27.9,.8),(-27.8,1.85),(-29.1,1.91)],[(-27.75,.8),(-26.9,.74),(-26.8,1.66),(-27.65,1.85)]]:
  vs=[];fs=[];n=7
  for i in range(n+1):
   u=i/n
   for j in range(n+1):
    v=j/n;z=(pane[0][0]*(1-u)+pane[1][0]*u)*(1-v)+(pane[3][0]*(1-u)+pane[2][0]*u)*v;y=(pane[0][1]*(1-u)+pane[1][1]*u)*(1-v)+(pane[3][1]*(1-u)+pane[2][1]*u)*v;vs.append(skin(z,y,side,.035))
  for i in range(n):
   for j in range(n):a=i*(n+1)+j;fs.append((a,a+1,a+n+2,a+n+1))
  mesh('Flight deck windshield',vs,fs,'glass',smooth=True)
 tube('Pitot probe',(side*2.2,-.1,-29.1),(side*2.35,-.15,-30.1),.027,'metal',segments=8)
# Rounded wing/body fairing, with no exposed slab below the pressure shell.
loft('Wing body fairing',[(-12,2.5,1.5,-1.8),(-8,3.4,2,-1.8),(0,4.25,2.1,-1.7),(10,4.3,1.9,-1.55),(17,3.4,1.6,-1.3),(20,2.6,1.3,-1.0)],'paint',segments=48)
def wing_at(x):return interpolate(WS,abs(x))
def foil(t):return .11*(.2969*math.sqrt(max(0,t))-.126*t-.3516*t*t+.2843*t**3-.1036*t**4)/.2
def wing_surface(name,side,xs,lo,hi,parent=BODY,pivot=(0,0,0)):
 vs=[];steps=12
 for x in xs:
  lead,trail,y=wing_at(x)
  for sign in [1,-1]:
   for j in range(steps+1):t=lo+(hi-lo)*j/steps;p=(side*x,y+sign*foil(t)*(trail-lead),lead+t*(trail-lead));vs.append(tuple(p[k]-pivot[k]for k in range(3)))
 row=2*(steps+1);fs=[]
 for i in range(len(xs)-1):
  for upper in range(2):
   for j in range(steps):a=i*row+upper*(steps+1)+j;b=a+row;fs.append((a,b,b+1,a+1)if upper==0 else(a,a+1,b+1,b))
  for j in [0,steps]:a=i*row+j;b=a+row;fs.append((a,a+steps+1,b+steps+1,b))
 fs.extend([tuple(range(steps+1))+tuple(reversed(range(steps+1,row))),tuple(range((len(xs)-1)*row,(len(xs)-1)*row+steps+1))+tuple(reversed(range((len(xs)-1)*row+steps+1,len(xs)*row)))])
 return mesh(name,vs,fs,'paint',parent,True)
for side,label in[(-1,'L'),(1,'R')]:
 xs=[3+36.6*i/35 for i in range(36)];wing_surface('Swept main wing '+label,side,xs,.12,.72)
 p=(side*20,0,4);slat=empty('Slat_'+label,p,BODY);wing_surface('Leading edge slat '+label,side,xs,0,.115,slat,p)
 for j,(xa,xb)in enumerate([(3.1,14),(14.1,27)]):
  x=(xa+xb)/2;l,t,y=wing_at(x);p=(side*x,y,l+(t-l)*.72);node=empty('Flap_'+label+'_'+str(j),p,BODY);wing_surface('Slotted flap '+label,side,[xa+(xb-xa)*i/15 for i in range(16)],.725,1,node,p)
  for xx in [xa+2,(xa+xb)/2,xb-1]:
   ll,tt,yy=wing_at(xx);boat=loft('Flap track canoe',[(-1,.025,.025,0),(0,.25,.24,0),(2,.24,.2,0),(3.6,.02,.02,0)],'wing',segments=12);boat.location=V((side*xx,yy-.65,tt-1.5))
 xa,xb=27.1,39.6;x=(xa+xb)/2;l,t,y=wing_at(x);p=(side*x,y,l+(t-l)*.72);node=empty('Aileron_'+label,p,BODY);wing_surface('Outboard aileron '+label,side,[xa+(xb-xa)*i/13 for i in range(14)],.725,1,node,p)
 for j,(xa,xb)in enumerate([(5,11.5),(12,18.5),(19,26)]):
  x=(xa+xb)/2;l,t,y=wing_at(x);p=(side*x,y+foil(.54)*(t-l)+.02,l+(t-l)*.54);node=empty('Spoiler_'+label+'_'+str(j),p,BODY);vs=[]
  for xx,c in[(xa,.54),(xb,.54),(xb,.70),(xa,.70)]:ll,tt,yy=wing_at(xx);q=(side*xx,yy+foil(c)*(tt-ll)+.03,ll+(tt-ll)*c);vs.append(tuple(q[k]-p[k]for k in range(3)))
  mesh('Spoiler panel',vs,[(0,1,2,3)],'wing',node)
 node=empty('Wingtip_fence_'+label,parent=BODY);mesh('Wingtip fence '+label,[(side*39.6,3,16),(side*39.9,5.2,17.5),(side*39.9,5.2,18.5),(side*39.7,1.7,20),(side*39.6,3,18.8)],[(0,1,2,3,4)],'paint',node)
 tube('Nav_'+label,(side*39.6,3.1,16.2),(side*39.7,3.1,16.2),.11,'red'if side<0 else'green',segments=12)
 tube('Strobe_'+label,(side*39.6,3.1,18.4),(side*39.7,3.1,18.4),.085,'lamp',segments=10)
 tube('Landing_'+label,(side*7,-1.5,-6.9),(side*7,-1.5,-7.15),.18,'lamp',segments=12)
 # Broad swept stabilizers and separate elevators.
 mesh('Horizontal stabilizer '+label,[(side*.6,3.4,26),(side*15,4.4,34),(side*15,4.4,36),(side*.6,3.4,34)],[(0,1,2,3)],'wing')
 p=(side*7,3.9,33.5);node=empty('Elevator_'+label,p,BODY);vs=[(side*.6,3.4,32.5),(side*15,4.4,35.4),(side*15,4.4,37.5),(side*.6,3.4,35.8)];mesh('Elevator surface '+label,[tuple(v[k]-p[k]for k in range(3))for v in vs],[(0,1,2,3)],'paint',node)
fin=[(-.24,3,23.5),(-.14,18.1,34.5),(-.12,18.1,36.4),(-.19,3.4,36),(.24,3,23.5),(.14,18.1,34.5),(.12,18.1,36.4),(.19,3.4,36)]
fs=[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)];mesh('Vertical stabilizer',fin,fs,'paint',smooth=True)
node=empty('Rudder',(0,3.4,35.8),BODY);mesh('Rudder trailing surface',[(-.11,0,0),(-.09,14.7,.55),(-.07,14.7,1.8),(-.09,0,3),(.11,0,0),(.09,14.7,.55),(.07,14.7,1.8),(.09,0,3)],fs,'paint',node)
def open_loft(name,rings,mat,parent,segments=48):
 o=loft(name,rings,mat,parent,segments);old=o.data;vs=[v.co.copy()for v in old.vertices];faces=[tuple(p.vertices)for p in old.polygons if len(p.vertices)==4];data=bpy.data.meshes.new(name+' open');data.from_pydata(vs,[],faces);data.materials.append(M[mat]);data.update();o.data=data
 for f in data.polygons:f.use_smooth=True
 return o
for i,mount in enumerate(D['authoring']['engineMounts']):
 p=(mount['x'],mount['y'],mount['z']);engine=empty('Engine_'+str(i+1),p,BODY);x,y,z=p
 tube('Engine pylon',(x,y+1.7,z+1.3),(x,y+3.1,z+3.2),.36,'wing',segments=12);box('Pylon fairing',(x,y+2.3,z+2),(.7,1,3.7),'wing',bevel=.15)
 open_loft('Nacelle outer '+str(i+1),[(-3.2,1.85,1.85,0),(-2.9,2.04,2.04,0),(-2,2.12,2.12,0),(.5,2.03,2.03,0),(2,1.8,1.8,0)],'paint',engine)
 open_loft('Polished intake lip',[(-3.2,1.85,1.85,0),(-3.34,1.72,1.72,0),(-3.15,1.59,1.59,0),(-2.7,1.56,1.56,0)],'metal',engine)
 open_loft('Acoustic inlet barrel',[(-2.7,1.56,1.56,0),(-1.65,1.47,1.47,0)],'graphite',engine)
 fan=empty('Fan_'+str(i+1),(0,0,-1.65),engine);tube('Fan backing',(0,0,.08),(0,0,.15),1.48,'graphite',fan,segments=40)
 for j in range(24):
  q=j*math.tau/24;vs=[(r*math.cos(a),r*math.sin(a),zz)for r,a,zz in[(.3,q,-.04),(1.43,q+.18,0),(1.46,q+.32,.02),(.65,q+.41,-.04),(.3,q+.26,-.08)]];mesh('Swept fan blade',vs,[(0,1,2,3,4)],'metal',fan)
 loft('Fan spinner',[(-.6,.02,.02,0),(-.3,.24,.24,0),(.1,.4,.4,0),(.35,.44,.44,0)],'metal',fan,segments=32)
 aft=empty('Reverse_'+str(i+1),(0,0,1.4),engine)if D['engines'][i]['reverseAvailable'] else engine
 aft_rings=[(0,1.92,1.92,0),(.7,1.76,1.76,0),(1.4,1.56,1.56,0)] if aft!=engine else [(1.4,1.92,1.92,0),(2.1,1.76,1.76,0),(2.8,1.56,1.56,0)]
 open_loft('Reverser cowl '+str(i+1),aft_rings,'paint',aft)
 if D['engines'][i]['reverseAvailable']:
  for j in range(28):q=j*math.tau/28;tube('Reverser cascade',(1.72*math.cos(q),1.72*math.sin(q),1.7),(1.65*math.cos(q+.06),1.65*math.sin(q+.06),3.1),.035,'graphite',engine,segments=5)
 open_loft('Exhaust nozzle',[(2.5,1.28,1.28,0),(3.5,1.02,1.02,0),(3.9,.89,.89,0)],'metal',engine,40)
 loft('Exhaust plug',[(3,.65,.65,0),(3.9,.36,.36,0),(4.5,.02,.02,0)],'graphite',engine,segments=32)
GEAR=empty('Undercarriage',parent=AIR);wheel_index=0
def tyre(center,radius,width,parent):
 global wheel_index
 node=empty('Wheel_'+str(wheel_index),center,parent);wheel_index+=1;vs=[];n=28
 for ax,rr in[(-width*.5,.76),(-width*.47,.94),(-width*.28,1),(width*.28,1),(width*.47,.94),(width*.5,.76)]:
  for j in range(n):q=j*math.tau/n;vs.append((ax,radius*rr*math.cos(q),radius*rr*math.sin(q)))
 faces=[]
 for j in range(5):
  for k in range(n):a=j*n+k;b=j*n+(k+1)%n;faces.append((a,b,b+n,a+n))
 mesh('Wheel tyre',vs,faces,'rubber',node,True);tube('Alloy wheel hub',(-width*.52,0,0),(width*.52,0,0),radius*.5,'metal',node,segments=20)
for side,label in[(-1,'L'),(1,'R')]:
 for body in [False,True]:
  x=side*(2.6 if body else 6.8);z=10.5 if body else 6.1;p=(side*(2.9 if body else 7.1),-1,z);node=empty(('BodyGear_'if body else'MainGear_')+label,p,GEAR);dx=x-p[0];dy=-5.3-p[1]
  tube('Main oleo',(0,0,0),(dx,dy+.3,0),.22,'wing',node,segments=14);tube('Main chrome piston',(dx,-2.2,0),(dx,dy+.1,0),.14,'metal',node,segments=12)
  tube('Main side brace',(-side*.9,.2,-1),(dx,dy+.6,0),.11,'metal',node,segments=10)
  for axle in([-1.4,0,1.4]if body else[-.85,.85]):
   tube('Bogie axle',(dx-.7,dy,axle),(dx+.7,dy,axle),.13,'metal',node,segments=10)
   for offset in[-.42,.42]:tyre((dx+offset,dy,axle),.7,.48,node)
  door=empty(('BodyDoor_'if body else'MainDoor_')+label,(p[0],-2.2,z-.4),GEAR);box('Gear door',(side*-.5,0,0),(1.15,.08,4.8 if body else 3.6),'paint',door)
 node=empty('NoseDoor_'+label,(side*.55,-3.4,-24),GEAR);box('Nose gear door',(side*.22,0,0),(.45,.08,3.8),'paint',node)
node=empty('NoseGear',(0,-2,-24),GEAR);steer=empty('NoseSteering',parent=node);tube('Nose oleo',(0,0,0),(0,-2.9,-1.8),.17,'wing',steer,segments=14);tube('Nose piston',(0,-1.8,-1.3),(0,-3.48,-1.8),.1,'metal',steer,segments=12);tube('Nose diagonal brace',(0,0,.8),(0,-2.6,-1.5),.09,'metal',steer,segments=10)
for side in [-1,1]:tyre((side*.36,-3.48,-1.8),.52,.32,steer)
assert wheel_index==22
for z in[-14,1,17]:tube('Dorsal antenna',(0,4.65,z),(0,5.3,z+.3),.06,'wing',segments=8,r2=.012)
for name,y in [('Beacon_top',4.75),('Beacon_bottom',-3.9)]:tube(name,(0,y,0),(0,y+.07,0),.15,'red',segments=12)
bpy.context.view_layer.update()
def unit(v,a,b):return max(0,min(1,(v-a)/(b-a)))
def atlas(region,u,v):
 x,y,w,h=UV['regions'][region];return((x+u*w)/UV['size'],1-(y+v*h)/UV['size'])
for o in g.parts:
 if o.data.materials[0]!=M['paint']:continue
 layer=o.data.uv_layers.new(name='PaintUV1');o['uvLayout']='a380-uv1';points=[(p.x,p.z,-p.y)for v in o.data.vertices for p in[o.matrix_world@v.co]]
 ancestor=o.parent
 while ancestor and not ancestor.name.startswith('Engine_'):ancestor=ancestor.parent
 mount=D['authoring']['engineMounts'][int(ancestor.name.split('_')[-1])-1]if ancestor else None
 for polygon in o.data.polygons:
  center=[sum(points[i][k]for i in polygon.vertices)/len(polygon.vertices)for k in range(3)];side='left'if center[0]<0 else'right'
  for idx in polygon.loop_indices:
   x,y,z=points[o.data.loops[idx].vertex_index]
   if o.name.startswith(('Vertical stabilizer','Rudder trailing')):
    u=unit(z,*UV['domains']['tailZ']);uv=atlas('tail-'+side,u if side=='left'else 1-u,1-unit(y,*UV['domains']['tailY']))
   elif mount:
    q=math.atan2(x-mount['x'],y-mount['y']);middle=math.atan2(center[0]-mount['x'],center[1]-mount['y'])
    while q-middle>math.pi:q-=math.tau
    while q-middle< -math.pi:q+=math.tau
    u=unit(z-mount['z'],*UV['domains']['engineZ']);uv=atlas('engine-'+side,u if side=='left'else 1-u,unit(q,-math.pi,math.pi))
   elif o.name.startswith('Wingtip fence'):
    u=unit(z,*UV['domains']['wingtipZ']);uv=atlas('wingtip-'+side,u if side=='left'else 1-u,1-unit(y,*UV['domains']['wingtipY']))
   elif o.name.startswith(('Swept main wing','Leading edge slat','Slotted flap','Outboard aileron')):
    face='top'if center[1]>=wing_at(center[0])[2]else'bottom';uv=atlas('wing-'+side+'-'+face,unit(abs(x),*UV['domains']['wingX']),unit(z,*UV['domains']['wingZ']))
   else:
    rx,ry,cy=profile(z);q=math.acos(max(-1,min(1,(y-cy)/ry)));u=unit(z,*UV['domains']['fuselageZ']);uv=atlas('fuselage-'+side,u if side=='left'else 1-u,q/math.pi)
   layer.data[idx].uv=uv
AIR['uvLayout']='a380-uv1';AIR['assetRevision']=1;AIR['wheelCount']=22;AIR['decks']=2
for o in g.parts:
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(OUT/'skyline-380-uv1.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False)
report={'originalAsset':True,'dimensionsM':D['authoring']['dimensionsM'],'wheelCount':wheel_index,'decks':2,'engines':4,'reversers':[2,3],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in g.parts),'materials':len(M),'meshObjects':len(g.parts),'contacts':D['geometry']['contacts'],'logicalCoordinateFrame':'X right, Y up, nose -Z'};(OUT/'skyline-380-uv1-metadata.json').write_text(json.dumps(report,indent=2)+'\n');print('AIRCRAFT_REPORT',json.dumps({k:v for k,v in report.items()if k!='contacts'}))
if not options.skip_preview:
 image=bpy.data.images.load(str(ROOT/'public/assets/aircraft/liveries/yunji-a380/v1/paint-2048.png'));node=M['paint'].node_tree.nodes.new('ShaderNodeTexImage');node.image=image;M['paint'].node_tree.links.new(node.outputs['Color'],M['paint'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 world=bpy.data.worlds.new('Studio');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.23,.3,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7
 for pos,power in [((50,-45,70),17000),((-45,0,40),12000)]:bpy.ops.object.light_add(type='AREA',location=pos);bpy.context.object.data.energy=power;bpy.context.object.data.size=60
 bpy.ops.object.camera_add(location=V((100,47,-90)));camera=bpy.context.object;target=Vector(V((0,2,3)));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=108;bpy.context.scene.camera=camera
 scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.filepath=str(OUT/'skyline-380-preview.png');bpy.ops.render.render(write_still=True)
