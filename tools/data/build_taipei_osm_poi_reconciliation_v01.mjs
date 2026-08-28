#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const configPath = path.join(__dirname, 'taipei_osm_poi_reconciliation_v01_config.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const boundaryConfig = JSON.parse(await fs.readFile(path.join(repoRoot, config.boundary_config_path), 'utf8'));
const canonicalEngine = await import(pathToFileURL(path.join(repoRoot, config.canonical_engine_path)).href);
const reconcileEngine = await import(pathToFileURL(path.join(repoRoot, config.reconcile_engine_path)).href);
const { buildCanonical, classifyFeature, featureKey } = canonicalEngine;
const { reconcileCanonicalPOI } = reconcileEngine;

const outputDir = path.join(repoRoot, 'public', 'data', 'daily-life-poi');
const cacheDir = path.join(repoRoot, '.cache', 'osm-poi-reconciliation-v01');
const boundaryCachePath = path.join(cacheDir, 'taipei-boundary-v01.geojson');
const overpassRawPath = path.join(cacheDir, 'taipei-osm-overpass-v01.json');
const osmTargetPath = path.join(outputDir, 'taipei-osm-target-v01.geojson');
const osmCanonicalPath = path.join(outputDir, 'taipei-osm-canonical-v01.geojson');
const reconciliationPath = path.join(outputDir, 'taipei-osm-reconciliation-v01.json');
const finalPath = path.join(outputDir, 'taipei-canonical-reconciled-v01.geojson');
const manifestPath = path.join(outputDir, 'taipei-poi-reconciled-manifest-v01.json');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--skip-fetch') out.skipFetch = true;
    else if (arg === '--overpass-raw') out.overpassRaw = argv[++i];
    else if (arg === '--boundary') out.boundary = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function stableStringify(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const intersects = ((yi > point[1]) !== (yj > point[1])) && point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || 1e-15) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
function pointInPolygon(point, coordinates) {
  if (!coordinates?.length || !pointInRing(point, coordinates[0])) return false;
  for (let i = 1; i < coordinates.length; i += 1) if (pointInRing(point, coordinates[i])) return false;
  return true;
}
function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(poly => pointInPolygon(point, poly));
  return false;
}
function pointInBoundary(point, boundary) { return boundary.features.some(feature => pointInGeometry(point, feature.geometry)); }
function visitCoords(coords, callback) {
  if (!Array.isArray(coords)) return;
  if (coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) { callback(coords); return; }
  for (const child of coords) visitCoords(child, callback);
}
function boundaryBBox(boundary) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const feature of boundary.features) visitCoords(feature.geometry?.coordinates, ([lon, lat]) => {
    minLon = Math.min(minLon, lon); minLat = Math.min(minLat, lat); maxLon = Math.max(maxLon, lon); maxLat = Math.max(maxLat, lat);
  });
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) throw new Error('boundary bbox could not be derived');
  return [minLon, minLat, maxLon, maxLat];
}

async function loadBoundary(overridePath) {
  await fs.mkdir(cacheDir, { recursive: true });
  if (overridePath) {
    const text = await fs.readFile(path.resolve(overridePath), 'utf8');
    return { text, boundary: JSON.parse(text), source: path.resolve(overridePath) };
  }
  let text;
  if (fsSync.existsSync(boundaryCachePath)) text = await fs.readFile(boundaryCachePath, 'utf8');
  else {
    const response = await fetch(boundaryConfig.boundary.url);
    if (!response.ok) throw new Error(`boundary download failed: HTTP ${response.status}`);
    text = await response.text();
    await fs.writeFile(boundaryCachePath, text);
  }
  return { text, boundary: JSON.parse(text), source: boundaryConfig.boundary.url };
}
function validateBoundary(boundary) {
  if (boundary?.type !== 'FeatureCollection' || !Array.isArray(boundary.features)) throw new Error('Taipei boundary is not a FeatureCollection');
  if (boundary.features.length !== boundaryConfig.boundary.expected_feature_count) throw new Error(`unexpected Taipei district count: ${boundary.features.length}`);
}

function overpassQuery(bbox) {
  const [west, south, east, north] = bbox;
  return `[out:json][timeout:180][date:"${config.osm_snapshot}"];\n(\n  nwr["shop"="convenience"](${south},${west},${north},${east});\n  nwr["shop"="supermarket"](${south},${west},${north},${east});\n);\nout meta center;`;
}
async function fetchOverpass(bbox, targetPath) {
  const body = `data=${encodeURIComponent(overpassQuery(bbox))}`;
  let lastError;
  for (const endpoint of config.overpass_endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': 'Buju-Taipei-Maps/poi-reconciliation-v0.1' },
        body,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = JSON.parse(await response.text());
      if (!Array.isArray(parsed.elements)) throw new Error('Overpass response has no elements array');
      await fs.writeFile(targetPath, stableStringify(parsed));
      console.log(`WROTE ${targetPath} via ${endpoint}`);
      return endpoint;
    } catch (error) {
      lastError = error;
      console.warn(`Overpass endpoint failed ${endpoint}: ${error.message}`);
    }
  }
  throw new Error(`all Overpass endpoints failed: ${lastError?.message || 'unknown error'}`);
}

const BRAND_RULES = [
  ['7-ELEVEN', /(?:7\s*[-‐‑–—]?\s*eleven|7\s*[-‐‑–—]?\s*11|統一超商)/i],
  ['全家', /(?:family\s*mart|全家便利商店|(?:^|\s)全家(?:\s|$|店|門市))/i],
  ['萊爾富', /(?:hi\s*[-‐‑–—]?\s*life|萊爾富)/i],
  ['OK Mart', /(?:\bok\s*mart\b|ok超商)/i],
  ['全聯', /(?:px\s*mart|全聯)/i],
  ['家樂福', /(?:carrefour|家樂福)/i],
  ['美廉社', /(?:simple\s*mart|美廉社)/i],
];
function brandHint(tags = {}) {
  const haystack = [tags.brand, tags['brand:zh'], tags.name, tags['name:zh'], tags.operator].filter(Boolean).join(' | ');
  for (const [brand, regex] of BRAND_RULES) if (regex.test(haystack)) return brand;
  return '';
}
function osmAddress(tags = {}) {
  if (tags['addr:full']) return tags['addr:full'];
  return [tags['addr:postcode'], tags['addr:city'], tags['addr:district'], tags['addr:suburb'], tags['addr:street'], tags['addr:housenumber'], tags['addr:floor']].filter(Boolean).join(' ');
}
function osmCoordinates(element) {
  if (Number.isFinite(element.lon) && Number.isFinite(element.lat)) return [element.lon, element.lat];
  if (Number.isFinite(element.center?.lon) && Number.isFinite(element.center?.lat)) return [element.center.lon, element.center.lat];
  return null;
}
function osmElementFeature(element) {
  const coordinates = osmCoordinates(element); if (!coordinates) return null;
  const tags = element.tags || {}, brand = brandHint(tags); if (!brand) return null;
  const name = tags.name || tags['name:zh'] || tags.brand || tags['brand:zh'] || brand;
  return {
    type: 'Feature', geometry: { type: 'Point', coordinates },
    properties: {
      id: `osm:${element.type}/${element.id}`, '@name': name, brand: { names: { primary: brand } }, addresses: osmAddress(tags), sources: [{ dataset: 'OpenStreetMap' }],
      osm_type: element.type, osm_id: element.id, osm_version: element.version ?? null, osm_timestamp: element.timestamp || '', osm_changeset: element.changeset ?? null,
      osm_shop: tags.shop || '', osm_name: tags.name || '', osm_brand: tags.brand || '', osm_operator: tags.operator || '',
    },
  };
}

function stableCanonicalize(features) {
  const ordered = [...features].sort((a, b) => String(featureKey(a)).localeCompare(String(featureKey(b))));
  const result = buildCanonical(ordered);
  result.entities.sort((a, b) => `${a.category}|${a.brand}|${a.canonical_id}`.localeCompare(`${b.category}|${b.brand}|${b.canonical_id}`, 'zh-Hant'));
  return result;
}
function baselineFeatureToEntity(feature) {
  const p = feature.properties || {};
  return {
    canonical_id: p.canonical_id, category: p.category, brand: p.brand, branch: p.branch || '', name: p.name || p.brand, coordinates: [...feature.geometry.coordinates],
    source_rows: Number(p.source_rows || 1), source_ids: Array.isArray(p.source_ids) ? [...p.source_ids] : [], source_names: Array.isArray(p.source_names) ? [...p.source_names] : [],
    sources: Array.isArray(p.sources) ? [...p.sources] : [], representative_key: p.representative_key || p.canonical_id, representative_strength: Number(p.representative_strength || 0),
    address: p.address || '', merge_reasons: Array.isArray(p.merge_reasons) ? [...p.merge_reasons] : [], branch_conflict: Boolean(p.branch_conflict), address_conflict: Boolean(p.address_conflict),
    source_kind: 'overture_baseline',
  };
}
function osmCanonicalEntity(entity, rawById) {
  const objects = entity.source_ids.map(sourceId => rawById.get(String(sourceId))?.properties).filter(Boolean).map(p => ({
    osm_type: p.osm_type, osm_id: p.osm_id, osm_version: p.osm_version, osm_timestamp: p.osm_timestamp, osm_shop: p.osm_shop, osm_name: p.osm_name, osm_brand: p.osm_brand, osm_operator: p.osm_operator,
  }));
  return { ...entity, source_kind: 'osm_secondary', osm_objects: objects };
}
function entityFeature(entity) {
  return {
    type: 'Feature', geometry: { type: 'Point', coordinates: [...entity.coordinates] },
    properties: {
      canonical_id: entity.canonical_id, category: entity.category, brand: entity.brand, branch: entity.branch || '', name: entity.name || entity.brand,
      source_rows: entity.source_rows, source_ids: [...(entity.source_ids || [])], source_names: [...(entity.source_names || [])], sources: [...(entity.sources || [])],
      representative_key: entity.representative_key || entity.canonical_id, representative_strength: entity.representative_strength ?? 0, address: entity.address || '',
      merge_reasons: [...(entity.merge_reasons || [])], branch_conflict: Boolean(entity.branch_conflict), address_conflict: Boolean(entity.address_conflict), source_kind: entity.source_kind || '',
      osm_objects: entity.osm_objects || [], nearest_same_brand_distance_m: entity.nearest_same_brand_distance_m ?? null,
    },
  };
}
function normalizedOsmTargetFeature(feature) {
  const item = classifyFeature(feature);
  return {
    type: 'Feature', geometry: feature.geometry,
    properties: {
      source_id: feature.properties.id, category: item.cat, brand: item.brand, branch: item.branch || '', name: item.rawName || item.brand, address: item.address || '',
      osm_type: feature.properties.osm_type, osm_id: feature.properties.osm_id, osm_version: feature.properties.osm_version, osm_timestamp: feature.properties.osm_timestamp,
      osm_shop: feature.properties.osm_shop, osm_brand: feature.properties.osm_brand, osm_operator: feature.properties.osm_operator,
    },
  };
}
function sortedCounts(values) {
  const counts = {}; for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, 'zh-Hant')));
}
function buildTimestamp() {
  const epoch = Number(process.env.SOURCE_DATE_EPOCH || '');
  return Number.isFinite(epoch) && epoch > 0 ? new Date(epoch * 1000).toISOString() : new Date().toISOString();
}
function reconcileSignature(result) {
  return {
    matched: result.matched.map(x => [x.osm_canonical_id, x.overture_canonical_id]),
    holes: result.safeHoles.map(x => [x.canonical_id, ...(x.source_ids || [])]),
    unresolved: result.unresolved.map(x => [x.osm_canonical_id, x.reason, ...(x.candidates || []).map(c => c.overture_canonical_id)]),
    final: result.finalEntities.map(x => [x.canonical_id, x.source_kind]),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(outputDir, { recursive: true }); await fs.mkdir(cacheDir, { recursive: true });
  const { text: boundaryText, boundary, source: boundarySource } = await loadBoundary(args.boundary); validateBoundary(boundary); const bbox = boundaryBBox(boundary);

  const rawPath = path.resolve(args.overpassRaw || overpassRawPath);
  let overpassEndpoint = 'fixture-or-cache';
  if (!args.overpassRaw && !args.skipFetch) overpassEndpoint = await fetchOverpass(bbox, rawPath);
  if (!fsSync.existsSync(rawPath)) throw new Error(`Overpass raw JSON not found: ${rawPath}`);
  const rawText = await fs.readFile(rawPath, 'utf8'), raw = JSON.parse(rawText); if (!Array.isArray(raw.elements)) throw new Error('Overpass raw JSON has no elements array');

  const rawFeatures = raw.elements.map(osmElementFeature).filter(Boolean);
  const insideTaipei = rawFeatures.filter(feature => pointInBoundary(feature.geometry.coordinates, boundary));
  const classified = insideTaipei.filter(feature => classifyFeature(feature)); classified.sort((a, b) => String(featureKey(a)).localeCompare(String(featureKey(b))));

  const targetCollection = { type: 'FeatureCollection', features: classified.map(normalizedOsmTargetFeature) };
  targetCollection.features.sort((a, b) => String(a.properties.source_id).localeCompare(String(b.properties.source_id)));

  const osmResult = stableCanonicalize(classified), rawById = new Map(classified.map(feature => [String(feature.properties.id), feature]));
  const osmEntities = osmResult.entities.map(entity => osmCanonicalEntity(entity, rawById));
  const osmCanonicalCollection = { type: 'FeatureCollection', features: osmEntities.map(entityFeature) };

  const baselineCollection = JSON.parse(await fs.readFile(path.join(repoRoot, config.baseline_canonical_path), 'utf8'));
  const baselineManifest = JSON.parse(await fs.readFile(path.join(repoRoot, config.baseline_manifest_path), 'utf8'));
  const baselineEntities = baselineCollection.features.map(baselineFeatureToEntity);
  if (baselineEntities.length !== baselineManifest.canonical_count) throw new Error('baseline manifest canonical count does not match baseline GeoJSON');

  const reconciliation = reconcileCanonicalPOI(baselineEntities, osmEntities);
  const reversedOsm = stableCanonicalize([...classified].reverse()).entities.map(entity => osmCanonicalEntity(entity, rawById));
  const reversedReconciliation = reconcileCanonicalPOI(baselineEntities, reversedOsm);
  if (JSON.stringify(reconcileSignature(reconciliation)) !== JSON.stringify(reconcileSignature(reversedReconciliation))) throw new Error('determinism regression: reversing OSM input changed reconciliation');

  if (reconciliation.stats.final_canonical !== baselineEntities.length + reconciliation.stats.safe_holes) throw new Error('final count does not equal baseline + safe holes');
  if (reconciliation.stats.matched + reconciliation.stats.safe_holes + reconciliation.stats.cross_source_unresolved !== osmEntities.length) throw new Error('OSM reconciliation decisions do not partition OSM canonical entities');
  const baselineIds = new Set(baselineEntities.map(entity => entity.canonical_id)), finalIds = new Set(reconciliation.finalEntities.map(entity => entity.canonical_id));
  for (const id of baselineIds) if (!finalIds.has(id)) throw new Error(`baseline id missing from final: ${id}`);
  for (const feature of targetCollection.features) {
    if (!pointInBoundary(feature.geometry.coordinates, boundary)) throw new Error(`OSM target outside Taipei: ${feature.properties.source_id}`);
    if (!config.brands.includes(feature.properties.brand)) throw new Error(`unsupported OSM brand: ${feature.properties.brand}`);
    if (!config.categories.includes(feature.properties.category)) throw new Error(`unsupported OSM category: ${feature.properties.category}`);
  }

  const finalCollection = { type: 'FeatureCollection', features: reconciliation.finalEntities.map(entityFeature) };
  const reconciliationOutput = {
    dataset_version: config.dataset_version, osm_snapshot: config.osm_snapshot, stats: reconciliation.stats, matched: reconciliation.matched,
    safe_holes: reconciliation.safeHoles.map(entity => ({ canonical_id: entity.canonical_id, osm_source_ids: [...(entity.source_ids || [])], category: entity.category, brand: entity.brand, name: entity.name, coordinates: entity.coordinates, nearest_same_brand_distance_m: entity.nearest_same_brand_distance_m })),
    cross_source_unresolved: reconciliation.unresolved,
  };
  const logicalHashInput = { dataset_version: config.dataset_version, osm_snapshot: config.osm_snapshot, baseline_logical_sha256: baselineManifest.logical_dataset_sha256, osm_target: targetCollection, osm_canonical: osmCanonicalCollection, reconciliation: reconciliationOutput, final: finalCollection };
  const manifest = {
    dataset_version: config.dataset_version, build_timestamp: buildTimestamp(), overture_release: baselineManifest.overture_release,
    overture_baseline_dataset_version: baselineManifest.dataset_version, overture_baseline_logical_sha256: baselineManifest.logical_dataset_sha256, overture_baseline_count: baselineEntities.length,
    osm_snapshot: config.osm_snapshot, osm_query: overpassQuery(bbox), overpass_endpoint_last_fetch: overpassEndpoint,
    osm_raw_element_count: raw.elements.length, osm_target_count: classified.length, osm_canonical_count: osmEntities.length,
    matched_count: reconciliation.stats.matched, safe_hole_count: reconciliation.stats.safe_holes, cross_source_unresolved_count: reconciliation.stats.cross_source_unresolved,
    final_canonical_count: reconciliation.stats.final_canonical, final_counts_by_brand: sortedCounts(reconciliation.finalEntities.map(entity => entity.brand)), final_counts_by_category: sortedCounts(reconciliation.finalEntities.map(entity => entity.category)),
    osm_hole_counts_by_brand: sortedCounts(reconciliation.safeHoles.map(entity => entity.brand)), boundary_source: boundarySource, boundary_version: boundaryConfig.boundary.version, boundary_sha256: sha256(boundaryText), boundary_bbox: bbox,
    canonical_engine_version: baselineManifest.canonical_engine_version, reconciliation_engine_version: 'buju-poi-reconcile-v0.1', logical_dataset_sha256: sha256(JSON.stringify(logicalHashInput)),
  };

  await fs.writeFile(osmTargetPath, stableStringify(targetCollection)); await fs.writeFile(osmCanonicalPath, stableStringify(osmCanonicalCollection));
  await fs.writeFile(reconciliationPath, stableStringify(reconciliationOutput)); await fs.writeFile(finalPath, stableStringify(finalCollection)); await fs.writeFile(manifestPath, stableStringify(manifest));

  console.log(`PASS · ${config.dataset_version}`); console.log(`OSM snapshot: ${config.osm_snapshot}`); console.log(`OSM raw elements: ${raw.elements.length}`);
  console.log(`OSM target records: ${classified.length}`); console.log(`OSM canonical: ${osmEntities.length}`); console.log(`matched: ${reconciliation.stats.matched}`);
  console.log(`safe holes: ${reconciliation.stats.safe_holes}`); console.log(`cross-source unresolved: ${reconciliation.stats.cross_source_unresolved}`); console.log(`final canonical: ${reconciliation.stats.final_canonical}`);
  console.log(`logical sha256: ${manifest.logical_dataset_sha256}`);
}

main().catch(error => { console.error(error.stack || error.message || error); process.exit(1); });
