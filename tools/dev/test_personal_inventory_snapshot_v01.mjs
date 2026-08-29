import fs from 'node:fs';
import assert from 'node:assert/strict';

const raw=JSON.parse(fs.readFileSync('public/data/inventory/personal-research-2026-08-29-v01.raw.json','utf8'));
const snap=JSON.parse(fs.readFileSync('public/data/inventory/personal-research-current-v01.json','utf8'));
const coverage=JSON.parse(fs.readFileSync('public/data/inventory/personal-research-current-v01.coverage.json','utf8'));

assert.equal(raw.research_only,true);
assert.equal(raw.complete_market_inventory,false);
assert.ok(raw.rows.length>=40,`expected >=40 discovery rows, got ${raw.rows.length}`);
assert.ok(new Set(raw.rows.map(r=>r.source)).size>=3,'expected at least three source/discovery surfaces');
assert.equal(snap.research_only,true);
assert.equal(snap.complete_market_inventory,false);
assert.ok(snap.homes.length>20,`expected >20 canonical homes, got ${snap.homes.length}`);
assert.ok(snap.homes.length<raw.rows.length,'dedupe should collapse at least one duplicate row');
assert.equal(coverage.raw_listing_rows,raw.rows.length);
assert.equal(coverage.canonical_unique_homes,snap.homes.length);
assert.ok(coverage.cross_source_homes>=4,'expected several cross-source canonical homes');
assert.ok(coverage.school_coverage['金華'].canonical_homes>10,'expected meaningful 金華 coverage');
assert.ok(coverage.school_coverage['中正'].canonical_homes>8,'expected meaningful 中正 coverage');
assert.ok((coverage.verification_status.insufficient_location||0)>0,'location-incomplete candidates must remain explicit');
assert.ok(snap.homes.some(h=>h.canonical_home_id==='jinhua-yongkang-liyuan-63.41-4f'&&h.source_count>=2),'永康麗園 should reconcile across sources');
assert.ok(snap.homes.some(h=>h.canonical_home_id==='zhongzheng-hangzhou2-39.75-1f'&&h.source_count>=2),'杭州南路二段 should reconcile across sources');
assert.ok(snap.homes.some(h=>h.verification_status==='verified_shared'),'shared school assignment must survive');
assert.ok(snap.homes.every(h=>h.verification_status!=='insufficient_location'||(!Number.isFinite(h.lon)&&!Number.isFinite(h.lat))),'insufficient-location homes must not carry invented coordinates');

console.log(`PASS personal inventory v0.1 · ${raw.rows.length} raw → ${snap.homes.length} canonical · ${coverage.cross_source_homes} cross-source homes`);
