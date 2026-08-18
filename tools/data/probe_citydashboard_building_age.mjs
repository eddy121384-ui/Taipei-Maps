#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const input = process.argv[2] || "data/derived/citydashboard_building_age.geojson";
const reportPath = process.argv[3] || "data/derived/citydashboard_building_age_report.txt";

function qSorted(xs, p) {
  if (!xs.length) return null;
  const i = (xs.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return xs[lo];
  return xs[lo] * (hi - i) + xs[hi] * (i - lo);
}

if (!fs.existsSync(input)) {
  console.error(`ERROR: file not found: ${input}`);
  process.exit(2);
}

const raw = fs.readFileSync(input, "utf8");
let geojson;
try {
  geojson = JSON.parse(raw);
} catch (error) {
  console.error(`ERROR: failed to parse GeoJSON: ${error.message}`);
  process.exit(3);
}

const features = Array.isArray(geojson.features) ? geojson.features : [];
const keyCounts = new Map();
const geometryCounts = new Map();

for (const f of features) {
  const props = f?.properties || {};
  for (const key of Object.keys(props)) keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  const type = f?.geometry?.type || "<missing>";
  geometryCounts.set(type, (geometryCounts.get(type) || 0) + 1);
}

const keys = [...keyCounts.keys()];
const ageKey = keys.find((k) => /^age_\d{4}$/i.test(k)) || keys.find((k) => /age|屋齡/i.test(k));
const addressKey = keys.includes("addr_key") ? "addr_key" : keys.find((k) => /addr|address|地址/i.test(k));
const districtKey = keys.includes("ptname") ? "ptname" : keys.find((k) => /district|行政區|區名/i.test(k));
const ageBasisMatch = ageKey?.match(/(\d{4})/);
const ageBasisYear = ageBasisMatch ? Number(ageBasisMatch[1]) : null;

const ages = [];
const districtCounts = new Map();
let withAddress = 0;
let missingAge = 0;
const samples = [];

for (const f of features) {
  const props = f?.properties || {};
  const age = ageKey == null ? NaN : Number(props[ageKey]);
  if (Number.isFinite(age)) ages.push(age);
  else missingAge += 1;

  if (addressKey && props[addressKey] != null && String(props[addressKey]).trim()) withAddress += 1;
  if (districtKey && props[districtKey] != null) {
    const district = String(props[districtKey]).trim() || "<blank>";
    districtCounts.set(district, (districtCounts.get(district) || 0) + 1);
  }
}

const currentYear = new Date().getFullYear();
const ageShift = ageBasisYear ? currentYear - ageBasisYear : null;
const bins = [
  ["0-10", 0, 10],
  ["10-20", 10, 20],
  ["20-30", 20, 30],
  ["30-40", 30, 40],
  ["40-50", 40, 50],
  ["50+", 50, Infinity],
];

function binCounts(values, shift = 0) {
  const out = new Map(bins.map(([name]) => [name, 0]));
  for (const v0 of values) {
    const v = v0 + shift;
    for (const [name, lo, hi] of bins) {
      if (v >= lo && v < hi) {
        out.set(name, out.get(name) + 1);
        break;
      }
    }
  }
  return out;
}

const bySourceAge = binCounts(ages, 0);
const byCurrentAge = ageShift != null ? binCounts(ages, ageShift) : null;

// Sort numeric ages once. Avoid Math.min(...ages) / Math.max(...ages):
// spreading a citywide feature array as function arguments can exceed V8's
// maximum call stack / argument count. Reusing one sorted array also avoids
// sorting the same large dataset three times for quartiles.
const sortedAges = [...ages].sort((a, b) => a - b);

const sortedFeatureAges = features
  .map((f) => ({ f, age: ageKey == null ? NaN : Number(f?.properties?.[ageKey]) }))
  .filter((x) => Number.isFinite(x.age))
  .sort((a, b) => b.age - a.age);

for (const { f, age } of sortedFeatureAges.slice(0, 10)) {
  const props = f?.properties || {};
  samples.push({
    age,
    district: districtKey ? props[districtKey] : undefined,
    address: addressKey ? props[addressKey] : undefined,
    coordinates: f?.geometry?.type === "Point" ? f.geometry.coordinates : undefined,
  });
}

const lines = [];
lines.push("Taipei City Dashboard building-age spatial layer audit");
lines.push(`Input: ${input}`);
lines.push(`Bytes: ${raw.length.toLocaleString()}`);
lines.push(`GeoJSON type: ${geojson.type || "<missing>"}`);
lines.push(`Features: ${features.length.toLocaleString()}`);
lines.push("");
lines.push("Geometry types:");
for (const [k, v] of [...geometryCounts.entries()].sort((a, b) => b[1] - a[1])) {
  lines.push(`  ${k}: ${v.toLocaleString()}`);
}
lines.push("");
lines.push(`Detected age field: ${ageKey || "NONE"}`);
lines.push(`Detected age basis year: ${ageBasisYear ?? "unknown"}`);
lines.push(`Detected address field: ${addressKey || "NONE"}`);
lines.push(`Detected district field: ${districtKey || "NONE"}`);
lines.push(`Rows with numeric age: ${ages.length.toLocaleString()}`);
lines.push(`Rows with missing/non-numeric age: ${missingAge.toLocaleString()}`);
lines.push(`Rows with address: ${withAddress.toLocaleString()}`);

if (sortedAges.length) {
  lines.push("");
  lines.push("Source age statistics:");
  lines.push(`  min: ${sortedAges[0]}`);
  lines.push(`  p25: ${qSorted(sortedAges, 0.25)}`);
  lines.push(`  median: ${qSorted(sortedAges, 0.5)}`);
  lines.push(`  p75: ${qSorted(sortedAges, 0.75)}`);
  lines.push(`  max: ${sortedAges[sortedAges.length - 1]}`);
  lines.push("");
  lines.push("Source age bins:");
  for (const [name, value] of bySourceAge) lines.push(`  ${name}: ${value.toLocaleString()}`);

  if (byCurrentAge && ageShift !== 0) {
    lines.push("");
    lines.push(`Age bins shifted from ${ageBasisYear} to ${currentYear} (+${ageShift} years):`);
    for (const [name, value] of byCurrentAge) lines.push(`  ${name}: ${value.toLocaleString()}`);
  }
}

lines.push("");
lines.push("District counts:");
for (const [k, v] of [...districtCounts.entries()].sort((a, b) => b[1] - a[1])) {
  lines.push(`  ${k}: ${v.toLocaleString()}`);
}

lines.push("");
lines.push("Property coverage:");
for (const [k, v] of [...keyCounts.entries()].sort((a, b) => b[1] - a[1])) {
  lines.push(`  ${k}: ${v.toLocaleString()} (${features.length ? (100 * v / features.length).toFixed(1) : "0.0"}%)`);
}

lines.push("");
lines.push("Oldest 10 samples:");
for (const s of samples) {
  const currentAge = ageShift == null ? "?" : s.age + ageShift;
  lines.push(`  source_age=${s.age} current_age=${currentAge} | ${s.district ?? ""} | ${s.address ?? ""} | ${JSON.stringify(s.coordinates ?? null)}`);
}

lines.push("");
lines.push("Interpretation guardrails:");
lines.push("  - This audit reports what the City Dashboard layer actually exposes; it does not assume one point equals one physical building until duplicates are checked.");
lines.push("  - If the age field is named age_YYYY, treat YYYY as the source age basis until the live payload proves otherwise.");
lines.push("  - Point geometry is still useful: address + age can be joined back to Taipei-Maps building footprints/3D geometry.");

const report = `${lines.join("\n")}\n`;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, report, "utf8");
console.log(report);
console.log(`Report written: ${reportPath}`);
