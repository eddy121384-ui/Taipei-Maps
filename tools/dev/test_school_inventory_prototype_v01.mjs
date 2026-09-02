import fs from 'node:fs';
import assert from 'node:assert/strict';
import {summarizeInventory,matchesInventoryFilters} from '../../public/inventory-filter-core-v01.mjs';

const fixture=JSON.parse(fs.readFileSync('public/data/inventory/school-district-inventory-prototype-v01.json','utf8'));
const homes=fixture.homes||[];
assert.equal(fixture.research_only,true,'fixture must remain research-only');
assert.equal(fixture.complete_market_inventory,false,'prototype must not claim complete market coverage');
assert.equal(homes.length,6,'expected six-home UX fixture including one street-only old-walkup candidate');

const counts=homes.reduce((a,h)=>(a[h.verification_status]=(a[h.verification_status]||0)+1,a),{});
assert.equal(counts.verified_exact,3,'expected 3 exact verified fixtures');
assert.equal(counts.verified_shared,1,'expected 1 shared verified fixture');
assert.equal(counts.insufficient_location,1,'expected 1 insufficient-location candidate');
assert.equal(counts.mismatch,1,'expected 1 mismatch fixture');

const jinhuaDefault=summarizeInventory(homes,{school:'金華'});
assert.equal(jinhuaDefault.total,4,'金華 default should show 3 verified + 1 pending-location candidate');
assert.equal(jinhuaDefault.verified,3,'金華 verified count remains 3');
assert.equal(jinhuaDefault.pending_location,1,'金華 should expose one pending-location candidate');
assert.equal(jinhuaDefault.mismatch,0,'mismatch hidden by default');

const zhongzhengDefault=summarizeInventory(homes,{school:'中正'});
assert.equal(zhongzhengDefault.total,1,'中正 default buyer list excludes mismatch');
assert.equal(zhongzhengDefault.verified,1,'中正 buyer count must remain 1');
const zhongzhengDebug=summarizeInventory(homes,{school:'中正',showMismatch:true});
assert.equal(zhongzhengDebug.total,2,'debug may expose mismatch without changing verified semantics');
assert.equal(zhongzhengDebug.verified,1,'mismatch must never inflate verified count');

const oldWalkup=homes.find(h=>h.id==='ux-jinhua-chaozhou-old-walkup');
assert.equal(oldWalkup.verification_status,'insufficient_location');
assert.equal(oldWalkup.building_form,'walkup');
assert.ok(oldWalkup.age_years>=40);
assert.equal(oldWalkup.lon,null,'street-only listing must not invent longitude');
assert.equal(oldWalkup.lat,null,'street-only listing must not invent latitude');

let s=summarizeInventory(homes,{school:'金華',filters:{age_min_years:40}});
assert.equal(s.total,1,'40+ filter should surface old walkup candidate');
assert.equal(s.verified,0,'street-only old walkup must not be counted verified');
assert.equal(s.pending_location,1);
s=summarizeInventory(homes,{school:'金華',filters:{building_form:'walkup'}});
assert.equal(s.total,1,'walkup filter should isolate old apartment candidate');
assert.equal(s.visible[0].id,'ux-jinhua-chaozhou-old-walkup');
s=summarizeInventory(homes,{school:'金華',filters:{price_max_wan:3000}});
assert.equal(s.total,1,'3,000萬 cap should isolate 2,311萬 fixture');
assert.equal(s.visible[0].id,'ux-jinhua-money');
s=summarizeInventory(homes,{school:'金華',filters:{ping_band:'20_40'}});
assert.deepEqual(new Set(s.visible.map(h=>h.id)),new Set(['ux-jinhua-linyi','ux-jinhua-chaozhou-old-walkup']));
s=summarizeInventory(homes,{school:'金華',filters:{bedrooms_min:3}});
assert.deepEqual(new Set(s.visible.map(h=>h.id)),new Set(['ux-jinhua-yongkang','ux-jinhua-chaozhou-old-walkup']));
assert.equal(matchesInventoryFilters({asking_wan:null},{price_max_wan:5000}),false,'unknown price must not pass active price filter');
assert.equal(matchesInventoryFilters({age_years:null},{age_min_years:40}),false,'unknown age must not pass active age filter');

const html=fs.readFileSync('public/maplibre-pmtiles-provider-spike.html','utf8');
for(const token of ['id="basemapMap"','id="basemapPhoto"','id="toggleLocal"','id="toggle3d"','id="toggleTerrain"','id="districtBtn"','id="juniorBtn"','id="schoolPointBtn"','id="summaryBtn"'])assert.ok(html.includes(token),`desktop map lost existing control ${token}`);
assert.ok(html.includes('window.__taipeiMapsDesktopMap=map;'),'desktop map bridge missing');
assert.ok(html.includes('src="./inventory-prototype-v01.js"'),'inventory module loader missing');
const plugin=fs.readFileSync('public/inventory-prototype-v01.js','utf8');
for(const token of ['inventoryBtn','inventoryShowMismatch','filterPrice','filterPing','filterAge','filterForm','filterBedrooms','inventoryResetFilters','insufficient_location','selectFromOfficialAssignment','school-catchment-fill'])assert.ok(plugin.includes(token),`inventory UX contract missing ${token}`);
assert.ok(plugin.includes("if(p.level!=='junior')return"),'school click must remain junior-only');
assert.ok(plugin.includes('目前 research snapshot 尚未覆蓋'),'unsupported school must clear prior inventory');
assert.ok(plugin.includes('let mode=false,school=null'),'inventory must open without a hard-coded school');
assert.ok(!plugin.includes('data-school="金華" class="active"'),'金華 must not be preselected in the UI');
assert.ok(plugin.includes('不再預設金華或中正'),'neutral-scope explanation missing');
assert.ok(plugin.includes("if(summaryBtn?.classList.contains('active'))summaryBtn.click()"),'inventory/summary mutual exclusion missing');

console.log('PASS school inventory prototype · neutral scope + filters · old-walkup candidate · exact/shared/pending/mismatch semantics');
