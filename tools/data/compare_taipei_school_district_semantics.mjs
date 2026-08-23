import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(here,'../..');
const currentRoot=path.join(repoRoot,'public');
const generatedBootstrap=path.resolve(process.argv[2]||'/tmp/taipei-school-districts-115.js');
const generatedShardDir=path.resolve(process.argv[3]||'/tmp/school-districts-115');

function runFile(filePath,context){
  if(!fs.existsSync(filePath))throw new Error(`Missing file: ${filePath}`);
  vm.runInNewContext(fs.readFileSync(filePath,'utf8'),context,{filename:filePath});
}

function loadDataset(bootstrapPath,shardDir){
  const context={window:{},console};
  runFile(bootstrapPath,context);
  const bootstrap=context.window.TaipeiMapsSchoolDistrictData115;
  if(!bootstrap)throw new Error(`Dataset bootstrap missing: ${bootstrapPath}`);
  const districts=bootstrap.coverage?.districts||[];
  for(const district of districts)runFile(path.join(shardDir,`${district}.js`),context);
  return JSON.parse(JSON.stringify(context.window.TaipeiMapsSchoolDistrictData115));
}

function parseSpec(spec){
  const out=[];
  for(const token of String(spec||'').replace(/、/g,',').split(',').map(s=>s.trim()).filter(Boolean)){
    const range=token.match(/^(\d+)\s*-\s*(\d+)$/);
    if(range){for(let n=Number(range[1]);n<=Number(range[2]);n++)out.push(n);}
    else if(/^\d+$/.test(token))out.push(Number(token));
    else throw new Error(`Invalid neighbor token: ${token}`);
  }
  return out;
}

function semanticEntry(entry){
  if(entry?.all)return {mode:'all',school:entry.all,note:entry.note||''};
  const neighbors={};
  for(const rule of entry?.rules||[]){
    for(const neighbor of parseSpec(rule.spec)){
      if(neighbors[neighbor])throw new Error(`Duplicate neighbor ${neighbor} in ${JSON.stringify(entry)}`);
      neighbors[neighbor]={school:rule.school,note:rule.note||''};
    }
  }
  return {mode:'split',neighbors};
}

function firstDiff(a,b,pathLabel='root'){
  if(Object.is(a,b))return null;
  if(Array.isArray(a)||Array.isArray(b)){
    if(!Array.isArray(a)||!Array.isArray(b))return `${pathLabel}: array/type mismatch`;
    if(a.length!==b.length)return `${pathLabel}: array length ${a.length} != ${b.length}`;
    for(let i=0;i<a.length;i++){
      const diff=firstDiff(a[i],b[i],`${pathLabel}[${i}]`);
      if(diff)return diff;
    }
    return null;
  }
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    const aKeys=Object.keys(a).sort(),bKeys=Object.keys(b).sort();
    const keyDiff=firstDiff(aKeys,bKeys,`${pathLabel} keys`);
    if(keyDiff)return keyDiff;
    for(const key of aKeys){
      const diff=firstDiff(a[key],b[key],`${pathLabel}.${key}`);
      if(diff)return diff;
    }
    return null;
  }
  return `${pathLabel}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
}

const current=loadDataset(path.join(currentRoot,'taipei-school-districts-115.js'),path.join(currentRoot,'school-districts-115'));
const generated=loadDataset(generatedBootstrap,generatedShardDir);

for(const field of ['academicYear','jurisdiction']){
  if(current[field]!==generated[field])throw new Error(`${field}: ${current[field]} != ${generated[field]}`);
}
const coverageDiff=firstDiff(current.coverage,generated.coverage,'coverage');
if(coverageDiff)throw new Error(coverageDiff);

for(const level of ['elementary','junior']){
  const currentTable=current.levels[level],generatedTable=generated.levels[level];
  const keysDiff=firstDiff(Object.keys(currentTable).sort(),Object.keys(generatedTable).sort(),`${level} keys`);
  if(keysDiff)throw new Error(keysDiff);
  for(const key of Object.keys(generatedTable).sort()){
    const diff=firstDiff(semanticEntry(currentTable[key]),semanticEntry(generatedTable[key]),`${level}.${key}`);
    if(diff)throw new Error(diff);
  }
}

const currentSources={
  elementarySha:current.sources?.assignment?.elementary?.sha256,
  juniorSha:current.sources?.assignment?.junior?.sha256,
  geometryEndpoint:current.sources?.geometry?.endpoint,
};
const generatedSources={
  elementarySha:generated.sources?.assignment?.elementary?.sha256,
  juniorSha:generated.sources?.assignment?.junior?.sha256,
  geometryEndpoint:generated.sources?.geometry?.endpoint,
};
const sourceDiff=firstDiff(currentSources,generatedSources,'sources');
if(sourceDiff)throw new Error(sourceDiff);

console.log(JSON.stringify({semanticComparison:'PASS',academicYear:current.academicYear,elementaryVillages:Object.keys(current.levels.elementary).length,juniorVillages:Object.keys(current.levels.junior).length},null,2));
