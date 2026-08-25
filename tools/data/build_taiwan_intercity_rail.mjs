import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const repoRoot=path.resolve(__dirname,'../..');
const outDir=path.join(repoRoot,'public','generated');
const lineOutputPath=path.join(outDir,'taiwan_intercity_thsr_lines.geojson');
const stationOutputPath=path.join(outDir,'taiwan_intercity_stations.geojson');
const auditPath=path.join(outDir,'taiwan_intercity_rail.audit.json');
const ifMissing=process.argv.includes('--if-missing');

const TRA_STATION_URL='https://ods.railway.gov.tw/tra-ods-web/ods/download/dataResource/0518b833e8964d53bfea3f7691aea0ee';
const OSM_API_BASE='https://api.openstreetmap.org/api/0.6';
const THSR_RELATION_IDS=[1827335,4500369,4500371];
const TRA_COLOR='#005ca8';
const THSR_COLOR='#f57c00';
const REQUEST_TIMEOUT_MS=30000;
const TAIWAN_BOUNDS={west:118.0,south:21.5,east:123.8,north:26.7};

function exists(filePath){return access(filePath).then(()=>true,()=>false);}
function clean(value){return String(value??'').trim();}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function inTaiwan(lng,lat){return lng>=TAIWAN_BOUNDS.west&&lng<=TAIWAN_BOUNDS.east&&lat>=TAIWAN_BOUNDS.south&&lat<=TAIWAN_BOUNDS.north;}

async function fetchText(url,label){
  const errors=[];
  for(let attempt=1;attempt<=3;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try{
      const response=await fetch(url,{signal:controller.signal,headers:{'user-agent':'Taipei-Maps intercity rail builder'}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return await response.text();
    }catch(error){
      const message=error?.name==='AbortError'?`timeout after ${REQUEST_TIMEOUT_MS/1000}s`:(error?.message||String(error));
      errors.push(`attempt ${attempt}: ${message}`);
      if(attempt<3)await sleep(900*attempt);
    }finally{clearTimeout(timer);}
  }
  throw new Error(`${label} fetch failed: ${errors.join(' | ')}`);
}

function findRows(payload){
  if(Array.isArray(payload))return payload;
  for(const key of ['data','result','results','items','records'])if(Array.isArray(payload?.[key]))return payload[key];
  const arrays=Object.values(payload||{}).filter(Array.isArray);
  if(arrays.length===1)return arrays[0];
  throw new Error('TRA station payload did not expose a recognizable row array');
}

function number(value){const n=Number(String(value??'').replace(/[^0-9+\-.eE]/g,''));return Number.isFinite(n)?n:null;}
function parseCoordinatePair(a,b){
  const x=number(a),y=number(b);if(x===null||y===null)return null;
  if(Math.abs(x)>90&&Math.abs(y)<=90)return [x,y];
  if(Math.abs(y)>90&&Math.abs(x)<=90)return [y,x];
  if(x>=118&&x<=124&&y>=21&&y<=27)return [x,y];
  if(y>=118&&y<=124&&x>=21&&x<=27)return [y,x];
  return null;
}
function parseGps(value,row={}){
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    const pair=parseCoordinatePair(value.lon??value.lng??value.longitude??value.x,value.lat??value.latitude??value.y);
    if(pair)return pair;
  }
  if(Array.isArray(value)&&value.length>=2){const pair=parseCoordinatePair(value[0],value[1]);if(pair)return pair;}
  if(typeof value==='string'){
    const parts=value.match(/-?\d+(?:\.\d+)?/g)||[];
    if(parts.length>=2){const pair=parseCoordinatePair(parts[0],parts[1]);if(pair)return pair;}
  }
  const candidates=[[row.lon,row.lat],[row.lng,row.lat],[row.longitude,row.latitude],[row.x,row.y],[row.stationLon,row.stationLat],[row.stationLng,row.stationLat]];
  for(const [a,b] of candidates){const pair=parseCoordinatePair(a,b);if(pair)return pair;}
  return null;
}

async function buildTraStations(){
  console.log('Downloading official TRA station dataset…');
  const text=await fetchText(TRA_STATION_URL,'TRA station dataset');
  const payload=JSON.parse(text.replace(/^\uFEFF/,''));
  const rows=findRows(payload);
  const features=[];
  const seen=new Set();
  for(const row of rows){
    const rawName=clean(row.stationName??row.name??row.station_name??row.StationName?.Zh_tw??row.StationName?.ZhTw);
    if(!rawName)continue;
    const coords=parseGps(row.gps??row.GPS??row.position??row.Position,row);
    if(!coords||!inTaiwan(coords[0],coords[1]))continue;
    const stationName=`${rawName.replace(/\s*站$/,'')}站`;
    const key=`${stationName}|${coords.map(v=>v.toFixed(5)).join(',')}`;
    if(seen.has(key))continue;seen.add(key);
    features.push({type:'Feature',geometry:{type:'Point',coordinates:coords},properties:{system:'TRA',line_code:'TRA',line_name:'臺鐵',line_color:TRA_COLOR,station_id:clean(row.stationCode??row.code??row.station_id??row.StationID),station_name:stationName,source:'Taiwan Railway Corporation open data',source_url:TRA_STATION_URL}});
  }
  if(features.length<180)throw new Error(`TRA station dataset unexpectedly small after GPS normalization: ${features.length}`);
  return features;
}

async function fetchOsmRelationFull(relationId){
  const url=`${OSM_API_BASE}/relation/${relationId}/full.json`;
  console.log(`Downloading THSR OSM relation ${relationId}…`);
  const text=await fetchText(url,`OSM relation ${relationId}`);
  const payload=JSON.parse(text);
  if(!Array.isArray(payload?.elements)||!payload.elements.length)throw new Error(`OSM relation ${relationId} returned no elements`);
  return payload.elements;
}
function activeRailWay(element){
  if(element?.type!=='way'||!Array.isArray(element.nodes)||element.nodes.length<2)return false;
  const railway=clean(element.tags?.railway).toLowerCase();
  if(!['rail','highspeed'].includes(railway))return false;
  if(clean(element.tags?.construction)||clean(element.tags?.proposed)||clean(element.tags?.disused)||clean(element.tags?.abandoned))return false;
  return true;
}
function stationLike(tags={}){return ['station','halt'].includes(clean(tags.railway).toLowerCase())||['station','stop_position'].includes(clean(tags.public_transport).toLowerCase());}
function zhName(tags={}){return clean(tags['name:zh-Hant']||tags['name:zh']||tags.name);}

async function buildThsr(){
  const all=[];
  for(const id of THSR_RELATION_IDS)all.push(...await fetchOsmRelationFull(id));
  const byKey=new Map();
  for(const element of all)byKey.set(`${element.type}:${element.id}`,element);
  const nodeById=new Map([...byKey.values()].filter(e=>e.type==='node').map(e=>[e.id,e]));
  const lines=[];const seenWays=new Set();
  for(const element of byKey.values()){
    if(!activeRailWay(element)||seenWays.has(element.id))continue;
    const coords=(element.nodes||[]).map(id=>nodeById.get(id)).filter(Boolean).map(node=>[Number(node.lon),Number(node.lat)]).filter(([lng,lat])=>Number.isFinite(lng)&&Number.isFinite(lat)&&inTaiwan(lng,lat));
    if(coords.length<2)continue;
    seenWays.add(element.id);
    lines.push({type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{system:'THSR',line_code:'THSR',line_name:'台灣高鐵',line_color:THSR_COLOR,source:'OpenStreetMap core API relation/full',source_way_id:element.id}});
  }
  if(lines.length<10)throw new Error(`THSR line geometry unexpectedly small: ${lines.length}`);
  const rawStations=[];
  for(const element of byKey.values()){
    if(element.type!=='node'||!stationLike(element.tags))continue;
    const name=zhName(element.tags);if(!name)continue;
    const lng=Number(element.lon),lat=Number(element.lat);if(!inTaiwan(lng,lat))continue;
    rawStations.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{system:'THSR',line_code:'THSR',line_name:'台灣高鐵',line_color:THSR_COLOR,station_id:clean(element.tags?.ref),station_name:`高鐵${name.replace(/^高鐵/,'').replace(/\s*站$/,'')}站`,source:'OpenStreetMap core API relation/full',source_node_id:element.id}});
  }
  const dedup=new Map();for(const feature of rawStations)if(!dedup.has(feature.properties.station_name))dedup.set(feature.properties.station_name,feature);
  const stations=[...dedup.values()];
  if(stations.length<10)throw new Error(`THSR station set unexpectedly small: ${stations.length}`);
  return {lines,stations};
}

function validateStations(features){
  const tra=features.filter(f=>f.properties.line_code==='TRA');const thsr=features.filter(f=>f.properties.line_code==='THSR');
  if(tra.length<180)throw new Error(`TRA stations unexpectedly small: ${tra.length}`);
  if(thsr.length<10)throw new Error(`THSR stations unexpectedly small: ${thsr.length}`);
  for(const required of ['高鐵南港站','高鐵台北站','高鐵板橋站','高鐵桃園站','高鐵左營站'])if(!thsr.some(f=>f.properties.station_name===required))throw new Error(`THSR station dataset missing expected station: ${required}`);
}

async function main(){
  await mkdir(outDir,{recursive:true});
  if(ifMissing&&await exists(lineOutputPath)&&await exists(stationOutputPath)){
    console.log(`Taiwan intercity THSR line cache found: ${lineOutputPath}`);console.log(`Taiwan intercity station cache found: ${stationOutputPath}`);return;
  }
  const [traStations,thsr]=await Promise.all([buildTraStations(),buildThsr()]);
  const stations=[...traStations,...thsr.stations];validateStations(stations);
  await writeFile(lineOutputPath,JSON.stringify({type:'FeatureCollection',features:thsr.lines}),'utf8');
  await writeFile(stationOutputPath,JSON.stringify({type:'FeatureCollection',features:stations}),'utf8');
  const audit={schema_version:1,fetched_at:new Date().toISOString(),output_crs:'EPSG:4326',tra_source:'Taiwan Railway Corporation station open data',tra_station_count:traStations.length,thsr_source:'OpenStreetMap core API relation/full',thsr_relation_ids:THSR_RELATION_IDS,thsr_line_feature_count:thsr.lines.length,thsr_station_count:thsr.stations.length,colors:{TRA:TRA_COLOR,THSR:THSR_COLOR}};
  await writeFile(auditPath,JSON.stringify(audit,null,2)+'\n','utf8');
  console.log('Taiwan intercity rail local dataset: PASS');console.log(`  TRA stations: ${traStations.length}`);console.log(`  THSR line features: ${thsr.lines.length}`);console.log(`  THSR stations: ${thsr.stations.length}`);
}

main().catch(error=>{console.error(`[ERROR] ${error?.stack||error}`);process.exitCode=1;});
