"""Shared original-aircraft authoring primitives, in metres, X right/Y up/-Z nose.

Templates own aircraft shape, UV layout and semantic joints. These helpers own
Blender mesh construction and collect source geometry without flattening joints.
"""
import bpy, math
from mathutils import Vector

def V(p):return (p[0],-p[2],p[1])

def material(name,color,metal=0,rough=.4,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 if emission:n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m

class AircraftGeometry:
 def __init__(self,materials):self.materials=materials;self.parts=[];self.body=None
 def empty(self,name,pos=(0,0,0),parent=None):
  o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=V(pos);o.parent=parent;return o
 def mesh(self,name,vertices,faces,mat,parent=None,smooth=False):
  g=bpy.data.meshes.new(name);g.from_pydata([V(p) for p in vertices],[],faces);g.materials.append(self.materials[mat] if isinstance(mat,str) else mat);g.update();o=bpy.data.objects.new(name,g);bpy.context.collection.objects.link(o);o.parent=self.body if parent is None else parent
  for f in g.polygons:f.use_smooth=smooth
  self.parts.append(o);return o
 def box(self,name,center,size,mat,parent=None,bevel=0):
  x,y,z=center;w,h,d=[s/2 for s in size];p=[(x+i*w,y+j*h,z+k*d)for i,j,k in[(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]];o=self.mesh(name,p,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,parent)
  if bevel:
   mod=o.modifiers.new('Small manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=2;mod.affect='EDGES';bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
  return o
 def tube(self,name,a,b,r,mat,parent=None,segments=12,r2=None):
  a=Vector(a);b=Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,1,0)))
  if u.length<.01:u=axis.cross(Vector((1,0,0)))
  u.normalize();v=axis.cross(u);verts=[]
  for p,rr in [(a,r),(b,r if r2 is None else r2)]:
   for i in range(segments):verts.append(tuple(p+rr*(math.cos(i*math.tau/segments)*u+math.sin(i*math.tau/segments)*v)))
  faces=[(i,(i+1)%segments,(i+1)%segments+segments,i+segments)for i in range(segments)];faces+=[tuple(reversed(range(segments))),tuple(range(segments,segments*2))];return self.mesh(name,verts,faces,mat,parent,True)
 def loft(self,name,rings,mat,parent=None,segments=72):
  verts=[]
  for z,rx,ry,cy in rings:
   for i in range(segments):q=i*math.tau/segments;verts.append((rx*math.sin(q),cy+ry*math.cos(q),z))
  faces=[]
  for j in range(len(rings)-1):
   for i in range(segments):a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
  faces.extend([tuple(reversed(range(segments))),tuple(range((len(rings)-1)*segments,len(rings)*segments))]);return self.mesh(name,verts,faces,mat,parent,True)
