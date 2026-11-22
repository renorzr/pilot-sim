# Xiaoshan terminal exterior asset

`xiaoshan-scene.js` is original procedural Three.js geometry. It consumes the
same attributed OSM pack as airport pavement and uses its actual terminal,
apron, jet-bridge and tower plans. It does not include a commercial model,
photograph texture, downloaded building mesh or external runtime request.

The T4 outline is OSM `way/776023304`; the source complex also includes T3
`way/775893373`, T2 `way/775893371` and T1 `relation/16330394`. The tower is
`way/1177045534`, named 萧山机场塔台. Other small terminal/corridor footprints
are kept when tagged as terminals; exact duplicates and small slivers are
removed. Source names describe the snapshot, rather than current airline use.

The roof palette and aerial recognition cues follow the construction company's
[official September 2022 completion report](https://english.cscec.com/CompanyNews/CorporateNews/202209/3580909.html)
and its [T4 exterior aerial photograph](https://english.cscec.com/CompanyNews/CorporateNews/202209/W020220930410464080734.png):
white/silver roofs with gentle changes in height, dark diamond rooflights,
slender white framing and blue-grey glass. The photograph was inspected as a
reference only and is not bundled. The [Hangzhou Asian Games organizing
committee's T4 introduction](https://www.hangzhou2022.cn/En/presscenter/spotnews/latestnews/202204/t20220405_47093.shtml)
also describes the white leaf-like structural language.

Heights, curved roof profile, glazing, mullions, rooflight spacing, tower shaft
and bridge equipment are deliberate visual estimates. Roof meshes are clipped
to source outlines/holes, with a continuous sampled height field. Terminal
walls follow the same perimeter. Source jet bridges receive simplified raised
walkways. No static aircraft are added to occupy a playable stand. The tower
uses its source footprint center and a default visual height where none is
provided; this is not a surveyed obstruction model.

Apron and paint use the shared `ground-layers.js` rules; the asset explicitly
sets paint render order. All mesh geometries have normals/UV/index attributes
compatible with the shared material batching. Small, degenerate source roof
slivers are removed and Float32 triangle winding is normalized upward.

The city-scene pass adds local sun shadows for the original terminal and raised
bridges, receiving on the apron/shared terrain. Source terminal plans, stand
clearance, roof language and mesh attributes remain intact. The surrounding
city uses a separate [attributed regional pack](data/XIAOSHAN-CITY.md).
