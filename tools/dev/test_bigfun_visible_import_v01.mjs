import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {extractBigFunAddressText,extractBigFunListingLabel,parseVisibleListingText,normalizeBigFunVisibleExport,toTemporaryInventoryHomes} from '../../public/bigfun-visible-import-core-v01.mjs';
import {normalizeTaipeiAddressForGeocode,isTaipeiCoordinate,geocodeBigFunHomes} from '../../public/bigfun-address-geocode-v01.mjs';

const parsed=parseVisibleListingText(`大安森林公園旁三房\n總價 3,680 萬\n35.6坪 · 42年 · 3房2廳\n相關地址 台北市大安區新生南路二段86號4樓之2 調電傳 地圖歷`);
assert.equal(parsed.asking_wan,3680);
assert.equal(parsed.total_ping,35.6);
assert.equal(parsed.age_years,42);
assert.equal(parsed.bedrooms,3);
assert.equal(parsed.address_text,'台北市大安區新生南路二段86號4樓之2');
assert.equal(extractBigFunAddressText('591 $1,498萬 相關地址 台北市大安區杭州南路一段61巷38號4樓之2 調電傳 地圖歷'),'台北市大安區杭州南路一段61巷38號4樓之2');
assert.equal(extractBigFunListingLabel('永慶房屋 3,680萬 35.6坪'),'永慶房屋');
assert.equal(normalizeTaipeiAddressForGeocode('臺北市大安區杭州南路一段61巷38號4樓之2'),'台北市大安區杭州南路一段61巷38號');
assert.ok(isTaipeiCoordinate(25.03,121.53));
assert.ok(!isTaipeiCoordinate(0,0));

const payload=normalizeBigFunVisibleExport({items:[
  {visible_text:'測試屋 2,980萬 28.5坪 2房 相關地址 台北市大安區和平東路二段10號 調電傳',source_url:'https://www.ibigfun.com/example/1',address_text:'台北市大安區和平東路二段10號'},
  {visible_text:'測試屋 2,980萬 28.5坪 2房 相關地址 台北市大安區和平東路二段10號 調電傳',source_url:'https://www.ibigfun.com/example/1',address_text:'台北市大安區和平東路二段10號'},
  {visible_text:'另一戶 4,200萬 41坪 40年 3房',source_url:'https://www.ibigfun.com/example/2',lat:25.03,lon:121.53}
]});
assert.equal(payload.count,2,'duplicate visible rows should collapse by physical/source identity');
assert.equal(payload.schema,'buju.bigfun-visible.v0.3');
const homes=toTemporaryInventoryHomes(payload);
assert.equal(homes.length,2);
assert.equal(homes[0].verification_status,'insufficient_location');
assert.equal(homes[0].address_text,'台北市大安區和平東路二段10號');
assert.ok(homes.every(x=>x.temporary_import&&x.research_only));
assert.equal(homes.filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)).length,1);

const brokerDupes=normalizeBigFunVisibleExport({items:[
  {visible_text:'永慶房屋 3,680萬 35.6坪 3房 相關地址 台北市大安區新生南路二段86號4樓之2 調電傳',source_url:'https://www.ibigfun.com/broker/A',address_text:'台北市大安區新生南路二段86號4樓之2',lat:25.0401,lon:121.5301},
  {visible_text:'信義房屋 3,750萬 35.6坪 3房 相關地址 台北市大安區新生南路二段86號4樓之2 調電傳',source_url:'https://www.ibigfun.com/broker/B',address_text:'台北市大安區新生南路二段86號4樓之2',lat:25.0415,lon:121.5322}
]});
assert.equal(brokerDupes.count,1,'same physical address/unit from different brokers must collapse to one canonical property');
assert.equal(brokerDupes.items[0].source_count,2,'canonical property should preserve both source listings');
assert.equal(brokerDupes.items[0].listing_count,2,'canonical property should expose listing count');
assert.equal(brokerDupes.items[0].source_listings.length,2,'canonical property should retain listing rows');
assert.deepEqual(new Set(brokerDupes.items[0].source_listings.map(x=>x.source_label)),new Set(['永慶房屋','信義房屋']));
assert.deepEqual(brokerDupes.items[0].asking_range_wan,[3680,3750]);
const renormalized=normalizeBigFunVisibleExport({items:brokerDupes.items});
assert.equal(renormalized.items[0].listing_count,2,'re-normalizing a canonical property must not erase source listing cluster');
assert.equal(renormalized.items[0].source_listings.length,2);
const canonicalHome=toTemporaryInventoryHomes(brokerDupes)[0];
assert.equal(canonicalHome.lat,null,'address-bearing BigFun DOM coordinates must not become canonical pins before official geocode');
assert.equal(canonicalHome.lon,null,'address-bearing BigFun DOM coordinates must not become canonical pins before official geocode');
assert.equal(canonicalHome.source_count,2);
assert.equal(canonicalHome.listing_count,2);
assert.equal(canonicalHome.source_listings.length,2);
const relocated=await geocodeBigFunHomes([canonicalHome],{fetchImpl:async()=>({ok:true,status:200,json:async()=>({ok:true,lat:25.031234,lon:121.529876,matched_address:'台北市大安區新生南路二段86號'})})});
assert.equal(relocated.located,1);
assert.equal(relocated.homes[0].location_basis,'taipei-official-doorplate');
assert.equal(relocated.homes[0].lat,25.031234);
assert.equal(relocated.homes[0].lon,121.529876);

const crossSite=normalizeBigFunVisibleExport({schema:'buju.listing-collection.v0.1',items:[
  {source_platform:'591',source_label:'591',visible_text:'森林公園三房 3,680萬 35.6坪 3房 地址 台北市大安區新生南路二段86號4樓之2',source_url:'https://sale.591.com.tw/home/abc',address_text:'台北市大安區新生南路二段86號4樓之2',asking_wan:3680,total_ping:35.6,bedrooms:3},
  {source_platform:'yungching',source_label:'永慶房屋',visible_text:'森林公園三房 3,750萬 35.6坪 3房 地址 台北市大安區新生南路二段86號4樓之2',source_url:'https://buy.yungching.com.tw/house/xyz',address_text:'台北市大安區新生南路二段86號4樓之2',asking_wan:3750,total_ping:35.6,bedrooms:3}
]});
assert.equal(crossSite.count,1,'same physical property from different websites must collapse into one property cluster');
assert.equal(crossSite.items[0].listing_count,2);
assert.deepEqual(new Set(crossSite.items[0].source_listings.map(x=>x.source_label)),new Set(['591','永慶房屋']));
assert.deepEqual(crossSite.items[0].asking_range_wan,[3680,3750]);

const helper=fs.readFileSync('tools/browser/bigfun-visible-helper-v01/content.js','utf8');
const importer=fs.readFileSync('public/bigfun-visible-import-desktop-v01.js','utf8');
const geocoder=fs.readFileSync('public/bigfun-address-geocode-v01.mjs','utf8');
const manifest=fs.readFileSync('tools/browser/bigfun-visible-helper-v01/manifest.json','utf8');
const shell=fs.readFileSync('public/maplibre-pmtiles-provider-spike.html','utf8');

for(const token of ['📦 卜居收集籃','卜居 · 房源收集器 v0.4','scanLoadedPage()','＋ 收集本頁','跨站已收集','📦 下載全部 JSON','清空收集籃','buju.listing-collection.v0.1','chrome.storage.local','STORAGE_KEY','LEGACY_BIGFUN_KEY','imageBackedCandidates()','selectorCandidates()','source_platform','source_label','address_text','extractAddress','pointermove'])assert.ok(helper.includes(token),`universal collector v0.4 contract missing: ${token}`);
for(const token of ["id:'bigfun'","id:'591'","id:'yungching'","id:'sinyi'","id:'rakuya'","id:'5168'","id:'housefun'"])assert.ok(helper.includes(token),`site adapter missing: ${token}`);
for(const forbidden of ['fetch(','XMLHttpRequest','api_key','ospc_api','query_on_market_by_id'])assert.ok(!helper.includes(forbidden),`collector must remain loaded-page/local-first and not call listing endpoints: ${forbidden}`);
assert.ok(helper.includes("panel.querySelector('#bujuCollect').onclick=collectPage"),'collection must remain explicitly user-triggered');
assert.ok(helper.includes('left:18px;bottom:18px'),'collector launcher should stay away from right-side pagination');
assert.ok(helper.includes('cursor:move'),'collector panel should be draggable');
for(const host of ['*.ibigfun.com','*.591.com.tw','*.yungching.com.tw','*.sinyi.com.tw','*.rakuya.com.tw','*.5168.com.tw','*.housefun.com.tw'])assert.ok(manifest.includes(host),`manifest must include ${host}`);
assert.ok(manifest.includes('0.4.0'),'extension manifest should expose v0.4 collector');
assert.ok(manifest.includes('"permissions": ["storage"]'),'shared cross-site basket requires extension local storage only');
for(const token of ['📥 BigFun JSON','sessionStorage','toTemporaryInventoryHomes','Canonical 地址','臺北市官方門牌座標','geocodeBigFunHomes','fitBounds','BIGFUN IMPORT v0.5','PROPERTY CLUSTERS','戶實體候選','筆刊登','source_listings','1 戶實體房屋','跨刊登價差','×${listingCount}'])assert.ok(importer.includes(token),`desktop property cluster UI contract missing: ${token}`);
for(const token of ['/__buju/taipei-doorplate','taipei-official-doorplate','CACHE_KEY','doorplate_index_missing','bigfun-dom-coordinate-fallback'])assert.ok(geocoder.includes(token),`official doorplate locator guard missing: ${token}`);
for(const forbidden of ['nominatim.openstreetmap.org','ibigfun.com','api_key','ospc_api','query_on_market_by_id'])assert.ok(!geocoder.includes(forbidden),`address locator must not use external/internal listing geocoder: ${forbidden}`);
assert.ok(shell.includes('./bigfun-visible-import-desktop-v01.js'),'desktop shell must load property-cluster importer');

for(const file of ['public/bigfun-visible-import-core-v01.mjs','public/bigfun-address-geocode-v01.mjs','public/bigfun-visible-import-desktop-v01.js','tools/browser/bigfun-visible-helper-v01/content.js','tools/data/taipei_doorplate_core_v01.mjs','tools/data/build_taipei_doorplate_index_v01.mjs','tools/dev/serve_single_engine_core.mjs','tools/research/apply_bigfun_visible_import_v01.mjs'])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
console.log('PASS Buju listing collector v0.4 · BigFun + 591 + Yungching + Sinyi + Rakuya + 5168 + HouseFun · cross-site property clusters · no listing API');
