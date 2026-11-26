// A fixed local sun/shadow volume covers the terminal district. It adds no
// time-of-day or weather changes to the simulation.
export const LAX_LIGHTING=Object.freeze({sun:3,ambient:1.35,environment:.45});
export function configureLaxLighting({THREE,renderer,scene,sun,airport,shadowResolution=2048}){
 const c=airport.viewCenter;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 sun.castShadow=true;sun.position.set(c.x-2000,4000,c.z+1500);sun.target.position.set(c.x,0,c.z);scene.add(sun.target);
 sun.shadow.mapSize.set(shadowResolution,shadowResolution);Object.assign(sun.shadow.camera,{left:-1900,right:1900,top:1900,bottom:-1900,near:100,far:9000});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.00008;sun.shadow.normalBias=.3;
}
