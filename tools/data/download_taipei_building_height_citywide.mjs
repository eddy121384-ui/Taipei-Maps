import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { deriveBuildingHeight } from "./taipei_building_height_semantics.mjs";

const ENDPOINTS = [
  "https://citydashboard.taipei/geo_server/taipei_vioc/ows",
  "https://citydashboard.taipei/geo_server/ows",
];
const TYPE_NAME = "taipei_vioc:tp_building_height";
const OUT_DIR = path.resolve("public/generated");
const OUT_PATH = path.join(OUT_DIR, "taipei_building_height_citywide.geojson");
const TMP_PATH = `${OUT_PATH}.tmp`;
const PAGE_SIZE = 5000;
const HEIGHT_CONSISTENCY_TOLERANCE_M = 0.05;

function makeUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, application/geo+json, application/xml, text/xml, */*",
      "User-Agent": "Taipei-Maps/0.1 issue-31-pmtiles-citywide",
    },
    redirect: "follow",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}; ${text.slice(0, 300).replace(/\s+/g, " ")}`);
  }
  return text;
}

function parseHitCount(xml) {
  const match = xml.match(/(?:numberMatched|numberOfFeatures)=["'](\d+)["']/i);
  return match ? Number(match[1]) : null;
}

async function getHits(base) {
  const xml = await fetchText(makeUrl(base, {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: TYPE_NAME,
    resultType: "hits",
    srsName: "EPSG:4326",
  }));
  return parseHitCount(xml);
}

async function getPage(base, startIndex) {
  const text = await fetchText(makeUrl(base, {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: TYPE_NAME,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    startIndex,
    count: PAGE_SIZE,
  }));
  const geojson = JSON.parse(text);
  if (geojson?.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    throw new Error(`unexpected GeoJSON shape: ${geojson?.type ?? "unknown"}`);
  }
  return geojson.features;
}

function slimFeature(feature) {
  if (!["Polygon", "MultiPolygon"].includes(feature?.geometry?.type)) return null;

  const derived = deriveBuildingHeight(feature.properties ?? {});
  return {
    feature: {
      type: "Feature",
      ...(feature.id !== undefined ? { id: feature.id } : {}),
      geometry: feature.geometry,
      properties: { height_m: derived.height_m },
    },
    derived,
  };
}

async function writeChunk(stream, text) {
  if (!stream.write(text)) await once(stream, "drain");
}

async function buildFromEndpoint(endpoint) {
  const expected = await getHits(endpoint);
  console.log(`Expected citywide features: ${expected?.toLocaleString() ?? "unknown"}`);

  await rm(TMP_PATH, { force: true });
  const stream = createWriteStream(TMP_PATH, { encoding: "utf8" });
  await writeChunk(stream, '{"type":"FeatureCollection","features":[');

  const seen = new Set();
  const sourceCounts = new Map();
  let startIndex = 0;
  let pageNumber = 0;
  let polygonCount = 0;
  let first = true;
  let maxDerivedHeight = 0;
  let maxRawTopElevation = -Infinity;
  let consistencyComparable = 0;
  let consistencyMismatch = 0;
  let maxConsistencyDiff = 0;

  try {
    while (true) {
      pageNumber += 1;
      const page = await getPage(endpoint, startIndex);
      if (!page.length) break;

      for (let i = 0; i < page.length; i += 1) {
        const raw = page[i];
        const key = String(raw.id ?? `${startIndex + i}`);
        if (seen.has(key)) continue;
        seen.add(key);

        const slim = slimFeature(raw);
        if (!slim) continue;

        const { feature, derived } = slim;
        sourceCounts.set(derived.source, (sourceCounts.get(derived.source) ?? 0) + 1);
        maxDerivedHeight = Math.max(maxDerivedHeight, derived.height_m);
        if (derived.top_elev_m != null) maxRawTopElevation = Math.max(maxRawTopElevation, derived.top_elev_m);
        if (derived.surveyed_vs_delta_diff_m != null) {
          consistencyComparable += 1;
          maxConsistencyDiff = Math.max(maxConsistencyDiff, derived.surveyed_vs_delta_diff_m);
          if (derived.surveyed_vs_delta_diff_m > HEIGHT_CONSISTENCY_TOLERANCE_M) {
            consistencyMismatch += 1;
          }
        }

        await writeChunk(stream, `${first ? "" : ","}${JSON.stringify(feature)}`);
        first = false;
        polygonCount += 1;
      }

      startIndex += page.length;
      console.log(`Page ${pageNumber}: +${page.length.toLocaleString()} -> ${seen.size.toLocaleString()} unique / ${polygonCount.toLocaleString()} polygons`);

      if (Number.isFinite(expected) && startIndex >= expected) break;
      if (page.length < PAGE_SIZE) break;
      if (pageNumber > 1000) throw new Error("paging guard tripped after 1000 pages");
    }

    await writeChunk(stream, "]}");
    stream.end();
    await once(stream, "finish");
  } catch (error) {
    stream.destroy();
    await rm(TMP_PATH, { force: true });
    throw error;
  }

  await rename(TMP_PATH, OUT_PATH);
  const info = await stat(OUT_PATH);
  console.log(`Wrote: ${OUT_PATH}`);
  console.log(`Unique WFS features: ${seen.size.toLocaleString()}`);
  console.log(`Polygon features: ${polygonCount.toLocaleString()}`);
  console.log("Height derivation:");
  for (const source of ["1_bud_high", "top_minus_entrance", "floors_x3.2", "fallback_9.6m"]) {
    console.log(`  ${source}: ${(sourceCounts.get(source) ?? 0).toLocaleString()}`);
  }
  console.log("Surveyed-height consistency check:");
  console.log(`  comparable 1_bud_high vs top-ent rows: ${consistencyComparable.toLocaleString()}`);
  console.log(`  mismatches > ${HEIGHT_CONSISTENCY_TOLERANCE_M.toFixed(2)} m: ${consistencyMismatch.toLocaleString()}`);
  console.log(`  max absolute difference: ${maxConsistencyDiff.toFixed(3)} m`);
  console.log(`Highest derived physical height: ${maxDerivedHeight.toFixed(1)} m`);
  console.log(`Highest raw 1_top_high elevation: ${Number.isFinite(maxRawTopElevation) ? `${maxRawTopElevation.toFixed(1)} m` : "n/a"}`);
  console.log(`Slim citywide GeoJSON size: ${(info.size / 1024 / 1024).toFixed(1)} MiB`);

  if (Number.isFinite(expected) && seen.size !== expected) {
    console.warn(`WARNING: WFS hits reported ${expected.toLocaleString()} but paging returned ${seen.size.toLocaleString()} unique features.`);
  }
}

await mkdir(OUT_DIR, { recursive: true });
let lastError = null;

for (const endpoint of ENDPOINTS) {
  try {
    console.log(`Endpoint: ${endpoint}`);
    await buildFromEndpoint(endpoint);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn(`  failed: ${error?.message ?? error}`);
  }
}

throw new Error(`Citywide download failed on all public WFS endpoints. Last error: ${lastError?.message ?? lastError}`);
