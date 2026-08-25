# Issue #56 — Overture Places / Taipei daily-life POI v0.1 audit

Status: **source/schema audit complete; physical coverage verdict pending local visual audit**

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
- `@name` — preferred display label when present
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

## Physical coverage audit matrix

Use `start-daily-life-poi-overture-spike.bat` and inspect several familiar locations in each district.

| District | Chain / known place | present | missing | wrong category | duplicate | stale | misplaced | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Daan |  |  |  |  |  |  |  |  |
| Daan |  |  |  |  |  |  |  |  |
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

Do not optimize or build a Taipei-only PMTiles extract unless the audit demonstrates a real performance problem.

## Guardrails

- OSM Standard remains a raster visual basemap only in this issue.
- Do not infer structured POIs from raster labels.
- Do not scrape Google Maps or ingest Google Places into the canonical POI store.
- Do not start multi-source entity reconciliation before the Overture-alone verdict.
- Do not add reviews, ratings, photos, opening hours, routing, restaurants, cafes, parks, markets, pharmacies, banks or a composite convenience score.
- Keep the final residential product question in view: POIs are inputs for place metrics, not the product itself.

## Verdict gate

The branch is **not allowed to claim that Overture alone is sufficient** until the physical audit above has been completed.

Possible final verdicts:

- `PASS — Overture alone is a credible commercial-POI baseline for v0.1.`
- `PASS WITH GAPS — Overture is the primary baseline, but OSM structured data is required as a Phase B hole-filler.`
- `FAIL — coverage / taxonomy / staleness is too weak to use Overture as the primary Taipei baseline.`

If the result is PASS or PASS WITH GAPS, the next product step is Place Metrics:

```text
nearest_convenience_store
convenience_store_count_500m
nearest_supermarket
supermarket_count_800m
```

No composite score yet.
