const ENDPOINTS = [
  "https://citydashboard.taipei/geo_server/taipei_vioc/ows",
  "https://citydashboard.taipei/geo_server/ows",
];
const TYPE_NAME = "taipei_vioc:tp_building_height";
const PAGE_SIZE = 250;

const TARGETS = [
  {
    id: "taipei101",
    label: "Taipei 101 vicinity",
    bbox: "121.5634,25.0330,121.5655,25.0349,EPSG:4326",
  },
  {
    id: "daan",
    label: "Daan residential control",
    bbox: "121.5405,25.0245,121.5460,25.0295,EPSG:4326",
  },
  {
    id: "yangmingshan",
    label: "Yangmingshan hillside residential",
    bbox: "121.5350,25.1350,121.5650,25.1650,EPSG:4326",
  },
];

const FIELDS = ["1_top_high", "1_ent_heig", "1_bud_high", "1_floor"];

function makeUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchFeatures(base, bbox) {
  const url = makeUrl(base, {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: TYPE_NAME,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    bbox,
    count: PAGE_SIZE,
  });
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, application/geo+json, */*",
      "User-Agent": "Taipei-Maps/0.1 issue-31-height-semantics-probe",
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
  const data = JSON.parse(text);
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error(`Unexpected response type: ${data?.type ?? "unknown"}`);
  }
  return data.features;
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stats(features, key) {
  const raw = features.map((f) => f?.properties?.[key]);
  const numericValues = raw.map(numeric).filter((v) => v !== null);
  return {
    present: raw.filter((v) => v !== undefined && v !== null && v !== "").length,
    numeric: numericValues.length,
    min: numericValues.length ? Math.min(...numericValues) : null,
    max: numericValues.length ? Math.max(...numericValues) : null,
    examples: [...new Set(raw.filter((v) => v !== undefined).map((v) => JSON.stringify(v)))].slice(0, 6),
  };
}

function row(feature) {
  const p = feature?.properties ?? {};
  const top = numeric(p["1_top_high"]);
  const entrance = numeric(p["1_ent_heig"]);
  const surveyed = numeric(p["1_bud_high"]);
  const floor = numeric(p["1_floor"]);
  return {
    id: feature?.id ?? null,
    top_raw: p["1_top_high"],
    entrance_raw: p["1_ent_heig"],
    bud_high_raw: p["1_bud_high"],
    floor_raw: p["1_floor"],
    top_minus_entrance: top !== null && entrance !== null ? Number((top - entrance).toFixed(3)) : null,
    surveyed_height: surveyed,
    floors_x3_2: floor !== null ? Number((floor * 3.2).toFixed(3)) : null,
  };
}

let endpointUsed = null;
let lastError = null;
for (const endpoint of ENDPOINTS) {
  try {
    await fetchFeatures(endpoint, TARGETS[0].bbox);
    endpointUsed = endpoint;
    break;
  } catch (error) {
    lastError = error;
  }
}
if (!endpointUsed) throw new Error(`No usable WFS endpoint. Last error: ${lastError?.message ?? lastError}`);

console.log("Taipei-Maps Issue #31 - raw building-height semantics probe");
console.log(`Endpoint: ${endpointUsed}`);
console.log("Purpose: validate actual live WFS height keys before rebuilding citywide PMTiles.\n");

for (const target of TARGETS) {
  const features = await fetchFeatures(endpointUsed, target.bbox);
  console.log("============================================================");
  console.log(`${target.label} (${target.id})`);
  console.log(`BBOX: ${target.bbox}`);
  console.log(`Features returned: ${features.length}`);
  console.log(`Property keys: ${Object.keys(features[0]?.properties ?? {}).join(", ")}`);
  for (const field of FIELDS) {
    console.log(`${field}:`, stats(features, field));
  }

  const rows = features.map(row);
  rows.sort((a, b) => (numeric(b.floor_raw) ?? -1) - (numeric(a.floor_raw) ?? -1));
  console.log("Representative rows (highest floors first):");
  console.table(rows.slice(0, 12));
}

console.log("============================================================");
console.log("PROBE COMPLETE");
console.log("If entrance/building-height fields are populated and sensible, rebuild citywide PMTiles with the corrected semantics.");
