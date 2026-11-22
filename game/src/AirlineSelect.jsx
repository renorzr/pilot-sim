import {useState,useRef,useEffect} from 'react';
import {AIRPORTS,airportOf} from './airports/registry.js';
import {AIRLINE_ROUTES,AIRPORT_MISSIONS,getLevel} from './missions/catalog.js';
import {routeDistance} from './missions/airline.js';
import {longitudeNear,greatCircle,mapLandRings,mapRouteSegments,routeMapBounds,placeMapLabels,mapMarkerRadii} from './airports/map-projection.js';
import land from './airports/data/world-land.json' with {type:'json'};

export function AirlineSelect({progress,selectedId,onSelect,onChoose}){
 const current=getLevel(selectedId),[origin,setOrigin]=useState(current?.origin||current?.airportId||'daxing'),[destination,setDestination]=useState(current?.destination||(current?.airportId==='xiaoshan'?'daxing':'xiaoshan')),[slot,setSlot]=useState('origin'),[zoom,setZoom]=useState(false),[mode,setMode]=useState(AIRPORT_MISSIONS.some(l=>l.id===selectedId)&&selectedId===current?.id?'practice':'flights');
 const a=airportOf(origin),b=airportOf(destination),route=AIRLINE_ROUTES.find(r=>r.origin===origin&&r.destination===destination),practice=AIRPORT_MISSIONS.find(l=>l.id===selectedId)||AIRPORT_MISSIONS[0];
 const mapRef=useRef(null),[size,setSize]=useState({width:680,height:380});
 useEffect(()=>{const el=mapRef.current;if(!el)return;const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));observer.observe(el);return()=>observer.disconnect();},[mode]);
 const routePoints=greatCircle(a.data.airport,b.data.airport),bounds=routeMapBounds(routePoints,zoom);
 const scale=Math.min(size.width/(bounds.east-bounds.west),size.height/(bounds.north-bounds.south)),cx=(bounds.west+bounds.east)/2,cy=(bounds.north+bounds.south)/2;
 const point=(lon,lat)=>({x:size.width/2+(lon-cx)*scale,y:size.height/2-(lat-cy)*scale}),xy=ap=>point(longitudeNear(ap.data.airport.longitude,cx),ap.data.airport.latitude),distance=routeDistance(origin,destination);
 const landPath=mapLandRings(land.rings,cx-180,cx+180).map(r=>r.map(([lon,lat],i)=>{const v=point(lon,lat);return `${i?'L':'M'}${v.x},${v.y}`;}).join(' ')+'Z').join(' ');
 const routePath=mapRouteSegments(routePoints,cx).map(r=>r.map(([lon,lat],i)=>{const v=point(lon,lat);return `${i?'L':'M'}${v.x},${v.y}`;}).join(' ')).join(' ');
 const markers=AIRPORTS.map(ap=>({id:ap.id,...xy(ap)})).filter(p=>p.x>8&&p.x<size.width-8&&p.y>8&&p.y<size.height-8),labels=placeMapLabels(markers,size.width,size.height),radii=mapMarkerRadii(markers);
 function choose(id){if(slot==='origin'){setOrigin(id);if(destination===id)setDestination(origin);setSlot('destination');}else{setDestination(id);if(origin===id)setOrigin(destination);setSlot('origin');}}
 function swap(){setOrigin(destination);setDestination(origin);}
 return <div className="airline-select">
  <div className="airline-mode-tabs" role="tablist" aria-label="航线与机场练习"><button data-airline-mode="flights" role="tab" aria-selected={mode==='flights'} onClick={()=>setMode('flights')}>城市间航班</button><button data-airline-mode="practice" role="tab" aria-selected={mode==='practice'} onClick={()=>setMode('practice')}>机场练习</button></div>
  {mode==='flights'?<div className="route-planner">
   <div className="route-map-column"><div className="route-map-heading"><p>点击地图机场选择{slot==='origin'?'起点':'终点'}</p><button className="map-zoom" onClick={()=>setZoom(v=>!v)}>{zoom?'查看世界':'聚焦航线区域'}</button></div>
    <svg ref={mapRef} className="world-route-map" viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label="世界机场航线地图">
     <rect width={size.width} height={size.height} fill="#112b3d"/><path d={landPath} fill="#304c58" stroke="#607c82" strokeWidth=".7"/>
     <path d={routePath} fill="none" stroke="#e8c17c" strokeWidth="2" strokeDasharray="6 4"/>
     {AIRPORTS.filter(ap=>labels[ap.id]).map(ap=>{const v=xy(ap),isOrigin=ap.id===origin,isDestination=ap.id===destination,colour=isOrigin?'#a9d8e2':isDestination?'#ebc382':'#96a6ae',label=labels[ap.id];return <g key={ap.id} data-airport-id={ap.id} role="button" tabIndex="0" aria-label={ap.name} onClick={()=>choose(ap.id)} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();choose(ap.id);}}} className="map-airport-marker">
      <circle cx={v.x} cy={v.y} r={radii[ap.id].hit} fill="transparent"/><circle cx={v.x} cy={v.y} r={radii[ap.id].dot} fill={colour} stroke="#dcecf2" strokeWidth="1.5"/>
      <text x={label.x} y={label.y} fill={colour} fontSize="13" fontWeight="600">{ap.iata}</text>
     </g>;})}
    </svg><p className="map-source-caption">Natural Earth · 选择任意两座机场执飞</p>
    <div className="airport-choice-buttons">{AIRPORTS.map(ap=><button key={ap.id} onClick={()=>choose(ap.id)}>{ap.iata} · {ap.city}</button>)}</div>
   </div>
   <aside className="route-detail"><p className="eyebrow">CITY TO CITY</p><h2>选择你的下一段航程</h2>
    <button className={`route-endpoint ${slot==='origin'?'active':''}`} aria-pressed={slot==='origin'} onClick={()=>setSlot('origin')}><small>始发机场</small><strong>{a.iata}</strong><span>{a.name}</span></button>
    <button className="swap-airports" onClick={swap} aria-label="交换起点与终点">交换起终点</button>
    <button className={`route-endpoint ${slot==='destination'?'active':''}`} aria-pressed={slot==='destination'} onClick={()=>setSlot('destination')}><small>目的机场</small><strong>{b.iata}</strong><span>{b.name}</span></button>
    <div className="route-distance"><b>{Math.round(distance)} km</b><span>约 9–14 分钟 · 巡航阶段略过</span></div>
    <p className="route-stages">机位离位 · 手动滑行 · 起飞爬升<br/>巡航略过 · 目的机场展示 · 进近着陆</p>
    {progress.levels[route?.id]&&<p className="route-record">本机最高 {progress.levels[route.id].bestScore} 分</p>}
    <button className="primary-button enter-flight" data-route-id={route?.id} disabled={!route} onClick={()=>onChoose(route.id)}>进入航班简报</button>
   </aside>
  </div>:<div className="airport-practice-layout"><div className="airport-practice-grid">{AIRPORT_MISSIONS.map(l=><button className={`level-tile ${practice.id===l.id?'selected':''}`} key={l.id} data-level-id={l.id} onClick={()=>onSelect(l.id)}><span className="level-tile-top">{airportOf(l.airportId).ident} / {airportOf(l.airportId).iata}</span><strong>{l.title}</strong><span className="level-focus">{l.focus}</span><span className="level-tile-bottom">{progress.levels[l.id]?`${progress.levels[l.id].bestScore} 分`:'未完成'} · {l.duration}</span></button>)}</div><aside className="level-detail"><p className="eyebrow">机场练习</p><h2>{practice.title}</h2><p className="level-goal">{practice.goal}</p><ol>{practice.objectives.map(o=><li key={o}>○ {o}</li>)}</ol><div className="level-detail-bottom"><button className="primary-button enter-level" onClick={()=>onChoose(practice.id)}>进入简报</button></div></aside></div>}
 </div>;
}
