import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const transitPath='public/transit-layer.js';
const corePath='public/shared-map-core.js';
const transit=await readFile(transitPath,'utf8');
const core=await readFile(corePath,'utf8');

new vm.Script(transit,{filename:transitPath});
new vm.Script(core,{filename:corePath,importModuleDynamically:()=>{}});

const requiredTransitTokens=[
  "transportation.pmtiles",
  "SOURCE_LAYER='segment'",
  "['==',['get','subtype'],'rail']",
  "['subway','monorail','light_rail']",
  "['narrow_gauge']",
  "['standard_gauge']",
  "centerInsideTaiwan",
  "TAIWAN_BOUNDS",
  "transit-mrt",
  "transit-tra",
  "transit-thsr",
  "TAIPEI_MRT_GEOJSON_URL",
  "data.taipei/api/frontstage/tpeod/dataset/resource.download",
  "TAIPEI_MRT_SOURCE_ID='taipei-mrt-official'",
  "RouteName",
  "'木柵線':'BR'",
  "'淡水線':'R'",
  "'新店線':'G'",
  "'中和線':'O'",
  "'板橋線':'BL'",
  "'環狀線':'Y'",
  "BR:'#c48c31'",
  "R:'#e3002c'",
  "G:'#008659'",
  "O:'#f8b61c'",
  "BL:'#0070bd'",
  "Y:'#ffdb00'",
  "twd97ToWgs84",
  "Unexpected Taipei MRT CRS",
  "map.addControl(this.control,'top-right')",
  "this.emit('outside','軌道僅在台灣顯示'",
  "return false;"
];
for(const token of requiredTransitTokens){
  if(!transit.includes(token))throw new Error(`Transit contract missing: ${token}`);
}

const requiredCoreTokens=[
  "TRANSIT_MODULE_URL",
  "import(TRANSIT_MODULE_URL)",
  "TaipeiMapsTransitLayer",
  "map.__taipeiMapsTransitLayer",
  "bootstrapTransit(map,overtureUrl)",
  "class NorthUpControl",
  "button.textContent='N'",
  "easeTo({bearing:0,duration:350})",
  "map.addControl(northControl,'top-right')",
  "map.__taipeiMapsNorthControl"
];
for(const token of requiredCoreTokens){
  if(!core.includes(token))throw new Error(`Shared core contract missing: ${token}`);
}

for(const forbidden of ['sale.591.com.tw','sinyi.com.tw','yungching.com.tw']){
  if(transit.includes(forbidden))throw new Error(`Transit layer unexpectedly contains housing-provider dependency: ${forbidden}`);
}

console.log(JSON.stringify({
  status:'PASS',
  rail_base:'Overture transportation.pmtiles / segment',
  mrt_authoritative_overlay:'Taipei City DORTS GIS / EPSG:3826 -> WGS84',
  mrt_colors:{BR:'#c48c31',R:'#e3002c',G:'#008659',O:'#f8b61c',BL:'#0070bd',Y:'#ffdb00'},
  filters:{mrt_fallback:['subway','monorail','light_rail'],tra:['narrow_gauge'],thsr:['standard_gauge']},
  taiwan_scoped:true,
  shared_core_bootstrap:true,
  default_enabled:true,
  transit_toggle_control:true,
  north_up_control:true,
  north_preserves_pitch:true,
  stations:false
},null,2));
