# Taipei-Maps

Map-first research tools for understanding where to live in Taipei.

## v0.0.1 — 3D Taipei spike

The first spike proves that Taipei-Maps can render an interactive 3D city directly from Taipei City's public cadastral-building SceneServer.

Current scope:

- React + TypeScript + Vite shell
- ArcGIS `SceneView`
- OpenStreetMap basemap
- Taipei City `CadastralBuilding_2023` 3D building layer
- pan / zoom / tilt / rotate
- click a building to inspect raw attributes returned by the SceneLayer

Not included yet:

- housing-price data
- MRT overlays
- school-district polygons
- redevelopment probability
- production hosting

## Run locally

```bash
npm install
npm run dev
```

Production build check:

```bash
npm run build
```

## Data source

Taipei City Multi-Dimensional Surveying Management System / cadastral 3D building SceneServer:

`https://3d.land.gov.taipei/arcgis/rest/services/Hosted/CadastralBuilding_2023/SceneServer/layers/0`

The source remains external; Taipei-Maps does not copy the full city model into this repository.
