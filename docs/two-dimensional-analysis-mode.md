# Single-map analytical layer model

Related: Greater Taipei v0.1 (#7), #26

## Corrected product decision

There should not be separate 2D and 3D map experiences.

Taipei-Maps keeps one persistent Greater Taipei map / camera / layer stack. The 3D building models are optional geometry layers inside that map, just like any other layer.

A user can turn 3D buildings off to get a cleaner street-map view while keeping analytical information in exactly the same geographic context.

## Mental model

`one map -> geometry layers + data lenses`

Geometry layers:
- Taipei 3D buildings
- New Taipei 3D buildings
- optional cadastral/detail geometry

Data lenses:
- building age
- price
- school zones
- flood risk
- zoning
- redevelopment potential

The data lens owns the analytical meaning. The 3D building layer only changes how much city form is visible behind/with it.

## Renderer behavior

A lens can adapt its renderer without moving the user to another page or another map.

Example — building age:
- 3D buildings ON: age can remain a 3D extrusion/color lens so the values are visible on building form.
- 3D buildings OFF: the same age GeoJSON becomes a flat footprint/ground overlay.

Future block-level lenses should generally stay as calm ground-level choropleths whether 3D buildings are on or off.

## Street-block phase

The preferred everyday analytical view is likely to be street/block level rather than thousands of individually colored buildings.

Candidate statistics:
- median building age
- old-building share
- transaction median price per ping
- recent price change
- transaction count / liquidity
- redevelopment potential

These derived blocks should remain visible independently of the 3D building toggle.

## Guardrails

- One map, not a 2D app plus a 3D app.
- No page reload or navigation to hide/show 3D buildings.
- Camera and layer context must stay put when 3D buildings are toggled.
- Analytical overlays must remain usable with the 3D geometry hidden.
- 3D is not the data model.
- Do not imply uncolored buildings/blocks have a specific age or price.
- Do not build block aggregation by arbitrary screen pixels; use reproducible geographic units.

The earlier separate `MapView` implementation was a misunderstanding and should not be treated as the target UX.