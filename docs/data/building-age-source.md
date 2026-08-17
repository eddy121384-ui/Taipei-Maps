# Building-age source research

## Goal

Build a citywide building-age dataset that can be joined to the `LOD1_2024` full-city 3D building layer.

## Primary official source found

Taipei Open Data publishes **臺北市歷年使用執照摘要** (historical occupancy/use permit summaries).

Dataset page:

`https://data.taipei/dataset/detail?id=c876ff02-af2e-4eb8-bd33-d444f5052733`

Current downloadable resource (observed 2026-08-17):

`https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=0f3f9675-8356-4f1a-9908-1ce8892012fa`

Format / size:

- XML
- about 65.25 MB
- covers permits through 2025-12-31
- annual update cadence
- public / free

Official metadata says the dataset includes:

- permit year / permit number
- issue date
- construction type
- structural type
- zoning
- above-ground floors
- below-ground floors
- households
- building height
- completion date (竣工日期)
- start date
- address
- land-section / parcel information
- floor details

This source is preferable to scraping the rendered `屋齡分布圖` when possible because it is an explicitly published raw dataset with stable provenance.

## Secondary official source / cross-check

Taipei City's 都更／地政資訊平台 exposes a `房屋健檢地圖 / 屋齡分布圖` and states that it provides building age, structure, and total-floor information:

`https://cloud.land.gov.taipei/urland/urban.html`

We should still investigate the underlying service because it may already contain a building-level geometry or join key that improves matching coverage.

## Planned pipeline

1. Download source XML to `data/raw/` (never commit raw files).
2. Inspect real XML tag/schema names.
3. Normalize completion date, address, structural type, floor count, permit id and parcel/section identifiers.
4. Convert ROC/Minguo dates to Gregorian dates where needed.
5. Produce a derived table with at least:
   - `permit_id`
   - `address_raw`
   - `address_normalized`
   - `completion_date`
   - `completion_year`
   - `building_age`
   - `structure`
   - `floors_above`
   - `floors_below`
   - `building_height`
   - parcel / section identifiers when available
6. Join to `LOD1_2024` using the strongest available key:
   - direct shared identifier if discovered
   - parcel / building id
   - normalized address
   - spatial join as fallback
7. Document coverage and unmatched rate by district.

## Data-quality rules

- Never classify unknown age as a real age bin.
- Preserve raw source values alongside normalized values during development.
- Prefer deterministic identifiers over address matching.
- Treat address/spatial matching as probabilistic and report match confidence.
- Do not infer a completion date from transaction dates.
