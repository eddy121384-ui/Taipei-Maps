#!/usr/bin/env python3
"""Inspect Taipei building-license overlay DBF for joinable permit metadata.

Usage:
    python tools/data/inspect_building_overlay.py data/raw/building_overlay/<file>.dbf

This intentionally uses only the Python standard library. We only need the DBF
attribute table at this stage to inspect `budatt_no`, floor and construction
fields, so installing pyshp/geopandas is unnecessary and can conflict with
whatever Python environment happens to be first on PATH.
"""

from __future__ import annotations

import argparse
import collections
import re
import struct
import sys
from dataclasses import dataclass
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


@dataclass(frozen=True)
class DBFField:
    name: str
    field_type: str
    length: int
    decimals: int


def clean(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def decode_text(raw: bytes) -> str:
    raw = raw.rstrip(b"\x00 ")
    if not raw:
        return ""

    # Taipei legacy GIS data commonly uses CP950/Big5, while some refreshed
    # exports are UTF-8. Try both before falling back to a replacement decode.
    for encoding in ("utf-8", "cp950", "big5"):
        try:
            return raw.decode(encoding).strip()
        except UnicodeDecodeError:
            pass
    return raw.decode("latin-1", errors="replace").strip()


def roc_year_from_license(value: str) -> int | None:
    """Extract a plausible ROC year from a Taipei license number.

    Examples expected in the wild include forms such as:
      090使字第0001號
      088建字第0221號
      061使0759號
    """
    text = clean(value)
    match = re.search(r"(?<!\d)(\d{2,3})(?=\D)", text)
    if not match:
        return None
    year = int(match.group(1))
    if 30 <= year <= 150:
        return year
    return None


def read_dbf_header(handle) -> tuple[int, int, int, list[DBFField]]:
    header = handle.read(32)
    if len(header) != 32:
        raise ValueError("DBF header is truncated")

    record_count = struct.unpack("<I", header[4:8])[0]
    header_length = struct.unpack("<H", header[8:10])[0]
    record_length = struct.unpack("<H", header[10:12])[0]

    fields: list[DBFField] = []
    while handle.tell() < header_length:
        first = handle.read(1)
        if not first:
            break
        if first == b"\r":
            break

        rest = handle.read(31)
        if len(rest) != 31:
            raise ValueError("DBF field descriptor is truncated")
        descriptor = first + rest

        name = descriptor[0:11].split(b"\x00", 1)[0].decode("ascii", errors="replace").strip()
        field_type = chr(descriptor[11])
        length = descriptor[16]
        decimals = descriptor[17]
        fields.append(DBFField(name=name, field_type=field_type, length=length, decimals=decimals))

    handle.seek(header_length)
    return record_count, header_length, record_length, fields


def iter_dbf_records(path: Path):
    with path.open("rb") as handle:
        record_count, header_length, record_length, fields = read_dbf_header(handle)

        for _ in range(record_count):
            raw_record = handle.read(record_length)
            if len(raw_record) < record_length:
                break
            if raw_record[:1] == b"*":
                continue

            offset = 1  # deletion flag
            row: dict[str, str] = {}
            for field in fields:
                raw_value = raw_record[offset : offset + field.length]
                offset += field.length
                row[field.name] = decode_text(raw_value)
            yield row


def inspect(path: Path, samples: int) -> int:
    if not path.exists():
        print(f"ERROR: DBF not found: {path}", file=sys.stderr)
        return 2

    try:
        with path.open("rb") as handle:
            record_count, header_length, record_length, field_defs = read_dbf_header(handle)
    except (OSError, ValueError) as exc:
        print(f"ERROR: could not read DBF header: {exc}", file=sys.stderr)
        return 3

    field_names = [field.name for field in field_defs]

    print(f"File: {path}")
    print(f"Records declared: {record_count:,}")
    print(f"Header bytes: {header_length:,}")
    print(f"Record bytes: {record_length:,}")
    print("Fields:")
    for field in field_defs:
        print(
            f"  {field.name}  type={field.field_type}  "
            f"size={field.length}  decimals={field.decimals}"
        )

    lower = {name.lower(): name for name in field_names}
    permit_field = lower.get("budatt_no")
    floor_field = lower.get("bud_floor")
    const_field = lower.get("bud_const")
    city_field = lower.get("city")

    if not permit_field:
        print("\nERROR: expected `budatt_no` field not found.")
        print("Available fields: " + ", ".join(field_names))
        return 4

    permits: list[str] = []
    floor_counts: collections.Counter[str] = collections.Counter()
    const_counts: collections.Counter[str] = collections.Counter()
    city_counts: collections.Counter[str] = collections.Counter()
    roc_years: list[int] = []
    actual_records = 0

    try:
        for row in iter_dbf_records(path):
            actual_records += 1
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
    except (OSError, ValueError) as exc:
        print(f"ERROR: DBF record scan failed: {exc}", file=sys.stderr)
        return 5

    unique_permits = list(dict.fromkeys(permits))
    denominator = max(actual_records, 1)

    print("\nJoin diagnostics:")
    print(f"  Records read: {actual_records:,}")
    print(f"  Records with budatt_no: {len(permits):,} ({len(permits) / denominator:.1%})")
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
    parser.add_argument("dbf", type=Path)
    parser.add_argument("--samples", type=int, default=40)
    args = parser.parse_args()
    return inspect(args.dbf, args.samples)


if __name__ == "__main__":
    raise SystemExit(main())
