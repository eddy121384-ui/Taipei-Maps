# Issue #56 — Daily-life POI normalization + duplicate audit v0.2

## Why this iteration exists

The first local smoke against Overture Places `2026-08-19.0` proved that the source is useful, but not clean enough to expose directly as a residential-research layer.

Observed in Taipei visual audit:

- useful convenience-store and supermarket coverage exists;
- some real stores visible on the OSM raster comparison basemap are missing from Overture structured POIs;
- at least one apparent physical store is represented by multiple Overture points;
- supermarket features can expose branch-oriented names such as `文山萬年` / `文山興隆`, while the residential user primarily needs the chain brand (`全聯`);
- a current Overture release date does not imply that every underlying place observation was freshly verified;
- the loaded brand list contains legacy-looking names that should be treated as stale-data candidates until address-level verification is completed.

Provisional source verdict remains:

`PASS WITH GAPS — Overture is useful as the commercial-POI baseline candidate, but raw Overture output is not production-ready.`

This is not the final five-district verdict yet.

## v0.2 goal

Do **not** merge OSM structured data yet.

First make the Overture-only audit capable of measuring the two source-quality defects that would otherwise contaminate future Place Metrics:

1. brand / branch-name normalization;
2. physical-store duplicate candidates.

The pipeline concept being tested is:

```text
Overture raw place
    ↓
category normalization
    ↓
Taiwan-chain brand normalization
    ↓
physical-store duplicate audit
    ↓
future Buju canonical POI
```

No automatic canonical merge is authorized in v0.2.

## Product-name contract

For the major chains in Issue #56, the map should prefer the consumer-facing brand:

```text
7-ELEVEN
全家
萊爾富
OK Mart
全聯
家樂福
美廉社
```

The source / branch name remains inspectable in the popup.

Example desired semantics:

```text
map label:  全聯
popup:      全聯
            文山萬年
            原始名稱: <Overture source name>
```

This prevents branch identifiers from becoming the primary residential-research label while preserving provenance.

## Duplicate-candidate rule v0.2

Duplicate handling must be conservative because genuinely distinct Taipei stores can be physically close.

A pair is only considered a **suspect duplicate candidate** when:

- normalized residential category matches;
- normalized brand / identity matches;
- point distance is no more than 30 m; and
- at least one stronger condition is true:
  - distance is no more than 8 m; or
  - normalized branch/name key matches; or
  - normalized raw primary name matches.

Candidate pairs are unioned into audit groups.

Important:

- candidate groups are highlighted, not deleted;
- raw counts remain visible;
- `audit dedup estimate` is explicitly non-production;
- thresholds should be revised from Taipei evidence, not assumed to be universally correct.

## v0.2 smoke UI

`public/daily-life-poi-overture-spike.html` now exposes:

- raw convenience count;
- raw supermarket count;
- raw classified total;
- suspected duplicate-group count;
- conservative audit dedup estimate;
- normalized major-chain labels;
- branch/source name in popup;
- red duplicate-candidate rings with inspection popup;
- existing move-to-idle timing.

Launcher remains:

```text
start-daily-life-poi-overture-spike.bat
```

## Next physical audit

Run the same five-area smoke:

- Daan
- Xinyi
- Songshan
- Zhongshan
- Zhongzheng

For each area, record at least several known stores across more than one chain and classify:

```text
present
missing
wrong category
duplicate candidate true positive
duplicate candidate false positive
stale candidate
misplaced
brand normalized correctly
branch preserved correctly
```

The key new questions are:

1. Does brand normalization make the map semantically correct for a residential user?
2. How many obvious raw duplicates are caught by the conservative rule?
3. Does the rule falsely combine legitimately separate same-brand stores?
4. Is missing coverage isolated noise, or systematic enough that OSM structured data is required?

## Decision after v0.2

If duplicate detection is usable and missing Overture coverage is material but not catastrophic:

```text
Phase B: Overture baseline + OSM structured hole-filler
```

At that point, build a canonical POI layer rather than rendering either source directly.

If the Overture missing/stale rate is severe or systematically biased for major Taiwan chains, reconsider whether Overture deserves primary-baseline status at all.

Only after the canonical POI contract is credible should Issue #56 feed:

```text
nearest_convenience_store
convenience_store_count_500m
nearest_supermarket
supermarket_count_800m
```

The Place Metrics must count physical stores, not raw source rows.
