#!/usr/bin/env python3
"""Extract a broad Taipei daily-life POI candidate set from pinned Overture GeoParquet."""

from __future__ import annotations

import argparse
from pathlib import Path

import duckdb


def sql_quote(value: str) -> str:
    return value.replace("'", "''")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--s3-path", required=True)
    parser.add_argument("--bbox", required=True, help="minLon,minLat,maxLon,maxLat")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    min_lon, min_lat, max_lon, max_lat = [float(v) for v in args.bbox.split(",")]
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()

    con = duckdb.connect()
    con.execute("INSTALL spatial")
    con.execute("LOAD spatial")
    con.execute("INSTALL httpfs")
    con.execute("LOAD httpfs")
    con.execute("SET s3_region='us-west-2'")

    # Keep the SQL filter deliberately broad. Buju's JS canonical engine remains the
    # authority for chain classification; this predicate only avoids downloading
    # unrelated Taipei restaurants/shops from the cloud dataset.
    candidate_predicate = r"""
      categories.primary IN ('convenience_store', 'supermarket', 'grocery_store')
      OR lower(coalesce(names.primary, '')) LIKE '%7-eleven%'
      OR lower(coalesce(names.primary, '')) LIKE '%7 eleven%'
      OR lower(coalesce(names.primary, '')) LIKE '%familymart%'
      OR lower(coalesce(names.primary, '')) LIKE '%family mart%'
      OR lower(coalesce(names.primary, '')) LIKE '%hi-life%'
      OR lower(coalesce(names.primary, '')) LIKE '%hi life%'
      OR lower(coalesce(names.primary, '')) LIKE '%ok mart%'
      OR lower(coalesce(names.primary, '')) LIKE '%px mart%'
      OR lower(coalesce(names.primary, '')) LIKE '%carrefour%'
      OR lower(coalesce(names.primary, '')) LIKE '%simple mart%'
      OR coalesce(names.primary, '') LIKE '%統一超商%'
      OR coalesce(names.primary, '') LIKE '%全家%'
      OR coalesce(names.primary, '') LIKE '%萊爾富%'
      OR coalesce(names.primary, '') LIKE '%OK超商%'
      OR coalesce(names.primary, '') LIKE '%全聯%'
      OR coalesce(names.primary, '') LIKE '%家樂福%'
      OR coalesce(names.primary, '') LIKE '%美廉社%'
      OR lower(coalesce(CAST(brand AS VARCHAR), '')) LIKE '%7-eleven%'
      OR lower(coalesce(CAST(brand AS VARCHAR), '')) LIKE '%family%mart%'
      OR lower(coalesce(CAST(brand AS VARCHAR), '')) LIKE '%hi-life%'
      OR lower(coalesce(CAST(brand AS VARCHAR), '')) LIKE '%ok%mart%'
      OR lower(coalesce(CAST(brand AS VARCHAR), '')) LIKE '%px%mart%'
      OR lower(coalesce(CAST(brand AS VARCHAR), '')) LIKE '%carrefour%'
      OR lower(coalesce(CAST(brand AS VARCHAR), '')) LIKE '%simple%mart%'
      OR coalesce(CAST(brand AS VARCHAR), '') LIKE '%統一超商%'
      OR coalesce(CAST(brand AS VARCHAR), '') LIKE '%全家%'
      OR coalesce(CAST(brand AS VARCHAR), '') LIKE '%萊爾富%'
      OR coalesce(CAST(brand AS VARCHAR), '') LIKE '%全聯%'
      OR coalesce(CAST(brand AS VARCHAR), '') LIKE '%家樂福%'
      OR coalesce(CAST(brand AS VARCHAR), '') LIKE '%美廉社%'
    """

    query = f"""
    COPY (
      SELECT
        id,
        CAST(names AS JSON) AS names,
        CAST(categories AS JSON) AS categories,
        confidence,
        CAST(brand AS JSON) AS brand,
        CAST(addresses AS JSON) AS addresses,
        CAST(sources AS JSON) AS sources,
        geometry
      FROM read_parquet(
        '{sql_quote(args.s3_path)}',
        filename=true,
        hive_partitioning=1
      )
      WHERE
        bbox.xmin BETWEEN {min_lon:.8f} AND {max_lon:.8f}
        AND bbox.ymin BETWEEN {min_lat:.8f} AND {max_lat:.8f}
        AND ({candidate_predicate})
    ) TO '{sql_quote(str(output))}'
      WITH (FORMAT GDAL, DRIVER 'GeoJSON', SRS 'EPSG:4326');
    """

    con.execute(query)
    con.close()
    print(f"WROTE {output}")


if __name__ == "__main__":
    main()
