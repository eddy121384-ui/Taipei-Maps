import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {parseVisibleListingText,normalizeBigFunVisibleExport,toTemporaryInventoryHomes} from '../../public/bigfun-visible-import-core-v01.mjs';

const parsed=parseVisibleListingText(`大安森林公園旁三房\n總價 3,680 萬\n35.6坪 · 42年 · 3房2廳\n大安區新生南路二段`);
assert.equal(parsed.asking_wan,3680);
assert.equal(parsed.total_ping,35.6);
assert.equal(parsed.age_years,42);
assert.equal(parsed.bedrooms,3);
assert.match(parsed.address_text,/大安區/);

const payload=normalizeBigFunVisibleExport({items:[
  {visible_text:'測試屋 2,980萬 28.5坪 2房 大安區和平東路',source_url:'https://www.ibigfun.com/example/1'},
  {visible_text:'測試屋 2,980萬 28.5坪 2房 大安區和平東路',source_url:'https://www.ibigfun.com/example/1'},
  {visible_text:'另一戶 4,200萬 41坪 40年 3房',source_url:'https://www.ibigfun.com/example/2',lat:25.03,lon:121.53}
]});
assert.equal(payload.count,2,'duplicate visible rows should collapse by source identity');
const homes=toTemporaryInventoryHomes(payload);
assert.equal(homes.length,2);
assert.equal(homes[0].verification_status,'insufficient_location');
assert.ok(homes.every(x=>x.temporary_import&&x.research_only));
assert.equal(homes.filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)).length,1);

const helper=fs.readFileSync('tools/browser/bigfun-visible-helper-v01/content.js','utf8');
const importer=fs.readFileSync('public/bigfun-visible-import-desktop-v01.js','utf8');
const manifest=fs.readFileSync('tools/browser/bigfun-visible-helper-v01/manifest.json','utf8');
const shell=fs.readFileSync('public/maplibre-pmtiles-provider-spike.html','utf8');

for(const token of ['📦 卜居收集籃','scanLoadedPage()','＋ 收集本頁','已收集','📦 下載全部 JSON','複製全部 JSON','清空收集籃','buju.bigfun-visible.v0.2','localStorage','STORAGE_KEY','imageBackedCandidates()','hasRenderedImage','isHelperNode','recordKey'])assert.ok(helper.includes(token),`helper v0.2 contract missing: ${token}`);
for(const forbidden of ['fetch(','XMLHttpRequest','api_key','ospc_api','query_on_market_by_id'])assert.ok(!helper.includes(forbidden),`helper must not call/internalize BigFun endpoint: ${forbidden}`);
assert.ok(helper.includes("panel.querySelector('#bujuCollect').onclick=collectPage"),'collection must remain explicitly user-triggered');
assert.ok(helper.includes("#bujuBigFunPanel,#bujuBigFunBtn"),'helper UI must be excluded from its own DOM scan');
assert.ok(helper.includes('const imageCards=collapseCandidates(imageBackedCandidates())'),'real-estate image cards must be preferred before generic fallback');
assert.ok(helper.includes('saveBasket(basket)'),'collected rows must persist across normal BigFun page navigation');
assert.ok(manifest.includes('https://www.ibigfun.com/*'),'extension must be scoped to BigFun');
assert.ok(manifest.includes('0.2.0'),'extension manifest should expose v0.2 collector');
assert.ok(!manifest.includes('"permissions"'),'v0.2 should require no extension privileges');
for(const token of ['📥 BigFun JSON','sessionStorage','toTemporaryInventoryHomes','官方地址／學區待驗證'])assert.ok(importer.includes(token),`desktop importer contract missing: ${token}`);
assert.ok(!importer.includes('fetch('),'desktop importer must be local-file only');
assert.ok(shell.includes('./bigfun-visible-import-desktop-v01.js'),'desktop shell must load visible importer');

for(const file of ['public/bigfun-visible-import-core-v01.mjs','public/bigfun-visible-import-desktop-v01.js','tools/browser/bigfun-visible-helper-v01/content.js','tools/research/apply_bigfun_visible_import_v01.mjs'])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
console.log('PASS BigFun collector v0.2 · user-triggered loaded-page cards → persistent basket → JSON → temporary Buju inventory · no BigFun API');
