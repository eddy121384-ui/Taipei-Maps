#!/usr/bin/env python3
"""Inspect Taipei historical use-permit XML without guessing its schema.

Usage:
    python tools/data/inspect_use_permits.py data/raw/taipei_use_permits.xml

The report is forced to UTF-8 so redirected output is readable regardless of
Windows console code page. The parser also keeps child values alive until the
containing <Data> record has been inspected, so sample values are not blanked
by premature Element.clear() calls.
"""

from __future__ import annotations

import argparse
import collections
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def clean_text(text: str | None, limit: int = 160) -> str:
    if not text:
        return ""
    value = " ".join(text.split())
    if len(value) > limit:
        return value[: limit - 1] + "…"
    return value


def leaf_pairs(elem: ET.Element, prefix: str = "", limit: int = 80) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []

    def walk(node: ET.Element, path: str) -> None:
        if len(rows) >= limit:
            return
        children = list(node)
        name = local_name(node.tag)
        next_path = f"{path}/{name}" if path else name
        if not children:
            value = clean_text(node.text)
            if value:
                rows.append((next_path, value))
            return
        for child in children:
            walk(child, next_path)

    walk(elem, prefix)
    return rows


def inspect(path: Path, max_events: int, sample_records: int) -> int:
    if not path.exists():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        return 2

    print(f"File: {path}")
    print(f"Size: {path.stat().st_size / (1024 * 1024):.2f} MB")

    tag_counts: collections.Counter[str] = collections.Counter()
    child_shape_counts: collections.Counter[tuple[str, tuple[str, ...]]] = collections.Counter()
    record_samples: list[list[tuple[str, str]]] = []

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
                child_shape_counts[(tag, child_names)] += 1

            # Capture complete sample records before clearing them. Clearing every
            # child on its own end event caused the first report to lose values.
            if tag == "Data":
                if len(record_samples) < sample_records:
                    record_samples.append(leaf_pairs(elem))
                elem.clear()

            if max_events and events >= max_events:
                break

    except ET.ParseError as exc:
        print(f"ERROR: XML parse failed: {exc}", file=sys.stderr)
        return 3

    print("\nMost common tags:")
    for tag, count in tag_counts.most_common(50):
        print(f"  {count:>10,}  {tag}")

    print("\nMost common record-like shapes:")
    for (tag, child_names), count in child_shape_counts.most_common(15):
        if len(child_names) < 3:
            continue
        print(f"\n[{count:,}x] <{tag}> with {len(child_names)} children")
        print("  " + ", ".join(child_names[:40]))

    print("\nSample <Data> records with real values:")
    if not record_samples:
        print("  (none captured)")
    for sample_no, row in enumerate(record_samples, start=1):
        print(f"\n  Sample {sample_no}:")
        for name, value in row:
            print(f"    {name}: {value}")

    print("\nNext step:")
    print("  Use the exact <Data> tags above to normalize permit ids, completion dates,")
    print("  addresses, structure, floors, height, and parcel identifiers.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("xml", type=Path, help="Path to Taipei historical use-permit XML")
    parser.add_argument(
        "--max-events",
        type=int,
        default=0,
        help="Stop after this many XML end-events (0 = full file). Default: full file",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=3,
        help="Number of complete <Data> records to print. Default: 3",
    )
    args = parser.parse_args()
    return inspect(args.xml, args.max_events, args.samples)


if __name__ == "__main__":
    raise SystemExit(main())
