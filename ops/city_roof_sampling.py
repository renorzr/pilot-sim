"""Build-time roof appearance from the actual georeferenced native RGB raster.

Sampling never moves a footprint. Small buildings remain limited by native
pixel resolution; clear vegetation is a conservative stale-outline signal,
not proof of demolition. OSM/source heights are never changed by this module.
"""
import numpy as np,rasterio,pyproj
class RoofSampler:
 def __init__(self,path,unproject,min_brightness=45,vegetation_screen=True):
  with rasterio.open(path)as src:
   self.rgb=np.moveaxis(src.read([1,2,3]),0,-1);self.inverse=~src.transform;self.project=pyproj.Transformer.from_crs(4326,src.crs,always_xy=True).transform
  self.unproject=unproject;self.min_brightness=min_brightness
  # Source mosaics can exceed a billion RGB samples. Identical float32 tests
  # in bounded row blocks avoid a multi-gigabyte temporary RGB expansion.
  self.green=np.empty(self.rgb.shape[:2],dtype='bool')
  for y in range(0,self.rgb.shape[0],256):
   f=self.rgb[y:y+256].astype('float32');r,g,b=f[:,:,0],f[:,:,1],f[:,:,2]
   self.green[y:y+256]=(g>r*1.12)&(g>b*1.08)&(g>45)
  self.integral=np.pad(self.green.astype('uint32'),((1,0),(1,0))).cumsum(0,dtype='uint32').cumsum(1,dtype='uint32')if vegetation_screen else None
 def pixels(self,rings):
  result=[]
  for ring in rings:
   lon,lat=self.unproject(np.asarray([p[0]for p in ring]),np.asarray([p[1]for p in ring]));x,y=self.project(lon,lat);c,r=self.inverse*(x,y);result.append(np.column_stack([c,r]))
  return result
 def sample(self,rings):
  paths=self.pixels(rings);p=paths[0];height,width=self.green.shape;x0=max(0,int(np.floor(p[:,0].min())));x1=min(width,int(np.ceil(p[:,0].max())));y0=max(0,int(np.floor(p[:,1].min())));y1=min(height,int(np.ceil(p[:,1].max())))
  if x1<=x0 or y1<=y0:return [155,152,143],False,{'vegetation':0,'context':0,'pixels':0}
  stride=max(1,int(np.sqrt((x1-x0)*(y1-y0)/400)));yy,xx=np.mgrid[y0:y1:stride,x0:x1:stride];weights=np.zeros(xx.shape,dtype='float32')
  x=(xx.ravel()[None,:]+np.array([.25,.75,.25,.75])[:,None]).ravel();y=(yy.ravel()[None,:]+np.array([.25,.25,.75,.75])[:,None]).ravel();inside=np.zeros(x.shape,dtype='bool')
  for ring in paths:
   ax=ring[:,0,None];ay=ring[:,1,None];bx=np.roll(ring[:,0],-1)[:,None];by=np.roll(ring[:,1],-1)[:,None];dy=by-ay
   hits=((ay>y)!=(by>y))&(x<(bx-ax)*(y-ay)/np.where(np.abs(dy)>1e-9,dy,1)+ax)
   inside^=np.logical_xor.reduce(hits,axis=0)
  weights=inside.reshape(4,-1).mean(axis=0).reshape(xx.shape).astype('float32')
  if not np.any(weights):
   # Subpixel outlines can miss all four quadrature points; their containing
   # native pixel still supplies colour, but never sufficient culling evidence.
   cx=min(width-1,max(0,int(np.mean(p[:,0]))));cy=min(height-1,max(0,int(np.mean(p[:,1]))));return list(map(int,self.rgb[cy,cx])),False,{'vegetation':0,'context':0,'pixels':0}
  colors=self.rgb[yy,xx].reshape(-1,3);w=weights.ravel();green=self.green[yy,xx].ravel();vegetation=float(np.sum(w*green)/np.sum(w));cx=min(width-1,max(0,int(np.mean(p[:,0]))));cy=min(height-1,max(0,int(np.mean(p[:,1]))))
  # Five native pixels span ~50 m. Requiring both the actual footprint and its
  # surrounding patch to be overwhelmingly green retains isolated small roofs.
  left=max(0,cx-2);right=min(width,cx+3);top=max(0,cy-2);bottom=min(height,cy+3);q=self.integral
  context=(int(q[bottom,right])-int(q[top,right])-int(q[bottom,left])+int(q[top,left]))/((right-left)*(bottom-top))if q is not None else 0
  valid=(w>0)&~green&(np.mean(colors,axis=1)>self.min_brightness)
  if not np.any(valid):valid=w>0
  colors=colors[valid];cw=w[valid];rgb=[]
  for k in range(3):
   order=np.argsort(colors[:,k]);v=colors[order,k];mass=np.cumsum(cw[order]);rgb.append(int(v[np.searchsorted(mass,mass[-1]/2)]))
  # Colour screening preserves blue/red roof panels. Only high-confidence
  # vegetation-only EAB estimates are rejected by the caller.
  stale=vegetation>=.92 and context>=.88
  return rgb,stale,{'vegetation':round(vegetation,4),'context':round(context,4),'pixels':int(np.count_nonzero(w))}
