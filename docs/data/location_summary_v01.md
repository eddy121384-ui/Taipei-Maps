# Location Summary Card v0.1

Issue: #65

## Purpose

Compose already-accepted Place-stage data into one deterministic location summary for an arbitrary Taipei point.

The v0.1 question is:

> 住在這裡會是什麼感覺？

This is a composition layer, not a new source-ingestion or scoring system.

## Output contract

`computeLocationSummary({ lon, lat }, sources)` returns:

- `daily_life`
  - `nearest_convenience_store`
  - `convenience_store_count_500m`
  - `nearest_supermarket`
  - `supermarket_count_800m`
- `transit.nearest_mrt_station`
- `healthcare.nearest_hospital`
- `healthcare.nearest_clinic`
- `school`
  - `elementary_school_district`
  - `junior_school_district`
  - official district / village / neighbor identity when resolved

## Distance semantics

All distance fields use the same great-circle distance helper as Place Metrics v0.1.

They are geographic distances in meters. They are not route distance, walking distance, or walking time.

## Daily-life source

The module directly reuses `computeDailyLifeMetrics()` and the accepted reconciled POI baseline.

No duplicate daily-life implementation is introduced here.

## Transit source

Nearest MRT uses the existing official Taipei metropolitan MRT station cache:

`public/generated/taipei_mrt_stations_official.geojson`

The upstream builder deduplicates platform/source points into one station feature per station name before Location Summary consumes it.

## Healthcare source

Nearest hospital and clinic use:

`public/generated/taipei_healthcare_facilities.geojson`

Hospital records are the existing physical-campus reconciled features. Hospital and clinic metrics are category-isolated.

## School semantics

School assignment must never use proximity.

`resolveTaipeiSchoolDistricts()`:

1. queries the official Taipei neighbor geometry service with the selected point
2. extracts official district / village / neighbor identity
3. lazy-loads only that district's 115 academic-year assignment shard in the smoke UI
4. resolves elementary and junior assignments from the official tables
5. preserves shared/common-school strings exactly

If the point returns multiple official neighbor identities, no usable geometry, missing assignment rows, or an upstream error, the school result is explicit `unresolved` / `unavailable` rather than guessed.

## Performance scope

v0.1 intentionally uses straightforward in-memory nearest-point scans.

The current source sizes are small enough for semantic/product validation. Spatial indexing should only be added after profiling shows a real need, without changing metric semantics.

## Smoke

Run:

`start-location-summary-v01-smoke.bat`

The launcher prepares the local MRT and healthcare caches, runs regressions and source validation, then opens `public/location-summary-v01.html`.

The smoke page is intentionally a semantic/product inspection surface, not final card styling.

## Non-goals

- composite neighborhood score
- ranked recommendations
- AI-generated verdict text
- routing or walking time
- Market / Property / Inventory metrics
- New Taipei school catchment approximation
