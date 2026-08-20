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

function geometryCenter(geometry) {
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
  return [
    Number(((minLon + maxLon) / 2).toFixed(6)),
    Number(((minLat + maxLat) / 2).toFixed(6)),
  ];
}

await mkdir(GENERATED_DIR, { recursive: true });

console.log("Taipei-Maps Issue #31 - prepare z16 footprint identity audit");
console.log(`Reading existing citywide source: ${INPUT_PATH}`);
const raw = await readFile(INPUT_PATH, "utf8");
const collection = JSON.parse(raw);

if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
  throw new Error("Expected a GeoJSON FeatureCollection from the citywide build.");
}

const expected = [];
const seenIds = new Set();
let invalidIds = 0;
let missingCenters = 0;

for (const feature of collection.features) {
  const sourceId = parseSourceId(feature.id);
  if (sourceId == null || seenIds.has(sourceId)) {
    invalidIds += 1;
    continue;
  }
  seenIds.add(sourceId);

  const center = geometryCenter(feature.geometry);
  if (!center) missingCenters += 1;
  expected.push([sourceId, center?.[0] ?? null, center?.[1] ?? null]);

  // Keep the audit source intentionally tiny in attribute space: only the
  // identity we need to trace through z16 MVT generation.
  feature.properties = { source_id: sourceId };
}

if (invalidIds > 0) {
  throw new Error(`Audit preparation found ${invalidIds.toLocaleString()} missing/duplicate/unparseable source IDs.`);
}

const auditBody = JSON.stringify(collection);
const expectedBody = JSON.stringify({
  source_count: expected.length,
  missing_centers: missingCenters,
  records: expected,
});

await writeFile(AUDIT_GEOJSON_PATH, auditBody);
await writeFile(EXPECTED_INDEX_PATH, expectedBody);

const auditStat = await stat(AUDIT_GEOJSON_PATH);
const indexStat = await stat(EXPECTED_INDEX_PATH);
console.log(`Expected unique source IDs: ${expected.length.toLocaleString()}`);
console.log(`Records without a geometry center: ${missingCenters.toLocaleString()}`);
console.log(`Audit GeoJSON: ${(auditStat.size / 1024 / 1024).toFixed(1)} MiB`);
console.log(`Expected-ID index: ${(indexStat.size / 1024 / 1024).toFixed(1)} MiB`);
console.log("Audit preparation complete.");
