"""Optional equivalent C kernel for very large OSM-only roof batches.

Falls back to the original implementation if a compiler is unavailable.
Normal game builds/play do not use Python or this helper.
"""
import ctypes,pathlib,subprocess,tempfile
import numpy as np
from city_roof_sampling import RoofSampler
_kernel=None
class FastRoofSampler(RoofSampler):
 def __init__(self,*args,**kwargs):
  global _kernel
  super().__init__(*args,**kwargs)
  if _kernel is None:
   src=pathlib.Path(__file__).with_suffix('.c');out=pathlib.Path(tempfile.gettempdir())/'pilot-jfk-city'/'roof-sampling.so';out.parent.mkdir(exist_ok=True)
   try:
    if not out.exists()or out.stat().st_mtime<src.stat().st_mtime:subprocess.run(['cc','-O3','-ffp-contract=off','-shared','-fPIC',str(src),'-lm','-o',str(out)],check=True,capture_output=True)
    lib=ctypes.CDLL(str(out));f=lib.city_roof_sample;f.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_int,ctypes.c_int]+[ctypes.c_int64]*5+[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_void_p];f.restype=ctypes.c_int;_kernel=f
   except (OSError,subprocess.CalledProcessError):_kernel=False
  self._rgb=ctypes.c_void_p(self.rgb.ctypes.data);self._green=ctypes.c_void_p(self.green.ctypes.data)
 def sample(self,rings):
  if not _kernel or self.integral is not None:return super().sample(rings)
  paths=self.pixels(rings);points=np.ascontiguousarray(np.concatenate(paths),dtype='float64');offsets=np.asarray([0,*np.cumsum([len(p)for p in paths])],dtype='int32');out=np.zeros(3,dtype='int32');height,width=self.green.shape
  ok=_kernel(self._rgb,self._green,width,height,*self.rgb.strides,*self.green.strides,ctypes.c_void_p(points.ctypes.data),ctypes.c_void_p(offsets.ctypes.data),len(paths),int(self.min_brightness),ctypes.c_void_p(out.ctypes.data))
  if not ok:return super().sample(rings)
  return list(map(int,out)),False,{'kernel':'equivalent weighted native-pixel quadrature'}
