# Issue #31 local validation notes

## 2026-08-20 — three-district-scale WFS sample

User-machine run of `build-taipei-building-height-pmtiles-sample.bat` reached the Planetiler step successfully after downloading the WFS sample.

Observed downloader output:

- paged download completed through page 32
- unique features: 159,076
- polygon features: 159,076
- fallback heights: 11
- slim GeoJSON size: 60.9 MiB

The first Planetiler attempt then failed with `UnsupportedClassVersionError`:

- Planetiler class file version: 65.0 (Java 21)
- system runtime supported only through: 52.0 (Java 8)

This was a local runtime/tooling mismatch, not a WFS or data-pipeline failure. The build BAT was then changed to download/cache an official Eclipse Temurin 21 portable JRE under `.cache/temurin21`, use it only for Planetiler, and leave the Windows-wide Java installation untouched.

After the portable-runtime fix, the sample PMTiles build and browser spike completed on the user machine. Subjective browser result: the 159,076-building PMTiles overlay remained "quite smooth" while keeping Overture as the global baseline.

## 2026-08-20 — live WFS height semantics

A targeted raw-field probe was run against Taipei 101, a Daan residential control area, and Yangmingshan hillside residential buildings.

The live WFS keys are:

- roof elevation: `1_top_high`
- entrance / ground elevation: `1_ent_heig`
- surveyed physical building height: `1_bud_high`
- floor count: `1_floor`

The earlier spike accidentally queried `1_entr_heig` and `1_bd_high`, which are not live WFS keys and therefore forced almost all buildings to the `floors × 3.2 m` fallback.

The corrected probe showed `1_bud_high == 1_top_high - 1_ent_heig` row-by-row in all three target areas. Representative evidence:

- Taipei 101: `517.37 - 4.94 = 512.43 m`, matching `1_bud_high = 512.43`
- Daan 24-floor example: `96.41 - 8.51 = 87.90 m`, matching `1_bud_high = 87.90`
- Yangmingshan 11-floor example: `445.80 - 387.97 = 57.83 m`, matching `1_bud_high = 57.83`

Decision: use `1_bud_high` as the primary physical extrusion height, use `1_top_high - 1_ent_heig` as an independent consistency/fallback path, then fall back to floors × 3.2 m and finally 9.6 m only when surveyed/elevation data is unusable.

The citywide downloader now reports how many rows are comparable between surveyed height and the elevation delta, mismatch count above 0.05 m, and maximum absolute difference. This gives one final full-city semantic validation gate during the next rebuild.

## Next validation — citywide

The branch now keeps the successful sample path intact and adds a separate citywide path:

- `tools/data/download_taipei_building_height_citywide.mjs` streams all WFS pages to disk instead of retaining the full geometry set in memory.
- citywide output keeps only `height_m` as a tile attribute; derivation and consistency counts remain offline build diagnostics.
- `tools/data/taipei_building_height_citywide_pmtiles.yml` builds the `building_height` source-layer through z16.
- `build-taipei-building-height-pmtiles-citywide.bat` uses preservation settings that disable small-footprint cutoffs and geometry simplification for this validation run.
- the browser validation includes central Taipei plus Neihu, Beitou, Wenshan, Yangmingshan, Banqiao, Shanghai, and Tokyo.

Citywide acceptance remains browser-observed: full Taipei official coverage should render without materially degrading interaction, while locations outside Taipei must continue to use the Overture global baseline without holes or black screens. The rebuild should also confirm that surveyed-height coverage is dominant, `1_bud_high` and the elevation delta remain consistent citywide, and the higher-preservation PMTiles retains substantially more source footprints than the earlier z14 archive.
