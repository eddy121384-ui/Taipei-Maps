#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const dataDir = path.join(repoRoot, 'public', 'data', 'daily-life-poi');

const reconciliationPath = path.join(dataDir, 'taipei-osm-reconciliation-v01.json');
const osmCanonicalPath = path.join(dataDir, 'taipei-osm-canonical-v01.geojson');
const overtureCanonicalPath = path.join(dataDir, 'taipei-canonical-v01.geojson');
const outputPath = path.join(dataDir, 'taipei-osm-hole-audit-v01.json');

function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function reviewRadius(category) {
  return category === 'supermarket' ? 100 : 50;
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function latestTimestamp(objects = []) {
  return objects
    .map(item => item?.osm_timestamp || '')
    .filter(Boolean)
    .sort()
    .at(-1) || '';
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = String(keyFn(item) ?? 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, 'zh-Hant')));
}

function distanceBand(ratio) {
  if (ratio == null) return 'no_same_brand_baseline';
  if (ratio <= 1.25) return '1.00x-1.25x';
  if (ratio <= 1.5) return '1.25x-1.50x';
  if (ratio <= 2) return '1.50x-2.00x';
  if (ratio <= 3) return '2.00x-3.00x';
  return '>3.00x';
}

function priorityFor({ ratio, thinEvidence }) {
  if (ratio == null) return thinEvidence ? 'medium' : 'low';
  if (ratio <= 1.5) return 'high';
  if (ratio <= 2) return 'medium';
  if (thinEvidence && ratio <= 3) return 'medium';
  return 'low';
}

function haversine(a, b) {
  const R = 6371000;
  const toRad = deg => deg * Math.PI / 180;
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const sLat = Math.sin(dLat / 2), sLon = Math.sin(dLon / 2);
  const h = sLat * sLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sLon * sLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const [reconciliation, osmCanonical, overtureCanonical] = await Promise.all([
  fs.readFile(reconciliationPath, 'utf8').then(JSON.parse),
  fs.readFile(osmCanonicalPath, 'utf8').then(JSON.parse),
  fs.readFile(overtureCanonicalPath, 'utf8').then(JSON.parse),
]);

if (!Array.isArray(reconciliation.safe_holes)) throw new Error('reconciliation.safe_holes is missing');
if (osmCanonical?.type !== 'FeatureCollection' || !Array.isArray(osmCanonical.features)) throw new Error('OSM canonical GeoJSON is invalid');
if (overtureCanonical?.type !== 'FeatureCollection' || !Array.isArray(overtureCanonical.features)) throw new Error('Overture canonical GeoJSON is invalid');

const osmByCanonicalId = new Map(
  osmCanonical.features.map(feature => [String(feature.properties?.canonical_id || ''), feature]),
);

function nearbyOvertureEvidence(hole) {
  const maxDistance = reviewRadius(hole.category) * 3;
  return overtureCanonical.features
    .filter(feature => feature.properties?.brand === hole.brand && feature.properties?.category === hole.category)
    .map(feature => ({ feature, distance_m: haversine(hole.coordinates, feature.geometry.coordinates) }))
    .filter(candidate => candidate.distance_m <= maxDistance)
    .sort((a, b) => a.distance_m - b.distance_m || String(a.feature.properties?.canonical_id || '').localeCompare(String(b.feature.properties?.canonical_id || '')))
    .slice(0, 5)
    .map(candidate => {
      const p = candidate.feature.properties || {};
      return {
        canonical_id: p.canonical_id || '',
        name: p.name || p.brand || '',
        branch: p.branch || '',
        address: p.address || '',
        coordinates: candidate.feature.geometry.coordinates,
        distance_m: Math.round(candidate.distance_m * 10) / 10,
      };
    });
}

const audited = reconciliation.safe_holes.map(hole => {
  const originalCanonicalId = String(hole.canonical_id || '').replace(/^buju-poi-osm-/, 'buju-poi-');
  const sourceFeature = osmByCanonicalId.get(originalCanonicalId);
  if (!sourceFeature) throw new Error(`OSM canonical source missing for safe hole: ${hole.canonical_id}`);

  const p = sourceFeature.properties || {};
  const threshold = reviewRadius(hole.category);
  const nearest = safeNumber(hole.nearest_same_brand_distance_m);
  const ratio = nearest == null ? null : Math.round((nearest / threshold) * 1000) / 1000;
  const branch = String(p.branch || '').trim();
  const address = String(p.address || '').trim();
  const sourceRows = Number(p.source_rows || 1);
  const thinEvidence = !branch && !address && sourceRows <= 1;
  const priority = priorityFor({ ratio, thinEvidence });
  const nearbyOverture = nearbyOvertureEvidence(hole);

  return {
    canonical_id: hole.canonical_id,
    osm_canonical_id: originalCanonicalId,
    brand: hole.brand,
    category: hole.category,
    name: hole.name,
    coordinates: hole.coordinates,
    nearest_same_brand_distance_m: nearest,
    review_radius_m: threshold,
    distance_ratio_to_review_radius: ratio,
    distance_band: distanceBand(ratio),
    review_priority: priority,
    branch,
    address,
    source_rows: sourceRows,
    has_branch: Boolean(branch),
    has_address: Boolean(address),
    thin_evidence: thinEvidence,
    latest_osm_timestamp: latestTimestamp(p.osm_objects),
    osm_source_ids: Array.isArray(hole.osm_source_ids) ? [...hole.osm_source_ids].sort() : [],
    nearest_overture: nearbyOverture[0] || null,
    nearby_overture: nearbyOverture,
  };
});

const priorityRank = { high: 0, medium: 1, low: 2 };
audited.sort((a, b) =>
  (priorityRank[a.review_priority] - priorityRank[b.review_priority]) ||
  ((a.distance_ratio_to_review_radius ?? Infinity) - (b.distance_ratio_to_review_radius ?? Infinity)) ||
  String(a.brand).localeCompare(String(b.brand), 'zh-Hant') ||
  String(a.canonical_id).localeCompare(String(b.canonical_id)),
);

const high = audited.filter(item => item.review_priority === 'high');
const medium = audited.filter(item => item.review_priority === 'medium');
const low = audited.filter(item => item.review_priority === 'low');
const thin = audited.filter(item => item.thin_evidence);

const output = {
  dataset_version: 'taipei-osm-hole-audit-v01',
  source_dataset_version: reconciliation.dataset_version,
  osm_snapshot: reconciliation.osm_snapshot,
  policy: {
    convenience_review_radius_m: 50,
    supermarket_review_radius_m: 100,
    high_priority: 'nearest same-brand Overture entity is <=1.5x the category review radius',
    medium_priority: 'nearest is <=2x, or thin-evidence record is <=3x',
    low_priority: 'farther from same-brand baseline evidence; still not proof that the store is current',
    nearby_overture: 'up to five same-brand/category Overture candidates within 3x the category review radius, for deterministic QA only',
    note: 'Priority and nearby candidates are visual-QA metadata only. They do not alter reconciliation decisions or widen merge thresholds.',
  },
  stats: {
    total_safe_holes: audited.length,
    high_priority: high.length,
    medium_priority: medium.length,
    low_priority: low.length,
    thin_evidence: thin.length,
    with_branch: audited.filter(item => item.has_branch).length,
    with_address: audited.filter(item => item.has_address).length,
    multi_source_rows: audited.filter(item => item.source_rows > 1).length,
  },
  counts_by_brand: countBy(audited, item => item.brand),
  counts_by_category: countBy(audited, item => item.category),
  counts_by_distance_band: countBy(audited, item => item.distance_band),
  counts_by_priority: countBy(audited, item => item.review_priority),
  high_priority_by_brand: countBy(high, item => item.brand),
  medium_priority_by_brand: countBy(medium, item => item.brand),
  review_queue: audited,
};

if (output.stats.total_safe_holes !== reconciliation.stats.safe_holes) {
  throw new Error(`safe-hole audit count mismatch: ${output.stats.total_safe_holes} vs ${reconciliation.stats.safe_holes}`);
}

await fs.writeFile(outputPath, stableStringify(output));
console.log(`PASS · OSM hole audit ${audited.length}`);
console.log(`high=${high.length} medium=${medium.length} low=${low.length} thin=${thin.length}`);
console.log(`WROTE ${outputPath}`);
