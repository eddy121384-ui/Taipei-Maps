# Taipei school-district source audit — v0.1

Status: source strategy identified; current-year machine-readable extraction still to be implemented.

Related issues: #7, #9, #12

## Product goal

The first consumer layer should answer a normal household question:

> If I care about a specific public school, which neighborhoods / buildings are actually inside its school zone?

The map should show this as a simple boundary/highlight above the 3D city. Users should not need to understand GIS or administrative-boundary terminology.

## Authoritative school-zone sources

### Elementary school

Taipei City's official elementary-school enrollment site provides a public **115 school-year school-zone lookup** with two directions:

- district / village / neighborhood → school
- district / school → zone

Official site:

`https://tpenroll.tp.edu.tw/`

The same official site publishes historical school-zone documents, including:

- 114 school-year elementary school-zone overview
- 114 school-year elementary village/neighborhood school-zone table

Examples:

`https://tpenroll.tp.edu.tw/Home/Announce/21`

`https://tpenroll.tp.edu.tw/Home/Announce/22`

This is currently the best authoritative consumer-facing source for elementary zones.

### Junior high school

Taipei City Department of Education publishes the current **115 school-year** junior-high school-zone overview and village/neighborhood mapping as official PDFs.

Official pages:

`https://www.doe.gov.taipei/News_Content.aspx?n=6948C3CBF6631855&s=1F50E7C87BDFCFFC`

`https://www.doe.gov.taipei/News_Content.aspx?n=6948C3CBF6631855&s=0BC77ABF91FB8763`

### Taipei Open Data school-zone dataset

Taipei Open Data also has a dataset named `臺北市中小學校學區` with fields such as postal code, district, village, neighborhood and school-zone assignment.

Dataset:

`https://data.taipei/dataset/detail?id=678c5215-f14a-47e3-92bd-da43f9d7c7a9`

Important limitation: the downloadable CSV currently exposed there is still labeled **110 school year**, so it is useful for schema/prototype work but must not be presented as the current v0.1 zone layer.

## Geometry source — the key finding

We do not need a dedicated official "school-zone polygon" dataset if the authoritative zone assignment is expressed at village/neighborhood level.

Taipei Open Data publishes current GIS boundary layers for both villages and neighborhoods.

### Neighborhood boundaries

Dataset: `臺北市鄰界圖`

`https://data.taipei/dataset/detail?id=6d864ede-c482-4f33-bb89-5be19dc772e1`

- format: SHP
- coordinate system: TWD97
- key fields include district, village and neighborhood identifiers/names
- public/open
- updated independently by the Department of Civil Affairs

### Village boundaries

Dataset: `臺北市里界圖`

`https://data.taipei/dataset/detail?id=6b17b31d-4e16-495e-95b1-9fd1f47c80d8`

- format: SHP
- coordinate system: TWD97
- public/open

## Proposed reproducible polygon method

The school-zone polygon should be derived rather than hand-drawn:

1. Normalize the official school-zone assignment into rows like:

   `school_year / school_level / district / village / neighborhood / school / assignment_type`

2. Normalize district/village/neighborhood names and numeric neighborhood identifiers.

3. Join each zone row to the official `臺北市鄰界圖` polygon.

4. Dissolve/merge neighborhood polygons by school to create a school-zone geometry.

5. Preserve shared/common-zone semantics instead of forcing one polygon to one school.

6. Convert TWD97 geometry to WGS84 / browser-ready GeoJSON.

7. Store provenance on every derived feature:

   - school year
   - official source
   - source type (lookup / PDF / machine-readable table)
   - reconstruction version
   - shared-zone flag

This gives us a deterministic and auditable pipeline. A later school-year update should mostly be a data refresh, not a new hand-mapping exercise.

## Why neighborhood polygons matter

School zones can split a village by neighborhood. Therefore village polygons alone are not precise enough for the product. The neighborhood boundary SHP should be the primary geometry universe; village polygons are fallback/context only.

## Current-year data gap

The main remaining problem is **not geometry**. Geometry is available.

The remaining problem is obtaining the current 115 school-year elementary assignment table in a stable machine-readable form. The official enrollment site already exposes the information interactively, so the next technical task is to identify its public request/API pattern or another official downloadable current-year source.

Do not silently substitute the stale 110 Open Data CSV as current data.

## v0.1 implementation order

1. Discover/extract current 115 elementary district-village-neighborhood assignment from the official enrollment site or official downloadable source.
2. Download current neighborhood SHP.
3. Normalize both sides.
4. Join + dissolve to GeoJSON.
5. Add one school-zone toggle and school selector to the main map.
6. Smoke-test a few known schools and shared-zone cases.

## Guardrails

- Always display the school year.
- Shared/common zones must remain shared/common zones.
- Do not add school rankings or quality scores in v0.1.
- Do not infer a school zone from nearest-school distance.
- Do not treat an old Open Data CSV as the current legal/administrative assignment.
