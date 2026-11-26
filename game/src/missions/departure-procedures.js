// Published INITIAL segments only. Coordinates are WGS84; all restrictions
// below are MSL feet. See docs/DEPARTURES.md for source editions and cutoffs.
// A simulator radar vector is explicitly marked; its endpoint is not a fix.
const m=value=>value/0.3048;
const fix=(id,latitude,longitude,extra={})=>({kind:'fix',id,name:id,latitude,longitude,...extra});
const altitude=(headingMag,variation,altitudeMSL,extra={})=>({kind:'altitude',name:'按航向爬升',headingMag,headingTrue:headingMag+variation,altitudeMSL,...extra});
const vector=(headingMag,variation,distance,extra={})=>({kind:'vector',name:'雷达引导',headingMag,headingTrue:headingMag+variation,distance,simulated:true,...extra});
export const DEPARTURE_SOURCES=Object.freeze({
 lax:{edition:'FAA AIRAC 2611',url:'https://aeronav.faa.gov/d-tpp/2611/00237ORCKA_C.PDF',coordinates:'https://aeronav.faa.gov/upload_313-d/cifp/CIFP_261029.zip'},
 jfk:{edition:'FAA AIRAC 2611',url:'https://aeronav.faa.gov/d-tpp/2611/00610KENNEDY_C.PDF'},
 changi:{edition:'CAAS AIP 2026-09-03; chart 2024-10-31',url:'https://aim-sg.caas.gov.sg/aim-content/uploads/aip/17-SEP-2026/AIP/2026-09-03-000000/pdf/SG-AD-2-WSSS-AD-2-WSSS-SID-11-to-11.1.pdf'},
 kansai:{edition:'AIP Japan, SID effective 2025-03-20 (archived original)',url:'https://nagodede.github.io/aip/japan/documents/RJBB_full.pdf#page=65'},
 daxing:{edition:'CAAC AIP effective 2025-04-16 1600Z (archived original)',url:'https://chart.wuhanqing.cn/Terminal/ZBAD-北京大兴/ZBAD-0W-1-WAYPOINT%20LIST.pdf'},
 xiaoshan:{edition:'CAAC AIP effective 2025-10-29 1600Z (archived original)',url:'https://chart.wuhanqing.cn/Terminal/ZSHC-杭州萧山/ZSHC-0C-2-DATABASE%20CODING%20TABLE.pdf'},
});
export function initialDeparture(airport,destinationCourse){
 const common={source:DEPARTURE_SOURCES[airport.id],clearanceMSL:3000,speedLimit:250};
 switch(airport.id){
  case 'lax':return{...common,id:'DOCKR',name:'25R · DOCKR 初始离场',legs:[
   altitude(251,12,640),
   fix('DOCKR',33+55/60+54.64/3600,-(118+27/60+29.17/3600),{maxMSL:3000,flyOver:true}),
   // ORCKA's published heading; duration/distance of radar guidance is a game clearance.
   vector(236,12,7000,{turn:'left'}),
  ]};
  case 'jfk':return{...common,id:'JFK5-initial',name:'22R · KENNEDY FIVE 初始离场',clearanceMSL:5000,legs:[
   vector(224,-13,12000,{name:'起飞后保持航向'}),
   vector(270,-13,8000,{turn:'right'}),
  ]};
  case 'changi':return{...common,id:'MOLVO-ATRUM',name:'02L · MOLVO 初始离场',speedLimit:230,legs:[
   fix('MOLVO',1+29/60+55/3600,104+2/60+27/3600,{minMSL:2000}),
   fix('ATRUM',1+32/60+56/3600,104+57/3600,{turn:'left'}),
  ]};
  case 'xiaoshan':{
   const east=destinationCourse>60&&destinationCourse<140;
   return{...common,id:east?'HC503-HC502':'HC503-HC504',name:'07 · HC503 初始离场',legs:[
    altitude(69,-5.7,m(150)),
    fix('HC503',30+13/60+43/3600,120+34/60+25/3600,{minMSL:m(500),turn:'right'}),
    east?fix('HC502',30+11/60+26/3600,120+42/60+46/3600):fix('HC504',30+8/60+59/3600,120+37/60+13/3600),
   ]};
  }
  case 'daxing':{
   const east=destinationCourse<135,south=destinationCourse>=135&&destinationCourse<180;
   return{...common,id:east?'AD451-east':south?'AD451-south':'AD451-west',name:'17L · AD450–AD451 初始离场',legs:[
    fix('AD450',39+25/60+30.2/3600,116+24/60+36.6/3600),
    fix('AD451',39+20/60+29.6/3600,116+25/60+24/3600,{minMSL:m(600)}),
    east?fix('AD456',39+21/60+18.3/3600,116+33/60+58.6/3600,{turn:'left',handoffDistance:6000}):south?
     fix('AD452',39+4/60+41.6/3600,116+27/60+52/3600,{handoffDistance:6000}):
     fix('AD472',39+12/60+18.1/3600,116+6/60+14.4/3600,{turn:'right',handoffDistance:6000}),
   ]};
  }
  case 'kansai':{
   const southwest=destinationCourse>180&&destinationCourse<250;
   return{...common,id:southwest?'UPMIN1-initial':'B6R11-initial',name:southwest?'06R · UPMIN ONE 初始离场':'06R · B6R11 初始离场',legs:[
    altitude(59,-8.1,500),
    ...(southwest?[
     fix('LELUS',34+24/60+36.6/3600,135+3/60+9.3/3600,{turn:'left'}),
     fix('VEKTA',34+22/60+15.6/3600,134+59/60+51.2/3600),
    ]:[
     fix('B6R10',34+27/60+59.6/3600,135+17/60+46/3600,{flyOver:true}),
     fix('B6R11',34+31/60+40.8/3600,135+18/60+45.1/3600,{minMSL:2500,turn:'left'}),
    ]),
   ]};
  }
  default:throw new Error(`No initial departure for ${airport.id}`);
 }
}
