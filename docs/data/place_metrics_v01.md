# Place Metrics v0.1 — Daily-life accessibility

Issue: #63

## Purpose

Turn the accepted Taipei daily-life POI baseline into reusable location-level metrics.

Input baseline:

- `public/data/daily-life-poi/taipei-canonical-reconciled-v01.geojson`
- 2285 canonical POIs
  - convenience stores: 1979
  - supermarkets: 306

## v0.1 metrics

For any query point `(lon, lat)`:

- `nearest_convenience_store`
- `convenience_store_count_500m`
- `nearest_supermarket`
- `supermarket_count_800m`

Nearest metrics retain canonical ID, name and brand for traceability.

## Distance semantics

v0.1 uses deterministic great-circle / Haversine distance over WGS84-style longitude/latitude coordinates with mean Earth radius `6371008.8 m`.

This is geographic point-to-point distance. It is **not** walking-route distance, travel time, entrance-to-entrance distance or road-network distance.

Radius counts are inclusive:

- convenience store count: `distance <= 500 m`
- supermarket count: `distance <= 800 m`

The tiny numerical epsilon used at the exact boundary is only to avoid floating-point exclusion of mathematically equal boundary points; it is not a widened product radius.

## Engine

`public/buju-place-metrics-v01.mjs`

Primary API:

```js
computeDailyLifeMetrics({ lon, lat }, poiFeatures)
```

Properties:

- no external routing/API dependency
- does not mutate source features
- ignores unsupported POI categories
- exact duplicate canonical IDs are counted once
- conflicting duplicate canonical IDs fail closed
- nearest ties are resolved by canonical ID so input order cannot change output
- nearest returned distance is rounded to 0.1 m; radius decisions use the unrounded distance

## Regression

`tools/dev/test_buju_place_metrics_v01.mjs`

Covers:

- zero / one / multiple POIs
- category separation
- 500 m and 800 m inclusive boundaries
- POIs immediately outside each boundary
- input-order invariance
- canonical-ID deduplication
- conflicting duplicate fail-closed behavior
- source immutability
- great-circle distance sanity

## Smoke

Run:

```text
start-place-metrics-v01-smoke.bat
```

Then click any location on the Taipei map. The page shows the four metrics and draws 500 m / 800 m geographic radius rings for visual inspection.

The smoke intentionally uses the accepted reconciled POI file directly. It is not the final Location Summary Card UI.

## Explicit non-goals

No routing, walking time, composite convenience score, new POI categories, transit/healthcare/school metrics, heatmap or nationwide precomputation is introduced in v0.1.
