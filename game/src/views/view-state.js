export const VIEW_MODES=['cockpit','exterior'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function createViewState(mode='cockpit'){if(mode==='chase'||mode==='orbit')mode='exterior';return{mode:VIEW_MODES.includes(mode)?mode:'cockpit',azimuth:0,elevation:.23,distance:85,revision:0,resetSerial:0};}
export function setViewMode(view,mode){if(!VIEW_MODES.includes(mode)||view.mode===mode)return false;view.mode=mode;view.revision++;view.resetSerial++;return true;}
export function orbitView(view,dx,dy){if(view.mode!=='exterior')return false;view.azimuth=((view.azimuth-dx*.007+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;view.elevation=clamp(view.elevation+dy*.005,-.35,1.25);view.revision++;return true;}
export function zoomView(view,delta){if(view.mode==='cockpit')return false;view.distance=clamp(view.distance*Math.exp(clamp(delta,-150,150)*.0025),45,220);view.revision++;return true;}
export function resetView(view){view.azimuth=0;view.elevation=.23;view.distance=85;view.revision++;view.resetSerial++;}
export function resetCameraTransition(view){view.resetSerial++;view.revision++;}
