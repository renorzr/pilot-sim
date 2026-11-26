import {isRealAirport}from '../airports/registry.js';
import {airportIntro}from '../missions/ground.js';
import {createHistoricalIntro,advanceHistoricalPresentation} from '../history/presentation.js';

export const AIRPORT_PRESENTATION_SECONDS=10;
// Standalone arrival practice has no airline/ground preview phase. Its short
// UI-only presentation clock leaves the entire physical flight untouched.
export function createAirportPresentation(flight){
 if(flight.historical)return createHistoricalIntro(flight);
 return isRealAirport(flight)&&flight.mode==='landing'&&!flight.airline?{active:true,elapsed:0,duration:AIRPORT_PRESENTATION_SECONDS}:null;
}
export function advanceAirportPresentation(presentation,dt,playing=true){
 if(presentation?.kind?.startsWith('history-'))return advanceHistoricalPresentation(presentation,dt,playing);
 if(!presentation?.active)return false;
 if(!playing)return true;
 presentation.elapsed=Math.min(presentation.duration,presentation.elapsed+Math.max(0,Math.min(.5,Number.isFinite(dt)?dt:0)));
 if(presentation.elapsed>=presentation.duration-1e-9)presentation.active=false;
 return true;
}
export function finishAirportPresentation(presentation){if(!presentation?.active)return false;presentation.active=false;return true;}
export const airportPresentationActive=(flight,presentation)=>!!(airportIntro(flight)||presentation?.active);
