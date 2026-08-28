# Inventory school-claim verification v0.1

Issue: #67

Official source semantics: Taipei 115 academic-year neighbor-level school assignment + Taipei Civil Affairs official neighbor geometry.

Live verification run: GitHub Actions `33211625763` (success)

## Summary

Five building-level inventory candidates with sufficiently precise locations were passed through the same `resolveTaipeiSchoolDistricts()` logic used by 卜居.

Result:

- `verified_exact`: 3
- `verified_shared`: 1
- `mismatch`: 1
- `unresolved`: 0
- `error`: 0

This is a deliberately small validation sample. The 20% mismatch rate must **not** be generalized to the whole market.

## Results

| Home | External claim | Official 115 junior assignment | Verdict |
| --- | --- | --- | --- |
| 大安MONEY賦寓 | 金華 | 金華、民族、螢橋共同學區 | `verified_shared` |
| 臨沂雅典 | 金華 | 金華 | `verified_exact` |
| 中正藏璽 | 中正 | 中正 | `verified_exact` |
| 中正名門 | 中正 | 弘道 | **`mismatch`** |
| 永康麗園 | 金華 | 金華 | `verified_exact` |

Machine-readable detail lives in `docs/research/inventory_school_verification_v01.csv`.

## Important cases

### 中正名門 — real mismatch

The verified building point resolves to:

- 中正區
- 龍福里
- 3 鄰
- elementary: 市大附小
- junior: **弘道國中**

The inventory benchmark had been discovered under a `中正國中` claim/search surface.

For 卜居, this property must **not** be displayed as verified 中正國中 inventory.

This is the concrete proof that external school marketing labels are discovery hints, not a source of truth.

### 大安MONEY賦寓 — shared catchment, not pure 金華

The building point resolves to:

- 大安區
- 古莊里
- 17 鄰
- elementary: 古亭
- junior: **金華、民族、螢橋共同學區**

Calling this simply `金華國中學區` loses material information. A buyer may see the word 金華 and assume an exclusive catchment when the official assignment is shared.

Therefore the product must preserve exact common-school wording.

## Product contract

A future inventory card should carry separate fields:

```text
external_school_claim
school_verification_status
official_elementary_assignment
official_junior_assignment
official_district / village / neighbor
location_precision_grade
```

Recommended status enum:

- `verified_exact`
- `verified_shared`
- `mismatch`
- `unresolved`
- `insufficient_location`
- `source_error`

Do not silently rewrite `mismatch` to the claimed school.

Do not collapse `verified_shared` into a single school label.

## Inventory filtering implication

For a user asking:

> 目前有哪些「金華國中」房子在賣？

The default result set should be explicit about semantics:

1. exact 金華 assignments
2. common/shared assignments containing 金華 — visually labeled as shared
3. unresolved candidates — optional separate section, never mixed into verified inventory
4. mismatches — excluded from the verified result set

The same rule applies to 中正國中.

## Location quality rule

School verification is only meaningful when the listing can be tied to a sufficiently precise physical location.

This first pass intentionally skipped many street/section-only benchmark rows.

Future source evaluation should therefore treat precise partner coordinates / address tokens as a **required field**, not a nice-to-have, if School District Live Inventory is a target feature.
