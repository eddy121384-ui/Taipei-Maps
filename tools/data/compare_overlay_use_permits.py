#!/usr/bin/env python3
"""Compare Taipei building-overlay permit keys with normalized use-permit records.

This is a diagnostics step, not a final citywide age join.

Inputs:
- DBF from Taipei City building-license overlay (`BUDATT_NO`)
- `data/derived/use_permits.csv` from normalize_use_permits.py

Outputs a text report and a row-level CSV preview so we can measure whether
permit-number joins are good enough to bypass bulk address geocoding for the
covered 2001+ subset.
"""

from __future__ import annotations

import argparse
import csv
import re
import struct
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


@dataclass(frozen=True)
class DBFField:
    name: str
    length: int


def decode_text(raw: bytes) -> str:
    raw = raw.rstrip(b"\x00 ")
    if not raw:
        return ""
    for encoding in ("utf-8", "cp950", "big5"):
        try:
            return raw.decode(encoding).strip()
        except UnicodeDecodeError:
            pass
    return raw.decode("latin-1", errors="replace").strip()


def read_dbf_header(handle):
    header = handle.read(32)
    if len(header) != 32:
        raise ValueError("DBF header is truncated")
    record_count = struct.unpack("<I", header[4:8])[0]
    header_length = struct.unpack("<H", header[8:10])[0]
    record_length = struct.unpack("<H", header[10:12])[0]
    fields: list[DBFField] = []
    while handle.tell() < header_length:
        first = handle.read(1)
        if not first or first == b"\r":
            break
        rest = handle.read(31)
        if len(rest) != 31:
            raise ValueError("DBF field descriptor is truncated")
        descriptor = first + rest
        name = descriptor[0:11].split(b"\x00", 1)[0].decode("ascii", errors="replace").strip()
        fields.append(DBFField(name=name, length=descriptor[16]))
    handle.seek(header_length)
    return record_count, record_length, fields


def iter_dbf_records(path: Path):
    with path.open("rb") as handle:
        record_count, record_length, fields = read_dbf_header(handle)
        for _ in range(record_count):
            raw_record = handle.read(record_length)
            if len(raw_record) < record_length:
                break
            if raw_record[:1] == b"*":
                continue
            offset = 1
            row: dict[str, str] = {}
            for field in fields:
                raw = raw_record[offset : offset + field.length]
                offset += field.length
                row[field.name] = decode_text(raw)
            yield row


def overlay_base_key(value: str) -> str:
    """Normalize values like `93.0266.12F` -> `93.0266`."""
    value = value.strip()
    match = re.match(r"^\s*(\d{2,3})\s*[.]\s*(\d{1,6})(?:[.]|$)", value)
    if not match:
        return ""
    year = int(match.group(1))
    sequence = int(match.group(2))
    if not 30 <= year <= 150:
        return ""
    return f"{year}.{sequence:04d}"


def license_keys(value: str) -> set[str]:
    """Extract ROC-year + permit-sequence keys from Chinese permit strings.

    Examples:
      088建字第0221號 -> 88.0221
      090使字第0001號 -> 90.0001
    """
    value = value.strip()
    if not value:
        return set()

    keys: set[str] = set()
    patterns = [
        r"(?<!\d)(\d{2,3})\s*(?:建|使|拆|雜)?\s*字?\s*第?\s*(\d{1,6})\s*號?",
        r"(?<!\d)(\d{2,3})[.\-/](\d{1,6})(?!\d)",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, value):
            year = int(match.group(1))
            seq = int(match.group(2))
            if 30 <= year <= 150:
                keys.add(f"{year}.{seq:04d}")
    return keys


def load_use_permits(path: Path):
    by_original: dict[str, list[dict[str, str]]] = defaultdict(list)
    by_use: dict[str, list[dict[str, str]]] = defaultdict(list)
    rows: list[dict[str, str]] = []

    with path.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        required = {"permit_number_raw", "original_permit_raw", "building_age", "completion_year"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError("use_permits.csv missing columns: " + ", ".join(sorted(missing)))

        for row in reader:
            rows.append(row)
            for key in license_keys(row.get("original_permit_raw", "")):
                by_original[key].append(row)
            for key in license_keys(row.get("permit_number_raw", "")):
                by_use[key].append(row)

    return rows, by_original, by_use


def choose_match(key: str, by_original, by_use):
    original_rows = by_original.get(key, [])
    use_rows = by_use.get(key, [])

    if original_rows:
        source = "original_permit_raw"
        candidates = original_rows
    elif use_rows:
        source = "permit_number_raw"
        candidates = use_rows
    else:
        return "unmatched", [], "", ""

    ages = sorted({r.get("building_age", "") for r in candidates if r.get("building_age", "")})
    years = sorted({r.get("completion_year", "") for r in candidates if r.get("completion_year", "")})

    if len(ages) == 1 and len(years) <= 1:
        return source, candidates, ages[0], years[0] if years else ""

    return source + ":ambiguous", candidates, "", ""


def compare(dbf_path: Path, use_csv: Path, out_csv: Path) -> int:
    if not dbf_path.exists():
        print(f"ERROR: DBF not found: {dbf_path}", file=sys.stderr)
        return 2
    if not use_csv.exists():
        print(f"ERROR: use-permit CSV not found: {use_csv}", file=sys.stderr)
        return 3

    try:
        use_rows, by_original, by_use = load_use_permits(use_csv)
    except (OSError, ValueError) as exc:
        print(f"ERROR: could not load use-permit CSV: {exc}", file=sys.stderr)
        return 4

    overlay_rows = list(iter_dbf_records(dbf_path))
    if not overlay_rows:
        print("ERROR: no overlay DBF rows read", file=sys.stderr)
        return 5

    field_lookup = {name.lower(): name for name in overlay_rows[0]}
    budatt_field = field_lookup.get("budatt_no")
    if not budatt_field:
        print("ERROR: BUDATT_NO not found in DBF", file=sys.stderr)
        return 6

    preview_rows: list[dict[str, str]] = []
    status_counts: Counter[str] = Counter()
    unique_overlay_keys: set[str] = set()
    matched_unique_keys: set[str] = set()
    unparsed_samples: list[str] = []
    unmatched_samples: list[str] = []

    for row in overlay_rows:
        raw = row.get(budatt_field, "")
        key = overlay_base_key(raw)
        if not key:
            status = "unparsed_overlay_key"
            candidates: list[dict[str, str]] = []
            age = completion_year = ""
            if raw and len(unparsed_samples) < 25:
                unparsed_samples.append(raw)
        else:
            unique_overlay_keys.add(key)
            source, candidates, age, completion_year = choose_match(key, by_original, by_use)
            if source == "unmatched":
                status = "unmatched"
                if len(unmatched_samples) < 25:
                    unmatched_samples.append(f"{raw} -> {key}")
            elif source.endswith(":ambiguous"):
                status = source
                matched_unique_keys.add(key)
            else:
                status = source
                matched_unique_keys.add(key)

        status_counts[status] += 1
        preview_rows.append(
            {
                "budatt_no": raw,
                "overlay_permit_key": key,
                "bud_floor": row.get(field_lookup.get("bud_floor", ""), ""),
                "bud_const": row.get(field_lookup.get("bud_const", ""), ""),
                "match_status": status,
                "candidate_use_permits": str(len(candidates)),
                "completion_year": completion_year,
                "building_age": age,
            }
        )

    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(preview_rows[0].keys()))
        writer.writeheader()
        writer.writerows(preview_rows)

    total = len(overlay_rows)
    parsed_records = total - status_counts["unparsed_overlay_key"]
    resolved_records = sum(
        count for status, count in status_counts.items()
        if status in {"original_permit_raw", "permit_number_raw"}
    )
    any_match_records = sum(
        count for status, count in status_counts.items()
        if status not in {"unmatched", "unparsed_overlay_key"}
    )

    print("Taipei building-overlay / use-permit join diagnostics")
    print(f"Overlay DBF records: {total:,}")
    print(f"Parsed overlay permit keys: {parsed_records:,} ({parsed_records / total:.1%})")
    print(f"Unique overlay base permit keys: {len(unique_overlay_keys):,}")
    print(f"Use-permit records: {len(use_rows):,}")
    print(f"Unique original/build permit keys in use-permit table: {len(by_original):,}")
    print(f"Unique use-permit keys in use-permit table: {len(by_use):,}")
    print()
    print("Record-level match status:")
    for status, count in status_counts.most_common():
        print(f"  {status}: {count:,} ({count / total:.1%})")
    print()
    print(f"Any permit-key match: {any_match_records:,} ({any_match_records / total:.1%})")
    print(f"Unambiguous age-resolved match: {resolved_records:,} ({resolved_records / total:.1%})")
    print(
        f"Unique overlay keys with any match: {len(matched_unique_keys):,} "
        f"({len(matched_unique_keys) / max(len(unique_overlay_keys), 1):.1%})"
    )

    if unmatched_samples:
        print("\nSample unmatched overlay permits:")
        for sample in unmatched_samples:
            print(f"  {sample}")
    if unparsed_samples:
        print("\nSample unparsed BUDATT_NO values:")
        for sample in unparsed_samples:
            print(f"  {sample}")

    print("\nInterpretation guardrail:")
    print("  This overlay itself only covers the permit years present in BUDATT_NO.")
    print("  A high join rate validates an exact permit-key join for that subset; it does NOT")
    print("  prove citywide historical coverage for pre-2001 / 40-60-year-old buildings.")
    print(f"\nRow-level preview: {out_csv}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dbf", type=Path)
    parser.add_argument("use_permits_csv", type=Path)
    parser.add_argument(
        "--out-csv",
        type=Path,
        default=Path("data/derived/building_overlay_age_join_preview.csv"),
    )
    args = parser.parse_args()
    return compare(args.dbf, args.use_permits_csv, args.out_csv)


if __name__ == "__main__":
    raise SystemExit(main())
