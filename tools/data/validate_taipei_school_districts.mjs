import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const datasetPath=path.resolve(here,'../../public/taipei-school-districts-115.js');
const source=fs.readFileSync(datasetPath,'utf8');
const context={window:{}};
vm.runInNewContext(source,context,{filename:datasetPath});

const dataset=context.window.TaipeiMapsSchoolDistrictData115;
if(!dataset)throw new Error('Dataset did not register TaipeiMapsSchoolDistrictData115');
if(dataset.academicYear!==115)throw new Error(`Expected academicYear 115, got ${dataset.academicYear}`);

const districts=dataset.coverage?.districts||[];
if(!districts.length)throw new Error('coverage.districts is empty');
if(new Set(districts).size!==districts.length)throw new Error('coverage.districts contains duplicates');

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
  let whole=0,split=0,rules=0;
  const districtCounts=Object.fromEntries(districts.map(d=>[d,0]));

  for(const [key,entry] of Object.entries(table)){
    const [district,village,...rest]=key.split('|');
    if(!district||!village||rest.length)throw new Error(`${level}: invalid key ${key}`);
    if(!districts.includes(district))throw new Error(`${level}: ${key} lies outside declared coverage`);
    districtCounts[district]++;

    const hasAll=typeof entry?.all==='string'&&entry.all.trim();
    const hasRules=Array.isArray(entry?.rules)&&entry.rules.length>0;
    if(Boolean(hasAll)===Boolean(hasRules))throw new Error(`${level}: ${key} must have exactly one of all/rules`);

    if(hasAll){whole++;continue;}
    split++;
    const occupied=new Set();
    for(const rule of entry.rules){
      if(typeof rule?.school!=='string'||!rule.school.trim())throw new Error(`${level}: ${key} has empty school`);
      const neighbors=parseSpec(rule.spec);
      if(!neighbors.size)throw new Error(`${level}: ${key} has empty neighbor spec`);
      rules++;
      for(const n of neighbors){
        if(occupied.has(n))throw new Error(`${level}: ${key} neighbor ${n} appears in multiple rules`);
        occupied.add(n);
      }
    }
  }

  for(const [district,count] of Object.entries(districtCounts))if(!count)throw new Error(`${level}: declared coverage district ${district} has no assignments`);
  summary[level]={villages:Object.keys(table).length,whole,split,rules,districtCounts};
}

console.log(JSON.stringify({academicYear:dataset.academicYear,coverage:districts,summary},null,2));
