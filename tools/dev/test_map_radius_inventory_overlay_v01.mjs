import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const mobileHtml=fs.readFileSync('public/mobile-school-inventory-v04.html','utf8');
const desktopHtml=fs.readFileSync('public/maplibre-pmtiles-provider-spike.html','utf8');
const mobile=fs.readFileSync('public/radius-inventory-mobile-v01.js','utf8');
const desktop=fs.readFileSync('public/radius-inventory-desktop-v01.js','utf8');

assert.ok(mobileHtml.includes('window.__taipeiMapsMobileMap=map'),'mobile map bridge missing');
assert.ok(mobileHtml.includes('radius-inventory-mobile-v01.js'),'mobile radius overlay loader missing');
assert.ok(mobileHtml.includes("map.on('click','school-catchment-fill'"),'existing mobile school click flow must remain');
assert.ok(desktopHtml.includes('radius-inventory-desktop-v01.js'),'desktop radius overlay loader missing');
assert.ok(desktopHtml.includes('inventory-prototype-v01.js'),'existing desktop school inventory loader must remain');

for(const token of ['#75 · MAP RADIUS INVENTORY v0.1','nearbyBtn','data-radius="300"','data-radius="500"','data-radius="1000"','data-radius="2000"','queryRadiusHomes','radiusCoverage','radiusCircleFeature','目前可定位','未定位候選','setCenter','mobile-radius-inventory-v01'])assert.ok(mobile.includes(token),`mobile overlay missing ${token}`);
for(const token of ['#75 · MAP RADIUS INVENTORY v0.1','nearbyInventoryBtn','data-radius="1000"','queryRadiusHomes','radiusCoverage','radiusCircleFeature','定位覆蓋','setCenter','desktop-radius-inventory-v01'])assert.ok(desktop.includes(token),`desktop overlay missing ${token}`);
assert.ok(mobile.includes('includeLocationCandidates:false'),'mobile radius search must exclude unlocated candidates');
assert.ok(desktop.includes('includeLocationCandidates:false'),'desktop radius search must exclude unlocated candidates');
assert.ok(mobile.includes("queryRenderedFeatures(e.point,{layers})"),'mobile must avoid consuming school-polygon click as radius point');
assert.ok(desktop.includes("queryRenderedFeatures(e.point,{layers})"),'desktop must avoid consuming school-polygon click as radius point');

execFileSync(process.execPath,['--check','public/radius-inventory-mobile-v01.js'],{stdio:'pipe'});
execFileSync(process.execPath,['--check','public/radius-inventory-desktop-v01.js'],{stdio:'pipe'});
execFileSync(process.execPath,['--check','public/inventory-spatial-core-v01.mjs'],{stdio:'pipe'});

console.log('PASS map radius inventory overlay v0.1 · mobile+desktop loaders · static semantics · syntax');
