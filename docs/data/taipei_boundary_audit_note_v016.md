# Taipei POI audit v0.16 — boundary guard note

Issue #56 anomaly review exposed two false-positive classes in the geo/address guard:

1. bare place-name token collision (`金門街` was mistaken for `金門縣`);
2. a broad Taipei bounding box also covered nearby New Taipei areas such as Yonghe, so legitimate New Taipei records whose structured address said `新北市` were incorrectly labeled as Taipei coordinate/address conflicts.

v0.16 changes the audit rule to require actual Taipei City polygon membership before an outside-city structured address can be treated as a geo/admin conflict.

Audit implementation currently loads the 12 Taipei district polygons from the public `xashiex/taiwan-district-boundary-to-geojson` conversion (`docs/data/63.json`), whose source workflow is based on Taiwan MOI district-boundary data. This is acceptable for the spike, but a production canonical pipeline should pin a local, provenance-recorded official boundary snapshot rather than depend on a live third-party raw GitHub URL.

Core rule:

```text
coordinate inside Taipei City polygon
AND structured address explicitly names another city/county
=> hard geo anomaly candidate
```

A point in Yonghe / Xindian / other New Taipei territory must not be called anomalous merely because it falls inside a broad Taipei-area rectangle.
