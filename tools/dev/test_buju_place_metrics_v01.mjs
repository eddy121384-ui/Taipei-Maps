import assert from 'node:assert/strict';
import {
  DAILY_LIFE_RADII_M,
  computeDailyLifeMetrics,
  greatCircleDistanceMeters,
} from '../../public/buju-place-metrics-v01.mjs';

const EARTH_RADIUS_M = 6371008.8;

function feature({ id, category, lon, lat, name = id, brand = name }) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { canonical_id: id, category, name, brand },
  };
}

function destinationNorth({ lon, lat }, distanceM) {
  return {
    lon,
    lat: lat + (distanceM / EARTH_RADIUS_M) * 180 / Math.PI,
  };
}

const origin = { lon: 121.543, lat: 25.033 };

{
  const empty = computeDailyLifeMetrics(origin, []);
  assert.equal(empty.nearest_convenience_store, null);
  assert.equal(empty.convenience_store_count_500m, 0);
  assert.equal(empty.nearest_supermarket, null);
  assert.equal(empty.supermarket_count_800m, 0);
}

{
  const atOrigin = feature({ id: 'c0', category: 'convenience_store', ...origin });
  const result = computeDailyLifeMetrics(origin, [atOrigin]);
  assert.equal(result.nearest_convenience_store.distance_m, 0);
  assert.equal(result.nearest_convenience_store.canonical_id, 'c0');
  assert.equal(result.convenience_store_count_500m, 1);
}

{
  const c100 = destinationNorth(origin, 100);
  const c400 = destinationNorth(origin, 400);
  const c600 = destinationNorth(origin, 600);
  const s700 = destinationNorth(origin, 700);
  const s900 = destinationNorth(origin, 900);
  const features = [
    feature({ id: 'c100', category: 'convenience_store', ...c100 }),
    feature({ id: 'c400', category: 'convenience_store', ...c400 }),
    feature({ id: 'c600', category: 'convenience_store', ...c600 }),
    feature({ id: 's700', category: 'supermarket', ...s700 }),
    feature({ id: 's900', category: 'supermarket', ...s900 }),
  ];
  const result = computeDailyLifeMetrics(origin, features);
  assert.equal(result.nearest_convenience_store.canonical_id, 'c100');
  assert.equal(result.convenience_store_count_500m, 2);
  assert.equal(result.nearest_supermarket.canonical_id, 's700');
  assert.equal(result.supermarket_count_800m, 1);
}

{
  const c500 = destinationNorth(origin, DAILY_LIFE_RADII_M.convenience_store);
  const c500Out = destinationNorth(origin, DAILY_LIFE_RADII_M.convenience_store + 0.1);
  const s800 = destinationNorth(origin, DAILY_LIFE_RADII_M.supermarket);
  const s800Out = destinationNorth(origin, DAILY_LIFE_RADII_M.supermarket + 0.1);
  const result = computeDailyLifeMetrics(origin, [
    feature({ id: 'c-boundary', category: 'convenience_store', ...c500 }),
    feature({ id: 'c-outside', category: 'convenience_store', ...c500Out }),
    feature({ id: 's-boundary', category: 'supermarket', ...s800 }),
    feature({ id: 's-outside', category: 'supermarket', ...s800Out }),
  ]);
  assert.equal(result.convenience_store_count_500m, 1, '500m boundary must be inclusive');
  assert.equal(result.supermarket_count_800m, 1, '800m boundary must be inclusive');
}

{
  const features = [
    feature({ id: 'b', category: 'convenience_store', ...destinationNorth(origin, 250) }),
    feature({ id: 'a', category: 'convenience_store', ...destinationNorth(origin, 250) }),
    feature({ id: 's', category: 'supermarket', ...destinationNorth(origin, 300) }),
  ];
  const forward = computeDailyLifeMetrics(origin, features);
  const reversed = computeDailyLifeMetrics(origin, [...features].reverse());
  assert.deepEqual(forward, reversed, 'input order must not change results');
  assert.equal(forward.nearest_convenience_store.canonical_id, 'a', 'distance ties use canonical_id');
}

{
  const c = feature({ id: 'dedupe', category: 'convenience_store', ...destinationNorth(origin, 100) });
  const result = computeDailyLifeMetrics(origin, [c, structuredClone(c)]);
  assert.equal(result.convenience_store_count_500m, 1, 'same canonical entity must not double-count');
}

{
  const before = feature({ id: 'immutable', category: 'supermarket', ...destinationNorth(origin, 200) });
  const features = [before];
  const snapshot = JSON.stringify(features);
  computeDailyLifeMetrics(origin, features);
  assert.equal(JSON.stringify(features), snapshot, 'metric computation must not mutate source data');
}

{
  const duplicateA = feature({ id: 'conflict', category: 'convenience_store', ...destinationNorth(origin, 100) });
  const duplicateB = feature({ id: 'conflict', category: 'convenience_store', ...destinationNorth(origin, 200) });
  assert.throws(
    () => computeDailyLifeMetrics(origin, [duplicateA, duplicateB]),
    /conflicting duplicate canonical_id/,
    'conflicting canonical IDs must fail closed',
  );
}

{
  const p500 = destinationNorth(origin, 500);
  const measured = greatCircleDistanceMeters(origin, p500);
  assert.ok(Math.abs(measured - 500) < 1e-6, `great-circle distance expected 500m, got ${measured}`);
}

console.log('PASS buju-place-metrics-v0.1 regression');
