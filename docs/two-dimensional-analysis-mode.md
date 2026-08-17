# 2D-first analysis mode

Related: Greater Taipei v0.1 (#7)

## Product decision

3D is an optional presentation mode, not the default product surface.

The default working experience should be a clean 2D map where data lenses are easy to read and compare. The same underlying data should be renderable at multiple spatial scales and presentations.

## Mental model

`data lens -> analysis scale -> renderer`

Examples:

- building age -> building -> 2D polygon fill
- building age -> building -> 3D extrusion
- building age -> block -> 2D choropleth
- price -> block -> 2D choropleth
- redevelopment potential -> block -> 2D choropleth

3D should be available when users want spatial form, density, height, or a more immersive city view, but it should not be required to consume the analytical data.

## v0.1 implementation order

1. Add a visible `2D / 3D` presentation toggle.
2. Default to 2D analysis mode.
3. In 2D mode, do not show Taipei/New Taipei 3D building SceneLayers.
4. Reuse the existing Taipei age GeoJSON as a flat polygon-fill renderer so the age lens remains useful without 3D.
5. Preserve the existing 3D extrusion renderer when switching to 3D.
6. Preserve map location as closely as practical when switching presentation modes.
7. Keep the age coverage warning unchanged.

## Next phase: block aggregation

After the basic 2D presentation works, create a street-block / analysis-block derivative where a lens can be aggregated into a smaller number of polygons.

Candidate statistics:

- median building age
- old-building share
- transaction median price per ping
- recent price change
- transaction count / liquidity
- redevelopment potential

The purpose is readability and performance: a consumer should be able to see the structure of a neighborhood without decoding thousands of individually colored buildings.

## Guardrails

- 2D mode is not a degraded fallback; it is the primary analytical mode.
- 3D is not the data model. Data lenses must remain presentation-independent.
- Do not imply that uncolored buildings have a particular age or price.
- Do not build block aggregation by arbitrary screen pixels; use a reproducible geographic unit or derived street block.
