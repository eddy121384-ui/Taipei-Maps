import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolveTaipeiSchoolDistricts } from '../../public/buju-school-district-resolver-v01.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(here, '../../public');
const context = { window: {}, console };

function runFile(filePath) {
  vm.runInNewContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
}

runFile(path.join(publicRoot, 'taipei-school-districts-115.js'));
let dataset = context.window.TaipeiMapsSchoolDistrictData115;
if (!dataset) throw new Error('Taipei school dataset bootstrap missing');
for (const district of dataset.coverage?.districts || []) {
  runFile(path.join(publicRoot, 'school-districts-115', `${district}.js`));
}
dataset = context.window.TaipeiMapsSchoolDistrictData115;

const samples = [
  {
    sample_ids: ['AG-JH-03', 'RK-JH-02', '591-JH-02'],
    home: '大安MONEY賦寓',
    claimed_junior: '金華',
    point: { lon: 121.52751, lat: 25.0217 },
    location_grade: 'A-',
    coordinate_source: 'Mapcarta / OpenStreetMap building point; community address independently confirmed as 羅斯福路三段155/159號',
    evidence_url: 'https://mapcarta.com/W1301948497',
  },
  {
    sample_ids: ['RK-JH-05'],
    home: '臨沂雅典',
    claimed_junior: '金華',
    point: { lon: 121.5314806, lat: 25.03718 },
    location_grade: 'A',
    coordinate_source: 'public 591 listing map embed for 臨沂雅典; community address 臨沂街71巷19弄25號 independently confirmed',
    evidence_url: 'https://sale.591.com.tw/home/house/detail/2/20565802.html',
  },
  {
    sample_ids: ['591-ZZ-03'],
    home: '中正藏璽',
    claimed_junior: '中正',
    point: { lon: 121.5196671, lat: 25.0314651 },
    location_grade: 'A',
    coordinate_source: 'public 591 listing map embed; community address 羅斯福路一段58巷20號 independently confirmed',
    evidence_url: 'https://sale.591.com.tw/home/house/detail/2/19529099.html',
  },
  {
    sample_ids: ['RK-ZZ-03'],
    home: '中正名門',
    claimed_junior: '中正',
    point: { lon: 121.5183008, lat: 25.0317572 },
    location_grade: 'A',
    coordinate_source: 'public 591 listing map embed for 中正名門; community address 南昌路一段76/78號 independently confirmed',
    evidence_url: 'https://sale.591.com.tw/home/house/detail/2/20220057.html',
  },
  {
    sample_ids: ['RK-JH-01'],
    home: '永康麗園',
    claimed_junior: '金華',
    point: { lon: 121.53159, lat: 25.031582 },
    location_grade: 'A-',
    coordinate_source: 'Taipei public air-raid shelter registry row for 新生南路二段30巷13號; search extraction drops the leading 2 in latitude, normalized to Taipei 25.x',
    evidence_url: 'https://www-ws.gov.taipei/',
  },
];

function assignmentIncludes(assignment, school) {
  if (!assignment || !school) return false;
  return String(assignment).split(/[、,]/).map((s) => s.trim()).includes(String(school).trim());
}

const results = [];
for (const sample of samples) {
  try {
    const resolved = await resolveTaipeiSchoolDistricts(sample.point, { dataset });
    results.push({
      ...sample,
      official_status: resolved.status,
      official_district: resolved.district,
      official_village: resolved.village,
      official_neighbors: resolved.neighbors,
      official_elementary: resolved.elementary_school_district,
      official_junior: resolved.junior_school_district,
      claim_verdict:
        resolved.status !== 'resolved'
          ? 'unresolved'
          : assignmentIncludes(resolved.junior_school_district, sample.claimed_junior)
            ? 'verified'
            : 'mismatch',
      resolver_reason: resolved.reason,
    });
  } catch (error) {
    results.push({
      ...sample,
      official_status: 'error',
      official_district: null,
      official_village: null,
      official_neighbors: [],
      official_elementary: null,
      official_junior: null,
      claim_verdict: 'error',
      resolver_reason: error?.message || String(error),
    });
  }
}

const summary = {
  academic_year: dataset.academicYear,
  generated_at: new Date().toISOString(),
  sample_count: results.length,
  verified: results.filter((r) => r.claim_verdict === 'verified').length,
  mismatch: results.filter((r) => r.claim_verdict === 'mismatch').length,
  unresolved: results.filter((r) => r.claim_verdict === 'unresolved').length,
  errors: results.filter((r) => r.claim_verdict === 'error').length,
};

console.log(JSON.stringify({ summary, results }, null, 2));

if (summary.errors === summary.sample_count) {
  throw new Error('All live official school-verification probes failed');
}
