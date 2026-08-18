# Execution plan — City Dashboard building source audit

Issue: #27
Branch: `agent/3d-taipei-spike`

## Decision from browser A/B

The renderer question is mostly settled for this spike:

- Overture + MapLibre is fast and can preserve landmark massing when `building_part` is rendered correctly.
- Taipei DUD `LOD1_2024` is authoritative and dense, but is not obviously a better source for landmark shape and takes longer to become useful in the current ArcGIS SceneView path.
- Therefore the next high-value question is **data source lineage**, not more renderer tuning.

## Current investigation

### Step 1 — identify the deployed vector-source fingerprint

Read the public City Dashboard production HTML / JS bundles and locate the already-known building markers:

- `tp_building_height84-18p8j0`
- `taipei_building_3d_source`
- `1_top_high`

The production Vite build may contain the resolved `VITE_MAPBOXTILE` literal. We only record a sanitized endpoint / tileset fingerprint; any Mapbox token is redacted and must not be reused.

### Step 2 — ask whether the same dataset exists on public GeoServer

Read City Dashboard WFS capabilities and search for matching building/height layers. If the exact layer exists, request one feature only and record:

- geometry type
- property field names
- whether `1_top_high` exists

### Step 3 — trace official provenance

If the production source is only a protected Mapbox derivative, trace it back to Taipei official source material. The strongest current candidate is the DUD building block SHP described as containing roof height and entrance height.

### Step 4 — build a legal same-renderer proof

Once a reproducible/open source is identified, extract only a Xinyi / Taipei 101 test bbox and render it with the same MapLibre harness. This gives a true same-renderer comparison against Overture.

## Acceptance criteria

The audit is complete when we can answer all four questions:

1. What exact source-layer/schema does City Dashboard use? (already mostly known)
2. Where is its production vector source hosted / how is it identified?
3. What authoritative dataset generated it?
4. Can Taipei-Maps legally/reproducibly build its own equivalent vector tiles without reusing City Dashboard credentials or protected tiles?

Only after #4 is answered should we consider replacing the ArcGIS/I3S main background.
