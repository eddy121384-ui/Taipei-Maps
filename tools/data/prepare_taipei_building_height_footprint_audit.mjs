import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const GENERATED_DIR = path.resolve("public/generated");
const INPUT_PATH = path.join(GENERATED_DIR, "taipei_building_height_citywide.geojson");
const AUDIT_GEOJSON_PATH = path.join(GENERATED_DIR, "taipei_building_height_footprint_audit.geojson");
const EXPECTED_INDEX_PATH = path.join(GENERATED_DIR, "taipei_building_height_footprint_expected.json");

function parseSourceId(value) {
  const match = String(value ?? "").match(/(?:^|\.)(\d+)$/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) ? number : null;
}

function geometryMetrics(geometry) {
  const coordinates = geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  const stack = [coordinates];

  while (stack.length) {
    const value = stack.pop();
    if (!Array.isArray(value)) continue;
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number" &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1])
    ) {
      minLon = Math.min(minLon, value[0]);
      minLat = Math.min(minLat, value[1]);
      maxLon = Math.max(maxLon, value[0]);
      maxLat = Math.max(maxLat, value[1]);
    } else {
      for (const child of value) stack.push(child);
    }
  }

  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return null;

  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const latRad = centerLat * Math.PI / 180;
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos(latRad);
  const widthM = Math.max(0, (maxLon - minLon) * metersPerDegLon);
  const heightM = Math.max(0, (maxLat - minLat) * metersPerDegLat);

  return {
    centerLon: Number(centerLon.toFixed(6)),
    centerLat: Number(centerLat.toFixed(6)),
    widthM: Number(widthM.toFixed(3)),
    heightM: Number(heightM.toFixed(3)),
    bboxAreaM2: Number((widthM * heightM).toFixed(3)),
  };
}

await mkdir(GENERATED_DIR, { recursive: true });

console.log("Taipei-Maps Issue #31 - prepare z16/z17/z18 footprint identity audit");
console.log(`Reading existing citywide source: ${INPUT_PATH}`);
const raw = await readFile(INPUT_PATH, "utf8");
const collection = JSON.parse(raw);

if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
  throw new Error("Expected a GeoJSON FeatureCollection from the citywide build.");
}

const expected = [];
const seenIds = new Set();
let invalidIds = 0;
let missingMetrics = 0;

for (const feature of collection.features) {
  const sourceId = parseSourceId(feature.id);
  if (sourceId == null || seenIds.has(sourceId)) {
    invalidIds += 1;
    continue;
  }
  seenIds.add(sourceId);

  const metrics = geometryMetrics(feature.geometry);
  if (!metrics) missingMetrics += 1;
  expected.push([
    sourceId,
    metrics?.centerLon ?? null,
    metrics?.centerLat ?? null,
    metrics?.widthM ?? null,
    metrics?.heightM ?? null,
    metrics?.bboxAreaM2 ?? null,
  ]);

  // Keep the audit source intentionally tiny in attribute space: only the
  // identity we need to trace through MVT generation.
  feature.properties = { source_id: sourceId };
}

if (invalidIds > 0) {
  throw new Error(`Audit preparation found ${invalidIds.toLocaleString()} missing/duplicate/unparseable source IDs.`);
}

const auditBody = JSON.stringify(collection);
const expectedBody = JSON.stringify({
  source_count: expected.length,
  missing_metrics: missingMetrics,
  records: expected,
});

await writeFile(AUDIT_GEOJSON_PATH, auditBody);
await writeFile(EXPECTED_INDEX_PATH, expectedBody);

const auditStat = await stat(AUDIT_GEOJSON_PATH);
const indexStat = await stat(EXPECTED_INDEX_PATH);
console.log(`Expected unique source IDs: ${expected.length.toLocaleString()}`);
console.log(`Records without geometry metrics: ${missingMetrics.toLocaleString()}`);
console.log(`Audit GeoJSON: ${(auditStat.size / 1024 / 1024).toFixed(1)} MiB`);
console.log(`Expected-ID index: ${(indexStat.size / 1024 / 1024).toFixed(1)} MiB`);
console.log("Audit preparation complete.");
