import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve("public/generated");
const OUT_PATH = path.join(OUT_DIR, "citydashboard_tp_building_height_xinyi.geojson");
const BBOX = "121.5560,25.0275,121.5730,25.0415,EPSG:4326";
const ENDPOINTS = [
  "https://citydashboard.taipei/geo_server/taipei_vioc/ows",
  "https://citydashboard.taipei/geo_server/ows",
];

function makeUrl(base) {
  const url = new URL(base);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "1.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeName", "taipei_vioc:tp_building_height");
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("srsName", "EPSG:4326");
  url.searchParams.set("bbox", BBOX);
  return url;
}

let lastError = null;
await mkdir(OUT_DIR, { recursive: true });

for (const endpoint of ENDPOINTS) {
  const url = makeUrl(endpoint);
  console.log(`Trying public WFS: ${url.origin}${url.pathname}`);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, application/geo+json, */*",
        "User-Agent": "Taipei-Maps/0.1 maplibre-single-engine-checkpoint",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 500).replace(/\s+/g, " ");
      throw new Error(`HTTP ${response.status} ${response.statusText}; ${body}`);
    }

    const geojson = JSON.parse(await response.text());
    if (geojson?.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
      throw new Error(`unexpected GeoJSON shape: ${geojson?.type ?? "unknown"}`);
    }

    await writeFile(OUT_PATH, JSON.stringify(geojson));
    console.log(`OK: ${geojson.features.length.toLocaleString()} features -> ${OUT_PATH}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn(`  failed: ${error?.message ?? error}`);
  }
}

throw new Error(`tp_building_height failed on all public WFS endpoints. Last error: ${lastError?.message ?? lastError}`);
