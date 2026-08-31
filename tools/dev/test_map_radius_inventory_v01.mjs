import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const mobileShell=fs.readFileSync('public/mobile-school-inventory-v04.html','utf8');
const desktopShell=fs.readFileSync('public/maplibre-pmtiles-provider-spike.html','utf8');
const mobileOverlay=fs.readFileSync('public/radius-inventory-mobile-v01.js','utf8');
const desktopOverlay=fs.readFileSync('public/radius-inventory-desktop-v01.js','utf8');

// The committed architecture is intentionally overlay-based: the existing
// school inventory shells expose their map instance and load a separate radius
// module. Do not require generated radius markup to be inlined into the shell.
// Mobile may load the overlay from a pinned jsDelivr URL for Safari/Vercel
// compatibility, so lock the module filename rather than one specific URL form.
for(const token of [
  'window.__taipeiMapsMobileMap=map',
  'radius-inventory-mobile-v01.js',
  "map.on('click','school-catchment-fill'"
])assert.ok(mobileShell.includes(token),`mobile radius loader contract missing: ${token}`);

for(const token of [
  'window.__taipeiMapsDesktopMap=map',
  './radius-inventory-desktop-v01.js',
  './inventory-prototype-v01.js'
])assert.ok(desktopShell.includes(token),`desktop radius loader contract missing: ${token}`);

for(const token of [
  '#75 · MAP RADIUS INVENTORY v0.1',
  "nearbyBtn.id='nearbyBtn'",
  'data-radius="300"','data-radius="500"','data-radius="1000"','data-radius="2000"',
  'queryRadiusHomes','radiusCoverage','radiusCircleFeature',
  'mobile-radius-inventory-v01',
  '目前可定位',
  'includeLocationCandidates:false',
  "map.queryRenderedFeatures(e.point,{layers})"
])assert.ok(mobileOverlay.includes(token),`mobile radius overlay contract missing: ${token}`);

for(const token of [
  '#75 · MAP RADIUS INVENTORY v0.1',
  "nearbyBtn.id='nearbyInventoryBtn'",
  'data-radius="300"','data-radius="500"','data-radius="1000"','data-radius="2000"',
  'queryRadiusHomes','radiusCoverage','radiusCircleFeature',
  'desktop-radius-inventory-v01',
  '定位覆蓋',
  'includeLocationCandidates:false',
  "map.queryRenderedFeatures(e.point,{layers})"
])assert.ok(desktopOverlay.includes(token),`desktop radius overlay contract missing: ${token}`);

// Radius mode and the existing Inventory / Location Summary panels must remain
// mutually exclusive on desktop.
assert.ok(desktopOverlay.includes("if(summaryBtn?.classList.contains('active'))summaryBtn.click()"),'desktop radius must close Location Summary');
assert.ok(desktopOverlay.includes("if(inventoryBtn?.classList.contains('active'))inventoryBtn.click()"),'desktop radius must close school Inventory');

for(const file of [
  'public/inventory-spatial-core-v01.mjs',
  'public/radius-inventory-mobile-v01.js',
  'public/radius-inventory-desktop-v01.js'
])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});

console.log('PASS map radius inventory v0.1 · committed overlay loaders + mobile/desktop contracts · module syntax');
