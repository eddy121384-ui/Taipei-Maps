import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const launcher=fs.readFileSync('public/bigfun-spatial-launcher-v01.js','utf8');
const desktop=fs.readFileSync('public/maplibre-pmtiles-provider-spike.html','utf8');
const mobile=fs.readFileSync('public/mobile-school-inventory-v04.html','utf8');
const smoke=fs.readFileSync('start-map-radius-inventory-smoke.bat','utf8');

for(const token of [
  "const BIGFUN_SEARCH_URL='https://www.ibigfun.com/Monitor'",
  '🔎 開 BigFun 找房比價',
  '📋 複製圓心座標',
  "window.open(BIGFUN_SEARCH_URL,'_blank','noopener,noreferrer')",
  '目前不會自動把座標送進 BigFun',
  'formatCenter',
  'navigator.clipboard?.writeText'
])assert.ok(launcher.includes(token),`BigFun launcher contract missing: ${token}`);

for(const forbidden of [
  '/map/latest',
  'query_on_market_by_id.php',
  'api_key',
  'api_id',
  "url.searchParams.set('lat'",
  "url.searchParams.set('lng'",
  'fetch(',
  'XMLHttpRequest'
])assert.ok(!launcher.includes(forbidden),`BigFun launcher must not contain internal/deep-fetch token: ${forbidden}`);

assert.ok(desktop.includes('./bigfun-spatial-launcher-v01.js'),'desktop must load BigFun spatial launcher');
assert.ok(mobile.includes('/public/bigfun-spatial-launcher-v01.js'),'mobile must load BigFun spatial launcher');
assert.ok(smoke.includes('test_bigfun_spatial_launcher_v01.mjs'),'desktop smoke must validate BigFun launcher');

execFileSync(process.execPath,['--check','public/bigfun-spatial-launcher-v01.js'],{stdio:'pipe'});
console.log('PASS BigFun spatial launcher v0.2 · official Monitor UI handoff + copy center · no internal endpoint / data fetch');
