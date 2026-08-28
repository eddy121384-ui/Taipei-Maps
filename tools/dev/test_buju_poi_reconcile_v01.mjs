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
  return { type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { id, '@name': name, brand: { names: { primary: brand } }, addresses: address, sources: [{ dataset: 'OpenStreetMap' }] } };
}

const osmInternal = buildCanonical([
  rawOsm('osm:node/1', 'FamilyMart 中心店', '全家', [121.50000, 25.00000], '台北市測試路1號'),
  rawOsm('osm:way/2', '全家中心店', '全家', [121.50002, 25.00000], '台北市測試路1號'),
]);
if (osmInternal.entities.length !== 1 || osmInternal.entities[0].source_rows !== 2) throw new Error('OSM node/way duplicate should canonicalize before reconciliation');

const baseline = [
  entity('overture-family-center', 'convenience_store', '全家', '中心店', [121.50000, 25.00000], '台北市測試路1號'),
  entity('overture-px-daan', 'supermarket', '全聯', '大安店', [121.51000, 25.01000], '台北市大安路1號'),
  entity('overture-seven-campus', 'convenience_store', '7-ELEVEN', '', [121.53000, 25.00000], '台北市文山區汀州路四段88號行政大樓1樓'),
  entity('overture-seven-jingmei', 'convenience_store', '7-ELEVEN', '', [121.54000, 25.00000], '台北市文山區木新路三段351號353號1樓'),
  entity('overture-family-cluster-survivor', 'convenience_store', '全家', '至善店', [121.55000, 25.10000], '台北市士林區至善路二段268號'),
  entity('overture-family-cluster-retired', 'convenience_store', '全家', '', [121.55040, 25.10020], ''),
];
const extendedOsm = entity('osm-seven-campus', 'convenience_store', '7-ELEVEN', '', [121.53052, 25.00000], '11677臺北市文山區汀州路四段88號');
extendedOsm.osm_objects = [{ osm_type: 'node', osm_id: 3780775615 }];
const reviewedThinOsm = entity('osm-seven-jingmei', 'convenience_store', '7-ELEVEN', '', [121.54058, 25.00020], '');
reviewedThinOsm.osm_objects = [{ osm_type: 'node', osm_id: 999 }];
const reviewedClusterOsm = entity('osm-family-cluster', 'convenience_store', '全家', '', [121.54955, 25.09965], '');
reviewedClusterOsm.osm_objects = [{ osm_type: 'node', osm_id: 1000 }];

const osm = [
  entity('osm-family-center', 'convenience_store', '全家', '中心店', [121.50003, 25.00000], '1 Test Rd'),
  entity('osm-family-hole', 'convenience_store', '全家', '遠方店', [121.52000, 25.02000], '台北市遠方路1號'),
  entity('osm-family-near-weak', 'convenience_store', '全家', '不同店', [121.50025, 25.00000], '台北市別條路9號'),
  extendedOsm,
  reviewedThinOsm,
  reviewedClusterOsm,
];
const result = reconcileCanonicalPOI(baseline, osm, {
  reviewedMatchOverrides: [{
    osm_canonical_id: 'osm-seven-jingmei', overture_canonical_id: 'overture-seven-jingmei', coordinate_source: 'overture_baseline', reason: 'fixture-reviewed-same-store',
  }],
  reviewedClusterOverrides: [{
    osm_canonical_id: 'osm-family-cluster',
    surviving_overture_canonical_id: 'overture-family-cluster-survivor',
    retired_overture_canonical_ids: ['overture-family-cluster-retired'],
    coordinate_source: 'osm_secondary',
    reason: 'fixture-reviewed-three-points-one-store',
  }],
});
if (result.stats.matched !== 4) throw new Error(`matched: ${result.stats.matched}`);
if (result.stats.safe_holes !== 1) throw new Error(`safe_holes: ${result.stats.safe_holes}`);
if (result.stats.cross_source_unresolved !== 1) throw new Error(`unresolved: ${result.stats.cross_source_unresolved}`);
if (result.stats.reviewed_match_overrides !== 1) throw new Error(`reviewed_match_overrides: ${result.stats.reviewed_match_overrides}`);
if (result.stats.reviewed_cluster_overrides !== 1) throw new Error(`reviewed_cluster_overrides: ${result.stats.reviewed_cluster_overrides}`);
if (result.stats.retired_overture_canonical !== 1) throw new Error(`retired_overture_canonical: ${result.stats.retired_overture_canonical}`);
if (result.stats.coordinate_overrides !== 2) throw new Error(`coordinate_overrides: ${result.stats.coordinate_overrides}`);
if (result.stats.final_canonical !== 6) throw new Error(`final: ${result.stats.final_canonical}`);
if (!result.finalEntities.some(x => x.canonical_id === 'overture-family-center')) throw new Error('baseline id must survive reconciliation');
if (!result.safeHoles[0]?.canonical_id.startsWith('buju-poi-osm-')) throw new Error('OSM hole id must use stable OSM namespace');
if (result.unresolved[0]?.reason !== 'nearby-same-brand-without-high-confidence-match') throw new Error('nearby weak pair should remain unresolved');
const extendedMatch = result.matched.find(x => x.osm_canonical_id === 'osm-seven-campus');
if (extendedMatch?.match_reason !== 'extended-address-containment') throw new Error('extended same-address pair should match beyond the ordinary review radius');
const correctedCampus = result.finalEntities.find(x => x.canonical_id === 'overture-seven-campus');
if (correctedCampus?.coordinate_source_kind !== 'osm_secondary') throw new Error('precise addressed OSM node should provide coordinates for an extended address match');
if (JSON.stringify(correctedCampus.coordinates) !== JSON.stringify(extendedOsm.coordinates)) throw new Error('extended address coordinate override should use the OSM node coordinate');
const reviewedMatch = result.matched.find(x => x.osm_canonical_id === 'osm-seven-jingmei');
if (reviewedMatch?.match_reason !== 'reviewed-pair-override') throw new Error('reviewed thin-evidence pair should use the explicit reviewed override');
const reviewedFinal = result.finalEntities.find(x => x.canonical_id === 'overture-seven-jingmei');
if (JSON.stringify(reviewedFinal.coordinates) !== JSON.stringify([121.54000, 25.00000])) throw new Error('reviewed override with overture coordinate source must preserve baseline coordinates');
const clusterMatch = result.matched.find(x => x.osm_canonical_id === 'osm-family-cluster');
if (clusterMatch?.match_reason !== 'reviewed-cluster-override') throw new Error('reviewed cluster should use explicit cluster override');
if (result.finalEntities.some(x => x.canonical_id === 'overture-family-cluster-retired')) throw new Error('retired Overture cluster member must not remain in final output');
const clusterFinal = result.finalEntities.find(x => x.canonical_id === 'overture-family-cluster-survivor');
if (!clusterFinal) throw new Error('reviewed cluster survivor missing');
if (JSON.stringify(clusterFinal.coordinates) !== JSON.stringify(reviewedClusterOsm.coordinates)) throw new Error('reviewed cluster should use requested OSM coordinate');
if (!clusterFinal.reviewed_cluster_retired_overture_ids?.includes('overture-family-cluster-retired')) throw new Error('reviewed cluster survivor must retain retired canonical provenance');
if (!clusterFinal.source_ids.includes('src:overture-family-cluster-retired')) throw new Error('retired Overture raw provenance must merge into survivor');

console.log('PASS · Buju OSM cross-source reconciliation v0.1');
console.log(result.stats);
