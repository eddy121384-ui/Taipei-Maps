# Current status — City Dashboard fast 3D building source

## Browser result that triggered this phase

The side-by-side Taipei 101 comparison is now working:

- Overture + MapLibre renders quickly and preserves some Taipei 101 massing through `building_part` semantics.
- Taipei DUD `LOD1_2024` renders a denser authoritative city model but does not clearly outperform Overture on the 101 landmark shape itself.

That means the City Dashboard's especially good combination of **speed + recognizable massing** should be investigated through its own vector-tile source, rather than assuming it is simply the DUD I3S layer rendered differently.

## Official source-code facts

Taipei City Dashboard defines its normal building background as:

`VITE_MAPBOXTILE` -> vector source -> source-layer `tp_building_height84-18p8j0` -> `fill-extrusion` using `1_top_high`.

The production tileset URL is injected at deployment time and is not committed to the public repository.

## Work now in the branch

- `docs/city-dashboard-building-source-forensics.md`
- `docs/city-dashboard-building-source-evidence.md`
- `docs/city-dashboard-building-source-plan.md`
- `tools/data/probe_citydashboard_building_source.mjs`
- `probe-citydashboard-building-source.bat`

The probe performs two independent checks:

1. fingerprints the deployed public JS bundles for the known building source-layer / height-field markers and records only sanitized nearby source URLs;
2. scans the public City Dashboard GeoServer WFS capabilities for matching building-height layers and, if an exact layer exists, requests one sample feature to record schema only.

Mapbox tokens are explicitly redacted and are not to be reused.
