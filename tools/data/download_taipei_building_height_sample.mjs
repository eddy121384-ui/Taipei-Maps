import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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
const HEIGHT_FIELDS = ["1_top_high", "1_bd_high"];

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

  const properties = feature.properties ?? {};
  let height = NaN;
  let heightSource = "fallback_9.6m";
  for (const field of HEIGHT_FIELDS) {
    const value = Number(properties[field]);
    if (Number.isFinite(value) && value > 0) {
      height = value;
      heightSource = field;
      break;
    }
  }
  if (!Number.isFinite(height) || height <= 0) height = 9.6;

  return {
    type: "Feature",
    id: feature.id,
    geometry: feature.geometry,
    properties: {
      height_m: Number(height.toFixed(3)),
      height_source: heightSource,
    },
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

    const features = [...byId.values()].map(slimFeature).filter(Boolean);
    const out = { type: "FeatureCollection", features };
    const body = JSON.stringify(out);
    await writeFile(OUT_PATH, body);

    const fallbackCount = features.filter((f) => f.properties.height_source === "fallback_9.6m").length;
    console.log(`Wrote: ${OUT_PATH}`);
    console.log(`Polygon features: ${features.length.toLocaleString()}`);
    console.log(`Fallback heights: ${fallbackCount.toLocaleString()}`);
    console.log(`Slim GeoJSON size: ${(Buffer.byteLength(body) / 1024 / 1024).toFixed(1)} MiB`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn(`  failed: ${error?.message ?? error}`);
  }
}

throw new Error(`Sample download failed on all public WFS endpoints. Last error: ${lastError?.message ?? lastError}`);
