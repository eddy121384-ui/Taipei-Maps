import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const publicRoot=path.resolve(here,'../../public');
const context={window:{},console};

function runFile(filePath){
  if(!fs.existsSync(filePath))throw new Error(`Missing runtime file: ${path.relative(publicRoot,filePath)}`);
  vm.runInNewContext(fs.readFileSync(filePath,'utf8'),context,{filename:filePath});
}

runFile(path.join(publicRoot,'taipei-school-districts-115.js'));
let dataset=context.window.TaipeiMapsSchoolDistrictData115;
if(!dataset)throw new Error('School-district bootstrap missing');
const districts=dataset.coverage?.districts||[];
for(const district of districts)runFile(path.join(publicRoot,'school-districts-115',`${district}.js`));
dataset=context.window.TaipeiMapsSchoolDistrictData115;

const endpoint=dataset.sources?.geometry?.endpoint;
if(!endpoint)throw new Error('Official neighbor geometry endpoint missing from dataset metadata');

function cleanDistrict(value){return String(value||'').trim().replace(/市$/,'').replace(/區$/,'');}
function cleanVillage(value){return String(value||'').trim().replace(/里$/,'');}
function neighborNos(value){
  return [...new Set((String(value??'').match(/\d+/g)||[]).map(Number).filter(Number.isFinite))];
}

function expandSpec(spec){
  const out=new Set();
  for(const token of String(spec||'').replace(/、/g,',').split(',').map(s=>s.trim()).filter(Boolean)){
    const range=token.match(/^(\d+)\s*-\s*(\d+)$/);
    if(range){for(let n=Number(range[1]);n<=Number(range[2]);n++)out.add(n);}
    else if(/^\d+$/.test(token))out.add(Number(token));
    else throw new Error(`Invalid neighbor token: ${token}`);
  }
  return out;
}

function schoolFor(level,key,neighbor){
  const entry=dataset.levels?.[level]?.[key];
  if(!entry)return null;
  if(entry.all)return entry.all;
  return (entry.rules||[]).find(rule=>expandSpec(rule.spec).has(neighbor))?.school||null;
}

async function fetchPage(offset){
  const params=new URLSearchParams({
    where:`SECT_NAME IN (${districts.map(d=>`'${d}區'`).join(',')})`,
    outFields:'f_id,SECT_NAME,SECT_CODE,LIE_NAME,LIE_CODE,LI_NO,SDFKEY,SDFNAME',
    orderByFields:'f_id ASC',
    returnGeometry:'false',
    resultOffset:String(offset),
    resultRecordCount:'1000',
    f:'json',
  });
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetch(`${endpoint}?${params}`,{signal:controller.signal,headers:{'User-Agent':'Taipei-Maps school-district geometry validator'}});
    if(!response.ok)throw new Error(`Official neighbor API HTTP ${response.status}`);
    const payload=await response.json();
    if(payload?.error)throw new Error(`Official neighbor API error ${JSON.stringify(payload.error)}`);
    if(!Array.isArray(payload?.features))throw new Error('Official neighbor API response has no features array');
    return payload;
  }finally{clearTimeout(timer);}
}

const geometry=new Map();
const details=new Map();
const objectIds=new Set();
let offset=0,pages=0,featureCount=0,multiNeighborFeatures=0;
while(true){
  const payload=await fetchPage(offset);
  pages++;
  const features=payload.features||[];
  for(const feature of features){
    const p=feature.attributes||feature.properties||{};
    if(p.f_id!=null){
      const id=String(p.f_id);
      if(objectIds.has(id))throw new Error(`Official neighbor API pagination duplicated f_id ${id}`);
      objectIds.add(id);
    }
    const district=cleanDistrict(p.SECT_NAME),village=cleanVillage(p.LIE_NAME),neighbors=neighborNos(p.LI_NO);
    if(!districts.includes(district)||!village||!neighbors.length)continue;
    const key=`${district}|${village}`;
    if(!geometry.has(key))geometry.set(key,new Set());
    if(!details.has(key))details.set(key,[]);
    for(const neighbor of neighbors)geometry.get(key).add(neighbor);
    const record={
      f_id:p.f_id??null,
      LI_NO:p.LI_NO??null,
      neighbors,
      LIE_CODE:p.LIE_CODE??null,
      SDFKEY:p.SDFKEY??null,
      SDFNAME:p.SDFNAME??null,
    };
    details.get(key).push(record);
    if(neighbors.length>1){
      multiNeighborFeatures++;
      for(const level of ['elementary','junior']){
        const schools=neighbors.map(neighbor=>schoolFor(level,key,neighbor));
        const unique=[...new Set(schools)];
        if(unique.length!==1||unique[0]==null){
          throw new Error(`${level} ${key} multi-neighbor geometry ${JSON.stringify(record)} cannot be represented by one exact catchment assignment; assignments=${JSON.stringify(schools)}`);
        }
      }
    }
    featureCount++;
  }
  offset+=features.length;
  if(!payload.exceededTransferLimit&&features.length<1000)break;
  if(!features.length)break;
  if(pages>30)throw new Error('Official neighbor API pagination guard exceeded 30 pages');
}

const assignmentKeys=new Set([
  ...Object.keys(dataset.levels.elementary||{}),
  ...Object.keys(dataset.levels.junior||{}),
]);
const missingVillages=[...assignmentKeys].filter(key=>!geometry.has(key)).sort();
if(missingVillages.length)throw new Error(`Official geometry missing ${missingVillages.length} assignment villages: ${missingVillages.slice(0,30).join(', ')}`);

let splitVillageChecks=0,neighborChecks=0;
for(const level of ['elementary','junior']){
  for(const [key,entry] of Object.entries(dataset.levels[level]||{})){
    if(!Array.isArray(entry?.rules))continue;
    splitVillageChecks++;
    const available=geometry.get(key)||new Set();
    for(const rule of entry.rules){
      for(const neighbor of expandSpec(rule.spec)){
        neighborChecks++;
        if(!available.has(neighbor)){
          const records=(details.get(key)||[]).sort((a,b)=>(a.neighbors[0]??0)-(b.neighbors[0]??0));
          throw new Error(`${level} ${key} assignment references neighbor ${neighbor}, absent from official geometry; available=${[...available].sort((a,b)=>a-b).join(',')}; records=${JSON.stringify(records)}`);
        }
      }
    }
  }
}

const unassignedGeometry=[];
for(const [key,neighbors] of geometry){
  for(const level of ['elementary','junior']){
    for(const neighbor of neighbors){
      if(!schoolFor(level,key,neighbor))unassignedGeometry.push({level,key,neighbor});
    }
  }
}

console.log(JSON.stringify({
  geometryJoin:'PASS',
  endpoint,
  pages,
  uniqueObjectIds:objectIds.size,
  officialNeighborFeatures:featureCount,
  multiNeighborFeatures,
  geometryVillages:geometry.size,
  assignmentVillages:assignmentKeys.size,
  splitVillageChecks,
  assignedNeighborChecks:neighborChecks,
  unassignedGeometryCount:unassignedGeometry.length,
  unassignedGeometry:unassignedGeometry.slice(0,100),
},null,2));
