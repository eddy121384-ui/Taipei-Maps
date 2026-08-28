# Taipei Structured OSM POI Reconciliation v0.1

Issue: #59

## Purpose

This phase uses OpenStreetMap as a conservative secondary evidence source for the fixed Taipei Overture canonical POI dataset from Issue #57.

It does **not** compute `Overture count + OSM count`.

Instead:

```text
Overture canonical baseline
          +
Pinned OSM snapshot
          ↓
OSM internal canonicalization
          ↓
Cross-source reconciliation
          ↓
matched / safe hole / unresolved
          ↓
Buju reconciled canonical POI
```

## Fixed OSM snapshot

Historical OSM state is queried through Overpass at:

```text
2026-08-19T23:59:59Z
```

This intentionally aligns the secondary-source snapshot with the Overture `2026-08-19.0` baseline rather than using mutable `latest` OSM data.

The query only requests Taipei-bbox objects tagged:

```text
shop=convenience
shop=supermarket
```

The fixed Taipei 12-district polygon from Issue #57 is then applied as the exact inclusion gate.

## Target chains

- 7-ELEVEN
- 全家
- 萊爾富
- OK Mart
- 全聯
- 家樂福
- 美廉社

OSM names, brands and operators are normalized to these seven canonical brands before the shared Buju canonical engine is called.

## OSM internal canonicalization

OSM can represent the same physical store more than once, for example a node and a building way.

Normalized OSM evidence is therefore passed through:

```text
public/buju-poi-canonical-v02.mjs
```

before it is compared with Overture.

## Cross-source decision rules

`public/buju-poi-reconcile-v01.mjs` does not invent a new fuzzy matcher.

For each OSM canonical entity it finds same-brand Overture candidates inside the existing category review radius and reuses the existing v0.2 canonical engine pairwise.

### matched

Exactly one nearby Overture entity passes the established high-confidence canonical rules.

The OSM row is evidence for the existing entity and is **not** added as another final store.

### safe_hole

No Overture entity of the same brand exists inside the existing review radius:

- convenience store: 50 m
- supermarket: 100 m

The OSM entity is allowed into the final dataset as an OSM hole-fill record.

### cross_source_unresolved

A same-brand Overture candidate is nearby, but the current canonical rules cannot prove they are the same physical store, or multiple Overture candidates pass.

The OSM entity is retained as evidence but is not added to the final count.

This intentionally prefers under-counting an ambiguous case to double-counting it.

## Outputs

Under `public/data/daily-life-poi/`:

```text
taipei-osm-target-v01.geojson
taipei-osm-canonical-v01.geojson
taipei-osm-reconciliation-v01.json
taipei-canonical-reconciled-v01.geojson
taipei-poi-reconciled-manifest-v01.json
```

The final GeoJSON retains all Overture baseline canonical IDs unchanged and adds only OSM entities classified as `osm_hole_fill`.

## Determinism

OSM elements and all derived collections are stable-sorted.

CI:

1. runs the existing canonical regression
2. runs the reconciliation synthetic regression
3. performs one historical Overpass fetch
4. builds the full reconciled dataset
5. records checksums
6. rebuilds from the frozen fetched response
7. requires byte-identical generated outputs

The manifest records the fixed snapshot/query and the SHA-256 of the fetched OSM response used by the build.

## Smoke

After generated outputs exist, run:

```text
start-daily-life-poi-reconciled-smoke.bat
```

Blue points are Overture baseline canonical entities.

Green points are OSM safe hole-fill additions.

The final total must remain independent of viewport.

## Non-goals

This issue does not add Place Metrics, Google Places, new POI categories, ratings/reviews/opening hours or generalized probabilistic entity resolution.

After this dataset is accepted, the next phase can compute:

```text
nearest_convenience_store
convenience_store_count_500m
nearest_supermarket
supermarket_count_800m
```
