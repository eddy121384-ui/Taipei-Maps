# Location Summary mobile preview v03

Purpose: integrate Location Summary v0.1 into the existing Taipei-Maps mobile preview instead of replacing the map UI.

Preview behavior:

- preserves existing basemap / aerial / 3D / terrain controls
- preserves school-district and school-point controls
- adds a `📍 摘要` mode toggle
- map clicks only query Location Summary while summary mode is enabled
- summary appears in a collapsible panel positioned above the existing mobile HUD
- turning summary mode off removes the query marker and restores the normal map interaction surface

Pinned accepted data snapshot for summary inputs: `172fbb1d78d788df4f626cca28debf648a9c240d`.

Vercel preview:

`https://taipei-maps-location-summary-mobile-v03-fbb0b6btm.vercel.app`

The prior standalone v01/v02 pages remain smoke/debug artifacts and are not the intended integrated product interaction.
