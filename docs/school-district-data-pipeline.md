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
- supports official multi-neighbor polygons such as `LI_NO="012,018"` only when every encoded neighbor resolves to the same catchment
- derives the canonical village name from the more specific `SDFNAME` when available, falling back to `LIE_NAME`; this handles source-field inconsistencies such as `LIE_NAME="陽明區"` with `SDFNAME="陽明里17鄰"`
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
canonicalize village fields + parse multi-neighbor polygons
        ↓
source-audited historical/source reconciliation where required
        ↓
bidirectional assignment ↔ geometry validation
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

## Assignment ↔ geometry reconciliation

`tools/data/taipei-school-district-geometry-reconciliations.json` is the auditable boundary between the 115 education tables and the current Civil Affairs neighbor geometry. It never invents a polygon. Four explicit reconciliation types are allowed:

1. **Historical merge** — a retired assignment neighbor may map to a current neighbor only when an official administrative record documents the merge and the catchment is identical before/after the mapping. Current example: 南港成福 28→6 and 29→16.
2. **Official empty neighbor** — an assignment table can retain a neighbor number that official district records identify as an empty neighbor. It has no polygon and is not drawn. Current example: 大安芳和第7鄰.
3. **Non-current assignment neighbor** — an education table can retain a historical neighbor number that current official administrative records no longer recognize, without enough evidence to remap it. It is retained for audit but no polygon is inferred. Current example: 士林三玉第22鄰 in the junior-high table.
4. **Exact stale geometry feature** — a current geometry service may contain an obsolete record contradicted by current official neighbor counts. It can be excluded only by exact feature identity (`f_id` plus district/village/neighbor/code/name fields); any source change fails CI and requires re-audit. Current example: 信義富台 `f_id=9688`, neighbor 19, while current official records list 富台里 as 18 neighbors.

Source-field inconsistencies are not reconciliation exceptions when a deterministic official field resolves them. Example: the Civil Affairs feature with `LIE_NAME="陽明區"` and `SDFNAME="陽明里17鄰"` is canonically joined as 士林區陽明里第17鄰.

## Validation gates

Fast local/runtime validation:

```bash
node tools/data/validate_taipei_school_districts.mjs
```

This validates the real browser load order (bootstrap → 12 shards → guard), metadata counts, malformed keys, undeclared districts, empty assignments, invalid/descending neighbor notation, overlapping neighbor rules, elementary/junior village-set equality, representative assignment regressions, multi-neighbor geometry parsing, and `SDFNAME` village canonicalization.

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
5. runs the runtime validator;
6. scans the live official Civil Affairs neighbor geometry with stable `f_id` pagination;
7. validates all multi-neighbor polygons and every audited reconciliation;
8. checks assignment → geometry and geometry → assignment coverage, requiring zero unexplained discrepancies.

Latest green citywide geometry validation inspected **9,691 accepted official neighbor features across 456 villages**, including **19 multi-neighbor features** and **5,123 split-neighbor assignment checks**. After the explicit audited reconciliations above, both `missingAssignmentGeometryCount` and `unassignedGeometryCount` are **0**.

A citywide release is not accepted from automated validation alone. Browser smoke must still verify elementary + junior polygons in representative central/north/south Taipei views and verify that leaving Taipei does not affect the global map.

## New Taipei guardrail

New Taipei remains **Exact or nothing**. Do not color a whole village when the official assignment is neighbor-level. iMAP may be used as a correctness cross-check, but the map layer should not ship until an exact redistributable assignment + geometry path is established.

## High-school guardrail

Do not create fake high-school catchment polygons. High-school research belongs in a different model: 基北區 / admission rules / commute / school locations.
