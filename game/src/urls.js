const defaultBase=import.meta.env?.BASE_URL||'/';
// Shared by DOM images, Three.js textures and recorded audio. Keep Node-based
// simulation tests usable without Vite while supporting project-site prefixes.
export function siteUrl(path,base=defaultBase){
 return (base.endsWith('/')?base:base+'/')+path.replace(/^\/+/, '');
}
