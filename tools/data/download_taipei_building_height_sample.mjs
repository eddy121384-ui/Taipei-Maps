import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deriveBuildingHeight } from "./taipei_building_height_semantics.mjs";

const ENDPOINTS = [
  "https://citydashboard.taipei/geo_server/taipei_vioc/ows",
  "https://citydashboard.taipei/geo_server/ows",
];
const TYPE_NAME = "taipei_vioc:tp_building_height";
const OUT_DIR = path.resolve("public/generated");
const OUT_PATH = path.join(OUT_DIR, "taipei_building_height_sample.geojson");

// Three-district-scale urban sample: Daan + Songshan + Xinyi, plus small edge overlap.
// This is intentionally a rectangular benchmark area, not an administrative-boundary product cut.
const BBOX = "121.5200,25.0050,121.6350,25.0750,EPSG:4326";
const PAGE_SIZE = 5000;

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
      "User-Agent": "Taipei-Maps/0.1 issue-31-pmtiles-sample",
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
    bbox: BBOX,
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
    bbox: BBOX,
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
    type: "Feature",
    ...(feature.id !== undefined ? { id: feature.id } : {}),
    geometry: feature.geometry,
    properties: {
      height_m: derived.height_m,
      height_source: derived.source,
    },
    _derived: derived,
  };
}

await mkdir(OUT_DIR, { recursive: true });
let lastError = null;

for (const endpoint of ENDPOINTS) {
  try {
    console.log(`Endpoint: ${endpoint}`);
    const expected = await getHits(endpoint);
    console.log(`Expected features in sample bbox: ${expected?.toLocaleString() ?? "unknown"}`);

    const byId = new Map();
    let startIndex = 0;
    let pageNumber = 0;

    while (true) {
      pageNumber += 1;
      const page = await getPage(endpoint, startIndex);
      if (!page.length) break;

      for (const feature of page) {
        const key = feature.id ?? `${startIndex}:${byId.size}`;
        byId.set(String(key), feature);
      }

      startIndex += page.length;
      console.log(`Page ${pageNumber}: +${page.length.toLocaleString()} -> ${byId.size.toLocaleString()} unique`);

      if (Number.isFinite(expected) && byId.size >= expected) break;
      if (page.length === 0) break;
      if (pageNumber > 500) throw new Error("paging guard tripped after 500 pages");
    }

    const sourceCounts = new Map();
    let maxDerivedHeight = 0;
    let maxRawTopElevation = -Infinity;
    const features = [...byId.values()].map(slimFeature).filter(Boolean).map((feature) => {
      const derived = feature._derived;
      sourceCounts.set(derived.source, (sourceCounts.get(derived.source) ?? 0) + 1);
      maxDerivedHeight = Math.max(maxDerivedHeight, derived.height_m);
      if (derived.top_elev_m != null) maxRawTopElevation = Math.max(maxRawTopElevation, derived.top_elev_m);
      delete feature._derived;
      return feature;
    });

    const out = { type: "FeatureCollection", features };
    const body = JSON.stringify(out);
    await writeFile(OUT_PATH, body);

    console.log(`Wrote: ${OUT_PATH}`);
    console.log(`Polygon features: ${features.length.toLocaleString()}`);
    console.log("Height derivation:");
    for (const source of ["top_minus_entrance", "1_bd_high", "floors_x3.2", "fallback_9.6m"]) {
      console.log(`  ${source}: ${(sourceCounts.get(source) ?? 0).toLocaleString()}`);
    }
    console.log(`Highest derived physical height: ${maxDerivedHeight.toFixed(1)} m`);
    console.log(`Highest raw 1_top_high elevation: ${Number.isFinite(maxRawTopElevation) ? `${maxRawTopElevation.toFixed(1)} m` : "n/a"}`);
    console.log(`Slim GeoJSON size: ${(Buffer.byteLength(body) / 1024 / 1024).toFixed(1)} MiB`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn(`  failed: ${error?.message ?? error}`);
  }
}

throw new Error(`Sample download failed on all public WFS endpoints. Last error: ${lastError?.message ?? lastError}`);
