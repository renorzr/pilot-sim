import {createPolygonMask} from './polygon-mask.js';
import kansai from './data/kansai.json' with {type:'json'};
import jfk from './data/jfk.json' with {type:'json'};
import lax from './data/lax.json' with {type:'json'};
import daxing from './data/daxing.json' with {type:'json'};
import xiaoshan from './data/xiaoshan.json' with {type:'json'};
import changi from './data/changi.json' with {type:'json'};
import {RUNWAY} from '../sim/constants.js';
const rad=Math.PI/180,earth=6378137;
const names={daxing:{city:'北京',shortName:'北京大兴'},xiaoshan:{city:'杭州',shortName:'杭州萧山'},changi:{city:'新加坡',shortName:'新加坡樟宜'},kansai:{city:'大阪',shortName:'大阪关西'},jfk:{city:'纽约',shortName:'纽约肯尼迪'},lax:{city:'洛杉矶',shortName:'洛杉矶'}};
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
export const JFK=makeAirport(jfk,'jfk','22R','纽约肯尼迪国际机场','NEW YORK KENNEDY');
export const LAX=makeAirport(lax,'lax','25R','洛杉矶国际机场','LOS ANGELES LAX');
export const AIRPORTS=[DAXING,XIAOSHAN,CHANGI,KANSAI,JFK,LAX];
export const airportOf=value=>AIRPORTS.find(a=>a.id===(typeof value==='string'?value:value?.airportId))||training;
export const isRealAirport=value=>!!airportOf(value).data;
export const runwayOf=value=>airportOf(value).runway;
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
 let mask=seaCache.get(airport.id);
 if(!mask){mask=createPolygonMask(airport.data.osm.features.filter(f=>f.tags?.water==='sea').map(f=>({outer:f.geometry.map(p=>airport.project(...p)),holes:(f.holes||[]).map(r=>r.map(p=>airport.project(...p)))})));seaCache.set(airport.id,mask);}
 return mask(x,z);
}
