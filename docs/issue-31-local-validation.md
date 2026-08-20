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

## Next validation — citywide

The branch now keeps the successful sample path intact and adds a separate citywide path:

- `tools/data/download_taipei_building_height_citywide.mjs` streams all WFS pages to disk instead of retaining the full geometry set in memory.
- citywide output keeps only `height_m` as a tile attribute; fallback counts remain an offline build diagnostic.
- `tools/data/taipei_building_height_citywide_pmtiles.yml` builds the same `building_height` source-layer.
- `build-taipei-building-height-pmtiles-citywide.bat` reuses the cached portable Java/Planetiler tooling, reports final GeoJSON + PMTiles sizes, and launches the browser in `?mode=citywide`.
- the browser validation now includes central Taipei plus Neihu, Beitou, Wenshan, Banqiao, Shanghai, and Tokyo.

Citywide acceptance remains browser-observed: full Taipei official coverage should render without materially degrading interaction, while locations outside Taipei must continue to use the Overture global baseline without holes or black screens.
