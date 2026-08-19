# Taipei-Maps

Map-first research tools for understanding where to live in Greater Taipei.

## Current development direction

Taipei-Maps is evolving from a 3D-map spike into a property / city intelligence prototype.

Current architecture hypotheses:

- **Map renderer:** OpenStreetMap + MapLibre for lightweight analytical / 2.5D rendering.
- **Local 3D providers:** Taipei DUD `LOD1_2024`, New Taipei NLSC layer 5, plus optional Taipei cadastral detail.
- **Global fallback:** Overture buildings for world-scale 2.5D/3D coverage.
- **Data lenses:** building age first; school districts next; later price, flood, transit, redevelopment, permits, etc.
- **Identity model:** geometry is not the same thing as a building identity. The project is now investigating a canonical Taipei building/property object that can link registry data, addresses, geometry, permits, and analytical lenses.

See:

- `docs/building-identity-and-property-intelligence-benchmark-memo.md`
- `docs/school-district-source-audit.md`
- `docs/two-dimensional-analysis-mode.md`

## Main launchers

The repository root is intentionally kept small. Completed one-off probe launchers have been removed; their underlying tools / HTML harnesses remain in `tools/` and `public/` for reproducibility.

### Normal app

```text
start-taipei-maps.bat
```

### Current official Xinyi age-to-building identity pilot

```text
start-xinyi-official-age-building-join.bat
```

### Global Overture 2.5D / 3D exploration spike

```text
start-overture-global-spike.bat
```

### Legacy 2001+ age-data bootstrap

The following are retained temporarily until the newer full-history building-identity path fully replaces them:

```text
download-building-age-data.bat
download-building-overlay.bat
```

## Run locally

```bash
npm install
npm run dev
```

Production build check:

```bash
npm run build
```

## Key public data sources currently under study

- Taipei DUD full-city LOD1 SceneServer
- Taipei City Dashboard / GeoServer (`building_age`, `tp_building_height`, related building/cadastral datasets)
- Taipei cadastral 3D SceneServer
- NLSC national building I3S
- Overture global buildings

The project does not treat any one geometry source as the canonical property identity until that relationship is proven.
