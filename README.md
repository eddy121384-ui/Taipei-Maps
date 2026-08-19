# Taipei-Maps

Map-first research tools for understanding where to live in Greater Taipei.

> **Map like Google. Read the city like SimCity. Analyze property like Bloomberg.**

## v0.1 baseline

This branch is intentionally small. It contains only the verified Greater Taipei map shell that is suitable to become the first real `main` baseline:

- React + TypeScript + Vite
- OpenStreetMap basemap
- Taipei full-city 3D buildings via Taipei DUD `LOD1_2024`
- New Taipei 3D buildings via verified NLSC SceneServer layer 5
- optional Taipei cadastral/detail SceneLayer
- one shared 3D on/off control
- building click inspector
- Banqiao camera shortcut
- one-click Windows launcher

## Deliberately excluded from this baseline

The following remain research work until their data model is proven:

- Overture / MapLibre performance and global-building spikes
- Taipei 101 source forensics
- Xinyi age-to-building join pilots
- City Dashboard building-identity experiments
- full-history building-age lens
- school / price / flood / redevelopment lenses

Those experiments remain preserved in the research branch and its issue history instead of being mixed into the first production baseline.

## Run

Double-click:

```text
start-taipei-maps.bat
```

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
