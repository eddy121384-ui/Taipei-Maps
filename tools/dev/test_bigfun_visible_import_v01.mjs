import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {extractBigFunAddressText,parseVisibleListingText,normalizeBigFunVisibleExport,toTemporaryInventoryHomes} from '../../public/bigfun-visible-import-core-v01.mjs';
import {normalizeTaipeiAddressForGeocode,isTaipeiCoordinate} from '../../public/bigfun-address-geocode-v01.mjs';

const parsed=parseVisibleListingText(`大安森林公園旁三房\n總價 3,680 萬\n35.6坪 · 42年 · 3房2廳\n相關地址 台北市大安區新生南路二段86號4樓之2 調電傳 地圖歷`);
assert.equal(parsed.asking_wan,3680);
assert.equal(parsed.total_ping,35.6);
assert.equal(parsed.age_years,42);
assert.equal(parsed.bedrooms,3);
assert.equal(parsed.address_text,'台北市大安區新生南路二段86號4樓之2');
assert.equal(extractBigFunAddressText('591 $1,498萬 相關地址 台北市大安區杭州南路一段61巷38號4樓之2 調電傳 地圖歷'),'台北市大安區杭州南路一段61巷38號4樓之2');
assert.equal(normalizeTaipeiAddressForGeocode('臺北市大安區杭州南路一段61巷38號4樓之2'),'台北市大安區杭州南路一段61巷38號');
assert.ok(isTaipeiCoordinate(25.03,121.53));
assert.ok(!isTaipeiCoordinate(0,0));

const payload=normalizeBigFunVisibleExport({items:[
  {visible_text:'測試屋 2,980萬 28.5坪 2房 相關地址 台北市大安區和平東路二段10號 調電傳',source_url:'https://www.ibigfun.com/example/1',address_text:'台北市大安區和平東路二段10號'},
  {visible_text:'測試屋 2,980萬 28.5坪 2房 相關地址 台北市大安區和平東路二段10號 調電傳',source_url:'https://www.ibigfun.com/example/1',address_text:'台北市大安區和平東路二段10號'},
  {visible_text:'另一戶 4,200萬 41坪 40年 3房',source_url:'https://www.ibigfun.com/example/2',lat:25.03,lon:121.53}
]});
assert.equal(payload.count,2,'duplicate visible rows should collapse by source identity');
assert.equal(payload.schema,'buju.bigfun-visible.v0.3');
const homes=toTemporaryInventoryHomes(payload);
assert.equal(homes.length,2);
assert.equal(homes[0].verification_status,'insufficient_location');
assert.equal(homes[0].address_text,'台北市大安區和平東路二段10號');
assert.ok(homes.every(x=>x.temporary_import&&x.research_only));
assert.equal(homes.filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)).length,1);

const helper=fs.readFileSync('tools/browser/bigfun-visible-helper-v01/content.js','utf8');
const importer=fs.readFileSync('public/bigfun-visible-import-desktop-v01.js','utf8');
const geocoder=fs.readFileSync('public/bigfun-address-geocode-v01.mjs','utf8');
const manifest=fs.readFileSync('tools/browser/bigfun-visible-helper-v01/manifest.json','utf8');
const shell=fs.readFileSync('public/maplibre-pmtiles-provider-spike.html','utf8');

for(const token of ['📦 卜居收集籃','scanLoadedPage()','＋ 收集本頁','已收集','📦 下載全部 JSON','清空收集籃','buju.bigfun-visible.v0.3','localStorage','STORAGE_KEY','imageBackedCandidates()','address_text','extractAddress','pointermove'])assert.ok(helper.includes(token),`helper v0.3 contract missing: ${token}`);
for(const forbidden of ['fetch(','XMLHttpRequest','api_key','ospc_api','query_on_market_by_id'])assert.ok(!helper.includes(forbidden),`helper must not call/internalize BigFun endpoint: ${forbidden}`);
assert.ok(helper.includes("panel.querySelector('#bujuCollect').onclick=collectPage"),'collection must remain explicitly user-triggered');
assert.ok(helper.includes('left:18px;bottom:18px'),'collector launcher should stay away from BigFun right-side pagination');
assert.ok(helper.includes('cursor:move'),'collector panel should be draggable');
assert.ok(manifest.includes('https://www.ibigfun.com/*'),'extension must be scoped to BigFun');
assert.ok(manifest.includes('0.3.0'),'extension manifest should expose v0.3 collector');
assert.ok(!manifest.includes('"permissions"'),'collector should require no extension privileges');
for(const token of ['📥 BigFun JSON','sessionStorage','toTemporaryInventoryHomes','BigFun 相關地址','臺北市官方門牌座標','geocodeBigFunHomes','fitBounds','BIGFUN IMPORT v0.4'])assert.ok(importer.includes(token),`desktop importer contract missing: ${token}`);
for(const token of ['/__buju/taipei-doorplate','taipei-official-doorplate','CACHE_KEY','doorplate_index_missing'])assert.ok(geocoder.includes(token),`official doorplate locator guard missing: ${token}`);
for(const forbidden of ['nominatim.openstreetmap.org','ibigfun.com','api_key','ospc_api','query_on_market_by_id'])assert.ok(!geocoder.includes(forbidden),`address locator must not use external/internal listing geocoder: ${forbidden}`);
assert.ok(shell.includes('./bigfun-visible-import-desktop-v01.js'),'desktop shell must load BigFun importer');

for(const file of ['public/bigfun-visible-import-core-v01.mjs','public/bigfun-address-geocode-v01.mjs','public/bigfun-visible-import-desktop-v01.js','tools/browser/bigfun-visible-helper-v01/content.js','tools/data/taipei_doorplate_core_v01.mjs','tools/data/build_taipei_doorplate_index_v01.mjs','tools/dev/serve_single_engine_core.mjs','tools/research/apply_bigfun_visible_import_v01.mjs'])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
console.log('PASS BigFun collector v0.4 · loaded-page basket + preserved address + local Taipei official doorplate pins · no BigFun API');
