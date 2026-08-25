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
  'https://overpass.kumi.systems/api/interpreter'
];

// Passenger-facing line identities. Relation colours are preferred whenever
// OSM supplies a valid colour; these values are deterministic fallbacks only.
const SYSTEMS={
  V:{system:'new_taipei',line_code:'V',line_name:'淡海輕軌',line_color:'#e5554f',aliases:['淡海輕軌','Danhai']},
  K:{system:'new_taipei',line_code:'K',line_name:'安坑輕軌',line_color:'#c4a46b',aliases:['安坑輕軌','Ankeng']},
  LB:{system:'new_taipei',line_code:'LB',line_name:'三鶯線',line_color:'#6ec4e8',aliases:['三鶯線','Sanying']},
  A:{system:'taoyuan',line_code:'A',line_name:'桃園機場捷運',line_color:'#8246af',aliases:['桃園機場捷運','機場捷運','Taoyuan Airport MRT','Airport MRT']}
};
const EXPECTED_CODES=new Set(Object.keys(SYSTEMS));

function exists(filePath){return access(filePath).then(()=>true,()=>false);}
function clean(value){return String(value??'').trim();}
function normalizeHex(value){
  const v=clean(value).toLowerCase();
  if(/^#[0-9a-f]{6}$/.test(v))return v;
  if(/^[0-9a-f]{6}$/.test(v))return `#${v}`;
  if(/^#[0-9a-f]{3}$/.test(v))return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
}

function classifyText(text){
  const t=clean(text).toLowerCase();
  for(const config of Object.values(SYSTEMS)){
    if(config.aliases.some(alias=>t.includes(alias.toLowerCase())))return config;
  }
  return null;
}

function classifyRef(ref){
  const r=clean(ref).replace(/\s+/g,'').toUpperCase();
  if(/^LB\d+/.test(r))return SYSTEMS.LB;
  if(/^V\d+/.test(r))return SYSTEMS.V;
  if(/^K\d+/.test(r))return SYSTEMS.K;
  if(/^A(?:14A|\d+)/.test(r))return SYSTEMS.A;
  return null;
}

function relationConfig(element){
  const t=element?.tags||{};
  return classifyText([t.name,t['name:zh'],t.network,t.operator,t.ref,t.description].filter(Boolean).join(' | '));
}

function lineCoordinatesFromRelation(element){
  const lines=[];
  for(const member of element?.members||[]){
    if(member?.type!=='way'||!Array.isArray(member.geometry)||member.geometry.length<2)continue;
    const coordinates=member.geometry
      .map(point=>[Number(point.lon),Number(point.lat)])
      .filter(([lng,lat])=>Number.isFinite(lng)&&Number.isFinite(lat));
    if(coordinates.length>=2)lines.push({memberRef:member.ref,coordinates});
  }
  return lines;
}

function segmentDistanceSquared(point,a,b){
  const latScale=Math.cos(point[1]*Math.PI/180);
  const px=point[0]*latScale,py=point[1];
  const ax=a[0]*latScale,ay=a[1],bx=b[0]*latScale,by=b[1];
  const vx=bx-ax,vy=by-ay,wx=px-ax,wy=py-ay;
  const len=vx*vx+vy*vy;
  const t=len?Math.max(0,Math.min(1,(wx*vx+wy*vy)/len)):0;
  const dx=px-(ax+t*vx),dy=py-(ay+t*vy);
  return dx*dx+dy*dy;
}

function nearestSystem(point,lineFeatures){
  let best=null,bestD=Infinity;
  for(const feature of lineFeatures){
    const coords=feature.geometry?.coordinates||[];
    for(let i=1;i<coords.length;i++){
      const d=segmentDistanceSquared(point,coords[i-1],coords[i]);
      if(d<bestD){bestD=d;best=SYSTEMS[feature.properties.line_code];}
    }
  }
  // ~700 m at northern Taiwan latitudes. Deliberately generous for platform
  // nodes that sit slightly off the route centreline, but still excludes most
  // unrelated Taipei MRT stations.
  return bestD<=0.00005?best:null;
}

function stationCandidate(element){
  if(element?.type!=='node')return false;
  const t=element.tags||{};
  if(!clean(t.name)&&!clean(t['name:zh']))return false;
  return ['station','halt','tram_stop'].includes(t.railway)||['stop_position','platform','station'].includes(t.public_transport);
}

function stationName(tags){
  return clean(tags?.['name:zh']||tags?.name).replace(/\s*站$/,'')+'站';
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
    properties:{...row.feature.properties,station_id:[...row.refs].sort().join('/')||row.feature.properties.station_id,source_point_count:row.count}
  })).sort((a,b)=>a.properties.line_code.localeCompare(b.properties.line_code)||a.properties.station_name.localeCompare(b.properties.station_name,'zh-Hant'));
}

function buildQuery(){
  const b=BOUNDS;
  return `[out:json][timeout:120];\n(\n  relation["type"="route"]["route"~"subway|light_rail|train"](${b.south},${b.west},${b.north},${b.east});\n)->.routes;\n.routes out tags geom;\nnode(r.routes);\nout tags;`;
}

async function fetchOverpass(){
  const query=buildQuery();
  const errors=[];
  for(const endpoint of OVERPASS_ENDPOINTS){
    try{
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','user-agent':'Taipei-Maps urban-rail builder'},
        body:new URLSearchParams({data:query})
      });
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const payload=await response.json();
      if(!Array.isArray(payload?.elements)||!payload.elements.length)throw new Error('empty Overpass payload');
      return {payload,endpoint};
    }catch(error){errors.push(`${endpoint}: ${error?.message||error}`);}
  }
  throw new Error(`North Taiwan rail Overpass failed: ${errors.join(' | ')}`);
}

function normalize(payload){
  const lineFeatures=[];
  const waySeen=new Set();
  const relationCounts={V:0,K:0,LB:0,A:0};
  for(const element of payload.elements||[]){
    if(element?.type!=='relation')continue;
    const config=relationConfig(element);
    if(!config)continue;
    relationCounts[config.line_code]++;
    const relationColor=normalizeHex(element.tags?.colour)||normalizeHex(element.tags?.color)||config.line_color;
    for(const line of lineCoordinatesFromRelation(element)){
      const key=`${config.line_code}|${line.memberRef}`;
      if(waySeen.has(key))continue;
      waySeen.add(key);
      lineFeatures.push({
        type:'Feature',
        geometry:{type:'LineString',coordinates:line.coordinates},
        properties:{
          system:config.system,line_code:config.line_code,line_name:config.line_name,
          line_color:relationColor,route_name:clean(element.tags?.['name:zh']||element.tags?.name)||config.line_name,
          source:'OpenStreetMap route relation',source_relation_id:element.id
        }
      });
    }
  }

  const rawStations=[];
  for(const element of payload.elements||[]){
    if(!stationCandidate(element))continue;
    const lng=Number(element.lon),lat=Number(element.lat);
    if(!Number.isFinite(lng)||!Number.isFinite(lat))continue;
    const tags=element.tags||{};
    let config=classifyRef(tags.ref)||classifyText([tags.network,tags.operator,tags.line,tags.route,tags.description].filter(Boolean).join(' | '));
    if(!config)config=nearestSystem([lng,lat],lineFeatures);
    if(!config)continue;
    const name=stationName(tags);
    if(!name||name==='站')continue;
    rawStations.push({
      type:'Feature',
      geometry:{type:'Point',coordinates:[lng,lat]},
      properties:{
        system:config.system,line_code:config.line_code,line_name:config.line_name,line_color:config.line_color,
        station_id:clean(tags.ref),station_name:name,
        source:'OpenStreetMap route member',source_node_id:element.id
      }
    });
  }

  const stations=dedupeStations(rawStations);
  return {lineFeatures,stations,relationCounts,rawStationCount:rawStations.length};
}

function validate(lineFeatures,stations){
  const lineCodes=new Set(lineFeatures.map(f=>f.properties.line_code));
  const stationCodes=new Set(stations.map(f=>f.properties.line_code));
  for(const code of EXPECTED_CODES){
    if(!lineCodes.has(code))throw new Error(`North Taiwan rail output missing line geometry for ${code}`);
    if(!stationCodes.has(code))throw new Error(`North Taiwan rail output missing station points for ${code}`);
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
    if(lng<BOUNDS.west||lng>BOUNDS.east||lat<BOUNDS.south||lat>BOUNDS.north)throw new Error(`Station outside north Taiwan build bounds: ${feature.properties.station_name}`);
  }
}

async function main(){
  await mkdir(outDir,{recursive:true});
  if(ifMissing&&await exists(lineOutputPath)&&await exists(stationOutputPath)){
    console.log(`North Taiwan urban rail local cache found: ${lineOutputPath}`);
    console.log(`North Taiwan urban rail station cache found: ${stationOutputPath}`);
    return;
  }

  console.log('Downloading North Taiwan urban rail route relations…');
  const {payload,endpoint}=await fetchOverpass();
  const {lineFeatures,stations,relationCounts,rawStationCount}=normalize(payload);
  validate(lineFeatures,stations);

  await writeFile(lineOutputPath,JSON.stringify({type:'FeatureCollection',features:lineFeatures}),'utf8');
  await writeFile(stationOutputPath,JSON.stringify({type:'FeatureCollection',features:stations}),'utf8');
  const audit={
    schema_version:1,
    source_name:'OpenStreetMap route relations (local build-time cache)',
    source_endpoint:endpoint,
    fetched_at:new Date().toISOString(),
    output_crs:'EPSG:4326',
    bounds:BOUNDS,
    line_feature_count:lineFeatures.length,
    station_feature_count:stations.length,
    raw_station_candidate_count:rawStationCount,
    matched_relation_counts:relationCounts,
    systems:Object.fromEntries(Object.entries(SYSTEMS).map(([code,row])=>[code,{system:row.system,line_name:row.line_name,fallback_line_color:row.line_color}]))
  };
  await writeFile(auditPath,JSON.stringify(audit,null,2)+'\n','utf8');

  console.log('North Taiwan urban rail local dataset: PASS');
  console.log(`  Lines: ${lineFeatures.length}`);
  console.log(`  Stations: ${stations.length}`);
  console.log(`  Relation groups: ${Object.entries(relationCounts).map(([k,v])=>`${k}=${v}`).join(', ')}`);
  console.log(`  Output: ${lineOutputPath}`);
}

main().catch(error=>{
  console.error(`[ERROR] ${error?.stack||error}`);
  process.exitCode=1;
});
