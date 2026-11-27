// City grouping in the menu is independent of this geographic source region.
// Scene/mission IDs retain their own contacts, seasons and height datums.
export const NEW_YORK_REGION=Object.freeze({
 id:'new-york',revision:3,extent:40000,sourceAirportId:'jfk',
 frame:{threshold:[-73.764702,40.6488],heading:210.6104709446215},
 buildingManifestPath:'assets/cities/jfk/buildings-v1.json',
 imageryManifestPath:'assets/cities/new-york/imagery-v1.json',
 woodlandSourcePath:'assets/cities/new-york/woodlands-v2.json',
 trafficManifestPath:'assets/cities/jfk/traffic-v1.json',
 regionalTrafficManifestPath:'assets/cities/new-york/traffic-region-v1.json',
 trafficTilePrefixes:['assets/cities/new-york/traffic-region-v1/','assets/cities/jfk/traffic-region-v1/'],
});
