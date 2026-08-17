#!/usr/bin/env python3
"""Audit the raw Taipei historical use-permit XML for true year coverage.

Pure stdlib. Streams the raw XML and reports:
- record count
- permit-year distribution
- issue/completion year ranges
- decade buckets
- pre-2001 counts
- suspicious very-old / 50+ samples

This is intentionally independent from the normalization pipeline so we can verify
whether the source XML itself contains older records rather than blaming ETL.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def clean(value: str | None) -> str:
    return " ".join((value or "").split()).strip()


def direct_text(parent: ET.Element, tag_name: str) -> str:
    for child in list(parent):
        if local_name(child.tag) == tag_name:
            return clean(child.text)
    return ""


def first_address(parent: ET.Element) -> str:
    for child in list(parent):
        if local_name(child.tag) != "建築地點":
            continue
        for elem in child.iter():
            if local_name(elem.tag) == "地址" and clean(elem.text):
                return clean(elem.text)
    return ""


def roc_or_gregorian_year(raw: str) -> int | None:
    text = clean(unicodedata.normalize("NFKC", raw))
    if not text:
        return None
    match = re.search(r"\d{2,4}", text)
    if not match:
        return None
    value = int(match.group(0))
    if value >= 1911:
        return value
    if 0 <= value <= 300:
        return value + 1911
    return None


def date_year(raw: str) -> int | None:
    text = clean(unicodedata.normalize("NFKC", raw))
    if not text:
        return None
    text = text.replace("中華民國", "").replace("民國", "")
    digits = re.sub(r"\D", "", text)
    if len(digits) >= 8 and int(digits[:4]) >= 1911:
        return int(digits[:4])
    if len(digits) >= 7:
        return int(digits[:3]) + 1911
    if len(digits) >= 6:
        return int(digits[:2]) + 1911
    return roc_or_gregorian_year(text)


def decade(year: int) -> str:
    start = (year // 10) * 10
    return f"{start}s"


def print_counter(title: str, counter: collections.Counter, sort_numeric: bool = True) -> None:
    print(title)
    items = counter.items()
    if sort_numeric:
        try:
            items = sorted(items, key=lambda item: int(str(item[0]).rstrip("s")))
        except ValueError:
            items = sorted(items)
    else:
        items = sorted(items)
    for key, count in items:
        print(f"  {key}: {count:,}")


def audit(xml_path: Path, as_of_year: int) -> int:
    if not xml_path.exists():
        print(f"ERROR: XML not found: {xml_path}", file=sys.stderr)
        return 2

    permit_years: collections.Counter[int] = collections.Counter()
    issue_years: collections.Counter[int] = collections.Counter()
    completion_years: collections.Counter[int] = collections.Counter()
    permit_decades: collections.Counter[str] = collections.Counter()
    completion_decades: collections.Counter[str] = collections.Counter()
    records = 0
    missing_completion = 0
    old_samples: list[tuple[str, str, str, str, str]] = []
    pre2001_permits: list[tuple[str, str, str, str, str]] = []

    try:
        for _event, elem in ET.iterparse(xml_path, events=("end",)):
            if local_name(elem.tag) != "Data":
                continue
            records += 1
            permit_year_raw = direct_text(elem, "執照年度")
            permit_no = direct_text(elem, "執照號碼")
            issue_raw = direct_text(elem, "發照日期")
            completion_raw = direct_text(elem, "竣工日期")
            address = first_address(elem)

            permit_year = roc_or_gregorian_year(permit_year_raw)
            issue_year = date_year(issue_raw)
            completion_year = date_year(completion_raw)

            if permit_year is not None:
                permit_years[permit_year] += 1
                permit_decades[decade(permit_year)] += 1
                if permit_year < 2001 and len(pre2001_permits) < 20:
                    pre2001_permits.append(
                        (permit_year_raw, permit_no, issue_raw, completion_raw, address)
                    )
            if issue_year is not None:
                issue_years[issue_year] += 1
            if completion_year is not None:
                completion_years[completion_year] += 1
                completion_decades[decade(completion_year)] += 1
                age = as_of_year - completion_year
                if age >= 50 and len(old_samples) < 30:
                    old_samples.append(
                        (str(age), permit_no, permit_year_raw, completion_raw, address)
                    )
            else:
                missing_completion += 1

            elem.clear()
    except ET.ParseError as exc:
        print(f"ERROR: XML parse failed: {exc}", file=sys.stderr)
        return 3

    print("Taipei raw use-permit history audit")
    print(f"File: {xml_path}")
    print(f"Size: {xml_path.stat().st_size / 1024 / 1024:.2f} MB")
    print(f"Data records: {records:,}")
    print(f"As-of year for age check: {as_of_year}")
    print()

    def range_line(label: str, counter: collections.Counter[int]) -> None:
        if counter:
            print(f"{label}: {min(counter)} -> {max(counter)} ({sum(counter.values()):,} parsed)")
        else:
            print(f"{label}: no parsed values")

    range_line("Permit year range", permit_years)
    range_line("Issue year range", issue_years)
    range_line("Completion year range", completion_years)
    print(f"Missing/unparsed completion year: {missing_completion:,}")
    print(f"Permit records before 2001: {sum(v for y, v in permit_years.items() if y < 2001):,}")
    print(f"Completion records before 2001: {sum(v for y, v in completion_years.items() if y < 2001):,}")
    print(f"Completion records age 30+: {sum(v for y, v in completion_years.items() if as_of_year - y >= 30):,}")
    print(f"Completion records age 50+: {sum(v for y, v in completion_years.items() if as_of_year - y >= 50):,}")
    print()

    print_counter("Permit records by decade:", permit_decades)
    print()
    print_counter("Completion records by decade:", completion_decades)
    print()
    print_counter("Permit records by year:", permit_years)
    print()

    if pre2001_permits:
        print("Samples with permit year before 2001:")
        for row in pre2001_permits:
            print("  | ".join(row))
    else:
        print("Samples with permit year before 2001: NONE")
    print()

    if old_samples:
        print("Samples with completion age 50+:")
        for row in old_samples:
            print("  age=" + row[0] + " | " + " | ".join(row[1:]))
    else:
        print("Samples with completion age 50+: NONE")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("xml", type=Path)
    parser.add_argument("--as-of-year", type=int, default=dt.date.today().year)
    args = parser.parse_args()
    return audit(args.xml, args.as_of_year)


if __name__ == "__main__":
    raise SystemExit(main())
