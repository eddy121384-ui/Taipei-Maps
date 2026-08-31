import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const mobile=fs.readFileSync('public/mobile-school-inventory-v04.html','utf8');
const desktop=fs.readFileSync('public/inventory-prototype-v01.js','utf8');

for(const token of [
  '#75 · RADIUS INVENTORY v0.1','id="nearbyBtn"','id="radiusControls"','data-radius="300"','data-radius="500"','data-radius="1000"','data-radius="2000"',
  'queryRadiusHomes','radiusCoverage','radiusCircleFeature',"spatialMode='radius'",'chooseRadius','enterRadiusMode','inventory-radius-v01',
  '目前可定位','半徑搜尋只涵蓋可信座標房源',"map.on('click','school-catchment-fill'"
])assert.ok(mobile.includes(token),`mobile radius contract missing: ${token}`);
assert.ok(mobile.includes("if(!inventoryOn||spatialMode!=='radius')return"),'generic map click must only drive radius mode');
assert.ok(mobile.includes("queryRenderedFeatures(e.point,{layers})"),'school polygon click must not be double-consumed as radius center');
assert.ok(mobile.includes("includeLocationCandidates:false"),'radius query must not include unlocated homes');
assert.ok(mobile.includes("spatialMode='school'"),'school selector must explicitly restore school mode');

for(const token of [
  "from './inventory-spatial-core-v01.mjs'",'nearbyInventoryBtn','inventoryRadiusControls','data-radius="1000"','queryRadiusHomes','radiusCoverage','radiusCircleFeature',
  "spatialMode='radius'",'chooseRadius','desktop-inventory-radius-v01','定位覆蓋'
])assert.ok(desktop.includes(token),`desktop radius contract missing: ${token}`);
assert.ok(desktop.includes("includeLocationCandidates:false"),'desktop radius query must exclude unlocated homes');
assert.ok(desktop.includes("selectFromOfficialAssignment"),'desktop school map-first selection must remain');
assert.ok(desktop.includes("if(p.level!=='junior')return"),'desktop school click must remain junior-only');

const match=mobile.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(match,'mobile module script missing');
const temp=path.join(os.tmpdir(),`taipei-radius-${process.pid}.mjs`);
fs.writeFileSync(temp,match[1]);
try{execFileSync(process.execPath,['--check',temp],{stdio:'pipe'});}finally{fs.rmSync(temp,{force:true});}
execFileSync(process.execPath,['--check','public/inventory-prototype-v01.js'],{stdio:'pipe'});

console.log('PASS map radius inventory v0.1 · mobile+desktop static contract · module syntax');
