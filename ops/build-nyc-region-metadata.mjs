// Metadata only: reuse the source photography and content-addressed river masks.
import{readFile,writeFile,mkdir}from'node:fs/promises';
const root=new URL('../',import.meta.url),source=JSON.parse(await readFile(new URL('public/assets/cities/us1549/imagery-river-v1.json',root))),dest=new URL('public/assets/cities/new-york/imagery-v1.json',root);
source.airportId='new-york';source.regionId='new-york';source.processing+=' Shared by JFK operations and the US1549 scene; scene identity does not duplicate photography or tidal masks.';
await mkdir(new URL('public/assets/cities/new-york/',root),{recursive:true});await writeFile(dest,JSON.stringify(source)+'\n');
