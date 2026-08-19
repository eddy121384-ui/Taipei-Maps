# Taipei-Maps

Map-first research tools for understanding where to live in Greater Taipei.

> **Map like Google. Read the city like SimCity. Analyze property like Bloomberg.**

## v0.1 baseline

This branch is intentionally small. It keeps the verified Greater Taipei shell while preserving the already-proven Overture global fallback inside the **same product map surface**:

- React + TypeScript + Vite
- OpenStreetMap basemap
- Taipei full-city 3D buildings via Taipei DUD `LOD1_2024`
- New Taipei 3D buildings via verified NLSC SceneServer layer 5
- optional Taipei cadastral/detail SceneLayer
- one shared Greater Taipei 3D on/off control
- building click inspector
- Banqiao camera shortcut
- Overture + MapLibre global-building fallback using `building` + `building_part`
- MapLibre globe projection when the global renderer is active
- same-page camera handoff between local authoritative 3D and global Overture 3D
- one-click Windows launcher

## Important renderer boundary

The user sees one persistent map UI, but two rendering engines still sit underneath it:

- Greater Taipei municipal 3D: ArcGIS SceneView / I3S
- global fallback: MapLibre + Overture PMTiles

`全球 3D 建築` no longer opens another tab. It hands the current center / zoom / pitch / bearing to the global renderer in place; switching back hands the camera back to ArcGIS.

This is an interim architecture, not a claim that ArcGIS I3S and Overture PMTiles have become one renderer. A future single-renderer path depends on a lawful, performant local `footprint + height` source that MapLibre can use for authoritative Taipei overrides.

### Taipei 101 / building parts

Overture parents with `has_parts=true` are suppressed when the `building_part` layer exists. This avoids drawing the 508m parent shell on top of the parts and preserves the stepped Taipei 101 massing found in the Issue #27 forensic pass.

## Still excluded from this baseline

The following remain research work until their data model is proven:

- Taipei 101 forensic / provider-comparison harness pages themselves
- Xinyi age-to-building join pilots
- City Dashboard building-identity experiments
- full-history building-age lens
- school / price / flood / redevelopment lenses

Those experiments remain preserved in the research branch and issue history instead of being mixed into the first production baseline.

## Run

Double-click:

```text
start-taipei-maps.bat
```

The launcher installs MapLibre / PMTiles automatically if an older `node_modules` folder is present.

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
- `src/GlobalBuildingMap.tsx` — same-page Overture / MapLibre globe fallback
- `docs/product-vision.md` — consumer product direction
- `docs/building-identity-and-property-intelligence-benchmark-memo.md` — why canonical building identity must be separated from geometry

Current principle:

> Geometry is a representation of a building. It is not automatically the building's canonical identity.
