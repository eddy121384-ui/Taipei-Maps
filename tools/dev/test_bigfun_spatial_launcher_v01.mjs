import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const launcher=fs.readFileSync('public/bigfun-spatial-launcher-v01.js','utf8');
const desktop=fs.readFileSync('public/maplibre-pmtiles-provider-spike.html','utf8');
const mobile=fs.readFileSync('public/mobile-school-inventory-v04.html','utf8');
const smoke=fs.readFileSync('start-map-radius-inventory-smoke.bat','utf8');

for(const token of [
  "const BIGFUN_MAP_BASE='https://www.ibigfun.com/map/latest'",
  "url.searchParams.set('lat'",
  "url.searchParams.set('lng'",
  "window.open(url,'_blank','noopener,noreferrer')",
  '🔎 BigFun 搜這附近',
  '只會開啟 BigFun 同座標頁面，不會從 BigFun 抓取資料',
  '目前只帶圓心'
])assert.ok(launcher.includes(token),`BigFun launcher contract missing: ${token}`);

assert.ok(!launcher.includes('fetch('),'BigFun launcher v0.1 must not fetch BigFun content');
assert.ok(!launcher.includes('XMLHttpRequest'),'BigFun launcher v0.1 must not use XHR');
assert.ok(desktop.includes('./bigfun-spatial-launcher-v01.js'),'desktop must load BigFun spatial launcher');
assert.ok(mobile.includes('/public/bigfun-spatial-launcher-v01.js'),'mobile must load BigFun spatial launcher');
assert.ok(smoke.includes('test_bigfun_spatial_launcher_v01.mjs'),'desktop smoke must validate BigFun launcher');

execFileSync(process.execPath,['--check','public/bigfun-spatial-launcher-v01.js'],{stdio:'pipe'});
console.log('PASS BigFun spatial launcher v0.1 · lat/lng deep-link only · no BigFun data fetch');
