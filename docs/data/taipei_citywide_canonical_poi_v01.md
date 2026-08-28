# Taipei Citywide Canonical POI Dataset v0.1

Issue: #57

## Purpose

This pipeline converts the pinned Overture Places release `2026-08-19.0` into a fixed Taipei City dataset for the seven daily-life chains already validated in Issue #56. It deliberately separates ETL from MapLibre rendering: the map consumes canonical data; it no longer creates canonical data from loaded source tiles.

## Fixed inputs

- Overture: `s3://overturemaps-us-west-2/release/2026-08-19.0/theme=places/type=place/*`
- Canonical engine: `public/buju-poi-canonical-v02.mjs`
- Taipei boundary: `xashiex/taiwan-district-boundary-to-geojson`, file `docs/data/63.json`, pinned to commit `43b3b1a858043d94f780f1f13e6efd682e57e505`
- Expected boundary features: 12 districts

The builder downloads the boundary from an immutable commit URL, records its SHA-256 in the manifest, derives a bbox for Overture predicate pushdown, then applies exact polygon point-in-polygon before canonicalization.

## Build

Prerequisites:

```text
Node.js 20+
Python 3
Python package: duckdb
```

Run:

```text
python -m pip install duckdb
node tools/data/build_taipei_daily_life_poi_v01.mjs
```

The Python extraction step only downloads a broad candidate set. Final target-chain classification remains inside the shared Buju v0.2 JavaScript canonical engine.

## Outputs

`public/data/daily-life-poi/taipei-canonical-v01.geojson`

One feature per Buju canonical physical-store entity. Coordinates always come from a real representative Overture source row.

`public/data/daily-life-poi/taipei-unresolved-v01.geojson`

Line features representing nearby same-brand source pairs that remain separate because current evidence is insufficient for a high-confidence merge.

`public/data/daily-life-poi/taipei-poi-manifest-v01.json`

Pinned input metadata, boundary SHA-256, raw/classified/canonical/unresolved counts, brand/category/source counts, and a logical dataset SHA-256.

## Determinism

Before canonicalization, source features are sorted by the shared `featureKey()`. Canonical and unresolved outputs are sorted again before serialization. The builder also re-runs canonicalization against reversed raw input and fails if canonical IDs or source membership change.

CI sets `SOURCE_DATE_EPOCH=1787097600` so even manifest serialization is stable for the pinned v0.1 release. The workflow builds twice and requires byte-identical SHA-256 checksums for all three outputs.

## Smoke

After generated data exists, serve the repository and open:

```text
http://127.0.0.1:5173/daily-life-poi-citywide-v01.html
```

The page loads the fixed canonical GeoJSON. Panning and zooming only alter rendering; the manifest-backed citywide canonical count remains fixed.

## Explicit non-goals

This version does not add structured OSM, Place Metrics, ratings, opening hours, Google Places, or new fuzzy/distance merge gates. Structured OSM hole-filling is the next phase after this dataset is accepted.
