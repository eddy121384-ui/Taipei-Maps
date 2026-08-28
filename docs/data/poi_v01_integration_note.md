# Taipei POI v0.1 integration note

This branch integrates the accepted Taipei daily-life POI v0.1 stack into `main`.

Accepted baseline:

- Overture baseline canonical POIs: 1781
- OSM canonical entities: 1751
- matched: 1164
- safe OSM holes: 505
- cross-source unresolved: 82
- reviewed pair overrides: 1
- reviewed cluster overrides: 1
- retired Overture canonical records: 1
- coordinate overrides: 2
- final reconciled canonical POIs: 2285

The dataset is accepted as **v0.1 / provisional complete**. Future isolated cleanup belongs in Issue #61 and is non-blocking for Place Metrics.

This integration absorbs the stacked work represented by PR #58 and PR #60.
