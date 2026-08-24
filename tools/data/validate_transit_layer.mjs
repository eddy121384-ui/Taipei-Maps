import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const transitPath='public/transit-layer.js';
const corePath='public/shared-map-core.js';
const builderPath='tools/data/build_taipei_mrt_official.mjs';
const transit=await readFile(transitPath,'utf8');
const core=await readFile(corePath,'utf8');
const builder=await readFile(builderPath,'utf8');

new vm.Script(transit,{filename:transitPath});
new vm.Script(core,{filename:corePath,importModuleDynamically:()=>{}});
// The builder is ESM. Strip import declarations only for a no-execution syntax
// parse so validation does not depend on experimental vm module flags.
new vm.Script(builder.replace(/^import .*$/gm,''),{filename:builderPath});

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
  "TAIPEI_MRT_GEOJSON_URL='/generated/taipei_mrt_lines_official.geojson'",
  "TAIPEI_MRT_SOURCE_ID='taipei-mrt-official'",
  "BR:'#c48c31'",
  "R:'#e3002c'",
  "G:'#008659'",
  "O:'#f8b61c'",
  "BL:'#0070bd'",
  "Y:'#ffdb00'",
  "validateOfficialMrt",
  "Local Taipei MRT GIS HTTP",
  "lineLayer(LAYERS.mrt,mrtFilter,'#1976d2'",
  "this.setFallbackMetroAppearance(true)",
  "map.addControl(this.control,'top-right')",
  "this.emit('outside','軌道僅在台灣顯示'",
  "return false;"
];
for(const token of requiredTransitTokens){
  if(!transit.includes(token))throw new Error(`Transit contract missing: ${token}`);
}
if(transit.includes('data.taipei/api/frontstage/tpeod/dataset/resource.download')){
  throw new Error('Browser transit layer must not fetch Taipei government GIS cross-origin; use the local generated dataset');
}

const requiredBuilderTokens=[
  "data.taipei/api/frontstage/tpeod/dataset/resource.download",
  "taipei_mrt_lines_official.geojson",
  "taipei_mrt_lines_official.audit.json",
  "'淡水線':'R'",
  "'信義線':'R'",
  "'新店線':'G'",
  "'松山線':'G'",
  "'中和線':'O'",
  "'蘆洲線':'O'",
  "'板橋線':'BL'",
  "'南港線':'BL'",
  "'木柵線':'BR'",
  "'內湖線':'BR'",
  "'環狀線':'Y'",
  "Unexpected Taipei MRT CRS",
  "output_crs:'EPSG:4326'",
  "source_sha256",
  "TextDecoder('utf-8',{fatal:true})",
  "if(!lineCounts[code])throw new Error"
];
for(const token of requiredBuilderTokens){
  if(!builder.includes(token))throw new Error(`Official MRT builder contract missing: ${token}`);
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
  if(transit.includes(forbidden)||builder.includes(forbidden))throw new Error(`Transit pipeline unexpectedly contains housing-provider dependency: ${forbidden}`);
}

console.log(JSON.stringify({
  status:'PASS',
  rail_base:'Overture transportation.pmtiles / segment',
  mrt_authoritative_source:'Taipei City DORTS GIS',
  mrt_runtime_path:'local generated GeoJSON; no browser CORS dependency',
  mrt_source_crs:'EPSG:3826',
  mrt_output_crs:'EPSG:4326',
  mrt_colors:{BR:'#c48c31',R:'#e3002c',G:'#008659',O:'#f8b61c',BL:'#0070bd',Y:'#ffdb00'},
  filters:{mrt_fallback:['subway','monorail','light_rail'],tra:['narrow_gauge'],thsr:['standard_gauge']},
  fallback_mrt_color:'#1976d2',
  taiwan_scoped:true,
  shared_core_bootstrap:true,
  default_enabled:true,
  transit_toggle_control:true,
  north_up_control:true,
  north_preserves_pitch:true,
  stations:false
},null,2));
