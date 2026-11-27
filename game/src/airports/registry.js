import {aircraftDefinition} from '../aircraft/registry.js';
import lga from './data/lga.json' with {type:'json'};
import {NEW_YORK_REGION} from '../regions/new-york.js';
import tidalWater from '../history/tidal-water.json' with {type:'json'};
import {isSeaLevelWater} from './water-surfaces.js';
import {createPolygonMask} from './polygon-mask.js';
import kansai from './data/kansai.json' with {type:'json'};
import jfk from './data/jfk.json' with {type:'json'};
import lax from './data/lax.json' with {type:'json'};
import daxing from './data/daxing.json' with {type:'json'};
import xiaoshan from './data/xiaoshan.json' with {type:'json'};
import changi from './data/changi.json' with {type:'json'};
import {RUNWAY} from '../sim/constants.js';
import {US1549_PROFILE} from '../history/us1549-profile.js';
const rad=Math.PI/180,earth=6378137;
const names={lga:{cityId:'new-york',city:'纽约',shortName:'纽约拉瓜迪亚'},daxing:{cityId:'beijing',city:'北京',shortName:'北京大兴'},xiaoshan:{cityId:'hangzhou',city:'杭州',shortName:'杭州萧山'},changi:{cityId:'singapore',city:'新加坡',shortName:'新加坡樟宜'},kansai:{cityId:'osaka',city:'大阪',shortName:'大阪关西'},jfk:{cityId:'new-york',city:'纽约',shortName:'纽约肯尼迪'},lax:{cityId:'los-angeles',city:'洛杉矶',shortName:'洛杉矶'}};
const training={id:'training',name:'海岸训练机场',runway:{...RUNWAY,id:'27',heading:270},elevationM:0};
function makeAirport(data,id,activeRunway,name,english,view){
 const source=data.runways.find(r=>r.ends.some(e=>e.id===activeRunway));if(!source)throw new Error(`${id}: missing runway ${activeRunway}`);
 const threshold=source.ends.find(e=>e.id===activeRunway),opposite=source.ends.find(e=>e.id!==activeRunway);
 const longitudeScale=earth*rad*Math.cos(threshold.latitude*rad),latitudeScale=earth*rad;
 const east=(opposite.longitude-threshold.longitude)*longitudeScale,north=(opposite.latitude-threshold.latitude)*latitudeScale;
 const bearing=(Math.atan2(east,north)/rad+360)%360,c=Math.cos(bearing*rad),s=Math.sin(bearing*rad);
 const project=(longitude,latitude)=>{const e=(longitude-threshold.longitude)*longitudeScale,n=(latitude-threshold.latitude)*latitudeScale;return{x:e*c-n*s,z:-(e*s+n*c)};};
 const unproject=(x,z)=>{const e=x*c-z*s,n=-x*s-z*c;return{longitude:threshold.longitude+e/longitudeScale,latitude:threshold.latitude+n/latitudeScale};};
 const points=data.runways.flatMap(r=>r.ends.map(e=>project(e.longitude,e.latitude)));
 const grading={minX:Math.min(...points.map(p=>p.x))-350,maxX:Math.max(...points.map(p=>p.x))+350,minZ:Math.min(...points.map(p=>p.z))-350,maxZ:Math.max(...points.map(p=>p.z))+350};
 return{id,...names[id],coastal:data.osm.features.some(f=>f.tags?.water==='sea'),ident:data.airport.ident,iata:data.airport.iata,name,english,elevationM:threshold.elevationM??data.airport.elevationM,
  runway:{width:source.widthM,length:Math.hypot(east,north),ground:RUNWAY.ground,id:activeRunway,heading:bearing},data,project,unproject,grading,
  viewCenter:project(view?.longitude??data.airport.longitude,view?.latitude??data.airport.latitude)};
}
export const DAXING=makeAirport(daxing,'daxing','17L','北京大兴国际机场','BEIJING DAXING',{longitude:116.410806,latitude:39.509881});
export const XIAOSHAN=makeAirport(xiaoshan,'xiaoshan','07','杭州萧山国际机场','HANGZHOU XIAOSHAN');
export const CHANGI=makeAirport(changi,'changi','02L','新加坡樟宜机场','SINGAPORE CHANGI');
export const KANSAI=makeAirport(kansai,'kansai','06R','大阪关西国际机场','OSAKA KANSAI');
const newYorkData={...jfk,osm:{...jfk.osm,features:[...jfk.osm.features,...tidalWater.features]}};
export const JFK=Object.assign(makeAirport(newYorkData,'jfk','22R','纽约肯尼迪国际机场','NEW YORK KENNEDY'),{region:NEW_YORK_REGION});
export const LAX=makeAirport(lax,'lax','25R','洛杉矶国际机场','LOS ANGELES LAX');
// Operational flight coordinates stay relative to the selected runway. The
// shared city and DEM remain in the canonical NYC tangent frame.
const lgaData={...lga,dem:newYorkData.dem,osm:{...newYorkData.osm,features:[...newYorkData.osm.features,...lga.osm.features]}};
export const LGA=Object.assign(makeAirport(lgaData,'lga','04','纽约拉瓜迪亚机场','NEW YORK LAGUARDIA'),{region:NEW_YORK_REGION,terrainFrameId:'jfk',sceneryAirportId:'lga-source'});
JFK.regionAirports=LGA.regionAirports=['jfk','lga'];
const LGA_SOURCE={...JFK,id:'lga-source',event:true,elevationM:LGA.elevationM,terrainFrameId:'jfk',sceneryAirportId:null,sceneryAirportBoundary:lga.osm.features.filter(f=>f.tags.aeroway==='aerodrome'),runway:{...JFK.runway,id:'—',width:0,length:0},viewCenter:JFK.project(lga.airport.longitude,lga.airport.latitude)};
export const AIRPORTS=[DAXING,XIAOSHAN,CHANGI,KANSAI,JFK,LAX,LGA];
// An independent event world shares the NYC horizontal source frame. It has no
// active runway at the frame origin and uses MSL metres, with river level zero.
export const HISTORICAL_NYC={...JFK,id:'us1549',event:true,aircraft:US1549_PROFILE.aircraft,viewCenter:JFK.project(US1549_PROFILE.initial.longitude,US1549_PROFILE.initial.latitude),ident:'US1549',iata:null,name:'纽约 · 哈德逊河事件区域',shortName:'哈德逊河',english:'NEW YORK · HUDSON',elevationM:0,coastal:true,grading:{minX:1e9,maxX:1e9,minZ:1e9,maxZ:1e9},runway:{...JFK.runway,id:'—',width:0,length:0},regionGrading:{bounds:JFK.grading,baseMSL:JFK.elevationM},data:{...JFK.data,runways:US1549_PROFILE.runways.map(r=>({widthM:r.widthM,ends:r.ends.map(([longitude,latitude],i)=>({longitude,latitude,id:i?r.opposite:r.id,elevationM:r.elevationM}))})),osm:JFK.data.osm}};
export const airportOf=value=>{const id=typeof value==='string'?value:value?.airportId;return id==='lga-source'?LGA_SOURCE:id==='us1549'?HISTORICAL_NYC:AIRPORTS.find(a=>a.id===id)||training;};
export const isRealAirport=value=>!!airportOf(value).data;
export const runwayOf=value=>{const runway=airportOf(value).runway;if(!value?.aircraft)return runway;const reference=aircraftDefinition(value).airframe.referenceHeight;return reference===RUNWAY.ground?runway:{...runway,ground:runway.ground+reference-RUNWAY.ground};};
export const runwayHeading=value=>runwayOf(value).heading;
export const projectAirport=(value,longitude,latitude)=>airportOf(value).project(longitude,latitude);
export const unprojectAirport=(value,x,z)=>airportOf(value).unproject(x,z);
export const projectDaxing=(longitude,latitude)=>DAXING.project(longitude,latitude);
export const unprojectDaxing=(x,z)=>DAXING.unproject(x,z);
export const daxingGradingBounds=()=>DAXING.grading;
export function sampleAirportElevation(value,x,z){
 const airport=airportOf(value),d=airport.data.dem,{longitude,latitude}=airport.unproject(x,z),[south,west,north,east]=d.bounds;
 const gx=Math.max(0,Math.min(d.columns-1.000001,(longitude-west)/(east-west)*(d.columns-1)));
 const gy=Math.max(0,Math.min(d.rows-1.000001,(latitude-south)/(north-south)*(d.rows-1)));
 const i=Math.floor(gx),j=Math.floor(gy),u=gx-i,v=gy-j,k=j*d.columns+i;
 return(d.heights[k]*(1-u)+d.heights[k+1]*u)*(1-v)+(d.heights[k+d.columns]*(1-u)+d.heights[k+d.columns+1]*u)*v-airport.elevationM;
}
export const sampleDaxingElevation=(x,z)=>sampleAirportElevation('daxing',x,z);

const seaCache=new Map();
export function seaAt(value,x,z){
 const airport=airportOf(value);if(!airport.coastal)return false;
 const key=airport.region?'region/'+airport.region.id:airport.id;let mask=seaCache.get(key);
 const source=airport.region?airportOf(airport.region.sourceAirportId):airport;
 if(!mask){mask=createPolygonMask(source.data.osm.features.filter(isSeaLevelWater).map(f=>({outer:f.geometry.map(p=>source.project(...p)),holes:(f.holes||[]).map(r=>r.map(p=>source.project(...p)))})));seaCache.set(key,mask);}
 if(airport.terrainFrameId){const geo=airport.unproject(x,z),p=source.project(geo.longitude,geo.latitude);return mask(p.x,p.z);}
 return mask(x,z);
}
