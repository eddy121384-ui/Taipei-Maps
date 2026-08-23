import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const publicRoot=path.resolve(here,'../../public');
const bootstrapPath=path.join(publicRoot,'taipei-school-districts-115.js');
const guardPath=path.join(publicRoot,'school-district-data-guard.js');
const context={window:{},console};

function runFile(filePath){
  if(!fs.existsSync(filePath))throw new Error(`Missing runtime file: ${path.relative(publicRoot,filePath)}`);
  vm.runInNewContext(fs.readFileSync(filePath,'utf8'),context,{filename:filePath});
}

runFile(bootstrapPath);
let dataset=context.window.TaipeiMapsSchoolDistrictData115;
if(!dataset)throw new Error('Dataset bootstrap did not register TaipeiMapsSchoolDistrictData115');
if(dataset.academicYear!==115)throw new Error(`Expected academicYear 115, got ${dataset.academicYear}`);

const districts=dataset.coverage?.districts||[];
if(districts.length!==12)throw new Error(`Expected 12 coverage districts, got ${districts.length}`);
if(new Set(districts).size!==districts.length)throw new Error('coverage.districts contains duplicates');

for(const district of districts)runFile(path.join(publicRoot,'school-districts-115',`${district}.js`));
runFile(guardPath);
if(!context.window.TaipeiMapsSchoolDistrictDataReady){
  throw new Error(context.window.TaipeiMapsSchoolDistrictDataError||'Runtime data guard did not mark dataset ready');
}
dataset=context.window.TaipeiMapsSchoolDistrictData115;
if(!dataset)throw new Error('Runtime data guard removed dataset unexpectedly');

function parseSpec(spec){
  const out=new Set();
  for(const token of String(spec||'').replace(/、/g,',').split(',').map(s=>s.trim()).filter(Boolean)){
    const range=token.match(/^(\d+)\s*-\s*(\d+)$/);
    if(range){
      const start=Number(range[1]),end=Number(range[2]);
      if(start>end)throw new Error(`Descending neighbor range: ${token}`);
      for(let n=start;n<=end;n++)out.add(n);
    }else if(/^\d+$/.test(token))out.add(Number(token));
    else throw new Error(`Invalid neighbor token: ${token}`);
  }
  return out;
}

const summary={};
for(const level of ['elementary','junior']){
  const table=dataset.levels?.[level];
  if(!table||typeof table!=='object')throw new Error(`Missing level table: ${level}`);
  let whole=0,split=0,rules=0,notes=0;
  const districtCounts=Object.fromEntries(districts.map(d=>[d,0]));

  for(const [key,entry] of Object.entries(table)){
    const [district,village,...rest]=key.split('|');
    if(!district||!village||rest.length)throw new Error(`${level}: invalid key ${key}`);
    if(!districts.includes(district))throw new Error(`${level}: ${key} lies outside declared coverage`);
    districtCounts[district]++;

    const hasAll=typeof entry?.all==='string'&&entry.all.trim();
    const hasRules=Array.isArray(entry?.rules)&&entry.rules.length>0;
    if(Boolean(hasAll)===Boolean(hasRules))throw new Error(`${level}: ${key} must have exactly one of all/rules`);

    if(hasAll){
      whole++;
      if(entry.note)notes++;
      continue;
    }
    split++;
    const occupied=new Set();
    for(const rule of entry.rules){
      if(typeof rule?.school!=='string'||!rule.school.trim())throw new Error(`${level}: ${key} has empty school`);
      const neighbors=parseSpec(rule.spec);
      if(!neighbors.size)throw new Error(`${level}: ${key} has empty neighbor spec`);
      rules++;
      if(rule.note)notes++;
      for(const n of neighbors){
        if(occupied.has(n))throw new Error(`${level}: ${key} neighbor ${n} appears in multiple rules`);
        occupied.add(n);
      }
    }
  }

  const actual={villages:Object.keys(table).length,whole,split,rules,notes,districtCounts};
  const expected=dataset.generated?.validation?.[level];
  if(!expected)throw new Error(`${level}: generated validation metadata missing`);
  for(const metric of ['villages','whole','split','rules','notes']){
    if(actual[metric]!==expected[metric])throw new Error(`${level}: ${metric} ${actual[metric]} != expected ${expected[metric]}`);
  }
  for(const district of districts){
    if(actual.districtCounts[district]!==expected.districtCounts?.[district]){
      throw new Error(`${level}: ${district} villages ${actual.districtCounts[district]} != expected ${expected.districtCounts?.[district]}`);
    }
  }
  summary[level]=actual;
}

const elementaryVillages=new Set(Object.keys(dataset.levels.elementary));
const juniorVillages=new Set(Object.keys(dataset.levels.junior));
const onlyElementary=[...elementaryVillages].filter(k=>!juniorVillages.has(k));
const onlyJunior=[...juniorVillages].filter(k=>!elementaryVillages.has(k));
if(onlyElementary.length||onlyJunior.length){
  throw new Error(`Village-set mismatch: elementary-only=${onlyElementary.join(',')} junior-only=${onlyJunior.join(',')}`);
}

console.log(JSON.stringify({academicYear:dataset.academicYear,coverage:districts,runtimeGuard:'PASS',summary},null,2));
