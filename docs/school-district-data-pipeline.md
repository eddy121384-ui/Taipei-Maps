# Taipei school-district data pipeline

## Product contract

Taipei-Maps answers **「這個門牌／這條街屬於哪所學校？」** with official catchment semantics. School points are secondary context. Distance, Voronoi cells, school-radius guesses, or whole-village approximations must not be presented as exact school districts.

Current exact coverage is **115學年度、臺北市大安區＋信義區、國小＋國中**.

## Runtime split

`public/taipei-school-districts-115.js`

- canonical school-assignment data
- academic-year metadata
- declared exact coverage
- source metadata
- no MapLibre rendering code

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

## Citywide target pipeline

```text
Taipei Education Department official 115學年度 source
        ↓
source-specific parser
        ↓
normalize district / village / neighbor notation
        ↓
validate overlaps, gaps, malformed ranges, shared-school wording
        ↓
canonical elementary + junior assignment tables
        ↓
Taipei official neighbor geometry (TPGOS / Civil Affairs)
        ↓
district + village + neighbor join
        ↓
MapLibre catchment polygons
```

The renderer must not need district-specific edits when coverage expands. Adding Zhongzheng, Songshan, Zhongshan, Wanhua, Wenshan, Nangang, Neihu, Shilin, Beitou, or Datong should be a data-pipeline change plus validation, not new UI logic.

## Validation gate

Run:

```bash
node tools/data/validate_taipei_school_districts.mjs
```

The validator rejects malformed keys, undeclared districts, empty assignments, invalid neighbor notation, descending ranges, and overlapping neighbor rules within the same village.

Before declaring a new district exact, also verify representative addresses/neighbors against the official source. For ambiguous or exceptional rules, preserve the official wording rather than forcing a simplified one-school model.

## New Taipei guardrail

New Taipei remains **Exact or nothing**. Do not color a whole village when the official assignment is neighbor-level. iMAP may be used as a correctness cross-check, but the map layer should not ship until an exact redistributable assignment + geometry path is established.

## High-school guardrail

Do not create fake high-school catchment polygons. High-school research belongs in a different model: 基北區 / admission rules / commute / school locations.
