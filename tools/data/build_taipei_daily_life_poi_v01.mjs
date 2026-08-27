#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const configPath = path.join(__dirname, 'taipei_daily_life_poi_v01_config.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const engine = await import(pathToFileURL(path.join(repoRoot, config.canonical_engine_path)).href);
const { buildCanonical, classifyFeature, featureKey } = engine;

const outputDir = path.join(repoRoot, 'public', 'data', 'daily-life-poi');
const cacheDir = path.join(repoRoot, '.cache', 'daily-life-poi-v01');
const canonicalPath = path.join(outputDir, 'taipei-canonical-v01.geojson');
const unresolvedPath = path.join(outputDir, 'taipei-unresolved-v01.geojson');
const manifestPath = path.join(outputDir, 'taipei-poi-manifest-v01.json');
const defaultRawPath = path.join(cacheDir, 'overture-taipei-candidates-v01.geojson');
const defaultBoundaryPath = path.join(cacheDir, 'taipei-boundary-v01.geojson');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--raw') out.raw = argv[++i];
    else if (arg === '--boundary') out.boundary = argv[++i];
    else if (arg === '--python') out.python = argv[++i];
    else if (arg === '--skip-extract') out.skipExtract = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sameCoord(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length >= 2 && b.length >= 2 && a[0] === b[0] && a[1] === b[1];
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > point[1]) !== (yj > point[1]))
      && point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || 1e-15) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, coordinates) {
  if (!coordinates?.length || !pointInRing(point, coordinates[0])) return false;
  for (let i = 1; i < coordinates.length; i += 1) {
    if (pointInRing(point, coordinates[i])) return false;
  }
  return true;
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(poly => pointInPolygon(point, poly));
  return false;
}

function pointInBoundary(point, boundary) {
  return boundary.features.some(feature => pointInGeometry(point, feature.geometry));
}

function visitCoords(coords, callback) {
  if (!Array.isArray(coords)) return;
  if (coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
    callback(coords);
    return;
  }
  for (const child of coords) visitCoords(child, callback);
}

function boundaryBBox(boundary) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const feature of boundary.features) {
    visitCoords(feature.geometry?.coordinates, ([lon, lat]) => {
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    });
  }
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) throw new Error('boundary bbox could not be derived');
  return [minLon, minLat, maxLon, maxLat];
}

async function loadPinnedBoundary(boundaryOverride) {
  if (boundaryOverride) {
    const text = await fs.readFile(path.resolve(boundaryOverride), 'utf8');
    return { text, boundary: JSON.parse(text), source: path.resolve(boundaryOverride) };
  }
  await fs.mkdir(cacheDir, { recursive: true });
  let text;
  if (fsSync.existsSync(defaultBoundaryPath)) {
    text = await fs.readFile(defaultBoundaryPath, 'utf8');
  } else {
    const response = await fetch(config.boundary.url);
    if (!response.ok) throw new Error(`boundary download failed: HTTP ${response.status}`);
    text = await response.text();
    await fs.writeFile(defaultBoundaryPath, text);
  }
  return { text, boundary: JSON.parse(text), source: config.boundary.url };
}

function validateBoundary(boundary) {
  if (boundary?.type !== 'FeatureCollection' || !Array.isArray(boundary.features)) throw new Error('Taipei boundary is not a FeatureCollection');
  if (boundary.features.length !== config.boundary.expected_feature_count) {
    throw new Error(`Taipei boundary feature count ${boundary.features.length} != ${config.boundary.expected_feature_count}`);
  }
  const ids = new Set(boundary.features.map(feature => String(feature.properties?.id || '')));
  if (ids.size !== config.boundary.expected_feature_count) throw new Error('Taipei boundary district ids are not unique');
}

function findPython(preferred) {
  const candidates = [preferred, process.env.PYTHON, 'python3', 'python'].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-c', 'import duckdb'], { stdio: 'ignore' });
    if (probe.status === 0) return candidate;
  }
  throw new Error('Python duckdb is required. Install with: python -m pip install duckdb');
}

function extractRaw({ python, bbox, rawPath }) {
  const extractor = path.join(__dirname, 'extract_overture_places_bbox.py');
  const args = [
    extractor,
    '--s3-path', config.overture_s3_path,
    '--bbox', bbox.join(','),
    '--output', rawPath,
  ];
  const result = spawnSync(python, args, { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Overture extraction failed with exit ${result.status}`);
}

function entityFeature(entity) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: entity.coordinates },
    properties: {
      canonical_id: entity.canonical_id,
      category: entity.category,
      brand: entity.brand,
      branch: entity.branch || '',
      name: entity.name,
      source_rows: entity.source_rows,
      source_ids: [...entity.source_ids],
      source_names: [...entity.source_names],
      sources: [...entity.sources],
      representative_key: entity.representative_key,
      representative_strength: entity.representative_strength,
      address: entity.address || '',
      merge_reasons: [...entity.merge_reasons],
      branch_conflict: Boolean(entity.branch_conflict),
      address_conflict: Boolean(entity.address_conflict),
    },
  };
}

function unresolvedFeature(pair, rawItems) {
  const a = rawItems[pair.ia];
  const b = rawItems[pair.ib];
  const keys = [String(a.key), String(b.key)].sort();
  const pairId = `buju-unresolved-${sha256(keys.join('|')).slice(0, 12)}`;
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [a.f.geometry.coordinates, b.f.geometry.coordinates] },
    properties: {
      pair_id: pairId,
      category: a.cat,
      brand: a.brand,
      distance_m: Math.round(pair.distance * 10) / 10,
      reason: pair.reason,
      source_keys: keys,
      source_ids: [a.f.properties?.id || a.key, b.f.properties?.id || b.key].map(String).sort(),
      source_names: [a.rawName || '', b.rawName || ''],
      branches: [a.branch || '', b.branch || ''],
      addresses: [a.address || '', b.address || ''],
      same_branch: Boolean(pair.sameBranch),
      same_address: Boolean(pair.sameAddress),
      exact_raw_name: Boolean(pair.exactRaw),
      generic_specific: Boolean(pair.genericSpecific),
    },
  };
}

function sortedCounts(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, 'zh-Hant')));
}

function canonicalizeStable(features) {
  const ordered = [...features].sort((a, b) => String(featureKey(a)).localeCompare(String(featureKey(b))));
  const result = buildCanonical(ordered);
  result.entities.sort((a, b) => `${a.category}|${a.brand}|${a.canonical_id}`.localeCompare(`${b.category}|${b.brand}|${b.canonical_id}`, 'zh-Hant'));
  result.unresolved.sort((a, b) => {
    const ak = [result.rawItems[a.ia].key, result.rawItems[a.ib].key].map(String).sort().join('|');
    const bk = [result.rawItems[b.ia].key, result.rawItems[b.ib].key].map(String).sort().join('|');
    return ak.localeCompare(bk);
  });
  return result;
}

function logicalSignature(result) {
  return result.entities.map(entity => ({
    canonical_id: entity.canonical_id,
    source_ids: [...entity.source_ids].sort(),
    coordinates: entity.coordinates,
  }));
}

function validateResult(result, boundary) {
  const allowedBrands = new Set(config.brands);
  const allowedCategories = new Set(config.categories);
  const sourceOwner = new Map();
  const rawBySourceId = new Map();
  for (const item of result.rawItems) rawBySourceId.set(String(item.f.properties?.id || item.key), item);

  for (const entity of result.entities) {
    if (!allowedBrands.has(entity.brand)) throw new Error(`unexpected brand: ${entity.brand}`);
    if (!allowedCategories.has(entity.category)) throw new Error(`unexpected category: ${entity.category}`);
    if (!pointInBoundary(entity.coordinates, boundary)) throw new Error(`canonical point outside Taipei: ${entity.canonical_id}`);
    if (!Array.isArray(entity.source_ids) || entity.source_ids.length < 1) throw new Error(`missing provenance: ${entity.canonical_id}`);
    const coordinateIsReal = entity.source_ids.some(sourceId => {
      const item = rawBySourceId.get(String(sourceId));
      return item && sameCoord(item.f.geometry.coordinates, entity.coordinates);
    });
    if (!coordinateIsReal) throw new Error(`representative coordinate is synthetic: ${entity.canonical_id}`);
    for (const sourceId of entity.source_ids) {
      const key = String(sourceId);
      if (sourceOwner.has(key)) throw new Error(`source id ${key} belongs to multiple canonical entities`);
      sourceOwner.set(key, entity.canonical_id);
    }
  }
}

function buildTimestamp() {
  const epoch = Number(process.env.SOURCE_DATE_EPOCH || '');
  return Number.isFinite(epoch) && epoch > 0 ? new Date(epoch * 1000).toISOString() : new Date().toISOString();
}

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });

  const { text: boundaryText, boundary, source: boundarySource } = await loadPinnedBoundary(args.boundary);
  validateBoundary(boundary);
  const bbox = boundaryBBox(boundary);

  const rawPath = path.resolve(args.raw || defaultRawPath);
  if (!args.raw && !args.skipExtract) {
    const python = findPython(args.python);
    extractRaw({ python, bbox, rawPath });
  }
  if (!fsSync.existsSync(rawPath)) throw new Error(`raw candidate GeoJSON not found: ${rawPath}`);

  const rawCollection = JSON.parse(await fs.readFile(rawPath, 'utf8'));
  if (rawCollection?.type !== 'FeatureCollection' || !Array.isArray(rawCollection.features)) throw new Error('raw Overture extract is not a FeatureCollection');

  const pointCandidates = rawCollection.features.filter(feature => feature?.geometry?.type === 'Point');
  const insideTaipei = pointCandidates.filter(feature => pointInBoundary(feature.geometry.coordinates, boundary));
  const classified = insideTaipei.filter(feature => classifyFeature(feature));
  const result = canonicalizeStable(classified);
  validateResult(result, boundary);

  const reversed = canonicalizeStable([...classified].reverse());
  if (JSON.stringify(logicalSignature(result)) !== JSON.stringify(logicalSignature(reversed))) {
    throw new Error('determinism regression: reversing raw input changed canonical membership/ids');
  }

  const canonical = {
    type: 'FeatureCollection',
    features: result.entities.map(entityFeature),
  };
  const unresolved = {
    type: 'FeatureCollection',
    features: result.unresolved.map(pair => unresolvedFeature(pair, result.rawItems)),
  };
  unresolved.features.sort((a, b) => a.properties.pair_id.localeCompare(b.properties.pair_id));

  const sourceDatasets = result.rawItems.flatMap(item => item.sources || []);
  const logicalHashInput = {
    dataset_version: config.dataset_version,
    overture_release: config.overture_release,
    boundary_version: config.boundary.version,
    canonical_engine_version: config.canonical_engine_version,
    canonical,
    unresolved,
  };

  const manifest = {
    dataset_version: config.dataset_version,
    build_timestamp: buildTimestamp(),
    overture_release: config.overture_release,
    overture_theme: config.overture_theme,
    overture_type: config.overture_type,
    overture_s3_path: config.overture_s3_path,
    boundary_source: boundarySource,
    boundary_source_repo: config.boundary.source_repo,
    boundary_source_commit: config.boundary.source_commit,
    boundary_source_path: config.boundary.source_path,
    boundary_version: config.boundary.version,
    boundary_feature_count: boundary.features.length,
    boundary_sha256: sha256(boundaryText),
    boundary_bbox: bbox,
    canonical_engine_version: config.canonical_engine_version,
    raw_input_count: rawCollection.features.length,
    point_candidate_count: pointCandidates.length,
    inside_taipei_count: insideTaipei.length,
    classified_target_count: result.rawItems.length,
    canonical_count: result.entities.length,
    unresolved_count: result.unresolved.length,
    counts_by_category: sortedCounts(result.entities.map(entity => entity.category)),
    counts_by_brand: sortedCounts(result.entities.map(entity => entity.brand)),
    source_dataset_counts: sortedCounts(sourceDatasets),
    logical_dataset_sha256: sha256(JSON.stringify(logicalHashInput)),
  };

  await fs.writeFile(canonicalPath, stableStringify(canonical));
  await fs.writeFile(unresolvedPath, stableStringify(unresolved));
  await fs.writeFile(manifestPath, stableStringify(manifest));

  console.log(`PASS · ${config.dataset_version}`);
  console.log(`Overture ${config.overture_release}`);
  console.log(`bbox candidates: ${rawCollection.features.length}`);
  console.log(`inside Taipei: ${insideTaipei.length}`);
  console.log(`target raw records: ${result.rawItems.length}`);
  console.log(`canonical POIs: ${result.entities.length}`);
  console.log(`unresolved nearby pairs: ${result.unresolved.length}`);
  for (const [brand, count] of Object.entries(manifest.counts_by_brand)) console.log(`${brand}: ${count}`);
  console.log(`logical sha256: ${manifest.logical_dataset_sha256}`);
}

await main();
