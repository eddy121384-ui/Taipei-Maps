import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { reconcileHospitalCampuses } from './taipei_hospital_campuses.mjs';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const repoRoot=path.resolve(__dirname,'../..');
const outDir=path.join(repoRoot,'public','generated');
const outputPath=path.join(outDir,'taipei_healthcare_facilities.geojson');
const auditPath=path.join(outDir,'taipei_healthcare_facilities.audit.json');
const ifMissing=process.argv.includes('--if-missing');
const CACHE_SCHEMA_VERSION=2;

const DATASET_ID='ffdd5753-30db-4c38-b65f-b77892773d60';
const SOURCES=[
  {kind:'clinic',rid:'3a02af7d-8c33-46c1-8226-c12a11610f6b',label:'臺北市診所清冊'},
  {kind:'hospital',rid:'04a3d195-ee97-467a-b066-e471ff99d15d',label:'臺北市醫院清冊'}
];
const DOWNLOAD_BASE='https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=';
const TAIPEI_BOUNDS={west:121.40,south:24.90,east:121.75,north:25.25};
const REQUEST_TIMEOUT_MS=30000;

function exists(filePath){return access(filePath).then(()=>true,()=>false);}
function clean(value){return String(value??'').replace(/^\uFEFF/,'').trim();}
function normalizeHeader(value){return clean(value).replace(/[\s＿_()（）/／-]/g,'').toLowerCase();}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function inTaipei(lng,lat){return lng>=TAIPEI_BOUNDS.west&&lng<=TAIPEI_BOUNDS.east&&lat>=TAIPEI_BOUNDS.south&&lat<=TAIPEI_BOUNDS.north;}
function sha256(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}

async function cacheIsCurrent(){
  if(!await exists(outputPath)||!await exists(auditPath))return false;
  try{
    const audit=JSON.parse(await readFile(auditPath,'utf8'));
    return Number(audit?.schema_version)>=CACHE_SCHEMA_VERSION&&Array.isArray(audit?.campus_reconciliation);
  }catch{return false;}
}

async function fetchBytes(url,label){
  const errors=[];
  for(let attempt=1;attempt<=3;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try{
      const response=await fetch(url,{signal:controller.signal,headers:{'user-agent':'Taipei-Maps healthcare builder'}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    }catch(error){
      const message=error?.name==='AbortError'?`timeout after ${REQUEST_TIMEOUT_MS/1000}s`:(error?.message||String(error));
      errors.push(`attempt ${attempt}: ${message}`);
      if(attempt<3)await sleep(900*attempt);
    }finally{clearTimeout(timer);}
  }
  throw new Error(`${label} fetch failed: ${errors.join(' | ')}`);
}

function decodeCsv(buffer){
  for(const encoding of ['utf-8','big5']){
    try{return new TextDecoder(encoding,{fatal:true}).decode(buffer).replace(/^\uFEFF/,'');}catch{}
  }
  throw new Error('Healthcare CSV is neither valid UTF-8 nor Big5');
}

function parseCsv(text){
  const rows=[];let row=[];let cell='';let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"')quoted=false;
      else cell+=ch;
      continue;
    }
    if(ch==='"'){quoted=true;continue;}
    if(ch===','){row.push(cell);cell='';continue;}
    if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';continue;}
    cell+=ch;
  }
  if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  return rows.filter(r=>r.some(v=>clean(v)));
}

const FIELD_ALIASES={
  name:['機構名稱','醫療機構名稱','名稱'],
  district:['行政區','行政區域','區別'],
  address:['地址','機構地址'],
  lng:['經度','longitude','lng','x'],
  lat:['緯度','latitude','lat','y'],
  category:['分類','類別','機構類別'],
  code:['機構代碼','醫事機構代碼','代碼','行政區域代碼']
};

function columnIndex(headers,aliases){
  const normalized=headers.map(normalizeHeader);
  for(const alias of aliases){const i=normalized.indexOf(normalizeHeader(alias));if(i>=0)return i;}
  return -1;
}
function number(value){const n=Number(clean(value).replace(/[^0-9+\-.eE]/g,''));return Number.isFinite(n)?n:null;}
function normalizeCoordinates(lngValue,latValue){
  let lng=number(lngValue),lat=number(latValue);
  if(lng===null||lat===null)return null;
  if(Math.abs(lng)<=90&&Math.abs(lat)>90)[lng,lat]=[lat,lng];
  if(!inTaipei(lng,lat))return null;
  return [lng,lat];
}

function rowsToFeatures(rows,source){
  if(rows.length<2)throw new Error(`${source.label} CSV has no data rows`);
  const headers=rows[0].map(clean);
  const idx={};for(const [key,aliases] of Object.entries(FIELD_ALIASES))idx[key]=columnIndex(headers,aliases);
  for(const required of ['name','address','lng','lat'])if(idx[required]<0)throw new Error(`${source.label} missing required column ${required}; headers=${headers.join('|')}`);
  const features=[];const seen=new Set();
  for(const row of rows.slice(1)){
    const name=clean(row[idx.name]);if(!name)continue;
    const coords=normalizeCoordinates(row[idx.lng],row[idx.lat]);if(!coords)continue;
    const district=idx.district>=0?clean(row[idx.district]):'';
    const address=clean(row[idx.address]);
    const key=`${source.kind}|${name}|${address}|${coords.map(v=>v.toFixed(6)).join(',')}`;
    if(seen.has(key))continue;seen.add(key);
    features.push({type:'Feature',geometry:{type:'Point',coordinates:coords},properties:{
      facility_type:source.kind,
      facility_type_zh:source.kind==='hospital'?'醫院':'診所',
      facility_name:name,
      district,
      address,
      category:idx.category>=0?clean(row[idx.category]):'',
      facility_code:idx.code>=0?clean(row[idx.code]):'',
      physical_campus:source.kind==='hospital',
      source:'臺北市政府衛生局開放資料',
      source_dataset_id:DATASET_ID,
      source_resource_id:source.rid
    }});
  }
  return {features,headers};
}

async function main(){
  await mkdir(outDir,{recursive:true});
  if(ifMissing&&await cacheIsCurrent()){
    console.log(`Taipei healthcare schema v${CACHE_SCHEMA_VERSION} cache found: ${outputPath}`);
    return;
  }
  if(ifMissing&&await exists(outputPath))console.log(`Healthcare cache is stale; rebuilding for physical-campus schema v${CACHE_SCHEMA_VERSION}…`);

  const rawFeatures=[];const auditSources=[];
  for(const source of SOURCES){
    const url=`${DOWNLOAD_BASE}${source.rid}`;
    console.log(`Downloading ${source.label}…`);
    const bytes=await fetchBytes(url,source.label);
    const parsed=rowsToFeatures(parseCsv(decodeCsv(bytes)),source);
    rawFeatures.push(...parsed.features);
    auditSources.push({kind:source.kind,label:source.label,rid:source.rid,source_url:url,source_sha256:sha256(bytes),row_count:parsed.features.length,headers:parsed.headers});
  }

  const rawHospitalRecords=rawFeatures.filter(f=>f.properties.facility_type==='hospital').length;
  const hospitalResourceId=SOURCES.find(source=>source.kind==='hospital').rid;
  const reconciled=reconcileHospitalCampuses(rawFeatures,{datasetId:DATASET_ID,hospitalResourceId});
  const allFeatures=reconciled.features;
  const hospitals=allFeatures.filter(f=>f.properties.facility_type==='hospital').length;
  const clinics=allFeatures.filter(f=>f.properties.facility_type==='clinic').length;
  if(rawHospitalRecords<30)throw new Error(`Raw hospital record count unexpectedly small: ${rawHospitalRecords}`);
  if(hospitals<30)throw new Error(`Physical hospital-site count unexpectedly small: ${hospitals}`);
  if(clinics<1700)throw new Error(`Clinic count unexpectedly small: ${clinics}`);

  const collection={type:'FeatureCollection',features:allFeatures};
  const audit={
    schema_version:CACHE_SCHEMA_VERSION,
    fetched_at:new Date().toISOString(),
    output_crs:'EPSG:4326',
    dataset_id:DATASET_ID,
    provider:'臺北市政府衛生局 + official physical-campus reconciliation',
    counts:{raw_hospital_records:rawHospitalRecords,hospital:hospitals,clinic:clinics,total:allFeatures.length},
    campus_reconciliation:reconciled.audit,
    sources:auditSources
  };
  await writeFile(outputPath,JSON.stringify(collection),'utf8');
  await writeFile(auditPath,JSON.stringify(audit,null,2)+'\n','utf8');
  console.log('Taipei healthcare local dataset: PASS');
  console.log(`  raw hospital records: ${rawHospitalRecords}`);
  console.log(`  physical hospital sites: ${hospitals}`);
  console.log(`  clinics: ${clinics}`);
  for(const item of reconciled.audit)console.log(`  reconciled ${item.parent_name}: ${item.replaced_raw_hospital_records} raw -> ${item.physical_campus_sites} physical sites`);
  console.log(`  total: ${allFeatures.length}`);
}

main().catch(error=>{console.error(`[ERROR] ${error?.stack||error}`);process.exitCode=1;});
