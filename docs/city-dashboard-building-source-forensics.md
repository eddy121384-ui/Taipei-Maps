# Taipei City Dashboard building-source forensics

Status: active investigation under Issue #27.

## Why this exists

Browser A/B testing now shows that the lightweight Overture + MapLibre path can render Taipei quickly, while Taipei DUD `LOD1_2024` is a denser authoritative I3S reference but not obviously more detailed for Taipei 101. The remaining question is therefore not `MapLibre vs ArcGIS`; it is **what building dataset the Taipei City Dashboard feeds into its fast Mapbox fill-extrusion renderer**.

## What the official City Dashboard source code already proves

The open-source frontend defines the normal Taipei building layer as:

- source id: `taipei_building_3d_source`
- source type: `vector`
- source URL: `import.meta.env.VITE_MAPBOXTILE`
- source-layer: `tp_building_height84-18p8j0`
- renderer: Mapbox `fill-extrusion`
- extrusion height field: `1_top_high`
- minimum zoom: 14

This means the City Dashboard's normal fast 3D background is a vector-tile building dataset with a per-feature roof/top height attribute, not the DUD I3S SceneLayer used by the current Taipei-Maps ArcGIS shell.

## Important deployment finding

`VITE_MAPBOXTILE` is intentionally not committed in the public repo:

- the frontend `.env.template` leaves it blank;
- Cloud Build injects `_VITE_MAPBOXTILE` into the built frontend;
- the production Helm values load `VITE_MAPBOXTILE` from a Kubernetes secret.

Therefore the public GitHub repo tells us the **schema and rendering contract**, but not the production tileset URL directly.

## Investigation plan

### Phase 1 — live-bundle fingerprinting

Fetch the public `https://citydashboard.taipei/` HTML and JavaScript bundles and search only for the already-known public client-side markers:

- `tp_building_height84-18p8j0`
- `taipei_building_3d_source`
- `1_top_high`

Because Vite replaces frontend environment variables at build time, the deployed source URL may appear as a literal string in the browser bundle. The probe must redact any access token and must not copy or reuse the Taipei City Dashboard's Mapbox credentials.

### Phase 2 — public GeoServer cross-check

Check the public City Dashboard GeoServer capabilities for any layer matching:

- `tp_building_height84-18p8j0`
- `building_height`
- other likely Taipei building-height layers

If a matching public WFS/TMS layer exists, record its schema and provenance. Do not assume that a publicly reachable service is automatically licensed for unrestricted redistribution; licensing/provenance still needs confirmation.

### Phase 3 — authoritative source lineage

Trace the vector layer back to an official/open source such as:

- Taipei 1/1000 digital topographic map / building block model
- building roof-height / entrance-height data
- other DUD / surveying derivatives

Goal: identify a **legally reusable** `footprint + height` dataset that we can tile ourselves.

### Phase 4 — same-renderer A/B

If a reusable source is found:

1. cut a small Taipei 101 / Xinyi bbox;
2. convert to GeoJSON or vector tiles;
3. render with the same MapLibre `fill-extrusion` harness used for Overture;
4. compare geometry quality and performance under identical camera/rendering conditions.

## Guardrails

- Do not reuse the City Dashboard's Mapbox access token.
- Do not build Taipei-Maps on scraped/protected Mapbox tiles.
- Public bundle inspection is for source-lineage discovery only.
- Prefer official open data or data that we can reproduce from official sources.
- Keep ArcGIS/I3S intact until a replacement source is proven in browser.
