# Verified evidence — Taipei City Dashboard fast 3D building source

This note separates facts already proven from hypotheses still under investigation.

## Proven from the official open-source frontend

The Taipei City Dashboard's normal Taipei building background is configured as a Mapbox vector source and a `fill-extrusion` layer:

- source id: `taipei_building_3d_source`
- source type: `vector`
- source URL: `import.meta.env.VITE_MAPBOXTILE`
- source-layer: `tp_building_height84-18p8j0`
- extrusion height field: `1_top_high`
- `minzoom: 14`

The frontend does not add this layer on mobile because of performance concerns.

## Proven from deployment configuration

The actual `VITE_MAPBOXTILE` value is not committed to the public source tree:

- `.env.template` leaves `VITE_MAPBOXTILE` blank;
- Cloud Build injects `_VITE_MAPBOXTILE` at build time;
- the production Helm configuration obtains `VITE_MAPBOXTILE` from a secret.

Therefore the GitHub repo is sufficient to prove the rendering contract but not sufficient by itself to identify the production tileset URL.

## Proven from Taipei DUD public documentation

Taipei DUD states that its application system can supply building block models in several formats. The SHP format includes **building roof height** and **entrance height** attributes. The numerical map/model files are provided through an application / fee workflow rather than simply committed as open files.

This is an important source-lineage candidate because it has exactly the kind of `footprint + roof height` structure needed by a lightweight extrusion renderer.

## Not yet proven

Do not claim any of the following until the forensic probe finds evidence:

- that `tp_building_height84-18p8j0` is directly generated from the DUD SHP building block model;
- that the production Mapbox tileset is legally reusable outside the City Dashboard;
- that the same building layer is exposed through the public City Dashboard GeoServer;
- that City Dashboard landmark massing is identical to DUD `LOD1_2024` I3S geometry.

## Current hypothesis to test

The most plausible architecture is:

`Taipei authoritative building/block geometry + roof height` -> `optimized vector tiles` -> `Mapbox fill-extrusion`

The next probe tests the deployed JS bundle for the resolved vector-source fingerprint and independently checks the public GeoServer capabilities for a matching building-height layer.
