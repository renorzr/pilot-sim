import {KT,G,FT,RUNWAY,RAD,clamp,wrap,massOf} from './constants.js';
import {trimAlpha} from './aerodynamics.js';
import {routeTarget} from '../missions/route.js';
import {commandableThrust} from './engines.js';
import {runwayHeading} from '../airports/registry.js';
import {airlineTarget} from '../missions/airline-navigation.js';

export function computeGuidance(s,approachAltitude){
 const a=s.airData,go=s.goAround,route=(s.route?.active&&!go&&!(s.route.inFinal&&s.scenario==='full')?routeTarget(s):null)||airlineTarget(s),glide=s.mission?.kind==='dual-glide'&&s.mission.triggered;
 const track=route?route.track:go?s.goAroundHeading:s.apprArmed||glide?-Math.atan2(s.x,Math.max(s.z*.35,600)):(s.selectedHeading-runwayHeading(s))*RAD;
 // APPR/GA track uses a wind correction; selected HDG remains a heading.
 const cross=a.wind.x*Math.cos(track)+a.wind.z*Math.sin(track);
 const heading=route||go||s.apprArmed||glide?track-Math.asin(clamp(cross/Math.max(a.horizontal,20),-.7,.7)):track;
 s.guidance.roll=clamp(wrap(heading-s.yaw)*2.0,route?-.42:-.25,route?.42:.25);
 let vs=go?clamp((RUNWAY.ground+s.selectedAltitude/FT-s.y)*.15,0,8):s.gsCaptured?-Math.max(20,a.groundSpeed)*Math.tan(3*RAD)+(approachAltitude(s.z)-s.y)*.16:clamp((RUNWAY.ground+s.selectedAltitude/FT-s.y)*.15,-6,6);
 if(route)vs=s.route?.inFinal?-Math.max(20,a.groundSpeed)*Math.tan(3*RAD)+(RUNWAY.ground+route.altitude/FT-s.y)*.16:clamp((RUNWAY.ground+route.altitude/FT-s.y)*.15,-5,7);
 if(glide)vs=-a.drag*Math.max(a.tas,20)/(massOf(s)*G);
 if(s.mode==='takeoff'&&!go&&!route)vs=s.airborne?(s.airline?clamp((RUNWAY.ground+s.selectedAltitude/FT-s.y)*.15,-3,7):7):0;
 if(s.mode==='landing'&&!go&&(s.y-RUNWAY.ground)*FT<(glide?80:30))vs=-.7;
 if(s.atc?.terrainFloorFt&&!glide)vs=Math.max(vs,clamp((RUNWAY.ground+s.atc.terrainFloorFt/FT-s.y)*.15,0,8));
 // A speed-protection demand is still bounded by available propulsive power.
 // FD/AP can ask for attitude, never assign vertical speed or position.
 const maxClimb=(commandableThrust(s)-a.drag)*Math.max(a.tas,20)/(massOf(s)*G);
 s.guidance.limited=vs>0&&vs>maxClimb;
 if(vs>0)vs=Math.min(vs,maxClimb);
 s.guidance.verticalSpeed=vs;
 s.guidance.pitch=clamp(trimAlpha(s)+Math.atan2(vs-a.wind.y,Math.max(a.horizontal,20))+(vs-s.verticalSpeed)*.009+(glide?(s.speed*KT-((s.flapPosition>=.5)?165:185))*.006:0),-.18,.28);
}
