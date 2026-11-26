// Session-local ordering: rendering, language and changing availability must not
// reshuffle buttons beneath a pointer. The seed is retained by checkpoints.
export function historicalDecisionSeed(){
 const value=new Uint32Array(1);if(globalThis.crypto?.getRandomValues){globalThis.crypto.getRandomValues(value);return value[0];}
 return Math.floor(Math.random()*4294967296);
}
function rank(seed,key){let n=(seed^2166136261)>>>0;for(const c of key){n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;}n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return(n^(n>>>16))>>>0;}
export function orderHistoricalOptions(seed,node,options){return options.slice().sort((a,b)=>rank(seed,node+':'+a.id)-rank(seed,node+':'+b.id)||a.id.localeCompare(b.id));}
export function historicalDecisionPoints(h,heightFt){
 const first=h.selected.some(x=>x.node==='priority')?8:0,assessment=h.assessments.length?12:0;
 const handover=h.handedOverAt!==null&&!h.earlyTakeover?10:0;
 // Charge measured exposure, not an answer-key bonus. Recovery reduces future
 // cost; a risky option never fabricates a crash or removes physical capability.
 const exposure=h.decisionExposure||{},cost=Math.min(12,(exposure.gearSeconds||0)*.14+(exposure.steepSeconds||0)*.12+(exposure.waitSeconds||0)*.09);
 const late=handover?Math.max(0,600-heightFt)/150:0;
 const committed=h.selected.filter(x=>['return','lga','teb','land'].includes(x.option));
 const risk=committed.reduce((sum,x)=>sum+Math.min(3,Math.max(0,-100-(x.margin??-100))/150),0);
 return Math.max(0,Math.min(30,first+assessment+handover-cost-late-risk));
}
