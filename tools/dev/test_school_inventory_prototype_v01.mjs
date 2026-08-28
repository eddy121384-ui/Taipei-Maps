import fs from 'node:fs';
import assert from 'node:assert/strict';

const fixture=JSON.parse(fs.readFileSync('public/data/inventory/school-district-inventory-prototype-v01.json','utf8'));
const homes=fixture.homes||[];
assert.equal(fixture.research_only,true,'fixture must remain research-only');
assert.equal(fixture.complete_market_inventory,false,'prototype must not claim complete market coverage');
assert.equal(homes.length,5,'expected fixed five-home UX fixture');

const counts=homes.reduce((a,h)=>(a[h.verification_status]=(a[h.verification_status]||0)+1,a),{});
assert.equal(counts.verified_exact,3,'expected 3 exact verified fixtures');
assert.equal(counts.verified_shared,1,'expected 1 shared verified fixture');
assert.equal(counts.mismatch,1,'expected 1 mismatch fixture');

const verified=h=>['verified_exact','verified_shared'].includes(h.verification_status);
const jinhua=homes.filter(h=>h.query_school==='金華');
const zhongzheng=homes.filter(h=>h.query_school==='中正');
assert.equal(jinhua.filter(verified).length,3,'金華 buyer count must include exact + shared');
assert.equal(zhongzheng.filter(verified).length,1,'中正 buyer count must exclude mismatch');
assert.equal(zhongzheng.filter(h=>h.verification_status==='mismatch').length,1,'expected one 中正 mismatch research candidate');
assert.equal(homes.find(h=>h.name==='中正名門')?.official_junior,'弘道','中正名門 mismatch must preserve official 弘道 result');
assert.match(homes.find(h=>h.name==='大安MONEY賦寓')?.official_junior||'',/共同學區/,'shared catchment wording must survive');

const html=fs.readFileSync('public/maplibre-pmtiles-provider-spike.html','utf8');
for(const token of ['id="basemapMap"','id="basemapPhoto"','id="toggleLocal"','id="toggle3d"','id="toggleTerrain"','id="districtBtn"','id="juniorBtn"','id="schoolPointBtn"','id="summaryBtn"']){
  assert.ok(html.includes(token),`desktop map lost existing control ${token}`);
}
assert.ok(html.includes('window.__taipeiMapsDesktopMap=map;'),'desktop map bridge missing');
assert.ok(html.includes('src="./inventory-prototype-v01.js"'),'inventory module loader missing');

const plugin=fs.readFileSync('public/inventory-prototype-v01.js','utf8');
for(const token of ['inventoryBtn','inventoryShowMismatch','verified_exact','verified_shared','mismatch','official_junior','source_url','summaryBtn']){
  assert.ok(plugin.includes(token),`inventory UX contract missing ${token}`);
}
assert.ok(plugin.includes("VERIFIED.has(h.verification_status)"),'verified result filtering contract missing');
assert.ok(plugin.includes("if(summaryBtn?.classList.contains('active'))summaryBtn.click()"),'inventory/summary mutual exclusion missing');

// Map-first product flow: clicking an official junior catchment drives the inventory selector.
assert.ok(plugin.includes("const layerId='school-catchment-fill'"),'school catchment click bridge missing');
assert.ok(plugin.includes("map.on('click',layerId"),'school catchment click handler missing');
assert.ok(plugin.includes("if(p.level!=='junior')return"),'inventory must ignore elementary catchment clicks');
assert.ok(plugin.includes('selectFromOfficialAssignment(p.school)'),'official school assignment is not wired into inventory selection');
assert.ok(plugin.includes("Object.keys(SCHOOL_LABEL).find(key=>raw.includes(key))||null"),'shared catchment must resolve supported school names without rewriting official wording');
assert.ok(plugin.includes("requestedAssignment=raw"),'selected official assignment must be retained for unsupported-school UX');
assert.ok(plugin.includes('prototype 尚無此學區的房源 fixture'),'unsupported catchment must show explicit no-fixture state');
assert.ok(plugin.includes('clearMarkers();\n        const label=requestedAssignment'),'unsupported catchment must clear prior-school markers before rendering no-fixture state');
assert.ok(plugin.includes('TaipeiMapsInventoryPrototypeV01'),'inventory selector API must remain externally testable/reusable');

console.log('PASS school inventory prototype · map school selection → inventory · exact/shared/mismatch semantics · unsupported clears stale homes · desktop controls preserved');