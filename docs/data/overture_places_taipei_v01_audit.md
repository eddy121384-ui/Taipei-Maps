# Issue #56 — Overture Places / Taipei daily-life POI v0.1 audit

Status: **source/schema audit complete; initial user visual smoke indicates provisional PASS WITH GAPS; duplicate-candidate detection now catches both convenience-store and supermarket examples; broader district / false-positive audit still required**

Product scope: Taipei City convenience stores and supermarkets / grocery stores only. This document is intentionally about source trustworthiness, not final UI.

## Release pinned for the spike

Primary release:

- Overture Maps data release: `2026-08-19.0`
- Overture schema: `v1.18.0`
- PMTiles archive: `places.pmtiles`
- PMTiles source-layer: `place`
- Overture tiles profile starts Places at zoom 14.

Fallback candidate retained only so the smoke page fails gracefully if the newest archive is temporarily unavailable:

- `2026-07-22.0`

The production decision should be made against `2026-08-19.0`, not the fallback.

## PMTiles property contract observed from Overture's official tiles profile

The official Overture tiles profile emits the full primitive tags and serializes nested structs as JSON strings. `names.primary` also receives the convenience attribute `@name` when the feature does not use conditional naming rules.

For this spike:

- `id` — source identifier / provenance key
- `@name` — preferred source label when present; do not assume this is the best residential UI label
- `basic_category` — preferred coarse filter input
- `taxonomy` — JSON string in PMTiles; use for hierarchy-aware fallback / audit
- `categories` — legacy / transitional JSON string; do not make it the long-term contract
- `brand` — JSON string; inspect rather than assume Taiwan chains are normalized perfectly
- `sources` — JSON string; retain lineage
- `operating_status` — inspect for stale / closed entities
- `confidence` — retain for audit; do not invent an application-level threshold until Taipei evidence supports one

## v0.1 normalization decision

Runtime residential-research category:

```text
convenience_store
```

accepts Overture `convenience_store`.

Runtime residential-research category:

```text
supermarket
```

accepts Overture `supermarket` and `grocery_store` (including taxonomy descendants where the serialized taxonomy exposes those ancestors).

This is deliberately an application normalization. We do not expose the complete Overture retail taxonomy to the map UI.

## Taiwan chain audit targets

Convenience:

- 7-ELEVEN / 統一超商
- FamilyMart / 全家
- Hi-Life / 萊爾富
- OK Mart

Supermarket / grocery:

- PX Mart / 全聯
- Carrefour / 家樂福
- Simple Mart / 美廉社
- other clearly classified supermarket / grocery entities

Brand inference shown in the spike is an **audit aid only**. It is not canonical entity resolution.

## Initial user visual smoke — 2026-08-26

A first desktop visual smoke against the `2026-08-19.0` Places archive confirms that the basic layer works and that useful Taiwan chain coverage exists, but also exposes three product-critical data-quality issues.

### 1. Coverage is useful but incomplete

Convenience-store points do appear and major chains are represented. However, the OSM raster basemap visibly contains some convenience stores for which no Overture v0.1 point is rendered at the same location.

This means Overture coverage is not complete enough to assume that an absent Overture feature means the amenity is absent in the real world.

Record these cases as `missing` during the district audit. Do not infer structured data from the raster label itself; use structured OSM data only in the later comparison / hole-filler phase.

### 2. Obvious duplicate physical-store points exist

The smoke revealed cases where a single physical store is represented by two nearby Overture points.

Therefore raw Overture features cannot be counted directly for future place metrics. A normalization / deduplication step is required before metrics such as `convenience_store_count_500m` are trustworthy.

The first v0.2 heuristic successfully detected the observed convenience-store duplicate but missed a visually obvious duplicate PX Mart / 全聯 pair. v0.3 therefore changed the duplicate-candidate rule to be category-aware:

- convenience stores keep a strict small-distance / matching-name rule because genuinely distinct stores can exist very close together in Taipei;
- supermarkets use a wider same-brand candidate radius because different source observations can plausibly represent the same large store at its entrance versus building centroid;
- all results remain audit candidates only; no source features are deleted or merged by the smoke page.

### v0.3 confirmation smoke

The follow-up desktop screenshot confirms that the previously missed supermarket duplicate is now surrounded by a red duplicate-candidate ring. The same view reported:

```text
raw convenience         378
raw supermarket         312
raw classified total    690
suspect duplicate groups 42
audit dedup estimate    647
rendered POI             25
move -> idle             737 ms
```

The `690 -> 647` difference is **not** a production dedup count. It only shows that duplicate handling is material enough to require a canonicalization layer. Before any automatic merge rule is promoted, a sample of red candidate groups must be checked for false positives across several districts and chains.

Initial deduplication direction for the canonical layer:

- require compatible normalized category
- normalize major Taiwan brands before entity comparison
- use category-specific distance thresholds rather than one global threshold
- use branch token / raw source name / address / provenance where available
- preserve all contributing source IDs and lineage on the surviving canonical POI
- never derive final Place Metrics directly from raw Overture feature counts

### 3. Source name is not necessarily the correct map label

Supermarkets such as PX Mart / 全聯 may expose branch-oriented names such as `文山萬年` or `文山興隆`. Those names are useful for identity and disambiguation, but they are not the most useful first-glance residential map label.

The normalized model should separate brand from branch identity rather than treating the source `@name` as the final display name.

Proposed normalized display contract:

```text
brand_name        = 全聯
branch_name       = 文山萬年
source_name       = original Overture label
map_label         = brand_name when confidently known, else normalized source_name
popup_title       = brand_name
popup_subtitle    = branch_name when available
```

For future place metrics, physical-store identity matters; branch-name typography does not.

### Provisional interpretation

The visual smokes do **not** support a clean `PASS — Overture alone` conclusion.

The current working hypothesis is:

`PASS WITH GAPS — Overture is useful as a primary commercial-POI baseline, but canonicalization / deduplication is required and structured OSM is likely needed as a Phase B hole-filler.`

This remains provisional until Daan, Xinyi, Songshan, Zhongshan and Zhongzheng have enough sampled observations to estimate the size and pattern of the gaps and until the v0.3 red duplicate candidates receive a small false-positive audit.

## Physical coverage audit matrix

Use `start-daily-life-poi-overture-spike.bat` and inspect several familiar locations in each district.

| District | Chain / known place | present | missing | wrong category | duplicate | stale | misplaced | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Daan | initial visual smoke | yes | yes |  | yes |  |  | Useful coverage exists; at least one raster-visible store lacks an Overture point; duplicate convenience-store pair observed |
| Daan | PX Mart / supermarket duplicate smoke | yes |  |  | yes |  |  | v0.2 missed the obvious duplicate; category-aware v0.3 catches it with a red candidate ring |
| Xinyi |  |  |  |  |  |  |  |  |
| Xinyi |  |  |  |  |  |  |  |  |
| Songshan |  |  |  |  |  |  |  |  |
| Songshan |  |  |  |  |  |  |  |  |
| Zhongshan |  |  |  |  |  |  |  |  |
| Zhongzheng |  |  |  |  |  |  |  |  |

Prefer enough observations that the sample is not dominated by a single chain or neighborhood.

## Performance audit

The spike uses the remote Overture `places.pmtiles` archive directly through the existing MapLibre + PMTiles stack. Record:

- whether ordinary pan / zoom remains subjectively smooth
- move-to-idle timing shown by the spike
- whether enabling the two POI categories causes obvious rendering stalls
- whether the archive preflight or requests fail intermittently

The v0.3 confirmation screenshot showed `move -> idle = 737 ms` in the inspected view. This is only one observation, not a benchmark, but there is no evidence yet that a Taipei-only PMTiles extract is required for performance.

Do not optimize or build a Taipei-only PMTiles extract unless the audit demonstrates a real performance problem.

## Guardrails

- OSM Standard remains a raster visual basemap only in this issue.
- Do not infer structured POIs from raster labels.
- Do not scrape Google Maps or ingest Google Places into the canonical POI store.
- Do not start full multi-source entity reconciliation before the Overture-alone verdict is documented.
- Do not add reviews, ratings, photos, opening hours, routing, restaurants, cafes, parks, markets, pharmacies, banks or a composite convenience score.
- Keep the final residential product question in view: POIs are inputs for place metrics, not the product itself.

## Verdict gate

The branch is **not allowed to claim that Overture alone is sufficient** until the physical audit above has been completed.

Possible final verdicts:

- `PASS — Overture alone is a credible commercial-POI baseline for v0.1.`
- `PASS WITH GAPS — Overture is the primary baseline, but normalization / deduplication and OSM structured data are required in Phase B.`
- `FAIL — coverage / taxonomy / staleness is too weak to use Overture as the primary Taipei baseline.`

If the result is PASS or PASS WITH GAPS, the next product step is Place Metrics:

```text
nearest_convenience_store
convenience_store_count_500m
nearest_supermarket
supermarket_count_800m
```

No composite score yet.
