import{airportOf,runwayOf}from'../airports/registry.js';
import{FT,RAD,clamp,wrap}from'../sim/constants.js';
import{geoDistance,geoBearing,geoMove,geoTrack,rotateFlightVector,longitudeWrapped}from'./route-geography.js';

// Flight-planning presets, not published ATC clearances. Nearby airports stay
// at their initial terminal clearance; long routes use the existing FL330 cast.
export function routeProfile(origin,destination,distanceKm,departure){
 const short=distanceKm<=180,initialMSL=departure.altitude+airportOf(origin).elevationM*FT;
 return{kind:short?'terminal':'enroute',short,cruiseMSL:short?initialMSL:Math.max(33000,initialMSL),handoffRadius:65000};
}
export function startContinuousRoute(s,arrival){
 const a=s.airline,ap=airportOf(s),geo=ap.unproject(s.x,s.z),to=airportOf(a.destination),entry=to.unproject(arrival.entry.x,arrival.entry.z),distance=geoDistance(geo,entry);
 a.departureEvidence=structuredClone(s.ground);a.departureRouteEvidence=structuredClone(a.navigation);a.departureCut={x:s.x,y:s.y,z:s.z,time:s.time};a.continuousStartedAt=s.time;
 a.arrivalAltitudeMSL=arrival.altitude+to.elevationM*FT;
 a.navigation={kind:'enroute',index:0,origin:{x:s.x,z:s.z},geoOrigin:geo,geoTarget:entry,geo:{...geo},distance,travelled:0,remaining:distance,crossTrack:0,complete:false,altitude:s.selectedAltitude,points:[{x:s.x,z:s.z,name:'航路飞行',alt:s.selectedAltitude}],course:geoBearing(geo,entry),elevationFt:ap.elevationM*FT};
 a.phase='enroute';a.continuous=true;return a.navigation;
}
export function observeContinuousMotion(s,previous){
 const n=s.airline?.navigation;if(n?.kind!=='enroute')return;
 const dx=s.x-previous.x,dz=s.z-previous.z,distance=Math.hypot(dx,dz);if(!distance)return;
 const geo=geoMove(n.geo,runwayOf(s).heading+Math.atan2(dx,-dz)/RAD,distance);geo.longitude=n.geo.longitude+longitudeWrapped(geo.longitude-n.geo.longitude);n.geo=geo;n.travelled+=distance;n.remaining=geoDistance(n.geo,n.geoTarget);
}
export function continuousTarget(s){
 const a=s.airline,n=a.navigation,ap=airportOf(s),to=airportOf(a.destination),distanceToAirport=geoDistance(n.geo,to.data.airport),profile=a.profile;
 const planned=geoTrack(n.geoOrigin,n.geoTarget,n.geo,clamp(s.airData.groundSpeed*25,3000,18000));let bearing=planned.bearing;
 if(a.waitingForArrival&&planned.remaining<10000){const r=geoDistance(n.geo,n.geoTarget);bearing=geoBearing(n.geoTarget,n.geo)+90+clamp((r-8000)/8000,-1,1)*45;n.holding=true;}else n.holding=false;
 const arrivalMSL=Math.max(to.elevationM*FT+3500,(a.arrivalAltitudeMSL||0)+500),msl=profile.short?Math.max(profile.cruiseMSL,arrivalMSL):Math.min(profile.cruiseMSL,arrivalMSL+Math.max(0,distanceToAirport-50000)*Math.tan(2.5*RAD)*FT),altitude=msl-ap.elevationM*FT,track=wrap((bearing-ap.runway.heading)*RAD),lookahead=clamp(s.airData.groundSpeed*25,3000,18000);
 n.altitude=altitude;n.course=(bearing+360)%360;n.remaining=planned.remaining;n.distanceToAirport=distanceToAirport;n.crossTrack=n.holding?Math.max(0,geoDistance(n.geo,n.geoTarget)-10000):planned.cross;
 n.origin={x:s.x-Math.sin(track)*1000,z:s.z+Math.cos(track)*1000,alt:altitude};n.points[0]={x:s.x+Math.sin(track)*lookahead,z:s.z-Math.cos(track)*lookahead,name:n.holding?'等待进近引导':profile.short?'同城转场':'航路飞行',alt:altitude};
 return{track,altitude,along:planned.along/Math.max(planned.total,1),cross:n.crossTrack,length:planned.total,distance:planned.remaining,name:n.points[0].name,speedLimit:msl<10000?250:null,headingMode:false,enroute:true};
}
export function continuousArrivalDue(s){const a=s.airline,n=a?.navigation;return n?.kind==='enroute'&&geoDistance(n.geo,airportOf(a.destination).data.airport)<=a.profile.handoffRadius;}
export function continuousCoordinates(s){const n=s.airline?.navigation;return n?.kind==='enroute'?{latitude:n.geo.latitude,longitude:longitudeWrapped(n.geo.longitude)}:airportOf(s).unproject(s.x,s.z);}
// A change of runway tangent frame, not a flight cut. Geography, MSL, body
// attitude, speed, failures and simulation time survive. No entry preset is used.
export function rebaseContinuousArrival(s){
 const a=s.airline,from=airportOf(s),to=airportOf(a.destination),geo=continuousCoordinates(s),position=to.project(geo.longitude,geo.latitude),angle=(to.runway.heading-from.runway.heading)*RAD,old={airportId:s.airportId,x:s.x,y:s.y,z:s.z,yaw:s.yaw},elevationDelta=from.elevationM-to.elevationM;
 a.enrouteEvidence={travelled:s.airline.navigation.travelled||0,startedAt:a.continuousStartedAt,finishedAt:s.time,geography:geo};
 Object.assign(s,{airportId:to.id,x:position.x,z:position.z,y:s.y+elevationDelta,yaw:wrap(s.yaw-angle),selectedHeading:(s.selectedHeading+360)%360});
 s.velocity=rotateFlightVector(s.velocity,angle);if(s.forces)s.forces=rotateFlightVector(s.forces,angle);
 s.weather.referenceHeading=to.runway.heading;s.weather.densityOffset=(s.weather.densityOffset||0)-elevationDelta;s.weather.noiseRotation=(s.weather.noiseRotation||0)+angle;
 if(s.weather.shear)s.weather.shear={...s.weather.shear,base:s.weather.shear.base+elevationDelta,delta:rotateFlightVector({x:0,z:0,...s.weather.shear.delta},angle)};
 s.weather.disturbances=s.weather.disturbances.map(f=>{const p=from.unproject(f.x,f.z);return{...f,...to.project(p.longitude,p.latitude),base:f.base+elevationDelta,top:f.top+elevationDelta,rotation:(f.rotation||0)+angle,wind:rotateFlightVector({x:0,z:0,...f.wind},angle)};});
 s.headwind=s.weather.wind.speedKt*Math.cos((s.weather.wind.directionDeg-to.runway.heading)*RAD);
 a.frameHandoff={kind:'continuous',at:s.time,from:old,to:{airportId:s.airportId,x:s.x,y:s.y,z:s.z,yaw:s.yaw},angle,geo};a.arrivalReached=true;a.arrivalMode='continuous';a.phase='arrival';a.waitingForArrival=false;
 s.mode='enroute';s.scenario='full';s.ground=null;s.arrival={x:s.x,z:s.z,altitude:(s.y-runwayOf(s).ground)*FT,heading:s.yaw/RAD,requiresPreparation:true};
 s.radio.towerVoice=s.radio.towerVoices[a.destination]??s.radio.towerVoice;
 return{geo,angle,entry:{x:s.x,z:s.z,altitude:(s.y-runwayOf(s).ground)*FT,yaw:s.yaw}};
}
