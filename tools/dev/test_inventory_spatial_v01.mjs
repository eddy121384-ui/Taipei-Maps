import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hasUsableCoordinate,haversineMeters,locatedInventory,queryRadiusHomes,radiusCoverage,radiusCircleFeature} from '../../public/inventory-spatial-core-v01.mjs';
import {summarizeInventory} from '../../public/inventory-filter-core-v01.mjs';

assert.equal(hasUsableCoordinate({lon:null,lat:null}),false,'null coordinates are not usable');
assert.equal(hasUsableCoordinate({lon:121.53,lat:25.03}),true);

const center={lon:121.53,lat:25.03};
const synthetic=[
  {id:'same',lon:121.53,lat:25.03,verification_status:'verified_exact',asking_wan:3000,total_ping:30,age_years:45,building_form:'walkup',bedrooms:3},
  {id:'near',lon:121.535,lat:25.03,verification_status:'verified_exact',asking_wan:5000,total_ping:50,age_years:10,building_form:'elevator',bedrooms:2},
  {id:'far',lon:121.56,lat:25.03,verification_status:'verified_exact',asking_wan:2500,total_ping:25,age_years:50,building_form:'walkup',bedrooms:4},
  {id:'unknown',lon:null,lat:null,verification_status:'insufficient_location',asking_wan:2000,total_ping:20,age_years:60,building_form:'walkup',bedrooms:3},
];
assert.equal(Math.round(haversineMeters(center,synthetic[0])),0);
assert.ok(haversineMeters(center,synthetic[1])>400&&haversineMeters(center,synthetic[1])<600,'near point should be roughly 500m east');
assert.equal(locatedInventory(synthetic).length,3);
let radius=queryRadiusHomes(synthetic,center,1000);
assert.deepEqual(radius.map(h=>h.id),['same','near'],'1km query should include same+near, exclude far+unlocated');
assert.ok(radius[0].distance_m<=radius[1].distance_m,'radius results sorted nearest first');
const combined=summarizeInventory(radius,{filters:{price_max_wan:4000,age_min_years:40}});
assert.deepEqual(combined.visible.map(h=>h.id),['same'],'existing filters must apply after radius selection');
const coverage=radiusCoverage(synthetic,center,1000);
assert.equal(coverage.total_candidates,4);
assert.equal(coverage.located_candidates,3);
assert.equal(coverage.unlocated_candidates,1);
assert.equal(coverage.inside_radius,2);
const circle=radiusCircleFeature(center,1000,36);
assert.equal(circle.geometry.type,'Polygon');
assert.equal(circle.geometry.coordinates[0].length,37,'circle ring must close');
assert.deepEqual(circle.geometry.coordinates[0][0],circle.geometry.coordinates[0].at(-1),'circle ring closed');

const snapshot=JSON.parse(fs.readFileSync('public/data/inventory/personal-research-current-v01.json','utf8'));
const homes=snapshot.homes||[];
assert.equal(homes.length,37,'#73 snapshot baseline remains 37 canonical candidates');
const located=locatedInventory(homes);
assert.equal(located.length,3,'radius v0.1 must disclose current 3/37 precise-location coverage');
const aroundFirst=queryRadiusHomes(homes,{lon:located[0].lon,lat:located[0].lat},10);
assert.ok(aroundFirst.some(h=>h.id===located[0].id),'a precise home must be returned around its own coordinate');
assert.ok(!aroundFirst.some(h=>h.verification_status==='insufficient_location'),'unlocated candidates must never leak into spatial radius query');

console.log(`PASS inventory spatial v0.1 · located ${located.length}/${homes.length} · radius+filters semantic guard`);
