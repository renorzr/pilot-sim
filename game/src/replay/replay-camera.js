// Templates are shared by the lightweight evaluator and the live replay camera.
// Generating a pose never changes aircraft state or touches streaming/rendering.
export {libraryShotPose as replayCameraPose} from './shot-library.js';
