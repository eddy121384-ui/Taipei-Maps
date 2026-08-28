# Daily-life POI canonical v0.1

Issue: #56  
Branch: `feat/taipei-daily-life-poi-v01`

## Decision

Stop optimizing the audit UI around every Overture edge case. Overture remains a useful baseline with known gaps and dirty records, so the next product-facing step is to create a Buju-owned canonical POI layer.

Pipeline for this prototype:

```text
Overture Places raw records
  -> strict known-chain normalization
  -> conservative high-confidence duplicate links
  -> guarded entity clustering
  -> representative source record selection
  -> Buju canonical POI
```

Structured OSM is intentionally not merged yet. It remains the planned hole-filler after the Overture-only canonical layer is visually stable.

## v0.1 target chains

- 7-ELEVEN
- FamilyMart / 全家
- Hi-Life / 萊爾富
- OK Mart
- PX Mart / 全聯
- Carrefour / 家樂福
- Simple Mart / 美廉社

Unknown / weakly normalized brands are excluded from this first canonical prototype rather than guessed.

## Canonical schema

Runtime canonical entities expose:

```text
canonical_id
category
brand
branch
name
coordinates
source_rows
source_ids[]
source_names[]
sources[]
representative_key
representative_strength
address
merge_reasons[]
branch_conflict
address_conflict
```

The canonical coordinate is always copied from the strongest real source record. It is never a midpoint or cluster centroid.

## Conservative auto-merge rules

Records must already share canonical category and brand. v0.1 then auto-merges only when at least one high-confidence condition is met inside the category review radius:

- normalized address exactly matches;
- normalized branch exactly matches;
- normalized raw name exactly matches;
- same-brand points are within 5 m;
- one record is generic and the other branch-specific within 20 m for convenience stores or 35 m for supermarkets.

Convenience-store review radius: 50 m.  
Supermarket review radius: 100 m.

A union is rejected if the resulting cluster span would exceed the category review radius. This prevents transitive A-B-C chaining from producing a physically implausible large cluster.

Anything nearby that does not meet the high-confidence gate stays as separate canonical POIs and is counted as `unresolved_nearby_pairs`. v0.1 prefers under-merging to silently collapsing two real stores.

## Findings from the preceding audit that informed v0.1

- Overture contains many true duplicate records for Taipei chain stores.
- The same physical store may differ by tens of metres across upstream sources.
- Generic names such as `FamilyMart` or `全聯福利中心` are not sufficient evidence of a ghost/stale record.
- Branch names may contain typos (`莒光` vs `劍光`), so branch disagreement alone is not safe anti-merge evidence.
- Address metadata and geometry can disagree; that is a field-quality issue, not proof that the entire POI is invalid.
- Raw Overture rows must not feed Place Metrics directly.

## Prototype files

- `public/buju-poi-canonical-v01.mjs` — reusable normalization + canonicalization logic.
- `public/daily-life-poi-canonical-v01.html` — MapLibre visual smoke page comparing canonical POIs with optional raw records.
- `tools/dev/test_buju_poi_canonical_v01.mjs` — small synthetic regression guard.
- `start-daily-life-poi-overture-spike.bat` — launcher now opens the canonical v0.1 smoke page.

## Prototype metrics

The smoke page reports:

- target-chain raw records
- canonical POI total
- canonical convenience stores
- canonical supermarkets
- auto-merged groups
- raw rows absorbed
- unresolved nearby pairs
- move-to-idle timing

These metrics are based on the Overture source tiles currently loaded by MapLibre. They are **not** full Taipei City totals and must not be used as production Place Metrics.

## Next gate

Perform a short desktop smoke in Daan / Xinyi / Songshan / Zhongshan / Zhongzheng:

1. canonical points render and remain clickable;
2. turning raw records on visually shows some obvious duplicates collapsing into one canonical point;
3. merged canonical popups retain source rows, source names, provenance, and merge evidence;
4. obvious uncertain cases remain separate rather than being aggressively merged;
5. pan / zoom stays usable.

If this passes, the next engineering step is a **citywide/offline canonical dataset**, followed by **structured OSM hole-filling and reconciliation**. Only after that should `nearest_convenience_store`, `convenience_store_count_500m`, `nearest_supermarket`, and `supermarket_count_800m` be treated as trustworthy Place Metrics.
