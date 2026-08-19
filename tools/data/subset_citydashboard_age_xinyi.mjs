#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const input = process.argv[2] || "data/derived/citydashboard_building_age.geojson";
const output = process.argv[3] || "public/generated/citydashboard_building_age_xinyi.geojson";

// Small pilot box around Taipei 101 / Xinyi Planning District.
const BBOX = [121.5560, 25.0275, 121.5730, 25.0415];

if (!fs.existsSync(input)) {
  console.error(`ERROR: file not found: ${input}`);
  process.exit(2);
}

const raw = fs.readFileSync(input, "utf8");
const data = JSON.parse(raw);
const features = Array.isArray(data.features) ? data.features : [];

const [minX, minY, maxX, maxY] = BBOX;
const selected = features.filter((feature) => {
  const geometry = feature?.geometry;
  if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) return false;
  const [x, y] = geometry.coordinates;
  return Number.isFinite(x) && Number.isFinite(y) && x >= minX && x <= maxX && y >= minY && y <= maxY;
});

const out = {
  type: "FeatureCollection",
  name: "citydashboard_building_age_xinyi_pilot",
  bbox: BBOX,
  source: "Taipei City Dashboard taipei_vioc:building_age",
  note: "Strict Xinyi/Taipei 101 pilot subset; no deduplication applied.",
  features: selected,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(out), "utf8");

console.log(`Input features: ${features.length.toLocaleString()}`);
console.log(`Pilot features: ${selected.length.toLocaleString()}`);
console.log(`BBOX: ${BBOX.join(",")}`);
console.log(`Output: ${output}`);
