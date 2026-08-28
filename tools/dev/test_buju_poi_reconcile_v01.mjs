import { buildCanonical } from '../../public/buju-poi-canonical-v02.mjs';
import { reconcileCanonicalPOI } from '../../public/buju-poi-reconcile-v01.mjs';

function entity(id, category, brand, branch, coordinates, address = '') {
  return {
    canonical_id: id, category, brand, branch,
    name: branch ? `${brand} ${branch}` : brand,
    coordinates, source_rows: 1,
    source_ids: [`src:${id}`], source_names: [branch ? `${brand} ${branch}` : brand],
    sources: ['fixture'], representative_key: `src:${id}`, representative_strength: 100,
    address, merge_reasons: [], branch_conflict: false, address_conflict: false,
  };
}

function rawOsm(id, name, brand, coordinates, address) {
  return {
    type: 'Feature', geometry: { type: 'Point', coordinates },
    properties: { id, '@name': name, brand: { names: { primary: brand } }, addresses: address, sources: [{ dataset: 'OpenStreetMap' }] },
  };
}

const osmInternal = buildCanonical([
  rawOsm('osm:node/1', 'FamilyMart 中心店', '全家', [121.50000, 25.00000], '台北市測試路1號'),
  rawOsm('osm:way/2', '全家中心店', '全家', [121.50002, 25.00000], '台北市測試路1號'),
]);
if (osmInternal.entities.length !== 1 || osmInternal.entities[0].source_rows !== 2) throw new Error('OSM node/way duplicate should canonicalize before reconciliation');

const baseline = [
  entity('overture-family-center', 'convenience_store', '全家', '中心店', [121.50000, 25.00000], '台北市測試路1號'),
  entity('overture-px-daan', 'supermarket', '全聯', '大安店', [121.51000, 25.01000], '台北市大安路1號'),
];
const osm = [
  entity('osm-family-center', 'convenience_store', '全家', '中心店', [121.50003, 25.00000], '1 Test Rd'),
  entity('osm-family-hole', 'convenience_store', '全家', '遠方店', [121.52000, 25.02000], '台北市遠方路1號'),
  entity('osm-family-near-weak', 'convenience_store', '全家', '不同店', [121.50025, 25.00000], '台北市別條路9號'),
];
const result = reconcileCanonicalPOI(baseline, osm);
if (result.stats.matched !== 1) throw new Error(`matched: ${result.stats.matched}`);
if (result.stats.safe_holes !== 1) throw new Error(`safe_holes: ${result.stats.safe_holes}`);
if (result.stats.cross_source_unresolved !== 1) throw new Error(`unresolved: ${result.stats.cross_source_unresolved}`);
if (result.stats.final_canonical !== 3) throw new Error(`final: ${result.stats.final_canonical}`);
if (!result.finalEntities.some(x => x.canonical_id === 'overture-family-center')) throw new Error('baseline id must survive reconciliation');
if (!result.safeHoles[0]?.canonical_id.startsWith('buju-poi-osm-')) throw new Error('OSM hole id must use stable OSM namespace');
if (result.unresolved[0]?.reason !== 'nearby-same-brand-without-high-confidence-match') throw new Error('nearby weak pair should remain unresolved');

console.log('PASS · Buju OSM cross-source reconciliation v0.1');
console.log(result.stats);
