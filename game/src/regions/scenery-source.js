export const scenerySourceId=airport=>airport.region?.sourceAirportId||airport.id;
export const sceneryCacheId=airport=>airport.region?.id||airport.id;
export const sceneryExtent=airport=>airport.region?.extent||30000;

// The regional source frame is independent of the selected airport/runway.
export function validateSceneryFrame(airport,frame,label='Scene'){
 const origin=airport.unproject(0,0),heading=frame?.heading,threshold=frame?.threshold;
 if(!Array.isArray(threshold)||threshold.length!==2||!threshold.every(Number.isFinite)||!Number.isFinite(heading))throw Error(label+' frame mismatch');
 const east=airport.project(origin.longitude+.001,origin.latitude),delta=Math.atan2(-east.z,east.x)-heading*Math.PI/180;
 if(Math.abs(origin.longitude-threshold[0])>1e-7||Math.abs(origin.latitude-threshold[1])>1e-7||Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta)))>1e-5)throw Error(label+' frame mismatch');
}
