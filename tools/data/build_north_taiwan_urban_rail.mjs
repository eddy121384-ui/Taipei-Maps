import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const repoRoot=path.resolve(__dirname,'../..');
const outDir=path.join(repoRoot,'public','generated');
const lineOutputPath=path.join(outDir,'north_taiwan_urban_rail_lines.geojson');
const stationOutputPath=path.join(outDir,'north_taiwan_urban_rail_stations.geojson');
const auditPath=path.join(outDir,'north_taiwan_urban_rail.audit.json');
const ifMissing=process.argv.includes('--if-missing');

const BOUNDS={south:24.80,west:121.12,north:25.33,east:121.86};
const OVERPASS_ENDPOINTS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];
const REQUEST_TIMEOUT_MS=30000;

// Stable OpenStreetMap relation IDs are linked from Wikidata P402 for each
// passenger line. We fetch those exact relation trees instead of guessing
// route relations from localized names, endpoint names, or operator tags.
const SYSTEMS={
  V:{system:'new_taipei',line_code:'V',line_name:'淡海輕軌',line_color:'#dc524d',osm_relation_id:5576487,stationRefRegex:'^V(?:[0-9]{2})$'},
  K:{system:'new_taipei',line_code:'K',line_name:'安坑輕軌',line_color:'#9b8f5e',osm_relation_id:15443527,stationRefRegex:'^K(?:[0-9]{2})$'},
  LB:{system:'new_taipei',line_code:'LB',line_name:'三鶯線',line_color:'#79bce8',osm_relation_id:5341250,stationRefRegex:'^LB(?:[0-9]{2})$'},
  A:{system:'taoyuan',line_code:'A',line_name:'桃園機場捷運',line_color:'#8e47ad',osm_relation_id:6937084,stationRefRegex:'^A(?:14A|[0-9]{1,2})$'}
};
const EXPECTED_CODES=new Set(Object.keys(SYSTEMS));
const ACTIVE_RAILWAY_VALUES=new Set(['rail','light_rail','subway','tram','monorail']);

function exists(filePath){return access(filePath).then(()=>true,()=>false);}
function clean(value){return String(value??'').trim();}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function normalizeHex(value){
  const v=clean(value).toLowerCase();
  if(/^#[0-9a-f]{6}$/.test(v))return v;
  if(/^[0-9a-f]{6}$/.test(v))return `#${v}`;
  if(/^#[0-9a-f]{3}$/.test(v))return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
}

function stationCandidate(element){
  if(element?.type!=='node')return false;
  const t=element.tags||{};
  if(!clean(t.name)&&!clean(t['name:zh']))return false;
  return ['station','halt','tram_stop','stop'].includes(clean(t.railway).toLowerCase())||
    ['stop_position','platform','station'].includes(clean(t.public_transport).toLowerCase());
}

function stationName(tags){
  const raw=clean(tags?.['name:zh']||tags?.name);
  if(!raw)return '';
  return raw.replace(/\s*站$/,'')+'站';
}

function railWayCandidate(element){
  if(element?.type!=='way'||!Array.isArray(element.geometry)||element.geometry.length<2)return false;
  const t=element.tags||{};
  const railway=clean(t.railway).toLowerCase();
  if(!ACTIVE_RAILWAY_VALUES.has(railway))return false;
  if(clean(t.construction)||clean(t.proposed)||clean(t.disused)||clean(t.abandoned)||clean(t.razed))return false;
  if(['construction','proposed','disused','abandoned','razed'].includes(railway))return false;
  return true;
}

function wayCoordinates(element){
  return (element.geometry||[])
    .map(point=>[Number(point.lon),Number(point.lat)])
    .filter(([lng,lat])=>Number.isFinite(lng)&&Number.isFinite(lat));
}

function dedupeStations(features){
  const groups=new Map();
  for(const feature of features){
    const p=feature.properties||{};
    const key=`${p.line_code}|${p.station_name}`;
    const row=groups.get(key)||{feature,count:0,sumLng:0,sumLat:0,refs:new Set()};
    const [lng,lat]=feature.geometry.coordinates;
    row.count++;row.sumLng+=lng;row.sumLat+=lat;
    if(p.station_id)row.refs.add(p.station_id);
    groups.set(key,row);
  }
  return [...groups.values()].map(row=>({
    ...row.feature,
    geometry:{type:'Point',coordinates:[row.sumLng/row.count,row.sumLat/row.count]},
    properties:{
      ...row.feature.properties,
      station_id:[...row.refs].sort().join('/')||row.feature.properties.station_id,
      source_point_count:row.count
    }
  })).sort((a,b)=>a.properties.line_code.localeCompare(b.properties.line_code)||
    a.properties.station_name.localeCompare(b.properties.station_name,'zh-Hant'));
}

function buildQuery(config){
  const b=BOUNDS;
  const bbox=`${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:45];\n`+
    `relation(${config.osm_relation_id})->.root;\n`+
    `.root >> ->.tree;\n`+
    `(\n  .root;\n  .tree;\n  node["ref"~"${config.stationRefRegex}"](${bbox});\n);\n`+
    `out body geom;`;
}

async function postOverpass(endpoint,query){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(endpoint,{
      method:'POST',signal:controller.signal,
      headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','user-agent':'Taipei-Maps urban-rail builder'},
      body:new URLSearchParams({data:query})
    });
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const payload=await response.json();
    if(!Array.isArray(payload?.elements)||!payload.elements.length)throw new Error('empty Overpass payload');
    return payload;
  }finally{
    clearTimeout(timer);
  }
}

async function fetchSystem(config){
  const query=buildQuery(config);
  const errors=[];
  for(let round=1;round<=2;round++){
    for(const endpoint of OVERPASS_ENDPOINTS){
      try{
        console.log(`  ${config.line_code}: ${endpoint}${round>1?' (retry)':''}`);
        const payload=await postOverpass(endpoint,query);
        return {config,payload,endpoint,round};
      }catch(error){
        const message=error?.name==='AbortError'?`timeout after ${REQUEST_TIMEOUT_MS/1000}s`:(error?.message||String(error));
        errors.push(`${endpoint} [attempt ${round}]: ${message}`);
      }
    }
    if(round===1)await sleep(1200);
  }
  throw new Error(`${config.line_code} Overpass failed: ${errors.join(' | ')}`);
}

async function fetchOverpass(){
  const rows=[];
  for(const config of Object.values(SYSTEMS)){
    console.log(`Downloading ${config.line_name} (${config.line_code}) relation ${config.osm_relation_id}…`);
    rows.push(await fetchSystem(config));
  }
  return rows;
}

function normalize(rows){
  const lineFeatures=[];
  const rawStations=[];
  const lineCounts={V:0,K:0,LB:0,A:0};
  const stationCandidateCounts={V:0,K:0,LB:0,A:0};

  for(const row of rows){
    const {config,payload}=row;
    const waySeen=new Set();
    for(const element of payload.elements||[]){
      if(!railWayCandidate(element))continue;
      const coordinates=wayCoordinates(element);
      if(coordinates.length<2)continue;
      const key=`${config.line_code}|${element.id}`;
      if(waySeen.has(key))continue;
      waySeen.add(key);
      lineFeatures.push({
        type:'Feature',
        geometry:{type:'LineString',coordinates},
        properties:{
          system:config.system,
          line_code:config.line_code,
          line_name:config.line_name,
          line_color:config.line_color,
          route_name:config.line_name,
          source:'OpenStreetMap relation tree',
          source_relation_id:config.osm_relation_id,
          source_way_id:element.id
        }
      });
      lineCounts[config.line_code]++;
    }

    for(const element of payload.elements||[]){
      if(!stationCandidate(element))continue;
      const lng=Number(element.lon),lat=Number(element.lat);
      if(!Number.isFinite(lng)||!Number.isFinite(lat))continue;
      const tags=element.tags||{};
      const name=stationName(tags);
      if(!name||name==='站')continue;
      rawStations.push({
        type:'Feature',
        geometry:{type:'Point',coordinates:[lng,lat]},
        properties:{
          system:config.system,
          line_code:config.line_code,
          line_name:config.line_name,
          line_color:config.line_color,
          station_id:clean(tags.ref),
          station_name:name,
          source:'OpenStreetMap relation tree / station ref',
          source_relation_id:config.osm_relation_id,
          source_node_id:element.id
        }
      });
      stationCandidateCounts[config.line_code]++;
    }
  }

  const stations=dedupeStations(rawStations);
  const stationCounts={V:0,K:0,LB:0,A:0};
  for(const feature of stations)stationCounts[feature.properties.line_code]++;

  return {lineFeatures,stations,lineCounts,stationCounts,stationCandidateCounts,rawStationCount:rawStations.length};
}

function validate(lineFeatures,stations,lineCounts,stationCounts){
  const lineCodes=new Set(lineFeatures.map(f=>f.properties.line_code));
  const stationCodes=new Set(stations.map(f=>f.properties.line_code));
  for(const code of EXPECTED_CODES){
    if(!lineCodes.has(code))throw new Error(`North Taiwan rail output missing line geometry for ${code} (OSM relation ${SYSTEMS[code].osm_relation_id}; ways=${lineCounts[code]||0})`);
    if(!stationCodes.has(code))throw new Error(`North Taiwan rail output missing station points for ${code} (OSM relation ${SYSTEMS[code].osm_relation_id}; stations=${stationCounts[code]||0})`);
  }
  if(lineFeatures.length<20)throw new Error(`North Taiwan rail line geometry unexpectedly small: ${lineFeatures.length}`);
  if(stations.length<45)throw new Error(`North Taiwan rail station set unexpectedly small: ${stations.length}`);
  for(const feature of lineFeatures){
    const color=normalizeHex(feature.properties.line_color);
    if(!color)throw new Error(`Invalid line colour for ${feature.properties.line_code}: ${feature.properties.line_color}`);
    feature.properties.line_color=color;
  }
  for(const feature of stations){
    const [lng,lat]=feature.geometry.coordinates;
    if(lng<BOUNDS.west||lng>BOUNDS.east||lat<BOUNDS.south||lat>BOUNDS.north){
      throw new Error(`Station outside north Taiwan build bounds: ${feature.properties.station_name}`);
    }
  }
}

async function main(){
  await mkdir(outDir,{recursive:true});
  if(ifMissing&&await exists(lineOutputPath)&&await exists(stationOutputPath)){
    console.log(`North Taiwan urban rail local cache found: ${lineOutputPath}`);
    console.log(`North Taiwan urban rail station cache found: ${stationOutputPath}`);
    return;
  }

  console.log('Downloading North Taiwan urban rail by stable OSM relation IDs…');
  const rows=await fetchOverpass();
  const {lineFeatures,stations,lineCounts,stationCounts,stationCandidateCounts,rawStationCount}=normalize(rows);

  for(const code of EXPECTED_CODES){
    console.log(`  ${code}: ${lineCounts[code]} rail way(s), ${stationCounts[code]} station(s) after dedupe`);
  }

  validate(lineFeatures,stations,lineCounts,stationCounts);

  await writeFile(lineOutputPath,JSON.stringify({type:'FeatureCollection',features:lineFeatures}),'utf8');
  await writeFile(stationOutputPath,JSON.stringify({type:'FeatureCollection',features:stations}),'utf8');
  const audit={
    schema_version:3,
    source_name:'OpenStreetMap stable relation trees (P402 IDs linked from Wikidata; local build-time cache)',
    source_endpoints:Object.fromEntries(rows.map(row=>[row.config.line_code,{endpoint:row.endpoint,attempt:row.round}])),
    fetched_at:new Date().toISOString(),
    output_crs:'EPSG:4326',
    bounds:BOUNDS,
    request_strategy:'stable per-line OSM relation ID + recursive descendants + station-ref supplement + multi-endpoint retry',
    line_feature_count:lineFeatures.length,
    station_feature_count:stations.length,
    raw_station_candidate_count:rawStationCount,
    line_counts:lineCounts,
    station_counts:stationCounts,
    raw_station_candidate_counts:stationCandidateCounts,
    systems:Object.fromEntries(Object.entries(SYSTEMS).map(([code,row])=>[code,{
      system:row.system,
      line_name:row.line_name,
      line_color:row.line_color,
      osm_relation_id:row.osm_relation_id
    }]))
  };
  await writeFile(auditPath,JSON.stringify(audit,null,2)+'\n','utf8');

  console.log('North Taiwan urban rail local dataset: PASS');
  console.log(`  Lines: ${lineFeatures.length}`);
  console.log(`  Stations: ${stations.length}`);
  console.log(`  Output: ${lineOutputPath}`);
}

main().catch(error=>{
  console.error(`[ERROR] ${error?.stack||error}`);
  process.exitCode=1;
});
