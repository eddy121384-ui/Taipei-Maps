import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const transitPath='public/transit-layer.js';
const corePath='public/shared-map-core.js';
const builderPath='tools/data/build_taipei_mrt_official.mjs';
const stationBuilderPath='tools/data/build_taipei_mrt_stations_official.mjs';
const transit=await readFile(transitPath,'utf8');
const core=await readFile(corePath,'utf8');
const builder=await readFile(builderPath,'utf8');
const stationBuilder=await readFile(stationBuilderPath,'utf8');

new vm.Script(transit,{filename:transitPath});
new vm.Script(core,{filename:corePath,importModuleDynamically:()=>{}});
function syntaxParseEsmBuilder(source,filename){
  const syntaxCopy=source
    .replace(/^import .*$/gm,'')
    .replace(/^const __filename=.*$/m,"const __filename='';")
    .replace(/^const __dirname=.*$/m,"const __dirname='';");
  new vm.Script(syntaxCopy,{filename});
}
syntaxParseEsmBuilder(builder,builderPath);
syntaxParseEsmBuilder(stationBuilder,stationBuilderPath);

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
  "TAIPEI_MRT_STATION_GEOJSON_URL='/generated/taipei_mrt_stations_official.geojson'",
  "TAIPEI_MRT_STATION_SOURCE_ID='taipei-mrt-stations-official'",
  "mrtStation:'transit-mrt-station'",
  "mrtStationLabel:'transit-mrt-station-label'",
  "'text-field':['get','station_name']",
  "minzoom:10.5",
  "minzoom:11.6",
  "BR:'#c48c31'",
  "R:'#e3002c'",
  "G:'#008659'",
  "O:'#f8b61c'",
  "BL:'#0070bd'",
  "Y:'#ffdb00'",
  "GLOBAL_METRO_COLOR='#1976d2'",
  "GLOBAL_RAIL_COLOR='#5f6b76'",
  "TAIWAN_TRA_COLOR='#2e7d32'",
  "TAIWAN_THSR_COLOR='#f57c00'",
  "GLOBAL_LAYER_IDS",
  "TAIWAN_LINE_LAYER_IDS",
  "TAIWAN_STATION_LAYER_IDS",
  "TAIWAN_ONLY_LAYER_IDS",
  "applyRegionalAppearance",
  "this.map.setPaintProperty(LAYERS.tra,'line-color',inTaiwan?TAIWAN_TRA_COLOR:GLOBAL_RAIL_COLOR)",
  "this.map.setPaintProperty(LAYERS.thsr,'line-color',inTaiwan?TAIWAN_THSR_COLOR:GLOBAL_RAIL_COLOR)",
  "this.map.setLayoutProperty(id,'visibility',this.enabled?'visible':'none')",
  "localLineVisible=this.enabled&&inTaiwan&&this.officialMrtReady",
  "localStationVisible=this.enabled&&inTaiwan&&this.officialMrtStationsReady",
  "軌道 ON · 全球捷運 / 鐵路 · Overture",
  "map.addControl(this.control,'top-right')",
  "validateOfficialMrt",
  "validateOfficialMrtStations",
  "loadOfficialTaipeiMrtStations",
  "Local Taipei MRT GIS HTTP",
  "Local Taipei MRT station GIS HTTP",
  "return false;"
];
for(const token of requiredTransitTokens){
  if(!transit.includes(token))throw new Error(`Transit contract missing: ${token}`);
}
if(transit.includes("this.emit('outside','軌道僅在台灣顯示'")){
  throw new Error('Global rail regression: transit overlay must not disappear outside Taiwan');
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

const requiredStationBuilderTokens=[
  "rid=a63e3278-9d10-4916-9f24-e5a4d78afb31",
  "taipei_mrt_stations_official.geojson",
  "taipei_mrt_stations_official.audit.json",
  "臺北都會區大眾捷運系統車站點位圖",
  "Unexpected Taipei MRT station CRS",
  "output_crs:'EPSG:4326'",
  "station_name:row.name",
  "source_point_count:row.coordinates.length",
  "features.length<90",
  "'台北車站'",
  "'市政府站'",
  "'板橋站'",
  "'景平站'",
  "'十四張站'",
  "duplicate_platform_stations",
  "source_sha256",
  "TextDecoder('utf-8',{fatal:true})"
];
for(const token of requiredStationBuilderTokens){
  if(!stationBuilder.includes(token))throw new Error(`Official MRT station builder contract missing: ${token}`);
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
  if(transit.includes(forbidden)||builder.includes(forbidden)||stationBuilder.includes(forbidden))throw new Error(`Transit pipeline unexpectedly contains housing-provider dependency: ${forbidden}`);
}

console.log(JSON.stringify({
  status:'PASS',
  rail_base:'Overture transportation.pmtiles / segment',
  global_transit:true,
  overseas_behavior:'blue metro + neutral rail; no Taiwan provider semantics',
  taiwan_behavior:'official MRT colors + official station points/names + green TRA + orange THSR',
  mrt_authoritative_source:'Taipei City DORTS GIS',
  mrt_station_authoritative_source:'Taipei City DORTS station GIS',
  mrt_runtime_path:'local generated GeoJSON; no browser CORS dependency',
  mrt_station_runtime_path:'local generated GeoJSON; duplicate transfer-platform points merged by station name',
  mrt_source_crs:'EPSG:3826',
  mrt_output_crs:'EPSG:4326',
  mrt_colors:{BR:'#c48c31',R:'#e3002c',G:'#008659',O:'#f8b61c',BL:'#0070bd',Y:'#ffdb00'},
  filters:{mrt_fallback:['subway','monorail','light_rail'],rail_narrow:['narrow_gauge'],rail_standard:['standard_gauge']},
  global_mrt_color:'#1976d2',
  global_rail_color:'#5f6b76',
  taiwan_local_semantics:true,
  shared_core_bootstrap:true,
  default_enabled:true,
  transit_toggle_control:true,
  north_up_control:true,
  north_preserves_pitch:true,
  stations:true,
  station_points_minzoom:10.5,
  station_labels_minzoom:11.6
},null,2));
