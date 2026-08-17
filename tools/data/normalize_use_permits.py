#!/usr/bin/env python3
"""Normalize Taipei historical use-permit XML into join-ready CSV tables.

Outputs:
- use_permits.csv: one row per permit record
- use_permit_addresses.csv: one row per permit/address pair for geocoding/joining

The source XML uses nested Chinese tags. This script intentionally preserves raw
values next to normalized values so later spatial/address matching remains auditable.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def clean(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.split()).strip()


def first_direct(parent: ET.Element, tag_name: str) -> str:
    for child in list(parent):
        if local_name(child.tag) == tag_name:
            return clean(child.text)
    return ""


def first_child(parent: ET.Element, tag_name: str) -> ET.Element | None:
    for child in list(parent):
        if local_name(child.tag) == tag_name:
            return child
    return None


def descendant_texts(parent: ET.Element | None, tag_name: str) -> list[str]:
    if parent is None:
        return []
    out: list[str] = []
    for elem in parent.iter():
        if elem is parent:
            continue
        if local_name(elem.tag) == tag_name:
            value = clean(elem.text)
            if value:
                out.append(value)
    return out


def all_leaf_values(parent: ET.Element | None) -> list[str]:
    if parent is None:
        return []
    out: list[str] = []
    for elem in parent.iter():
        if len(list(elem)) == 0:
            value = clean(elem.text)
            if value:
                out.append(value)
    return out


def unique_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            out.append(value)
    return out


def normalize_address(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = value.replace("台北市", "臺北市")
    value = value.replace("臺北縣", "新北市")
    value = re.sub(r"\s+", "", value)
    value = value.replace("－", "-").replace("—", "-")
    return value.strip(" ,，;；")


def parse_date(raw: str) -> tuple[str, str, str]:
    """Return ISO date, year, parse_status.

    Supports common Gregorian and ROC/Minguo numeric forms such as:
    2020/01/02, 20200102, 109/01/02, 1090102, 民國109年1月2日.
    """
    raw = clean(unicodedata.normalize("NFKC", raw))
    if not raw:
        return "", "", "missing"

    text = raw.replace("中華民國", "").replace("民國", "")
    text = text.replace("年", "/").replace("月", "/").replace("日", "")
    text = re.sub(r"[.\-]", "/", text)
    text = re.sub(r"\s+", "", text)

    y = m = d = None

    parts = [p for p in text.split("/") if p]
    if len(parts) >= 3 and all(re.fullmatch(r"\d+", p) for p in parts[:3]):
        y, m, d = map(int, parts[:3])
    else:
        digits = re.sub(r"\D", "", text)
        if len(digits) == 8:
            y, m, d = int(digits[:4]), int(digits[4:6]), int(digits[6:8])
        elif len(digits) == 7:
            y, m, d = int(digits[:3]), int(digits[3:5]), int(digits[5:7])
        elif len(digits) == 6:
            y, m, d = int(digits[:2]), int(digits[2:4]), int(digits[4:6])

    if y is None or m is None or d is None:
        return "", "", "unparsed"

    # ROC year -> Gregorian. Four-digit values are treated as Gregorian.
    if y < 1911:
        y += 1911

    try:
        parsed = dt.date(y, m, d)
    except ValueError:
        return "", "", "invalid"

    return parsed.isoformat(), str(parsed.year), "ok"


def safe_int(raw: str) -> str:
    raw = clean(unicodedata.normalize("NFKC", raw))
    match = re.search(r"-?\d+", raw.replace(",", ""))
    return match.group(0) if match else ""


def normalize_record(elem: ET.Element, as_of_year: int) -> tuple[dict[str, str], list[dict[str, str]]]:
    building_info = first_child(elem, "建物資訊")
    building_location = first_child(elem, "建築地點")
    parcel_block = first_child(elem, "地段地號")

    permit_year = first_direct(elem, "執照年度")
    permit_number = first_direct(elem, "執照號碼")
    permit_id = f"{permit_year}-{permit_number}".strip("-")

    completion_raw = first_direct(elem, "竣工日期")
    completion_date, completion_year, completion_status = parse_date(completion_raw)

    issue_raw = first_direct(elem, "發照日期")
    issue_date, _, issue_status = parse_date(issue_raw)

    start_raw = first_direct(elem, "開工日期")
    start_date, _, start_status = parse_date(start_raw)

    addresses = unique_keep_order(descendant_texts(building_location, "地址"))
    if not addresses and building_location is not None:
        addresses = unique_keep_order(all_leaf_values(building_location))

    parcels = unique_keep_order(descendant_texts(parcel_block, "地段號"))
    if not parcels and parcel_block is not None:
        parcels = unique_keep_order(all_leaf_values(parcel_block))

    age = ""
    if completion_year:
        try:
            age_value = as_of_year - int(completion_year)
            if 0 <= age_value < 300:
                age = str(age_value)
        except ValueError:
            pass

    row = {
        "permit_id": permit_id,
        "permit_year_raw": permit_year,
        "permit_number_raw": permit_number,
        "issue_date_raw": issue_raw,
        "issue_date": issue_date,
        "issue_date_parse_status": issue_status,
        "original_permit_raw": first_direct(elem, "原核發執照"),
        "construction_type_raw": first_direct(elem, "建造類別"),
        "structure_raw": first_direct(elem, "構造種類"),
        "zoning_raw": first_direct(elem, "使用分區"),
        "building_count_raw": first_direct(building_info, "棟數") if building_info is not None else "",
        "floors_above_raw": first_direct(building_info, "地上層數") if building_info is not None else "",
        "floors_above": safe_int(first_direct(building_info, "地上層數")) if building_info is not None else "",
        "floors_below_raw": first_direct(building_info, "地下層數") if building_info is not None else "",
        "floors_below": safe_int(first_direct(building_info, "地下層數")) if building_info is not None else "",
        "households_raw": first_direct(building_info, "戶數") if building_info is not None else "",
        "building_height_raw": first_direct(elem, "建物高度"),
        "completion_date_raw": completion_raw,
        "completion_date": completion_date,
        "completion_year": completion_year,
        "completion_date_parse_status": completion_status,
        "age_as_of_year": str(as_of_year),
        "building_age": age,
        "start_date_raw": start_raw,
        "start_date": start_date,
        "start_date_parse_status": start_status,
        "addresses_raw": " | ".join(addresses),
        "addresses_normalized": " | ".join(normalize_address(a) for a in addresses),
        "parcel_values_raw": " | ".join(parcels),
    }

    address_rows: list[dict[str, str]] = []
    for index, address in enumerate(addresses, start=1):
        address_rows.append(
            {
                "permit_id": permit_id,
                "address_index": str(index),
                "address_raw": address,
                "address_normalized": normalize_address(address),
                "completion_date": completion_date,
                "completion_year": completion_year,
                "building_age": age,
                "structure_raw": row["structure_raw"],
                "floors_above": row["floors_above"],
                "floors_below": row["floors_below"],
                "building_height_raw": row["building_height_raw"],
                "parcel_values_raw": row["parcel_values_raw"],
            }
        )

    return row, address_rows


def normalize(xml_path: Path, out_dir: Path, as_of_year: int) -> int:
    if not xml_path.exists():
        print(f"ERROR: XML not found: {xml_path}", file=sys.stderr)
        return 2

    out_dir.mkdir(parents=True, exist_ok=True)
    permits_path = out_dir / "use_permits.csv"
    addresses_path = out_dir / "use_permit_addresses.csv"

    permit_rows: list[dict[str, str]] = []
    address_rows: list[dict[str, str]] = []
    completion_status: dict[str, int] = {}

    try:
        for event, elem in ET.iterparse(xml_path, events=("end",)):
            if local_name(elem.tag) != "Data":
                continue
            row, exploded = normalize_record(elem, as_of_year)
            permit_rows.append(row)
            address_rows.extend(exploded)
            status = row["completion_date_parse_status"]
            completion_status[status] = completion_status.get(status, 0) + 1
            elem.clear()
    except ET.ParseError as exc:
        print(f"ERROR: XML parse failed: {exc}", file=sys.stderr)
        return 3

    if not permit_rows:
        print("ERROR: no <Data> permit records found", file=sys.stderr)
        return 4

    with permits_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(permit_rows[0].keys()))
        writer.writeheader()
        writer.writerows(permit_rows)

    address_fields = [
        "permit_id",
        "address_index",
        "address_raw",
        "address_normalized",
        "completion_date",
        "completion_year",
        "building_age",
        "structure_raw",
        "floors_above",
        "floors_below",
        "building_height_raw",
        "parcel_values_raw",
    ]
    with addresses_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=address_fields)
        writer.writeheader()
        writer.writerows(address_rows)

    with_address = sum(1 for row in permit_rows if row["addresses_normalized"])
    with_age = sum(1 for row in permit_rows if row["building_age"])

    print("Taipei use-permit normalization complete")
    print(f"Permit records: {len(permit_rows):,}")
    print(f"Permit records with address: {with_address:,} ({with_address / len(permit_rows):.1%})")
    print(f"Exploded permit-address rows: {len(address_rows):,}")
    print(f"Permit records with parsed building age: {with_age:,} ({with_age / len(permit_rows):.1%})")
    print("Completion-date parse status:")
    for key in sorted(completion_status):
        print(f"  {key}: {completion_status[key]:,}")
    print(f"Output: {permits_path}")
    print(f"Output: {addresses_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("xml", type=Path)
    parser.add_argument("--out-dir", type=Path, default=Path("data/derived"))
    parser.add_argument("--as-of-year", type=int, default=dt.date.today().year)
    args = parser.parse_args()
    return normalize(args.xml, args.out_dir, args.as_of_year)


if __name__ == "__main__":
    raise SystemExit(main())
