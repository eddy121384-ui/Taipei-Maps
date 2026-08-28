import assert from 'node:assert/strict';
import { computeDailyLifeMetrics } from '../../public/buju-place-metrics-v01.mjs';
import {
  computeLocationSummary,
  nearestHealthcareFacility,
  nearestMrtStation,
} from '../../public/buju-location-summary-v01.mjs';

const pointFeature = (lon, lat, properties) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties,
});

const query = { lon: 121.5, lat: 25.0 };
const pois = [
  pointFeature(121.5005, 25.0, { canonical_id: 'conv-a', category: 'convenience_store', name: '便利 A', brand: '7-ELEVEN' }),
  pointFeature(121.5040, 25.0, { canonical_id: 'conv-b', category: 'convenience_store', name: '便利 B', brand: '全家' }),
  pointFeature(121.5020, 25.0, { canonical_id: 'super-a', category: 'supermarket', name: '超市 A', brand: '全聯' }),
];

const mrt = [
  pointFeature(121.498, 25.0, { station_name: 'A站', location: 'A路', source: 'official' }),
  pointFeature(121.502, 25.0, { station_name: 'B站', location: 'B路', source: 'official' }),
];

const healthcare = [
  pointFeature(121.503, 25.0, { facility_type: 'clinic', facility_name: '診所 B', address: 'B街', facility_code: 'C2' }),
  pointFeature(121.501, 25.0, { facility_type: 'hospital', facility_name: '醫院 A', address: 'A街', facility_code: 'H1' }),
  pointFeature(121.5004, 25.0, { facility_type: 'clinic', facility_name: '診所 A', address: 'A街', facility_code: 'C1' }),
  pointFeature(121.506, 25.0, { facility_type: 'hospital', facility_name: '醫院 B', address: 'B街', facility_code: 'H2' }),
];

const schoolResolved = {
  status: 'resolved',
  reason: null,
  academic_year: 115,
  district: '大安',
  village: '義安',
  neighbors: [3],
  elementary_school_district: '仁愛、建安共同學區',
  junior_school_district: '大安',
};

const snapshots = JSON.stringify({ pois, mrt, healthcare });
const summary = await computeLocationSummary(query, {
  poiFeatures: pois,
  mrtStationFeatures: mrt,
  healthcareFeatures: healthcare,
  resolveSchoolDistricts: async () => schoolResolved,
});

assert.deepEqual(summary.daily_life, computeDailyLifeMetrics(query, pois), 'daily-life metrics must be reused unchanged');
assert.equal(summary.transit.nearest_mrt_station.name, 'A站', 'equal-distance MRT tie must use deterministic station key');
assert.equal(summary.healthcare.nearest_hospital.name, '醫院 A');
assert.equal(summary.healthcare.nearest_clinic.name, '診所 A');
assert.equal(summary.school.elementary_school_district, '仁愛、建安共同學區', 'shared school assignment must remain intact');
assert.equal(summary.school.junior_school_district, '大安');
assert.equal(JSON.stringify({ pois, mrt, healthcare }), snapshots, 'source arrays/features must not be mutated');

const reversed = await computeLocationSummary(query, {
  poiFeatures: [...pois].reverse(),
  mrtStationFeatures: [...mrt].reverse(),
  healthcareFeatures: [...healthcare].reverse(),
  resolveSchoolDistricts: async () => schoolResolved,
});
assert.deepEqual(reversed, summary, 'input feature order must not affect Location Summary result');

assert.equal(nearestMrtStation(query, mrt).name, 'A站');
assert.equal(nearestHealthcareFacility(query, healthcare, 'hospital').name, '醫院 A');
assert.equal(nearestHealthcareFacility(query, healthcare, 'clinic').name, '診所 A');
assert.throws(() => nearestHealthcareFacility(query, healthcare, 'pharmacy'), /hospital or clinic/);

const schoolFailure = await computeLocationSummary(query, {
  poiFeatures: pois,
  mrtStationFeatures: mrt,
  healthcareFeatures: healthcare,
  resolveSchoolDistricts: async () => { throw new Error('school endpoint unavailable'); },
});
assert.equal(schoolFailure.school.status, 'unavailable');
assert.match(schoolFailure.school.reason, /school endpoint unavailable/);
assert.equal(schoolFailure.school.elementary_school_district, null);

const noSchoolResolver = await computeLocationSummary(query, {
  poiFeatures: pois,
  mrtStationFeatures: mrt,
  healthcareFeatures: healthcare,
});
assert.equal(noSchoolResolver.school.status, 'unavailable');

console.log('Buju Location Summary v0.1 synthetic regression: PASS');
