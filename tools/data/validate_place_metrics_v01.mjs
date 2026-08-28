import fs from 'node:fs';
import assert from 'node:assert/strict';
import { computeDailyLifeMetrics } from '../../public/buju-place-metrics-v01.mjs';

const datasetPath = 'public/data/daily-life-poi/taipei-canonical-reconciled-v01.geojson';
const manifestPath = 'public/data/daily-life-poi/taipei-poi-reconciled-manifest-v01.json';
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert.equal(dataset.type, 'FeatureCollection');
assert.ok(Array.isArray(dataset.features));
assert.equal(dataset.features.length, manifest.final_canonical_count);
assert.equal(manifest.final_canonical_count, 2285);

const counts = { convenience_store: 0, supermarket: 0 };
const ids = new Set();
for (const feature of dataset.features) {
  const p = feature.properties || {};
  assert.ok(p.canonical_id, 'every accepted POI must retain canonical_id');
  assert.ok(!ids.has(p.canonical_id), `duplicate canonical_id in accepted baseline: ${p.canonical_id}`);
  ids.add(p.canonical_id);
  if (p.category in counts) counts[p.category] += 1;
  else assert.fail(`unsupported category in accepted baseline: ${p.category}`);
}
assert.deepEqual(counts, manifest.final_counts_by_category);
assert.deepEqual(counts, { convenience_store: 1979, supermarket: 306 });

const samplePoints = [
  { name: 'Taipei Main Station', lon: 121.5170, lat: 25.0478 },
  { name: 'Xinyi', lon: 121.5654, lat: 25.0330 },
  { name: 'Jingmei', lon: 121.5415, lat: 24.9922 },
];

for (const sample of samplePoints) {
  const result = computeDailyLifeMetrics(sample, dataset.features);
  const reversed = computeDailyLifeMetrics(sample, [...dataset.features].reverse());
  assert.deepEqual(result, reversed, `${sample.name}: accepted dataset order must not change metrics`);
  assert.ok(result.nearest_convenience_store, `${sample.name}: expected convenience result`);
  assert.ok(result.nearest_supermarket, `${sample.name}: expected supermarket result`);
  assert.ok(Number.isInteger(result.convenience_store_count_500m));
  assert.ok(Number.isInteger(result.supermarket_count_800m));
  assert.ok(result.convenience_store_count_500m >= 0 && result.convenience_store_count_500m <= counts.convenience_store);
  assert.ok(result.supermarket_count_800m >= 0 && result.supermarket_count_800m <= counts.supermarket);
}

console.log(`PASS Place Metrics accepted baseline · ${dataset.features.length} POIs · convenience ${counts.convenience_store} · supermarket ${counts.supermarket}`);
