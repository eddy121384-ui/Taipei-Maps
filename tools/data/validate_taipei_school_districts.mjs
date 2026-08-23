import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const publicRoot=path.resolve(here,'../../public');
const bootstrapPath=path.join(publicRoot,'taipei-school-districts-115.js');
const guardPath=path.join(publicRoot,'school-district-data-guard.js');
const rendererPath=path.join(publicRoot,'school-district-layer.js');
const mobilePath=path.join(publicRoot,'mobile-preview.html');
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

function assignment(level,district,village,neighbor){
  const entry=dataset.levels?.[level]?.[`${district}|${village}`];
  if(!entry)return null;
  if(entry.all)return entry.all;
  return entry.rules?.find(rule=>parseSpec(rule.spec).has(neighbor))?.school||null;
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

// Content regressions: keep approved Daan/Xinyi pilot semantics identical while also
// pinning representative new Shilin/Beitou split rules. These catch a structurally
// complete 456-village dataset whose neighbor assignments are nevertheless wrong.
const regressions=[
  ['elementary','大安','義安',1,'仁愛'],
  ['elementary','大安','義安',3,'仁愛、建安共同學區'],
  ['elementary','大安','義安',8,'建安'],
  ['elementary','信義','三犁',17,'信義、吳興共同學區'],
  ['junior','大安','通安',1,'仁愛'],
  ['junior','大安','通安',4,'大安'],
  ['junior','信義','中興',4,'信義、仁愛共同學區'],
  ['elementary','士林','芝山',1,'陽明山、芝山共同學區'],
  ['elementary','士林','芝山',2,'雨聲、芝山共同學區'],
  ['junior','士林','社子',16,'陽明、福安共同學區'],
  ['elementary','北投','長安',10,'逸仙、北投共同學區'],
  ['junior','北投','中央',7,'北投、新民共同學區'],
];
for(const [level,district,village,neighbor,expected] of regressions){
  const actual=assignment(level,district,village,neighbor);
  if(actual!==expected)throw new Error(`Regression ${level} ${district}|${village} neighbor ${neighbor}: ${actual} != ${expected}`);
}

// Load the renderer without constructing a map so its pure geometry/assignment helpers
// can be regression-tested. Taipei's official neighbor layer can encode multiple neighbor
// numbers in one polygon (e.g. 富台里 LI_NO="012,018").
runFile(rendererPath);
const renderer=context.window.TaipeiMapsSchoolDistrictLayer;
if(!renderer)throw new Error('school-district-layer.js did not register runtime helpers');
const parsedMulti=renderer.neighborNos('012,018');
if(JSON.stringify(parsedMulti)!==JSON.stringify([12,18]))throw new Error(`Multi-neighbor parse regression: ${JSON.stringify(parsedMulti)}`);
const futaiElementary=renderer.assignmentForNeighbors('elementary','信義','富台',[12,18]);
if(futaiElementary!=='雙永')throw new Error(`富台 12/18 elementary multi-neighbor assignment regression: ${futaiElementary}`);
const futaiJunior=renderer.assignmentForNeighbors('junior','信義','富台',[12,18]);
if(futaiJunior!=='興雅')throw new Error(`富台 12/18 junior multi-neighbor assignment regression: ${futaiJunior}`);

// The browser must use the same fail-closed order the validator just exercised:
// bootstrap -> every declared district shard -> guard -> renderer.
const mobile=fs.readFileSync(mobilePath,'utf8');
const scripts=[
  './taipei-school-districts-115.js',
  ...districts.map(d=>`./school-districts-115/${d}.js`),
  './school-district-data-guard.js',
  './school-district-layer.js',
];
let previous=-1;
for(const script of scripts){
  const index=mobile.indexOf(`src="${script}"`);
  if(index<0)throw new Error(`mobile-preview.html does not load ${script}`);
  if(index<=previous)throw new Error(`mobile-preview.html school script load order is invalid at ${script}`);
  previous=index;
}

console.log(JSON.stringify({academicYear:dataset.academicYear,coverage:districts,runtimeGuard:'PASS',assignmentRegressions:regressions.length,multiNeighborRuntime:'PASS',mobileLoadOrder:'PASS',summary},null,2));
