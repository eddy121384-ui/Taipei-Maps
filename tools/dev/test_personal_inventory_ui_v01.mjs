import fs from 'node:fs';
import assert from 'node:assert/strict';
import {summarizeInventory} from '../../public/inventory-filter-core-v01.mjs';

const snap=JSON.parse(fs.readFileSync('public/data/inventory/personal-research-current-v01.json','utf8'));
const homes=snap.homes||[];
assert.equal(snap.research_only,true);
assert.equal(snap.complete_market_inventory,false);
assert.equal(homes.length,37,'current personal snapshot should contain 37 canonical homes');
assert.equal(snap.coverage.raw_listing_rows,45,'expected 45 source listing rows');
assert.equal(snap.coverage.duplicate_rows_collapsed,8,'expected eight collapsed duplicate rows');
assert.equal(snap.coverage.cross_source_homes,5,'expected five cross-source canonical matches');

const jinhua=summarizeInventory(homes,{school:'金華'});
assert.equal(jinhua.total,23,'金華 candidate pool should expose 23 canonical homes');
assert.equal(jinhua.verified,2,'金華 official verified count must remain exact + shared only');
assert.equal(jinhua.pending_location,21,'金華 street/community-only candidates must remain pending');
const zhongzheng=summarizeInventory(homes,{school:'中正'});
assert.equal(zhongzheng.total,14,'中正 candidate pool should expose 14 canonical homes');
assert.equal(zhongzheng.verified,1,'中正 official verified count must not follow marketing claims');
assert.equal(zhongzheng.pending_location,13,'中正 street/community-only candidates must remain pending');

const oldJinhua=summarizeInventory(homes,{school:'金華',filters:{age_min_years:40}});
assert.ok(oldJinhua.total>=7,'40+ filter should expose a meaningful old-home pool');
assert.ok(oldJinhua.pending_location>0,'40+ candidates without exact location must remain pending');
const walkups=summarizeInventory(homes,{school:'金華',filters:{building_form:'walkup'}});
assert.ok(walkups.total>=5,'walkup filter should expose multiple public candidates');
assert.ok(walkups.visible.every(h=>h.building_form==='walkup'));

for(const home of homes.filter(h=>h.verification_status==='insufficient_location')){
  assert.equal(home.lon,null,`${home.id} must not invent longitude`);
  assert.equal(home.lat,null,`${home.id} must not invent latitude`);
}
assert.ok(homes.some(h=>h.canonical_home_id==='jinhua-yongkang-liyuan-63.41-4f'&&h.source_count>=2),'永康麗園 cross-source reconciliation missing');
assert.ok(homes.some(h=>h.canonical_home_id==='zhongzheng-hangzhou2-39.75-1f'&&h.source_count>=2),'杭州南路二段 cross-source reconciliation missing');

const desktop=fs.readFileSync('public/inventory-prototype-v01.js','utf8');
assert.ok(desktop.includes("const FIXTURE_URL='./data/inventory/personal-research-current-v01.json';"),'desktop must read personal canonical snapshot');
assert.ok(desktop.includes("h.verification_status==='insufficient_location'"),'desktop must preserve pending-location semantics');
assert.ok(desktop.includes("if(!finiteCoord(h)||h.verification_status==='insufficient_location')continue"),'desktop must not draw fake pending-location pins');
const mobile=fs.readFileSync('public/mobile-school-inventory-v04.html','utf8');
assert.ok(mobile.includes('personal-research-current-v01.json'),'mobile must read personal canonical snapshot');
assert.ok(mobile.includes('raw.githubusercontent.com/eddy121384-ui/Taipei-Maps/research/personal-inventory-v01'),'mobile personal snapshot source must be explicit');
assert.ok(mobile.includes("h.verification_status==='insufficient_location'"),'mobile must preserve pending-location semantics');

console.log('PASS personal inventory UI · 45 raw → 37 canonical · 金華 23 / 中正 14 · verified counts remain official-only');
