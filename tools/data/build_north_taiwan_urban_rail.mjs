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

const OSM_API_BASE='https://api.openstreetmap.org/api/0.6';
const REQUEST_TIMEOUT_MS=30000;
const MAX_RELATIONS_PER_SYSTEM=160;
const ACTIVE_RAILWAY_VALUES=new Set(['rail','light_rail','subway','tram','monorail']);

// Stable OpenStreetMap relation IDs are linked from Wikidata P402 for each
// passenger line. Build-time code reads those exact OSM relation trees via the
// core OSM API instead of sending search queries to public Overpass instances.
const SYSTEMS={
  V:{system:'new_taipei',line_code:'V',line_name:'淡海輕軌',line_color:'#dc524d',osm_relation_id:5576487},
  K:{system:'new_taipei',line_code:'K',line_name:'安坑輕軌',line_color:'#9b8f5e',osm_relation_id:15443527},
  LB:{system:'new_taipei',line_code:'LB',line_name:'三鶯線',line_color:'#79bce8',osm_relation_id:5341250},
  A:{system:'taoyuan',line_code:'A',line_name:'桃園機場捷運',line_color:'#8e47ad',osm_relation_id:6937084}
};
const EXPECTED_CODES=new Set(Object.keys(SYSTEMS));

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

async function fetchJson(url,label){
  const errors=[];
  for(let attempt=1;attempt<=3;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try{
      const response=await fetch(url,{
        signal:controller.signal,
        headers:{accept:'application/json','user-agent':'Taipei-Maps urban-rail builder'}
      });
      if(!response.ok){
        const detail=(await response.text().catch(()=>'' )).slice(0,240).replace(/\s+/g,' ');
        throw new Error(`HTTP ${response.status}${detail?` · ${detail}`:''}`);
      }
      const payload=await response.json();
      if(!Array.isArray(payload?.elements)||!payload.elements.length)throw new Error('empty OSM API payload');
      return {payload,attempt};
    }catch(error){
      const message=error?.name==='AbortError'?`timeout after ${REQUEST_TIMEOUT_MS/1000}s`:(error?.message||String(error));
      errors.push(`attempt ${attempt}: ${message}`);
      if(attempt<3)await sleep(700*attempt);
    }finally{
      clearTimeout(timer);
    }
  }
  throw new Error(`${label} failed: ${errors.join(' | ')}`);
}

async function fetchRelationFull(relationId,lineCode){
  const url=`${OSM_API_BASE}/relation/${relationId}/full.json`;
  const {payload,attempt}=await fetchJson(url,`${lineCode} relation ${relationId}`);
  return {payload,attempt,url};
}

function mergeElements(target,payload){
  for(const element of payload.elements||[]){
    if(!element?.type||!Number.isFinite(Number(element.id)))continue;
    target.set(`${element.type}:${element.id}`,element);
  }
}

async function fetchSystem(config){
  const queue=[config.osm_relation_id];
  const queued=new Set(queue);
  const visited=new Set();
  const elements=new Map();
  const requests=[];

  while(queue.length){
    if(visited.size>=MAX_RELATIONS_PER_SYSTEM){
      throw new Error(`${config.line_code} relation traversal exceeded safety limit ${MAX_RELATIONS_PER_SYSTEM}`);
    }
    const relationId=queue.shift();
    queued.delete(relationId);
    if(visited.has(relationId))continue;

    console.log(`  ${config.line_code}: OSM relation ${relationId}${relationId===config.osm_relation_id?' (root)':''}`);
    const {payload,attempt,url}=await fetchRelationFull(relationId,config.line_code);
    requests.push({relation_id:relationId,url,attempt});
    visited.add(relationId);
    mergeElements(elements,payload);

    // `/full` expands ways to their nodes, but a route-master can contain child
    // relations whose own members are not recursively expanded. Follow those
    // relation members explicitly so route-master and route schemas both work.
    for(const element of payload.elements||[]){
      if(element?.type!=='relation')continue;
      for(const member of element.members||[]){
        if(member?.type!=='relation')continue;
        const childId=Number(member.ref);
        if(!Number.isFinite(childId)||visited.has(childId)||queued.has(childId))continue;
        queue.push(childId);
        queued.add(childId);
      }
    }
  }

  return {config,elements:[...elements.values()],requests,relationCount:visited.size};
}

function railWayCandidate(element){
  if(element?.type!=='way'||!Array.isArray(element.nodes)||element.nodes.length<2)return false;
  const tags=element.tags||{};
  const railway=clean(tags.railway).toLowerCase();
  if(!ACTIVE_RAILWAY_VALUES.has(railway))return false;
  if(clean(tags.construction)||clean(tags.proposed)||clean(tags.disused)||clean(tags.abandoned)||clean(tags.razed))return false;
  return true;
}

function stationCandidate(element){
  const tags=element?.tags||{};
  if(!clean(tags.name)&&!clean(tags['name:zh']))return false;
  const railway=clean(tags.railway).toLowerCase();
  const pt=clean(tags.public_transport).toLowerCase();
  return ['station','halt','tram_stop','stop','platform'].includes(railway)||
    ['stop_position','platform','station','stop_area'].includes(pt);
}

function stationName(tags){
  const raw=clean(tags?.['name:zh']||tags?.name);
  if(!raw)return '';
  return raw.replace(/\s*站$/,'')+'站';
}

function buildIndexes(elements){
  const byKey=new Map();
  const nodes=new Map();
  for(const element of elements){
    byKey.set(`${element.type}:${element.id}`,element);
    if(element.type==='node'&&Number.isFinite(Number(element.lon))&&Number.isFinite(Number(element.lat))){
      nodes.set(Number(element.id),[Number(element.lon),Number(element.lat)]);
    }
  }
  return {byKey,nodes};
}

function wayCoordinates(element,nodes){
  return (element.nodes||[]).map(id=>nodes.get(Number(id))).filter(Boolean);
}

function meanPoint(points){
  if(!points.length)return null;
  const sum=points.reduce((acc,[lng,lat])=>[acc[0]+lng,acc[1]+lat],[0,0]);
  return [sum[0]/points.length,sum[1]/points.length];
}

function elementPoint(element,indexes,seen=new Set(),depth=0){
  if(!element||depth>3)return null;
  const key=`${element.type}:${element.id}`;
  if(seen.has(key))return null;
  seen.add(key);

  if(element.type==='node'){
    const lng=Number(element.lon),lat=Number(element.lat);
    return Number.isFinite(lng)&&Number.isFinite(lat)?[lng,lat]:null;
  }
  if(element.type==='way')return meanPoint(wayCoordinates(element,indexes.nodes));
  if(element.type==='relation'){
    const points=[];
    for(const member of element.members||[]){
      const child=indexes.byKey.get(`${member.type}:${member.ref}`);
      const point=elementPoint(child,indexes,new Set(seen),depth+1);
      if(point)points.push(point);
    }
    return meanPoint(points);
  }
  return null;
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

function normalize(rows){
  const lineFeatures=[];
  const rawStations=[];
  const lineCounts={V:0,K:0,LB:0,A:0};
  const stationCandidateCounts={V:0,K:0,LB:0,A:0};

  for(const row of rows){
    const {config,elements}=row;
    const indexes=buildIndexes(elements);
    const waySeen=new Set();

    for(const element of elements){
      if(!railWayCandidate(element))continue;
      const coordinates=wayCoordinates(element,indexes.nodes);
      if(coordinates.length<2)continue;
      const key=`${config.line_code}|${element.id}`;
      if(waySeen.has(key))continue;
      waySeen.add(key);
      lineFeatures.push({
        type:'Feature',
        geometry:{type:'LineString',coordinates},
        properties:{
          system:config.system,line_code:config.line_code,line_name:config.line_name,
          line_color:config.line_color,route_name:config.line_name,
          source:'OpenStreetMap core API relation/full',
          source_relation_id:config.osm_relation_id,source_way_id:element.id
        }
      });
      lineCounts[config.line_code]++;
    }

    for(const element of elements){
      if(!stationCandidate(element))continue;
      const point=elementPoint(element,indexes);
      if(!point)continue;
      const name=stationName(element.tags||{});
      if(!name||name==='站')continue;
      rawStations.push({
        type:'Feature',geometry:{type:'Point',coordinates:point},
        properties:{
          system:config.system,line_code:config.line_code,line_name:config.line_name,
          line_color:config.line_color,station_id:clean(element.tags?.ref),station_name:name,
          source:'OpenStreetMap core API relation/full',source_relation_id:config.osm_relation_id,
          source_element_type:element.type,source_element_id:element.id
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
}

async function main(){
  await mkdir(outDir,{recursive:true});
  if(ifMissing&&await exists(lineOutputPath)&&await exists(stationOutputPath)){
    console.log(`North Taiwan urban rail local cache found: ${lineOutputPath}`);
    console.log(`North Taiwan urban rail station cache found: ${stationOutputPath}`);
    return;
  }

  console.log('Downloading North Taiwan urban rail by stable OSM relation IDs via core API…');
  const rows=[];
  for(const config of Object.values(SYSTEMS)){
    console.log(`Downloading ${config.line_name} (${config.line_code}) relation ${config.osm_relation_id}…`);
    rows.push(await fetchSystem(config));
  }

  const {lineFeatures,stations,lineCounts,stationCounts,stationCandidateCounts,rawStationCount}=normalize(rows);
  for(const code of EXPECTED_CODES){
    const row=rows.find(item=>item.config.line_code===code);
    console.log(`  ${code}: ${lineCounts[code]} rail way(s), ${stationCounts[code]} station(s), ${row?.relationCount||0} relation(s) traversed`);
  }
  validate(lineFeatures,stations,lineCounts,stationCounts);

  await writeFile(lineOutputPath,JSON.stringify({type:'FeatureCollection',features:lineFeatures}),'utf8');
  await writeFile(stationOutputPath,JSON.stringify({type:'FeatureCollection',features:stations}),'utf8');
  const audit={
    schema_version:4,
    source_name:'OpenStreetMap core API stable relation trees (P402 IDs linked from Wikidata; local build-time cache)',
    source_api:OSM_API_BASE,
    fetched_at:new Date().toISOString(),output_crs:'EPSG:4326',
    request_strategy:'core OSM relation/full JSON + explicit child-relation traversal + retry; no Overpass dependency',
    line_feature_count:lineFeatures.length,station_feature_count:stations.length,
    raw_station_candidate_count:rawStationCount,line_counts:lineCounts,station_counts:stationCounts,
    raw_station_candidate_counts:stationCandidateCounts,
    systems:Object.fromEntries(rows.map(row=>[row.config.line_code,{
      system:row.config.system,line_name:row.config.line_name,line_color:row.config.line_color,
      osm_relation_id:row.config.osm_relation_id,relations_traversed:row.relationCount,
      requests:row.requests
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
