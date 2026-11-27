import * as THREE from 'three';
import {airportOf} from '../airports/registry.js';
import {installDenseCity,installWoodlands,installRoadTraffic} from '../terrain/city-obstacles.js';
import {sceneryFrame,bridgeObstacleIndex} from './scenery-frame.js';
// Keep regional source coordinates in the renderer/cache. Only a parent matrix,
// a camera and the candidate queries cross into the active runway flight frame.
export async function loadRunwayCity(options,load){
 const actual=options.airport,source=airportOf(actual.sceneryAirportId),toSource=sceneryFrame(actual,source),toLocal=sceneryFrame(source,actual),sourceMatrix=new THREE.Matrix4().fromArray(toSource.elements),localMatrix=new THREE.Matrix4().fromArray(toLocal.elements),root=new THREE.Group();root.name=actual.id+'-regional-frame';root.matrixAutoUpdate=false;root.matrix.copy(localMatrix);options.scene.add(root);
 const camera=new THREE.PerspectiveCamera();camera.matrixAutoUpdate=false;
 function sync(real){real.updateMatrixWorld();for(const key of ['fov','zoom','aspect','near','far'])camera[key]=real[key];camera.projectionMatrix.copy(real.projectionMatrix);camera.projectionMatrixInverse.copy(real.projectionMatrixInverse);camera.matrix.multiplyMatrices(sourceMatrix,real.matrixWorld);camera.matrix.decompose(camera.position,camera.quaternion,camera.scale);camera.updateMatrixWorld(true);}
 sync(options.camera);
 const terrain={material:options.terrain.material,geometry:options.terrain.geometry.clone().applyMatrix4(sourceMatrix)};
 let city;
 try{city=await load({...options,scene:root,terrain,airport:source,materialAirport:actual,camera,installContacts(dense,forest,roads){const remove=[installDenseCity(bridgeObstacleIndex(dense,toSource,toLocal),actual.id),installWoodlands(bridgeObstacleIndex(forest,toSource,toLocal),actual.id)];if(roads)remove.push(installRoadTraffic(bridgeObstacleIndex(roads,toSource,toLocal),actual.id));return()=>remove.forEach(fn=>fn());}});options.terrain.geometry.setAttribute('uv',terrain.geometry.attributes.uv.clone());}
 catch(error){root.removeFromParent();throw error;}finally{terrain.geometry.dispose();}
 return{...city,update(real,timing={}){sync(real);city.update(camera,{...timing,...(timing.position?{position:toSource.point(timing.position)}:{}),...(timing.velocity?{velocity:toSource.vector(timing.velocity)}:{})});},stats(){const s=city.stats(),regional=s.roadTraffic?.regional;return{...s,airportId:actual.id,sourceFrame:source.id,...(regional?{roadTraffic:{...s.roadTraffic,regional:{...regional,focus:regional.focus?toLocal.point(regional.focus):regional.focus}}}:{})};},dispose(){city.dispose();root.removeFromParent();}};
}
