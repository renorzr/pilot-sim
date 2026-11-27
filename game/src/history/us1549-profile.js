// Source-backed event placement. This is a game performance preset, not an
// A320 engineering model or a claim to reconstruct the full recorded flight.
// Radar position is interpolated between Table 1a's EWR returns at 15:27:08.78
// and 15:27:13.43, at the correlated bird-strike time 15:27:11.40.
const fraction=(11.40-8.78)/(13.43-8.78);
const dms=(degrees,minutes,seconds)=>degrees+minutes/60+seconds/3600;
const mix=(a,b)=>a+(b-a)*fraction;
export const US1549_PROFILE=Object.freeze({
 id:'history-us1549',revision:4,date:'2009-01-15',
 aircraft:Object.freeze({model:'a320',variant:'wingtip-fence',livery:'us-airways-n106us-2009',assetVersion:1,liveryVersion:1,uvLayout:'a320-uv1',definitionVersion:1}),
 sources:{
  report:'https://www.ntsb.gov/investigations/AccidentReports/Reports/AAR1003.pdf',
  performance:'https://data.ntsb.gov/Docket/Document/docBLOB?FileExtension=.PDF&FileName=Aircraft+Performance+13+-+Factual+Report+of+Group+Chairman-Master.PDF&ID=40322563',
  runways:'https://davidmegginson.github.io/ourairports-data/runways.csv',
 },
 initial:{longitude:-mix(dms(73,52,31.51),dms(73,52,37.16)),latitude:mix(dms(40,50,41.12),dms(40,51,.05)),heightAGLFt:2818,iasKt:219,massTonnes:68.5,climbMps:10,headingTrue:347},
 // Performance study section D-I: author-estimated coordinates from BEA image.
 historicalTouchdown:{longitude:-dms(74,0,20.50),latitude:dms(40,46,16.78),positionKind:'NTSB performance-study image estimate'},
 // Deliberately documented game estimates; not historical FDR coefficients.
 aerodynamics:{cleanDrag:.020,failedEngineDrag:.0028,inducedDrag:.038,flapDrag:[0,.010,.028,.055,.085],liftZero:[.30,.50,.80,.95,1.10],liftMax:[1.45,1.90,2.25,2.50,2.70],liftSlope:6.2,stallDrag:.12},
 water:{levelMSL:0,density:1000,current:{east:0,north:-.35}},
 weather:{wind:{speedKt:8,directionDeg:315,vertical:0},visibility:32000,overcast:.22,ambientTurbulence:0},
 runways:[
  {airport:'LGA',id:'04',opposite:'22',widthM:45.72,ends:[[-73.88410187,40.76919937],[-73.87069702,40.78540039]],elevationM:6.7056},
  {airport:'LGA',id:'13',opposite:'31',widthM:45.72,ends:[[-73.87850189,40.78229904],[-73.85710144,40.77209854]],elevationM:3.9624},
  // Modern TEB numbering is 06/24. The 2009 historical option was runway 01.
  {airport:'TEB',id:'01',opposite:'19',widthM:45.72,ends:[[-74.060376,40.838687],[-74.058962,40.857868]],elevationM:2.7432},
 ],
 // Source-water cross-section midpoints, rounded to about 40 m. These are
 // navigation estimates, never recorded aircraft positions or motion setters.
 riverTargets:[[-73.9405,40.8710],[-73.9530,40.8510],[-73.9690,40.8185],[-74.0057,40.7713]],
});
