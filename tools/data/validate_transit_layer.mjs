import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const transitPath='public/transit-layer.js';
const corePath='public/shared-map-core.js';
const builderPath='tools/data/build_taipei_mrt_official.mjs';
const stationBuilderPath='tools/data/build_taipei_mrt_stations_official.mjs';
const northBuilderPath='tools/data/build_north_taiwan_urban_rail.mjs';
const transit=await readFile(transitPath,'utf8');
const core=await readFile(corePath,'utf8');
const builder=await readFile(builderPath,'utf8');
const stationBuilder=await readFile(stationBuilderPath,'utf8');
const northBuilder=await readFile(northBuilderPath,'utf8');

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
syntaxParseEsmBuilder(northBuilder,northBuilderPath);

const requiredTransitTokens=[
  "transportation.pmtiles","SOURCE_LAYER='segment'","['subway','monorail','light_rail']","['narrow_gauge']","['standard_gauge']",
  "centerInsideTaiwan","centerInsideNorthTaiwan","TAIWAN_BOUNDS","NORTH_TAIWAN_BOUNDS","transit-mrt","transit-tra","transit-thsr",
  "TAIPEI_MRT_GEOJSON_URL='/generated/taipei_mrt_lines_official.geojson'","TAIPEI_MRT_STATION_GEOJSON_URL='/generated/taipei_mrt_stations_official.geojson'",
  "NORTH_URBAN_RAIL_GEOJSON_URL='/generated/north_taiwan_urban_rail_lines.geojson'","NORTH_URBAN_RAIL_STATION_GEOJSON_URL='/generated/north_taiwan_urban_rail_stations.geojson'",
  "NORTH_URBAN_RAIL_SOURCE_ID='north-taiwan-urban-rail'","NORTH_URBAN_RAIL_STATION_SOURCE_ID='north-taiwan-urban-rail-stations'",
  "northUrbanCasing:'transit-north-urban-casing'","northUrbanStation:'transit-north-urban-station'","northUrbanStationLabel:'transit-north-urban-station-label'",
  "'text-field':['get','station_name']","minzoom:10.5","minzoom:11.6","new Set(['V','K','LB','A'])",
  "BR:'#c48c31'","R:'#e3002c'","G:'#008659'","O:'#f8b61c'","BL:'#0070bd'","Y:'#ffdb00'",
  "GLOBAL_METRO_COLOR='#1976d2'","GLOBAL_RAIL_COLOR='#5f6b76'","TAIWAN_TRA_COLOR='#2e7d32'","TAIWAN_THSR_COLOR='#f57c00'",
  "NORTH_URBAN_LINE_LAYER_IDS","NORTH_URBAN_STATION_LAYER_IDS","applyRegionalAppearance","completeCoverage=inNorth&&localReadyCount===2","partialCoverage=inNorth&&localReadyCount===1",
  "loadNorthUrbanRail","loadNorthUrbanStations","validateNorthUrbanRail","validateNorthUrbanStations","scope:'north-taiwan'","軌道 ON · 全球捷運 / 鐵路 · Overture","map.addControl(this.control,'top-right')","return false;"
];
for(const token of requiredTransitTokens)if(!transit.includes(token))throw new Error(`Transit contract missing: ${token}`);
if(transit.includes("this.emit('outside','軌道僅在台灣顯示'"))throw new Error('Global rail regression: transit overlay must not disappear outside Taiwan');
if(transit.includes('data.taipei/api/frontstage/tpeod/dataset/resource.download'))throw new Error('Browser transit layer must not fetch Taipei government GIS cross-origin; use local generated datasets');
if(transit.includes('overpass-api.de/api/interpreter'))throw new Error('Browser transit layer must not fetch Overpass at runtime; use the local generated North Taiwan dataset');

const requiredBuilderTokens=[
  "data.taipei/api/frontstage/tpeod/dataset/resource.download","taipei_mrt_lines_official.geojson","taipei_mrt_lines_official.audit.json",
  "'淡水線':'R'","'信義線':'R'","'新店線':'G'","'松山線':'G'","'中和線':'O'","'蘆洲線':'O'","'板橋線':'BL'","'南港線':'BL'","'木柵線':'BR'","'內湖線':'BR'","'環狀線':'Y'",
  "Unexpected Taipei MRT CRS","output_crs:'EPSG:4326'","source_sha256","TextDecoder('utf-8',{fatal:true})"
];
for(const token of requiredBuilderTokens)if(!builder.includes(token))throw new Error(`Official MRT builder contract missing: ${token}`);

const requiredStationBuilderTokens=[
  "rid=a63e3278-9d10-4916-9f24-e5a4d78afb31","taipei_mrt_stations_official.geojson","taipei_mrt_stations_official.audit.json","臺北都會區大眾捷運系統車站點位圖","Unexpected Taipei MRT station CRS","output_crs:'EPSG:4326'",
  "station_name:row.name","source_point_count:row.coordinates.length","features.length<90","'台北車站'","'市政府站'","'板橋站'","'景平站'","'十四張站'","duplicate_platform_stations","source_sha256"
];
for(const token of requiredStationBuilderTokens)if(!stationBuilder.includes(token))throw new Error(`Official MRT station builder contract missing: ${token}`);

const requiredNorthBuilderTokens=[
  "north_taiwan_urban_rail_lines.geojson","north_taiwan_urban_rail_stations.geojson","north_taiwan_urban_rail.audit.json",
  "overpass-api.de/api/interpreter","overpass.kumi.systems/api/interpreter","overpass.private.coffee/api/interpreter","overpass.nchc.org.tw/api/interpreter",
  "V:{system:'new_taipei'","K:{system:'new_taipei'","LB:{system:'new_taipei'","A:{system:'taoyuan'",
  "line_name:'淡海輕軌'","line_name:'安坑輕軌'","line_name:'三鶯線'","line_name:'桃園機場捷運'",
  "osm_relation_id:5576487","osm_relation_id:15443527","osm_relation_id:5341250","osm_relation_id:6937084",
  "line_color:'#dc524d'","line_color:'#9b8f5e'","line_color:'#79bce8'","line_color:'#8e47ad'",
  ".root >> ->.tree","source:'OpenStreetMap relation tree'","source:'OpenStreetMap relation tree / station ref'",
  "station_name:name","lineFeatures.length<20","stations.length<45","schema_version:3","output_crs:'EPSG:4326'",
  "request_strategy:'stable per-line OSM relation ID + recursive descendants + station-ref supplement + multi-endpoint retry'"
];
for(const token of requiredNorthBuilderTokens)if(!northBuilder.includes(token))throw new Error(`North Taiwan urban rail builder contract missing: ${token}`);
if(northBuilder.includes('relation["type"="route"]["route"~"subway|light_rail|train"]')){
  throw new Error('North Taiwan builder regression: do not rediscover routes by broad name query; use stable per-line relation IDs');
}

const requiredCoreTokens=["TRANSIT_MODULE_URL","import(TRANSIT_MODULE_URL)","TaipeiMapsTransitLayer","map.__taipeiMapsTransitLayer","bootstrapTransit(map,overtureUrl)","class NorthUpControl","button.textContent='N'","easeTo({bearing:0,duration:350})","map.addControl(northControl,'top-right')","map.__taipeiMapsNorthControl"];
for(const token of requiredCoreTokens)if(!core.includes(token))throw new Error(`Shared core contract missing: ${token}`);
for(const forbidden of ['sale.591.com.tw','sinyi.com.tw','yungching.com.tw'])if(transit.includes(forbidden)||builder.includes(forbidden)||stationBuilder.includes(forbidden)||northBuilder.includes(forbidden))throw new Error(`Transit pipeline unexpectedly contains housing-provider dependency: ${forbidden}`);

console.log(JSON.stringify({
  status:'PASS',rail_base:'Overture transportation.pmtiles / segment',global_transit:true,
  overseas_behavior:'blue metro + neutral rail; no Taiwan provider semantics',
  taiwan_behavior:'green TRA + orange THSR; generic metro retained outside North Taiwan local coverage',
  north_taiwan_behavior:'Taipei official MRT + route-specific Danhai V / Ankeng K / Sanying LB / Airport MRT A + station points/names',
  mrt_authoritative_source:'Taipei City DORTS GIS',mrt_station_authoritative_source:'Taipei City DORTS station GIS',
  north_urban_source:'Stable OpenStreetMap P402 relation trees cached at build time; Overture remains runtime fallback',
  north_urban_relation_ids:{V:5576487,K:15443527,LB:5341250,A:6937084},
  runtime_network_dependency_for_local_routes:false,
  station_points_minzoom:10.5,station_labels_minzoom:11.6,north_codes:['V','K','LB','A'],
  kaohsiung_regression_guard:'generic metro is not faded merely because viewport is inside Taiwan',transit_toggle_control:true,north_up_control:true,north_preserves_pitch:true
},null,2));
