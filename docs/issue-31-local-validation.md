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

This is a local runtime/tooling mismatch, not a WFS or data-pipeline failure.

Follow-up fix on the branch: the build BAT now downloads and caches an official Eclipse Temurin 21 portable JRE under `.cache/temurin21`, uses it only for Planetiler, and does not modify the Windows-wide Java installation.
