import {useState,useRef,useEffect} from 'react';
import {ArrowsLeftRight,ArrowRight,AirplaneTakeoff,AirplaneLanding,CaretDown,Check,MapPin} from '@phosphor-icons/react';
import {AIRPORTS} from './airports/registry.js';
import {AIRLINE_ROUTES,AIRPORT_MISSIONS,getLevel} from './missions/catalog.js';
import {routeDistance} from './missions/airline.js';
import {longitudeNear,greatCircle,mapLandRings,mapRouteSegments,routeMapBounds,placeMapLabels,mapMarkerRadii} from './airports/map-projection.js';
import {groupAirports,initialPlanner,pickPlannerAirport,pickCityAirport,readPlanner,savePlanner} from './airports/airline-planner.js';
import {t} from './i18n/index.js';
import land from './airports/data/world-land.json' with {type:'json'};
const storage=()=>{try{return globalThis.localStorage;}catch{return null;}};

export function AirlineSelect({progress,selectedId,onChoose,airports=AIRPORTS}){
 const cities=groupAirports(airports),[planner,setPlanner]=useState(()=>initialPlanner(airports,getLevel(selectedId),readPlanner(storage()))),[slot,setSlot]=useState('origin'),[cityId,setCityId]=useState(()=>cities.find(c=>c.airports.some(a=>a.id===planner.focused))?.id||cities[0].id),[pickerOpen,setPickerOpen]=useState(false),[pendingAirport,setPendingAirport]=useState(false);
 const mapRef=useRef(null),pickerRef=useRef(null),pickerButton=useRef(null),[size,setSize]=useState({width:1000,height:380});
 const a=airports.find(ap=>ap.id===planner.origin),b=airports.find(ap=>ap.id===planner.destination),city=cities.find(c=>c.id===cityId)||cities[0],airport=!pendingAirport?city.airports.find(ap=>ap.id===planner.focused):null,route=AIRLINE_ROUTES.find(r=>r.origin===a.id&&r.destination===b.id),missions=airport?AIRPORT_MISSIONS.filter(l=>l.airportId===airport.id):[];
 useEffect(()=>{const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));observer.observe(mapRef.current);return()=>observer.disconnect();},[]);
 useEffect(()=>savePlanner(storage(),planner),[planner]);
 useEffect(()=>{if(pickerOpen)(pickerRef.current?.querySelector('[aria-selected=true]')||pickerRef.current?.querySelector('[role=option]'))?.focus();},[pickerOpen,cityId]);
 const routePoints=greatCircle(a.data.airport,b.data.airport),bounds=planner.bounds||routeMapBounds([],false),cardWidth=Math.min(300,Math.max(205,size.width*.28)),mapWidth=Math.max(120,size.width-cardWidth-44),mapHeight=Math.max(100,size.height-58),scale=Math.min(mapWidth/(bounds.east-bounds.west),mapHeight/(bounds.north-bounds.south)),cx=(bounds.west+bounds.east)/2,cy=(bounds.north+bounds.south)/2;
 const point=(lon,lat)=>({x:18+mapWidth/2+(lon-cx)*scale,y:42+mapHeight/2-(lat-cy)*scale});
 const landPath=mapLandRings(land.rings,cx-180,cx+180).map(r=>r.map(([lon,lat],i)=>{const p=point(lon,lat);return `${i?'L':'M'}${p.x},${p.y}`;}).join(' ')+'Z').join(' '),routePath=mapRouteSegments(routePoints,cx).map(r=>r.map(([lon,lat],i)=>{const p=point(lon,lat);return `${i?'L':'M'}${p.x},${p.y}`;}).join(' ')).join(' ');
 const markers=cities.map(c=>({...c,...point(longitudeNear(c.longitude,cx),c.latitude),label:t(c.name)+(c.airports.length>1?` · ${c.airports.length}`:'')})).filter(p=>p.x>8&&p.x<mapWidth+25&&p.y>35&&p.y<size.height-8),labels=placeMapLabels(markers,mapWidth+28,size.height-12,{widthFor:m=>Math.max(30,Array.from(m.label).reduce((n,c)=>n+(/\p{Script=Han}/u.test(c)?12:6.2),0)),heightFor:()=>17}),radii=mapMarkerRadii(markers);
 function acceptAirport(choice){setPlanner(choice.state);setSlot(choice.nextSlot);setPendingAirport(false);setPickerOpen(false);}
 const selectAirport=id=>acceptAirport(pickPlannerAirport(planner,slot,id));
 function chooseCity(c){setCityId(c.id);const choice=pickCityAirport(c,slot,planner);setPendingAirport(!choice.airport);setPickerOpen(choice.pickerOpen);if(choice.airport)acceptAirport(choice);}
 function pickerKeys(e){const options=[...pickerRef.current.querySelectorAll('[role=option]')],index=options.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?options.length-1:(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[next]?.focus();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setPickerOpen(false);pickerButton.current?.focus();}}
 function enterPractice(mission){savePlanner(storage(),planner);onChoose(mission.id);}
 const record=route&&progress.levels[route.id];
 return <div className="airline-select unified-airline-map">
  <div className="airline-map-stage">
   <div className="airline-map-canvas" ref={mapRef} style={{'--airport-card-width':cardWidth+'px'}}>
    <svg className="world-route-map" viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label="世界机场航线地图">
     <rect width={size.width} height={size.height} fill="#112735"/><path d={landPath} fill="#28434d" stroke="#52717b" strokeWidth=".7"/>
     <path d={routePath} fill="none" stroke="#dfbc80" strokeWidth="2" strokeDasharray="5 5"/>
     {markers.map(m=>{const label=labels[m.id],origin=m.airports.some(ap=>ap.id===a.id),destination=m.airports.some(ap=>ap.id===b.id),focused=m.id===cityId,colour=origin?'#a8d9dd':destination?'#e8bd7e':'#a0b5c0';return <g data-menu-focus key={m.id} data-city-id={m.id} data-airport-id={m.airports.length===1?m.airports[0].id:undefined} role="button" tabIndex="0" aria-label={m.name} aria-pressed={focused} className="map-airport-marker" onClick={()=>chooseCity(m)} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();chooseCity(m);}}}>
      <circle cx={m.x} cy={m.y} r={radii[m.id].hit} fill="transparent"/>{focused&&<circle className="city-focus-ring" cx={m.x} cy={m.y} r={radii[m.id].dot+5} fill="none" stroke={colour} strokeOpacity=".4"/>}<circle cx={m.x} cy={m.y} r={radii[m.id].dot} fill={colour} stroke="#dcecf2" strokeWidth="1.5"/>
      <line x1={m.x} y1={m.y} x2={label.x+4} y2={label.y-5} stroke={colour} strokeOpacity=".35"/><text x={label.x} y={label.y} fill={colour} fontSize="12" fontWeight="600">{m.label}</text>
     </g>;})}
    </svg>
    <div className="route-map-heading"><p>{slot==='origin'?'选择始发机场 · 点击地图上的城市':'选择目的机场 · 点击地图上的城市'}</p><div><button data-menu-focus className="map-zoom" onClick={()=>setPlanner(p=>({...p,bounds:p.bounds?null:routeMapBounds(routePoints,true)}))}>{planner.bounds?'查看世界':'聚焦航线区域'}</button></div></div>
    <aside className="map-airport-card" aria-label="机场操作" data-selected-airport={airport?.id}>
     <header><span className="airport-card-label"><MapPin/> {city.name}</span><span className="airport-count">{city.airports.length>1?`${city.airports.length} 个机场`:'机场'}</span></header>
     {city.airports.length>1&&<div className="city-airport-dropdown" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setPickerOpen(false);}}><button data-menu-focus ref={pickerButton} className="airport-picker-trigger" aria-label="选择机场" aria-haspopup="listbox" aria-expanded={pickerOpen} onClick={()=>setPickerOpen(v=>!v)}><span>{airport?`${airport.iata} · ${airport.name}`:'请选择机场'}</span><CaretDown/></button>{pickerOpen&&<div ref={pickerRef} className="city-airport-options" role="listbox" aria-label="城市机场列表" onKeyDown={pickerKeys}>{city.airports.map(ap=><button data-menu-focus key={ap.id} role="option" aria-selected={airport?.id===ap.id} data-airport-option={ap.id} tabIndex={airport?.id===ap.id||!airport&&city.airports[0]===ap?0:-1} onClick={()=>selectAirport(ap.id)}><strong>{ap.iata}</strong><span>{ap.name}</span>{airport?.id===ap.id&&<Check/>}</button>)}</div>}</div>}
     {airport?<>
      <div className="airport-card-title"><strong>{airport.iata}</strong><span>{airport.ident}</span></div><h2 title={airport.name}>{airport.name}</h2>
      <div className="airport-practice-actions"><p>机场练习</p>{missions.map(m=><button data-menu-focus key={m.id} data-level-id={m.id} onClick={()=>enterPractice(m)}>{m.mode==='takeoff'?<AirplaneTakeoff/>:<AirplaneLanding/>}<span><strong>{m.mode==='takeoff'?'起飞练习':'进近着陆练习'}</strong><small>{`RWY ${airport.runway.id} · `}{progress.levels[m.id]?`最高 ${progress.levels[m.id].bestScore} 分`:m.duration}</small></span><ArrowRight/></button>)}{!missions.length&&<small>机场练习尚未开放</small>}</div>
     </>:<p className="airport-pick-hint">选择具体机场后，可安排航班或进入机场练习。</p>}
    </aside>
    <div className="map-source-caption"><span><i className="origin-dot"/>始发</span><span><i className="destination-dot"/>目的地</span><small>Natural Earth</small></div>
   </div>
   <div className="map-route-tray" aria-label="当前航线">
    <button data-menu-focus className={`route-endpoint ${slot==='origin'?'active':''}`} data-route-slot="origin" aria-pressed={slot==='origin'} onClick={()=>setSlot('origin')}><small>始发机场</small><strong>{a.iata}</strong><span>{a.city}</span><em title={a.name}>{a.name}</em></button>
    <button data-menu-focus className="swap-airports" onClick={()=>{setPlanner(p=>({...p,origin:p.destination,destination:p.origin}));setSlot('origin');}} aria-label="交换起点与终点"><ArrowsLeftRight/></button>
    <button data-menu-focus className={`route-endpoint ${slot==='destination'?'active':''}`} data-route-slot="destination" aria-pressed={slot==='destination'} onClick={()=>setSlot('destination')}><small>目的机场</small><strong>{b.iata}</strong><span>{b.city}</span><em title={b.name}>{b.name}</em></button>
    <div className="route-summary"><b>{route?`${Math.round(routeDistance(a.id,b.id))} km`:'—'}</b><span>{route?.duration}</span><small>{!route?'该航线尚未开放':record?`本机最高 ${record.bestScore} 分`:'巡航阶段可跳过'}</small></div>
    <button data-menu-focus className="primary-button enter-flight" data-route-id={route?.id} disabled={!route} onClick={()=>{savePlanner(storage(),planner);onChoose(route.id);}}>进入航班简报<ArrowRight/></button>
   </div>
  </div>
 </div>;
}
