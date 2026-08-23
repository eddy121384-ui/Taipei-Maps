import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const publicRoot=path.resolve(here,'../../public');
const reconciliationPath=path.join(here,'taipei-school-district-geometry-reconciliations.json');
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

const reconciliation=JSON.parse(fs.readFileSync(reconciliationPath,'utf8'));
if(reconciliation.academicYear!==dataset.academicYear){
  throw new Error(`Geometry reconciliation academicYear ${reconciliation.academicYear} != dataset ${dataset.academicYear}`);
}
const mergeMap=new Map();
for(const merge of reconciliation.merges||[]){
  const key=`${merge.district}|${merge.village}|${merge.retiredNeighbor}`;
  if(mergeMap.has(key))throw new Error(`Duplicate geometry reconciliation ${key}`);
  mergeMap.set(key,merge);
}
const emptyNeighborMap=new Map();
for(const empty of reconciliation.emptyNeighbors||[]){
  const key=`${empty.district}|${empty.village}|${empty.neighbor}`;
  if(emptyNeighborMap.has(key))throw new Error(`Duplicate empty-neighbor reconciliation ${key}`);
  if(mergeMap.has(key))throw new Error(`Neighbor ${key} cannot be both merged and empty`);
  emptyNeighborMap.set(key,empty);
}

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

let reconciliationLevelChecks=0;
for(const merge of reconciliation.merges||[]){
  const key=`${merge.district}|${merge.village}`;
  const available=geometry.get(key)||new Set();
  if(available.has(merge.retiredNeighbor)){
    throw new Error(`Stale geometry reconciliation ${key} retired neighbor ${merge.retiredNeighbor} is present again; re-audit source history`);
  }
  if(!available.has(merge.mergedInto)){
    throw new Error(`Geometry reconciliation ${key} target neighbor ${merge.mergedInto} is absent`);
  }
  for(const level of ['elementary','junior']){
    const retiredSchool=schoolFor(level,key,merge.retiredNeighbor);
    if(retiredSchool==null)continue;
    const targetSchool=schoolFor(level,key,merge.mergedInto);
    if(targetSchool!==retiredSchool){
      throw new Error(`${level} ${key} historical merge ${merge.retiredNeighbor}->${merge.mergedInto} changes catchment ${retiredSchool} -> ${targetSchool}; exact polygon reconciliation is unsafe`);
    }
    reconciliationLevelChecks++;
  }
}
for(const empty of reconciliation.emptyNeighbors||[]){
  const key=`${empty.district}|${empty.village}`;
  const available=geometry.get(key)||new Set();
  if(available.has(empty.neighbor)){
    throw new Error(`Stale empty-neighbor reconciliation ${key} neighbor ${empty.neighbor} now has geometry; re-audit before drawing it`);
  }
  if(!schoolFor('elementary',key,empty.neighbor)&&!schoolFor('junior',key,empty.neighbor)){
    throw new Error(`Empty-neighbor reconciliation ${key} neighbor ${empty.neighbor} is no longer referenced by either assignment level`);
  }
}

let splitVillageChecks=0,neighborChecks=0,reconciledAssignmentRefs=0,emptyAssignmentRefs=0;
const missingAssignmentGeometry=[];
for(const level of ['elementary','junior']){
  for(const [key,entry] of Object.entries(dataset.levels[level]||{})){
    if(!Array.isArray(entry?.rules))continue;
    splitVillageChecks++;
    const available=geometry.get(key)||new Set();
    for(const rule of entry.rules){
      for(const neighbor of expandSpec(rule.spec)){
        neighborChecks++;
        if(available.has(neighbor))continue;
        const merge=mergeMap.get(`${key}|${neighbor}`);
        if(merge){
          const targetSchool=schoolFor(level,key,merge.mergedInto);
          if(targetSchool!==rule.school){
            throw new Error(`${level} ${key} reconciliation ${neighbor}->${merge.mergedInto} does not preserve school ${rule.school}`);
          }
          reconciledAssignmentRefs++;
          continue;
        }
        if(emptyNeighborMap.has(`${key}|${neighbor}`)){
          emptyAssignmentRefs++;
          continue;
        }
        missingAssignmentGeometry.push({
          level,key,neighbor,school:rule.school,
          available:[...available].sort((a,b)=>a-b),
        });
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

if(missingAssignmentGeometry.length||unassignedGeometry.length){
  const report={
    geometryJoin:'FAIL',
    missingAssignmentGeometryCount:missingAssignmentGeometry.length,
    missingAssignmentGeometry,
    unassignedGeometryCount:unassignedGeometry.length,
    unassignedGeometry,
    auditedHistoricalMerges:(reconciliation.merges||[]).length,
    auditedEmptyNeighbors:(reconciliation.emptyNeighbors||[]).length,
    reconciledAssignmentRefs,
    emptyAssignmentRefs,
  };
  throw new Error(`School assignment / current geometry discrepancies remain:\n${JSON.stringify(report,null,2)}`);
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
  auditedHistoricalMerges:(reconciliation.merges||[]).length,
  auditedEmptyNeighbors:(reconciliation.emptyNeighbors||[]).length,
  reconciliationLevelChecks,
  reconciledAssignmentRefs,
  emptyAssignmentRefs,
  missingAssignmentGeometryCount:0,
  unassignedGeometryCount:0,
},null,2));
