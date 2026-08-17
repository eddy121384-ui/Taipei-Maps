#!/usr/bin/env python3
"""Inspect Taipei building-license overlay SHP/DBF for joinable permit metadata.

Usage:
    python tools/data/inspect_building_overlay.py data/raw/building_overlay/<file>.shp

Requires pyshp (`pip install pyshp`). This is deliberately an inspection step:
we want to see the real `budatt_no` formats before hard-coding the age join.
"""

from __future__ import annotations

import argparse
import collections
import re
import sys
from pathlib import Path

try:
    import shapefile  # type: ignore
except ImportError:
    print("ERROR: pyshp is not installed. Run: python -m pip install pyshp", file=sys.stderr)
    raise SystemExit(2)


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def clean(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def roc_year_from_license(value: str) -> int | None:
    """Extract a plausible ROC year from a Taipei license number.

    Examples expected in the wild include forms such as:
      090使字第0001號
      088建字第0221號
      061使0759號

    Returns ROC year only when the leading 2-3 digit token is plausible.
    """
    text = clean(value)
    match = re.search(r"(?<!\d)(\d{2,3})(?=\D)", text)
    if not match:
        return None
    year = int(match.group(1))
    if 30 <= year <= 150:
        return year
    return None


def inspect(path: Path, samples: int) -> int:
    if not path.exists():
        print(f"ERROR: shapefile not found: {path}", file=sys.stderr)
        return 2

    reader = shapefile.Reader(str(path), encoding="utf-8", encodingErrors="replace")
    field_defs = reader.fields[1:]
    field_names = [field[0] for field in field_defs]

    print(f"File: {path}")
    print(f"Shape type: {reader.shapeTypeName}")
    print(f"Records: {len(reader):,}")
    print("Fields:")
    for field in field_defs:
        print(f"  {field[0]}  type={field[1]}  size={field[2]}  decimals={field[3]}")

    lower = {name.lower(): name for name in field_names}
    permit_field = lower.get("budatt_no")
    floor_field = lower.get("bud_floor")
    const_field = lower.get("bud_const")
    city_field = lower.get("city")

    if not permit_field:
        print("\nERROR: expected `budatt_no` field not found.")
        return 3

    permits: list[str] = []
    floor_counts: collections.Counter[str] = collections.Counter()
    const_counts: collections.Counter[str] = collections.Counter()
    city_counts: collections.Counter[str] = collections.Counter()
    roc_years: list[int] = []

    for record in reader.iterRecords():
        row = dict(zip(field_names, record))
        permit = clean(row.get(permit_field))
        if permit:
            permits.append(permit)
            year = roc_year_from_license(permit)
            if year is not None:
                roc_years.append(year)
        if floor_field:
            floor_counts[clean(row.get(floor_field))] += 1
        if const_field:
            const_counts[clean(row.get(const_field))] += 1
        if city_field:
            city_counts[clean(row.get(city_field))] += 1

    unique_permits = list(dict.fromkeys(permits))
    print("\nJoin diagnostics:")
    print(f"  Records with budatt_no: {len(permits):,} ({len(permits) / max(len(reader), 1):.1%})")
    print(f"  Unique budatt_no: {len(unique_permits):,}")
    if roc_years:
        print(f"  Parsed ROC year range from budatt_no: {min(roc_years)}–{max(roc_years)}")
        print(f"  Approx Gregorian range: {min(roc_years) + 1911}–{max(roc_years) + 1911}")
    else:
        print("  No plausible ROC years parsed from budatt_no")

    print("\nSample budatt_no values:")
    for value in unique_permits[:samples]:
        year = roc_year_from_license(value)
        print(f"  {value}  -> ROC year {year if year is not None else 'unparsed'}")

    if const_counts:
        print("\nMost common bud_const values:")
        for value, count in const_counts.most_common(15):
            print(f"  {count:>8,}  {value or '<blank>'}")

    if floor_counts:
        print("\nMost common bud_floor values:")
        for value, count in floor_counts.most_common(20):
            print(f"  {count:>8,}  {value or '<blank>'}")

    if city_counts:
        print("\nCity values:")
        for value, count in city_counts.most_common(10):
            print(f"  {count:>8,}  {value or '<blank>'}")

    print("\nNext step:")
    print("  Compare budatt_no against use_permits.csv permit_number_raw and original_permit_raw.")
    print("  If exact-match coverage is high, we can bypass bulk address geocoding.")
    print("  Unmatched older permits may still yield an approximate age from the ROC year in budatt_no.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("shp", type=Path)
    parser.add_argument("--samples", type=int, default=40)
    args = parser.parse_args()
    return inspect(args.shp, args.samples)


if __name__ == "__main__":
    raise SystemExit(main())
