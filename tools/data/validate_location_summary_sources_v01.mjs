import fs from 'node:fs';
import assert from 'node:assert/strict';
import { computeLocationSummary } from '../../public/buju-location-summary-v01.mjs';

const paths = {
  poi: 'public/data/daily-life-poi/taipei-canonical-reconciled-v01.geojson',
  mrt: 'public/generated/taipei_mrt_stations_official.geojson',
  healthcare: 'public/generated/taipei_healthcare_facilities.geojson',
  schoolBootstrap: 'public/taipei-school-districts-115.js',
};

for (const [label, filePath] of Object.entries(paths)) {
  assert.ok(fs.existsSync(filePath), `${label} source missing: ${filePath}`);
}

const poi = JSON.parse(fs.readFileSync(paths.poi, 'utf8'));
const mrt = JSON.parse(fs.readFileSync(paths.mrt, 'utf8'));
const healthcare = JSON.parse(fs.readFileSync(paths.healthcare, 'utf8'));
const schoolBootstrap = fs.readFileSync(paths.schoolBootstrap, 'utf8');

assert.equal(poi?.type, 'FeatureCollection');
assert.equal(poi.features.length, 2285, 'Location Summary must use accepted reconciled POI baseline');

assert.equal(mrt?.type, 'FeatureCollection');
assert.ok(mrt.features.length >= 90, `MRT station cache unexpectedly small: ${mrt.features.length}`);
const stationNames = new Set();
for (const feature of mrt.features) {
  assert.equal(feature?.geometry?.type, 'Point');
  const name = String(feature?.properties?.station_name || '').trim();
  assert.ok(name, 'MRT station missing station_name');
  assert.ok(!stationNames.has(name), `MRT station cache is not station-deduplicated: ${name}`);
  stationNames.add(name);
}
for (const required of ['台北車站', '市政府站', '大安站']) assert.ok(stationNames.has(required), `missing expected MRT station: ${required}`);

assert.equal(healthcare?.type, 'FeatureCollection');
const hospitals = healthcare.features.filter((feature) => feature?.properties?.facility_type === 'hospital');
const clinics = healthcare.features.filter((feature) => feature?.properties?.facility_type === 'clinic');
assert.ok(hospitals.length >= 30, `healthcare hospital cache unexpectedly small: ${hospitals.length}`);
assert.ok(clinics.length >= 1700, `healthcare clinic cache unexpectedly small: ${clinics.length}`);
for (const feature of [...hospitals, ...clinics]) {
  assert.equal(feature?.geometry?.type, 'Point');
  assert.ok(String(feature?.properties?.facility_name || '').trim(), 'healthcare feature missing facility_name');
}

assert.match(schoolBootstrap, /exactNeighborLevel/);
assert.match(schoolBootstrap, /citywide/);
const districts = ['松山', '信義', '大安', '中山', '中正', '大同', '萬華', '文山', '南港', '內湖', '士林', '北投'];
for (const district of districts) {
  const shard = `public/school-districts-115/${district}.js`;
  assert.ok(fs.existsSync(shard), `school assignment shard missing: ${shard}`);
}

const sample = await computeLocationSummary(
  { lon: 121.5654, lat: 25.0330 },
  {
    poiFeatures: poi.features,
    mrtStationFeatures: mrt.features,
    healthcareFeatures: healthcare.features,
  },
);
assert.ok(sample.daily_life.nearest_convenience_store);
assert.ok(sample.daily_life.nearest_supermarket);
assert.ok(sample.transit.nearest_mrt_station);
assert.ok(sample.healthcare.nearest_hospital);
assert.ok(sample.healthcare.nearest_clinic);
assert.equal(sample.school.status, 'unavailable', 'source validator intentionally runs without live school geometry query');

console.log(`PASS Location Summary local sources · POI ${poi.features.length} · MRT ${mrt.features.length} · hospital ${hospitals.length} · clinic ${clinics.length} · school shards ${districts.length}`);
