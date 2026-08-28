import assert from 'node:assert/strict';
import {
  parseNeighborSpec,
  resolveAssignmentFromDataset,
  resolveTaipeiSchoolDistricts,
} from '../../public/buju-school-district-resolver-v01.mjs';

function makeDataset() {
  return {
    academicYear: 115,
    coverage: { districts: ['大安'] },
    sources: {
      assignment: { authority: '臺北市教育局' },
      geometry: { authority: '臺北市民政局', endpoint: 'https://example.test/neighbors/query' },
    },
    levels: {
      elementary: {
        '大安|義安': {
          rules: [
            { spec: '1,2', school: '仁愛' },
            { spec: '3-7', school: '仁愛、建安共同學區' },
          ],
        },
      },
      junior: {
        '大安|義安': { all: '大安' },
      },
    },
  };
}

const spec = parseNeighborSpec('1,3-5、7');
assert.deepEqual([...spec].sort((a, b) => a - b), [1, 3, 4, 5, 7]);

const dataset = makeDataset();
assert.equal(resolveAssignmentFromDataset(dataset, 'elementary', '大安', '義安', [3]), '仁愛、建安共同學區');
assert.equal(resolveAssignmentFromDataset(dataset, 'junior', '大安', '義安', [3]), '大安');
assert.equal(resolveAssignmentFromDataset(dataset, 'elementary', '大安', '義安', [2, 3]), null, 'multi-neighbor geometry with differing assignments must fail closed');

let loadedDistrict = null;
const fetchSingle = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: null,
      properties: {
        f_id: 123,
        SECT_NAME: '大安區',
        LIE_NAME: '義安里',
        LI_NO: '3',
        SDFKEY: 'daan-yian-3',
        SDFNAME: '義安里 3鄰',
      },
    }],
  }),
});

const resolved = await resolveTaipeiSchoolDistricts(
  { lon: 121.55, lat: 25.03 },
  {
    dataset,
    fetchImpl: fetchSingle,
    ensureDistrictLoaded: async (district) => { loadedDistrict = district; },
  },
);
assert.equal(loadedDistrict, '大安');
assert.equal(resolved.status, 'resolved');
assert.equal(resolved.district, '大安');
assert.equal(resolved.village, '義安');
assert.deepEqual(resolved.neighbors, [3]);
assert.equal(resolved.elementary_school_district, '仁愛、建安共同學區');
assert.equal(resolved.junior_school_district, '大安');
assert.equal(resolved.academic_year, 115);

const ambiguous = await resolveTaipeiSchoolDistricts(
  { lon: 121.55, lat: 25.03 },
  {
    dataset: makeDataset(),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        features: [
          { type: 'Feature', geometry: null, properties: { f_id: 1, SECT_NAME: '大安區', LIE_NAME: '義安里', LI_NO: '3', SDFKEY: 'a' } },
          { type: 'Feature', geometry: null, properties: { f_id: 2, SECT_NAME: '大安區', LIE_NAME: '義安里', LI_NO: '4', SDFKEY: 'b' } },
        ],
      }),
    }),
  },
);
assert.equal(ambiguous.status, 'unresolved');
assert.match(ambiguous.reason, /multiple official neighbor identities/);
assert.equal(ambiguous.elementary_school_district, null);

const outside = await resolveTaipeiSchoolDistricts(
  { lon: 121.9, lat: 25.3 },
  {
    dataset: makeDataset(),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ features: [] }) }),
  },
);
assert.equal(outside.status, 'unavailable');

await assert.rejects(
  resolveTaipeiSchoolDistricts(
    { lon: 121.55, lat: 25.03 },
    {
      dataset: makeDataset(),
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    },
  ),
  /HTTP 503/,
);

console.log('Buju Taipei school district point resolver v0.1 regression: PASS');
