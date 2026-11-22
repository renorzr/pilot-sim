// Airport overlays are thin surfaces above the same graded physical ground.
// Base pavements use fixed depth units: slope bias on a large pavement can
// pull it through paint at cockpit grazing angles. Only paint receives the
// conventional small decal slope bias, keeping depth tests against scenery.
export const GROUND_LAYERS=Object.freeze({apron:.02,road:.03,taxi:.04,shoulder:.05,runway:.06,paint:.065,label:.07});
export const surfaceDepth=rank=>({polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-rank});
export function groundPaint(material,order=10){
 Object.assign(material,surfaceDepth(8),{polygonOffsetFactor:-1,depthWrite:false});
 material.userData.groundPaintOrder=order;
 return material;
}
export function orderGroundPaint(group){
 group.traverse(mesh=>{if(mesh.isMesh&&mesh.material?.userData.groundPaintOrder)mesh.renderOrder=mesh.material.userData.groundPaintOrder;});
}
