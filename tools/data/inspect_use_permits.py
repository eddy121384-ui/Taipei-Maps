#!/usr/bin/env python3
"""Inspect Taipei historical use-permit XML before writing a normalizer.

Usage:
    python tools/data/inspect_use_permits.py data/raw/taipei_use_permits.xml

This intentionally does not assume the XML record/tag schema. It reports:
- root tag
- common element tags
- likely record-like elements
- sample child tag/value pairs

The output is meant to let us write a deterministic normalizer without guessing.
"""

from __future__ import annotations

import argparse
import collections
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def clean_text(text: str | None, limit: int = 120) -> str:
    if not text:
        return ""
    value = " ".join(text.split())
    if len(value) > limit:
        return value[: limit - 1] + "…"
    return value


def inspect(path: Path, max_events: int, sample_records: int) -> int:
    if not path.exists():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        return 2

    print(f"File: {path}")
    print(f"Size: {path.stat().st_size / (1024 * 1024):.2f} MB")

    tag_counts: collections.Counter[str] = collections.Counter()
    child_shape_counts: collections.Counter[tuple[str, tuple[str, ...]]] = collections.Counter()
    samples: dict[tuple[str, tuple[str, ...]], list[list[tuple[str, str]]]] = collections.defaultdict(list)

    root_tag: str | None = None
    events = 0

    try:
        for event, elem in ET.iterparse(path, events=("start", "end")):
            if event == "start" and root_tag is None:
                root_tag = local_name(elem.tag)
                print(f"Root tag: {root_tag}")

            if event != "end":
                continue

            events += 1
            tag = local_name(elem.tag)
            tag_counts[tag] += 1

            children = list(elem)
            if children:
                child_names = tuple(local_name(child.tag) for child in children)
                key = (tag, child_names)
                child_shape_counts[key] += 1

                if len(samples[key]) < sample_records:
                    row: list[tuple[str, str]] = []
                    for child in children[:40]:
                        row.append((local_name(child.tag), clean_text(child.text)))
                    samples[key].append(row)

            elem.clear()

            if max_events and events >= max_events:
                break

    except ET.ParseError as exc:
        print(f"ERROR: XML parse failed: {exc}", file=sys.stderr)
        return 3

    print("\nMost common tags:")
    for tag, count in tag_counts.most_common(40):
        print(f"  {count:>10,}  {tag}")

    print("\nMost common record-like shapes:")
    for (tag, child_names), count in child_shape_counts.most_common(12):
        if len(child_names) < 3:
            continue
        print(f"\n[{count:,}x] <{tag}> with {len(child_names)} children")
        print("  " + ", ".join(child_names[:30]))

        for sample_no, row in enumerate(samples[(tag, child_names)], start=1):
            print(f"  Sample {sample_no}:")
            for name, value in row:
                if value:
                    print(f"    {name}: {value}")

    print("\nNext step:")
    print("  Identify the repeating permit record shape above, then map its exact tags")
    print("  to completion date, address, structure, floors, height, permit id and parcel ids.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("xml", type=Path, help="Path to Taipei historical use-permit XML")
    parser.add_argument(
        "--max-events",
        type=int,
        default=250_000,
        help="Stop after this many XML end-events (0 = full file). Default: 250000",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=2,
        help="Samples to print for each common record shape. Default: 2",
    )
    args = parser.parse_args()
    return inspect(args.xml, args.max_events, args.samples)


if __name__ == "__main__":
    raise SystemExit(main())
