import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve("public/generated");
const BBOX = "121.5560,25.0275,121.5730,25.0415,EPSG:4326";
const ENDPOINTS = [
  "https://citydashboard.taipei/geo_server/taipei_vioc/ows",
  "https://citydashboard.taipei/geo_server/ows",
];

const layers = [
  {
    name: "building_age",
    out: "citydashboard_building_age_xinyi.geojson",
  },
  {
    name: "tp_building_height",
    out: "citydashboard_tp_building_height_xinyi.geojson",
  },
];

function makeUrl(base, layerName) {
  const url = new URL(base);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "1.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeName", `taipei_vioc:${layerName}`);
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("srsName", "EPSG:4326");
  url.searchParams.set("bbox", BBOX);
  return url;
}

async function fetchLayer(layer) {
  let lastError = null;

  for (const endpoint of ENDPOINTS) {
    const url = makeUrl(endpoint, layer.name);
    console.log(`Trying ${layer.name}: ${url.origin}${url.pathname}`);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json, application/geo+json, */*",
          "User-Agent": "Taipei-Maps/0.1 public-WFS-probe",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        const body = (await response.text()).slice(0, 500).replace(/\s+/g, " ");
        throw new Error(`HTTP ${response.status} ${response.statusText}; ${body}`);
      }

      const text = await response.text();
      let geojson;
      try {
        geojson = JSON.parse(text);
      } catch {
        throw new Error(`response was not JSON; first bytes: ${text.slice(0, 300)}`);
      }

      if (geojson?.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
        throw new Error(`unexpected GeoJSON shape: ${geojson?.type ?? "unknown"}`);
      }

      const outPath = path.join(OUT_DIR, layer.out);
      await writeFile(outPath, JSON.stringify(geojson));
      console.log(`OK ${layer.name}: ${geojson.features.length.toLocaleString()} features -> ${outPath}`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`  failed: ${error.message ?? error}`);
    }
  }

  throw new Error(`${layer.name} failed on all public WFS endpoints. Last error: ${lastError?.message ?? lastError}`);
}

await mkdir(OUT_DIR, { recursive: true });
for (const layer of layers) {
  await fetchLayer(layer);
}

console.log("Both official Xinyi inputs are ready.");
