#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const input = process.argv[2] || "data/derived/citydashboard_building_age.geojson";
const reportPath = process.argv[3] || "data/derived/citydashboard_building_age_identity_report.txt";

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

function addGroup(map, key, age, sample) {
  if (key == null || key === "") return;
  const k = String(key);
  const current = map.get(k);
  if (!current) {
    map.set(k, { count: 1, firstAge: age, ageConflict: false, sample });
  } else {
    current.count += 1;
    if (Number.isFinite(age) && Number.isFinite(current.firstAge) && age !== current.firstAge) {
      current.ageConflict = true;
    }
  }
}

function summarizeMap(name, map, lines) {
  let duplicateKeys = 0;
  let rowsInDuplicateGroups = 0;
  let conflictKeys = 0;
  let maxGroup = 0;
  const top = [];

  for (const [key, value] of map.entries()) {
    if (value.count > 1) {
      duplicateKeys += 1;
      rowsInDuplicateGroups += value.count;
      if (value.ageConflict) conflictKeys += 1;
      if (value.count > maxGroup) maxGroup = value.count;
      top.push({ key, ...value });
    }
  }

  top.sort((a, b) => b.count - a.count);

  lines.push(`${name}:`);
  lines.push(`  unique keys: ${map.size.toLocaleString()}`);
  lines.push(`  duplicate keys (>1 row): ${duplicateKeys.toLocaleString()}`);
  lines.push(`  rows inside duplicate groups: ${rowsInDuplicateGroups.toLocaleString()}`);
  lines.push(`  keys with conflicting age values: ${conflictKeys.toLocaleString()}`);
  lines.push(`  largest group: ${maxGroup.toLocaleString()} rows`);
  lines.push(`  top duplicate groups:`);
  for (const item of top.slice(0, 12)) {
    lines.push(`    ${item.count} rows | ageConflict=${item.ageConflict ? "YES" : "no"} | ${item.key} | ${item.sample || ""}`);
  }
  lines.push("");
}

function coordKey(feature) {
  const g = feature?.geometry;
  if (!g || g.type !== "Point" || !Array.isArray(g.coordinates) || g.coordinates.length < 2) return null;
  const lon = Number(g.coordinates[0]);
  const lat = Number(g.coordinates[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return `${lon.toFixed(6)},${lat.toFixed(6)}`;
}

const byAddress = new Map();
const byCoordinate = new Map();
const byCpid = new Map();
const byCoordinateYear = new Map();
const byAddressYear = new Map();

let missingPoint = 0;
let numericConstrYr = 0;
let gregorianConsistencyRows = 0;
let gregorianExact = 0;
let rocConsistencyRows = 0;
let rocExact = 0;
const constrYears = [];

for (const f of features) {
  const p = f?.properties || {};
  const age = Number(p.age_2021);
  const addr = p.addr_key == null ? "" : String(p.addr_key).trim();
  const cpid = p.cpid == null ? "" : String(p.cpid).trim();
  const coord = coordKey(f);
  if (!coord) missingPoint += 1;

  const cy = Number(p.constr_yr);
  const cyFinite = Number.isFinite(cy);
  if (cyFinite) {
    numericConstrYr += 1;
    constrYears.push(cy);

    if (cy >= 1800 && cy <= 2021 && Number.isFinite(age)) {
      gregorianConsistencyRows += 1;
      if (2021 - cy === age) gregorianExact += 1;
    }
    if (cy >= 1 && cy <= 150 && Number.isFinite(age)) {
      rocConsistencyRows += 1;
      if (2021 - (cy + 1911) === age) rocExact += 1;
    }
  }

  const sample = [p.ptname, addr, `constr_yr=${p.constr_yr}`, `age_2021=${p.age_2021}`].filter(Boolean).join(" | ");
  addGroup(byAddress, addr, age, sample);
  addGroup(byCoordinate, coord, age, sample);
  addGroup(byCpid, cpid, age, sample);
  if (coord && cyFinite) addGroup(byCoordinateYear, `${coord}|${cy}`, age, sample);
  if (addr && cyFinite) addGroup(byAddressYear, `${addr}|${cy}`, age, sample);
}

constrYears.sort((a, b) => a - b);
function q(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - i) + sorted[hi] * (i - lo);
}

const lines = [];
lines.push("Taipei City Dashboard building-age identity / duplicate audit");
lines.push(`Input: ${input}`);
lines.push(`Features: ${features.length.toLocaleString()}`);
lines.push(`Missing/non-Point geometry: ${missingPoint.toLocaleString()}`);
lines.push("");
lines.push("Why this audit exists:");
lines.push("  The source has 258k+ rows, far more than a naive expectation of one row per physical building.");
lines.push("  Before treating this as a building universe, we must learn whether rows represent addresses, entrances, floors, parcels, or repeated building records.");
lines.push("");

summarizeMap("addr_key identity", byAddress, lines);
summarizeMap("coordinate identity (rounded 6 decimals)", byCoordinate, lines);
summarizeMap("cpid identity", byCpid, lines);
summarizeMap("coordinate + constr_yr identity", byCoordinateYear, lines);
summarizeMap("addr_key + constr_yr identity", byAddressYear, lines);

lines.push("Construction-year field audit:");
lines.push(`  numeric constr_yr rows: ${numericConstrYr.toLocaleString()}`);
if (constrYears.length) {
  lines.push(`  min: ${constrYears[0]}`);
  lines.push(`  p25: ${q(constrYears, 0.25)}`);
  lines.push(`  median: ${q(constrYears, 0.5)}`);
  lines.push(`  p75: ${q(constrYears, 0.75)}`);
  lines.push(`  max: ${constrYears[constrYears.length - 1]}`);
}
lines.push(`  Gregorian candidate rows (1800..2021): ${gregorianConsistencyRows.toLocaleString()}`);
lines.push(`    exact age_2021 == 2021-constr_yr: ${gregorianExact.toLocaleString()}`);
lines.push(`  ROC candidate rows (1..150): ${rocConsistencyRows.toLocaleString()}`);
lines.push(`    exact age_2021 == 2021-(constr_yr+1911): ${rocExact.toLocaleString()}`);
lines.push("");

lines.push("Interpretation guardrails:");
lines.push("  - Do NOT deduplicate yet just because two rows share a coordinate or address.");
lines.push("  - A duplicate group may represent valid multiple entrances / house numbers / units / building parts.");
lines.push("  - Conflicting ages within the same coordinate/address group are especially important and should be inspected before any spatial join.");
lines.push("  - Prefer constr_yr as the durable age basis only after its coding convention is verified against age_2021.");
lines.push("  - The next step after this report is to define the strongest physical-building identity key, then join that identity to polygon geometry.");

const report = `${lines.join("\n")}\n`;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, report, "utf8");
console.log(report);
console.log(`Report written: ${reportPath}`);
