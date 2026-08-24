# Official new-development pipeline v0.1

Issue: #48

## Product intent

Create a government-open-data truth layer for Taipei presale/new-development projects. This pipeline is deliberately separate from commercial listing experiments. A project enters the canonical Taipei dataset only after its MOI presale filing construction-permit number joins to an official Taipei construction-permit record.

## Sources

Source metadata and download URLs live in `tools/data/new-development-sources.json`.

- MOI presale project filing data: all filings declared since 2021-07-01, regenerated monthly.
- Taipei historical construction permits: through ROC year 114.
- Taipei current construction permits: ROC year 115, refreshed monthly.
- Taipei building-permit overlay SHP (TWD97): reserved for the next spatial stage.

All registered sources declare Government Open Data License v1.0.

## v0.1 join

```text
MOI presale filing BUILDINGPERMITNO
        |
        | normalize ROC year + 建字 + numeric serial
        v
Taipei historical/current construction permit number
        |
        v
canonical Taipei new-development row
```

District-name-only matching is forbidden because names such as `大安區` are not globally unique. Address geocoding is also forbidden in v0.1.

## Output contract

`public/generated/taipei_new_developments_official.json`

Each project keeps:

- project name
- filing district/location
- builder
- filed household count
- zoning/use/material
- filing and filed selling-period fields
- parcel/land-lot text
- filed construction permit number/date
- matched Taipei permit summary
- `location_precision = permit_join_nonspatial`
- `geometry = null`
- source provenance

`public/generated/taipei_new_developments_official.audit.json`

The audit includes source SHA-256 hashes, source row counts, canonical join count, ambiguous exact-key joins, and unresolved samples.

## Fail-closed rules

The pipeline stops instead of emitting guessed data when:

- source files are missing;
- MOI schema no longer exposes required columns;
- UTF-8 decoding is damaged;
- Taipei permit XML structure can no longer be parsed at a plausible record count;
- zero MOI projects join to official Taipei permits.

## Local run

From the repo root:

```bat
build-official-new-development-pipeline.bat
```

The first run downloads a large historical Taipei XML file and can take time. Later runs use `.cache/new-development`.

Force an official-source refresh with:

```bat
build-official-new-development-pipeline.bat refresh
```

## Next gate: spatial geometry

Do not draw project points yet. The next stage should inspect the Taipei building-permit overlay SHP (`TWD97`) and establish a deterministic permit/parcel-to-geometry join. Only after that join passes audit should the MapLibre layer expose exact project geometry. If the official spatial source cannot be joined reliably, the UI must label a lower location precision rather than invent coordinates.
