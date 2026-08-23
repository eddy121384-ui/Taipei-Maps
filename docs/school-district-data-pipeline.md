# Taipei school-district data pipeline

## Product contract

Taipei-Maps answers **「這個門牌／這條街屬於哪所學校？」** with official catchment semantics. School points are secondary context. Distance, Voronoi cells, school-radius guesses, or whole-village approximations must not be presented as exact school districts.

Current exact assignment coverage is **115學年度、臺北市 12 行政區、國小＋國中**. Runtime geometry is joined at official neighbor level.

## Runtime split

`public/taipei-school-districts-115.js`

- small canonical bootstrap
- academic-year metadata
- declared 12-district exact coverage
- pinned official assignment-source metadata and checksums
- generated validation counts
- no MapLibre rendering code

`public/school-districts-115/<district>.js`

- one runtime assignment shard per Taipei district
- elementary + junior assignment rows for that district
- generated from the same canonical importer
- no rendering code

`public/school-district-data-guard.js`

- runs after all 12 shards and before the renderer
- requires both levels to match generated citywide village counts and district counts
- fails closed: incomplete data disables the catchment dataset instead of drawing a believable partial map

`public/school-district-layer.js`

- compiles neighbor specs for lookup
- requests official neighbor geometry
- joins `district + village + neighbor` to the canonical assignment table
- assigns labels/colors and renders MapLibre polygons/popups

`public/school-location-layer.js`

- remains a secondary school-location layer
- does not define catchment membership

## Canonical schema

Each level uses a stable key:

```text
<district>|<village>
```

A whole-village assignment is represented as:

```js
{ all: '建安' }
```

A split village is represented as ordered neighbor rules:

```js
{
  rules: [
    { spec: '1,2', school: '仁愛' },
    { spec: '3-7', school: '仁愛、建安共同學區' },
    { spec: '8-20', school: '建安' }
  ]
}
```

Shared districts remain explicit strings containing `共同學區`. They must never be silently collapsed to one school.

## Source → product pipeline

```text
Taipei Education Department official 115學年度 PDFs
        ↓
SHA-256 + page-count verification
        ↓
source-specific pdfplumber parser
        ↓
explicit source-audited PDF extraction exceptions
        ↓
normalize district / village / neighbor notation
        ↓
validate 456 villages per level, district counts, syntax, overlaps, village-set equality
        ↓
canonical elementary + junior assignment tables
        ↓
12 browser runtime shards + metadata bootstrap
        ↓
fail-closed runtime guard
        ↓
Taipei official neighbor geometry (TPGOS / Civil Affairs)
        ↓
district + village + neighbor join
        ↓
MapLibre catchment polygons
```

The renderer does not contain district-specific assignment tables. Future academic-year refreshes should be importer/data changes, not MapLibre rewrites.

## Source-audited extraction exceptions

Do not add broad fill-down or cross-page guessing heuristics just to make a PDF parse. Known defects are explicit so they remain reviewable and fail loudly when source/parser behavior changes.

Current exceptions include:

- **Beitou elementary page 14**: vertically merged village cells cause generic table extraction to shift neighbor rows. The 42 internal Taipei villages are explicitly source-audited in the parser. The external New Taipei row is excluded from Taipei geometry coverage.
- **Shilin elementary, 天和里**: the official table continues neighbors **19–21** on the next PDF page as `三玉、天母共同學區`; pdfplumber loses the village association at the page break, so this exact continuation is explicitly restored.
- **Zhongshan junior, 晴光里**: a vertically merged school cell is explicitly restored rather than generically filled down.

The Shilin Tianhe exception was discovered by CI semantic comparison: the first importer build produced only neighbors 1–18, while the committed source-audited shard correctly retained 19–21. The importer was fixed instead of deleting the correct runtime rule.

## Validation gates

Fast local/runtime validation:

```bash
node tools/data/validate_taipei_school_districts.mjs
```

This validates the real browser load order (bootstrap → 12 shards → guard), metadata counts, malformed keys, undeclared districts, empty assignments, invalid/descending neighbor notation, overlapping neighbor rules, elementary/junior village-set equality, and representative assignment regressions.

One-click Windows data + browser smoke:

```text
start-school-district-citywide-smoke.bat
```

The BAT runs the validator first and refuses to open the browser on a data failure.

GitHub CI additionally:

1. installs the pinned PDF parser version;
2. re-downloads both checksum-pinned official 115 PDFs;
3. freshly regenerates the canonical bootstrap + all 12 shards;
4. compares committed assignment semantics against fresh importer output;
5. runs the runtime validator.

A citywide release is not accepted from counts alone. Browser smoke must still verify elementary + junior polygons in representative central/north/south Taipei views and verify that leaving Taipei does not affect the global map.

## New Taipei guardrail

New Taipei remains **Exact or nothing**. Do not color a whole village when the official assignment is neighbor-level. iMAP may be used as a correctness cross-check, but the map layer should not ship until an exact redistributable assignment + geometry path is established.

## High-school guardrail

Do not create fake high-school catchment polygons. High-school research belongs in a different model: 基北區 / admission rules / commute / school locations.
