# Taipei-Maps

Map-first research tools for understanding where to live in Greater Taipei.

> **Map like Google. Read the city like SimCity. Analyze property like Bloomberg.**

## v0.1 baseline

This branch is intentionally small. It contains the verified map shell and the already-proven global building fallback that are suitable to become the first real `main` baseline:

- React + TypeScript + Vite
- OpenStreetMap basemap
- Taipei full-city 3D buildings via Taipei DUD `LOD1_2024`
- New Taipei 3D buildings via verified NLSC SceneServer layer 5
- optional Taipei cadastral/detail SceneLayer
- one shared Greater Taipei 3D on/off control
- building click inspector
- Banqiao camera shortcut
- verified Overture + MapLibre global-building view, including building/building_part handling
- one-click Windows launchers

## Important renderer boundary

The Greater Taipei municipal 3D shell currently uses ArcGIS SceneView / I3S. The verified Overture global building universe currently uses MapLibre + PMTiles.

Both capabilities are kept in the baseline because both have already been browser-verified, but they are **not yet pretending to be one seamless renderer**. Unifying global fallback with local authoritative overrides remains a separate architecture milestone.

## Still excluded from this baseline

The following remain research work until their data model is proven:

- Taipei 101 source forensics / provider-comparison harnesses
- Xinyi age-to-building join pilots
- City Dashboard building-identity experiments
- full-history building-age lens
- school / price / flood / redevelopment lenses

Those experiments remain preserved in the research branch and its issue history instead of being mixed into the first production baseline.

## Run

Normal Greater Taipei shell:

```text
start-taipei-maps.bat
```

Verified global Overture building view:

```text
start-overture-global-spike.bat
```

The normal shell also exposes a `全球 3D 建築` button that opens the global view.

Or:

```bash
npm install
npm run dev
```

Build check:

```bash
npm run build
```

## Architecture notes

- `src/providers/buildingProviders.ts` — verified local 3D provider registry
- `docs/product-vision.md` — consumer product direction
- `docs/building-identity-and-property-intelligence-benchmark-memo.md` — why canonical building identity must be separated from geometry

Current principle:

> Geometry is a representation of a building. It is not automatically the building's canonical identity.
