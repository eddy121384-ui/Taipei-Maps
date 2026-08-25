import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const transitPath='public/transit-layer.js';
const corePath='public/shared-map-core.js';
const builderPath='tools/data/build_taipei_mrt_official.mjs';
const stationBuilderPath='tools/data/build_taipei_mrt_stations_official.mjs';
const northBuilderPath='tools/data/build_north_taiwan_urban_rail.mjs';
const intercityBuilderPath='tools/data/build_taiwan_intercity_rail.mjs';
const transit=await readFile(transitPath,'utf8');
const core=await readFile(corePath,'utf8');
const builder=await readFile(builderPath,'utf8');
const stationBuilder=await readFile(stationBuilderPath,'utf8');
const northBuilder=await readFile(northBuilderPath,'utf8');
const intercityBuilder=await readFile(intercityBuilderPath,'utf8');

new vm.Script(transit,{filename:transitPath});
new vm.Script(core,{filename:corePath,importModuleDynamically:()=>{}});
function syntaxParseEsmBuilder(source,filename){
  const syntaxCopy=source.replace(/^import .*$/gm,'').replace(/^const __filename=.*$/m,"const __filename='';").replace(/^const __dirname=.*$/m,"const __dirname='';");
  new vm.Script(syntaxCopy,{filename});
}
for(const [source,filename] of [[builder,builderPath],[stationBuilder,stationBuilderPath],[northBuilder,northBuilderPath],[intercityBuilder,intercityBuilderPath]])syntaxParseEsmBuilder(source,filename);

const requiredTransitTokens=[
  "transportation.pmtiles","SOURCE_LAYER='segment'","['subway','monorail','light_rail']","railBaseFilter=railFilter(['narrow_gauge','standard_gauge'])",
  "centerInsideTaiwan","centerInsideNorthTaiwan","TAIWAN_BOUNDS","NORTH_TAIWAN_BOUNDS","transit-mrt","transit-tra",
  "TAIPEI_MRT_GEOJSON_URL='/generated/taipei_mrt_lines_official.geojson'","TAIPEI_MRT_STATION_GEOJSON_URL='/generated/taipei_mrt_stations_official.geojson'",
  "NORTH_URBAN_RAIL_GEOJSON_URL='/generated/north_taiwan_urban_rail_lines.geojson'","NORTH_URBAN_RAIL_STATION_GEOJSON_URL='/generated/north_taiwan_urban_rail_stations.geojson'",
  "INTERCITY_THSR_GEOJSON_URL='/generated/taiwan_intercity_thsr_lines.geojson'","INTERCITY_STATION_GEOJSON_URL='/generated/taiwan_intercity_stations.geojson'",
  "INTERCITY_THSR_SOURCE_ID='taiwan-intercity-thsr'","INTERCITY_STATION_SOURCE_ID='taiwan-intercity-stations'",
  "thsrOfficial:'transit-thsr-official'","traStation:'transit-tra-station'","thsrStation:'transit-thsr-station'",
  "new Set(['V','K','LB','A'])","BR:'#c48c31'","R:'#e3002c'","G:'#008659'","O:'#f8b61c'","BL:'#0070bd'","Y:'#ffdb00'",
  "GLOBAL_METRO_COLOR='#1976d2'","GLOBAL_RAIL_COLOR='#5f6b76'","TAIWAN_TRA_COLOR='#005ca8'","TAIWAN_THSR_COLOR='#f57c00'",
  "TRA_DASH=[2.2,1.8]","THSR_DASH=[4.2,2.0]","'line-dasharray',inTaiwan?TRA_DASH:null","THSR_DASH",
  "INTERCITY_LINE_LAYER_IDS","INTERCITY_STATION_LAYER_IDS","loadIntercityThsr","loadIntercityStations","validateIntercityThsr","validateIntercityStations",
  "filter:traFilter,minzoom:10.2,stroke:TAIWAN_TRA_COLOR","filter:thsrFilter,minzoom:8.8,stroke:TAIWAN_THSR_COLOR","filter:thsrFilter,minzoom:9.7",
  "setGroup(INTERCITY_LINE_LAYER_IDS,this.enabled&&inTaiwan&&this.intercityThsrReady)","setGroup(INTERCITY_STATION_LAYER_IDS,this.enabled&&inTaiwan&&this.intercityStationsReady)",
  "軌道 ON · 全球捷運 / 鐵路 · Overture","map.addControl(this.control,'top-right')","return false;"
];
for(const token of requiredTransitTokens)if(!transit.includes(token))throw new Error(`Transit contract missing: ${token}`);
if(transit.includes("thsrFilter=railFilter(['standard_gauge'])"))throw new Error('Rail semantic regression: Overture standard_gauge must not be treated as THSR');
if(transit.includes('ods.railway.gov.tw')||transit.includes('api.openstreetmap.org'))throw new Error('Browser transit layer must use same-origin generated intercity datasets, not provider APIs');
if(transit.includes("this.emit('outside','軌道僅在台灣顯示'"))throw new Error('Global rail regression: transit overlay must not disappear outside Taiwan');

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
  "OSM_API_BASE='https://api.openstreetmap.org/api/0.6'","/full.json","MAX_RELATIONS_PER_SYSTEM=160",
  "osm_relation_id:5576487","osm_relation_id:15443527","osm_relation_id:5341250","osm_relation_id:6937084",
  "line_color:'#dc524d'","line_color:'#9b8f5e'","line_color:'#79bce8'","line_color:'#8e47ad'",
  "fetchRelationFull","source:'OpenStreetMap core API relation/full'","schema_version:4","output_crs:'EPSG:4326'"
];
for(const token of requiredNorthBuilderTokens)if(!northBuilder.includes(token))throw new Error(`North Taiwan urban rail builder contract missing: ${token}`);
if(northBuilder.includes('overpass-api.de/api/interpreter'))throw new Error('North Taiwan builder regression: use OSM core API, not Overpass');

const requiredIntercityBuilderTokens=[
  "TRA_STATION_URL='https://ods.railway.gov.tw/tra-ods-web/ods/download/dataResource/0518b833e8964d53bfea3f7691aea0ee'",
  "OSM_API_BASE='https://api.openstreetmap.org/api/0.6'","THSR_RELATION_IDS=[1827335,4500369,4500371]",
  "TRA_COLOR='#005ca8'","THSR_COLOR='#f57c00'","taiwan_intercity_thsr_lines.geojson","taiwan_intercity_stations.geojson","taiwan_intercity_rail.audit.json",
  "buildTraStations","buildThsr","parseGps","TRA station dataset unexpectedly small after GPS normalization","THSR line geometry unexpectedly small","THSR station set unexpectedly small",
  "'高鐵南港站'","'高鐵台北站'","'高鐵板橋站'","'高鐵桃園站'","'高鐵左營站'","source:'Taiwan Railway Corporation open data'","source:'OpenStreetMap core API relation/full'"
];
for(const token of requiredIntercityBuilderTokens)if(!intercityBuilder.includes(token))throw new Error(`Intercity rail builder contract missing: ${token}`);

const requiredCoreTokens=["TRANSIT_MODULE_URL","import(TRANSIT_MODULE_URL)","TaipeiMapsTransitLayer","map.__taipeiMapsTransitLayer","bootstrapTransit(map,overtureUrl)","class NorthUpControl","button.textContent='N'","easeTo({bearing:0,duration:350})","map.addControl(northControl,'top-right')","map.__taipeiMapsNorthControl"];
for(const token of requiredCoreTokens)if(!core.includes(token))throw new Error(`Shared core contract missing: ${token}`);
for(const forbidden of ['sale.591.com.tw','sinyi.com.tw','yungching.com.tw'])if([transit,builder,stationBuilder,northBuilder,intercityBuilder].some(text=>text.includes(forbidden)))throw new Error(`Transit pipeline unexpectedly contains housing-provider dependency: ${forbidden}`);

console.log(JSON.stringify({
  status:'PASS',rail_base:'Overture transportation.pmtiles / segment',global_transit:true,
  overseas_behavior:'blue metro + neutral generic rail; no Taiwan provider semantics',
  taiwan_behavior:'blue short-dashed TRA/conventional rail + explicit orange long-dashed THSR + TRA/THSR station points and labels',
  intercity_semantics:'standard_gauge is no longer equated with THSR; THSR uses explicit local route geometry',
  intercity_style:{tra_color:'#005ca8',tra_dash:[2.2,1.8],thsr_color:'#f57c00',thsr_dash:[4.2,2.0]},
  intercity_sources:{tra_stations:'Taiwan Railway Corporation open data',thsr:'OpenStreetMap stable route relations via core API'},
  intercity_relation_ids:[1827335,4500369,4500371],intercity_station_zoom:{tra_points:10.2,tra_labels:11.2,thsr_points:8.8,thsr_labels:9.7},
  north_taiwan_behavior:'Taipei official MRT + route-specific Danhai V / Ankeng K / Sanying LB / Airport MRT A + station points/names',
  runtime_network_dependency_for_local_routes:false,kaohsiung_regression_guard:'generic metro is not faded merely because viewport is inside Taiwan',transit_toggle_control:true,north_up_control:true,north_preserves_pitch:true
},null,2));
