import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='public/maplibre-pmtiles-provider-spike.html';
const html=fs.readFileSync(path,'utf8');

const requiredExistingControls=[
  'id="basemapMap"',
  'id="basemapPhoto"',
  'id="toggleLocal"',
  'id="toggle3d"',
  'id="toggleTerrain"',
  'id="districtBtn"',
  'id="elementaryBtn"',
  'id="juniorBtn"',
  'id="schoolPointBtn"',
];
for(const token of requiredExistingControls)assert.ok(html.includes(token),`desktop integration lost existing control: ${token}`);

const summaryContracts=[
  'id="summaryBtn"',
  'id="summaryPanel"',
  "import('./buju-location-summary-v01.mjs')",
  "import('./buju-school-district-resolver-v01.mjs')",
  "fetch('./data/daily-life-poi/taipei-canonical-reconciled-v01.geojson')",
  "fetch('./generated/taipei_mrt_stations_official.geojson')",
  "fetch('./generated/taipei_healthcare_facilities.geojson')",
  "map.on('click'",
  'summaryMode',
  'great-circle distance',
  '不是步行距離',
  '目前只支援臺北市',
];
for(const token of summaryContracts)assert.ok(html.includes(token),`missing desktop Location Summary contract: ${token}`);

assert.ok(html.includes("summaryBtn.textContent=`📍 摘要 ${on?'ON':'OFF'}`"),'summary mode must have explicit ON/OFF state');
assert.ok(html.includes("if(!inTaipei(lng,lat))"),'desktop summary must reject unsupported geography before metric computation');
assert.ok(html.includes("summaryReady=false"),'summary bootstrap must be fail-soft and independent from the map');

console.log('PASS desktop Location Summary integration · existing controls preserved · fail-soft summary mode present');
