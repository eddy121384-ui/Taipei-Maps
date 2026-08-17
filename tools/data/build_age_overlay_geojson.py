#!/usr/bin/env python3
"""Build a browser-ready 2001+ Taipei building-age GeoJSON overlay.

Inputs
------
- official Taipei building-license overlay SHP + DBF (TWD97 / TM2 zone 121)
- normalized `use_permits.csv`

Output
------
A GeoJSON FeatureCollection containing only records with an unambiguous
permit-key age match. Geometry is converted from TWD97/TM2 (EPSG:3826) to
WGS84 so ArcGIS GeoJSONLayer can render it directly.

This is deliberately a *subset* layer. The source building-license overlay
covers roughly ROC 90+ permits, so this file must never be presented as full
historical Taipei building-age coverage.

No third-party Python packages are required.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import struct
import sys
from pathlib import Path

# Import the exact same key/join logic used by the validated diagnostics.
from compare_overlay_use_permits import (
    iter_dbf_records,
    load_use_permits,
    overlay_base_key,
    choose_match,
)


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# GRS80 / TWD97 TM2 zone 121 (EPSG:3826)
_A = 6378137.0
_INV_F = 298.257222101
_F = 1.0 / _INV_F
_E2 = _F * (2.0 - _F)
_EP2 = _E2 / (1.0 - _E2)
_K0 = 0.9999
_FALSE_EASTING = 250000.0
_FALSE_NORTHING = 0.0
_LON0 = math.radians(121.0)


def twd97_to_wgs84(x: float, y: float) -> tuple[float, float]:
    """Inverse TWD97/TM2 zone 121 -> WGS84 lon/lat.

    Taipei Open Data documents this SHP as TWD97. For Taipei GIS data this is
    the TM2 121-degree central meridian system (EPSG:3826).
    """
    # Defensive convenience: if a future source is already lon/lat, preserve it.
    if 118.0 <= x <= 123.0 and 20.0 <= y <= 27.0:
        return x, y

    x_adj = x - _FALSE_EASTING
    y_adj = y - _FALSE_NORTHING

    m = y_adj / _K0
    e4 = _E2 * _E2
    e6 = e4 * _E2
    mu = m / (_A * (1.0 - _E2 / 4.0 - 3.0 * e4 / 64.0 - 5.0 * e6 / 256.0))

    sqrt_one_minus_e2 = math.sqrt(1.0 - _E2)
    e1 = (1.0 - sqrt_one_minus_e2) / (1.0 + sqrt_one_minus_e2)
    e1_2 = e1 * e1
    e1_3 = e1_2 * e1
    e1_4 = e1_2 * e1_2

    phi1 = (
        mu
        + (3.0 * e1 / 2.0 - 27.0 * e1_3 / 32.0) * math.sin(2.0 * mu)
        + (21.0 * e1_2 / 16.0 - 55.0 * e1_4 / 32.0) * math.sin(4.0 * mu)
        + (151.0 * e1_3 / 96.0) * math.sin(6.0 * mu)
        + (1097.0 * e1_4 / 512.0) * math.sin(8.0 * mu)
    )

    sin1 = math.sin(phi1)
    cos1 = math.cos(phi1)
    tan1 = math.tan(phi1)

    n1 = _A / math.sqrt(1.0 - _E2 * sin1 * sin1)
    r1 = _A * (1.0 - _E2) / (1.0 - _E2 * sin1 * sin1) ** 1.5
    t1 = tan1 * tan1
    c1 = _EP2 * cos1 * cos1
    d = x_adj / (n1 * _K0)

    lat = phi1 - (n1 * tan1 / r1) * (
        d * d / 2.0
        - (5.0 + 3.0 * t1 + 10.0 * c1 - 4.0 * c1 * c1 - 9.0 * _EP2) * d**4 / 24.0
        + (
            61.0
            + 90.0 * t1
            + 298.0 * c1
            + 45.0 * t1 * t1
            - 252.0 * _EP2
            - 3.0 * c1 * c1
        )
        * d**6
        / 720.0
    )

    lon = _LON0 + (
        d
        - (1.0 + 2.0 * t1 + c1) * d**3 / 6.0
        + (5.0 - 2.0 * c1 + 28.0 * t1 - 3.0 * c1 * c1 + 8.0 * _EP2 + 24.0 * t1 * t1)
        * d**5
        / 120.0
    ) / cos1

    return math.degrees(lon), math.degrees(lat)


def parse_numeric(value: str) -> float | None:
    if not value:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def infer_height_m(candidate: dict[str, str], overlay_row: dict[str, str]) -> tuple[float, str]:
    """Prefer permit height, then permit floors, then overlay floors."""
    height = parse_numeric(candidate.get("building_height_raw", ""))
    if height is not None and 2.0 <= height <= 600.0:
        return round(height, 2), "use_permit_height"

    floors = parse_numeric(candidate.get("floors_above", ""))
    if floors is not None and 1 <= floors <= 150:
        return round(floors * 3.2, 2), "use_permit_floors_x3.2"

    field_lookup = {name.lower(): name for name in overlay_row}
    floors = parse_numeric(overlay_row.get(field_lookup.get("bud_floor", ""), ""))
    if floors is not None and 1 <= floors <= 150:
        return round(floors * 3.2, 2), "overlay_floor_x3.2"

    return 9.6, "fallback_9.6m"


def iter_shp_polygons(path: Path):
    """Yield one geometry payload per SHP record, preserving record order.

    Supports Polygon (5), PolygonZ (15), PolygonM (25), and NullShape (0).
    For this first analytical overlay each SHP part is emitted as its own
    polygon in a MultiPolygon. This guarantees multipart building pieces stay
    visible. Courtyard holes are therefore not reconstructed in this prototype.
    """
    with path.open("rb") as handle:
        header = handle.read(100)
        if len(header) != 100:
            raise ValueError("SHP header is truncated")

        while True:
            rec_header = handle.read(8)
            if not rec_header:
                return
            if len(rec_header) != 8:
                raise ValueError("SHP record header is truncated")

            _, content_words = struct.unpack(">2i", rec_header)
            content = handle.read(content_words * 2)
            if len(content) != content_words * 2:
                raise ValueError("SHP record content is truncated")

            shape_type = struct.unpack_from("<i", content, 0)[0]
            if shape_type == 0:
                yield None
                continue
            if shape_type not in {5, 15, 25}:
                raise ValueError(f"Unsupported SHP shape type {shape_type}; expected polygon")

            if len(content) < 44:
                raise ValueError("Polygon SHP record is too short")

            num_parts, num_points = struct.unpack_from("<2i", content, 36)
            parts_offset = 44
            points_offset = parts_offset + 4 * num_parts
            needed = points_offset + 16 * num_points
            if num_parts < 1 or num_points < 3 or len(content) < needed:
                yield None
                continue

            parts = list(struct.unpack_from(f"<{num_parts}i", content, parts_offset))
            points: list[tuple[float, float]] = []
            for i in range(num_points):
                x, y = struct.unpack_from("<2d", content, points_offset + i * 16)
                points.append(twd97_to_wgs84(x, y))

            rings: list[list[list[float]]] = []
            for part_index, start in enumerate(parts):
                end = parts[part_index + 1] if part_index + 1 < len(parts) else num_points
                ring_points = points[start:end]
                if len(ring_points) < 3:
                    continue
                ring = [[round(lon, 7), round(lat, 7)] for lon, lat in ring_points]
                if ring[0] != ring[-1]:
                    ring.append(ring[0])
                rings.append(ring)

            if not rings:
                yield None
            elif len(rings) == 1:
                yield {"type": "Polygon", "coordinates": [rings[0]]}
            else:
                yield {"type": "MultiPolygon", "coordinates": [[[p for p in ring]] for ring in rings]}


def age_bin(age: int) -> str:
    if age <= 10:
        return "0-10"
    if age <= 20:
        return "10-20"
    if age <= 30:
        return "20-30"
    if age <= 40:
        return "30-40"
    if age <= 50:
        return "40-50"
    return "50+"


def build(shp_path: Path, dbf_path: Path, use_csv: Path, out_geojson: Path, report_path: Path) -> int:
    for path in (shp_path, dbf_path, use_csv):
        if not path.exists():
            print(f"ERROR: required input not found: {path}", file=sys.stderr)
            return 2

    try:
        _, by_original, by_use = load_use_permits(use_csv)
        dbf_rows = list(iter_dbf_records(dbf_path))
        shp_rows = list(iter_shp_polygons(shp_path))
    except (OSError, ValueError) as exc:
        print(f"ERROR: failed to read source data: {exc}", file=sys.stderr)
        return 3

    if len(dbf_rows) != len(shp_rows):
        print(
            f"ERROR: SHP/DBF row-count mismatch: shp={len(shp_rows):,}, dbf={len(dbf_rows):,}",
            file=sys.stderr,
        )
        return 4

    if not dbf_rows:
        print("ERROR: no building-overlay rows", file=sys.stderr)
        return 5

    field_lookup = {name.lower(): name for name in dbf_rows[0]}
    budatt_field = field_lookup.get("budatt_no")
    if not budatt_field:
        print("ERROR: BUDATT_NO not found", file=sys.stderr)
        return 6

    features: list[dict] = []
    resolved = 0
    missing_geometry = 0
    ambiguous = 0
    unmatched = 0
    unparsed = 0
    height_sources: dict[str, int] = {}
    bins: dict[str, int] = {}

    for index, (overlay_row, geometry) in enumerate(zip(dbf_rows, shp_rows), start=1):
        raw = overlay_row.get(budatt_field, "")
        key = overlay_base_key(raw)
        if not key:
            unparsed += 1
            continue

        source, candidates, age_raw, completion_year = choose_match(key, by_original, by_use)
        if source == "unmatched":
            unmatched += 1
            continue
        if source.endswith(":ambiguous"):
            ambiguous += 1
            continue
        if not age_raw or not candidates:
            ambiguous += 1
            continue
        if geometry is None:
            missing_geometry += 1
            continue

        try:
            age = int(float(age_raw))
        except ValueError:
            ambiguous += 1
            continue
        if not 0 <= age <= 200:
            ambiguous += 1
            continue

        # choose_match only returns resolved when all candidates agree on age;
        # the first row is therefore safe for non-age descriptive attributes.
        candidate = candidates[0]
        height_m, height_source = infer_height_m(candidate, overlay_row)
        height_sources[height_source] = height_sources.get(height_source, 0) + 1
        bin_name = age_bin(age)
        bins[bin_name] = bins.get(bin_name, 0) + 1

        features.append(
            {
                "type": "Feature",
                "id": index,
                "properties": {
                    "overlay_index": index,
                    "budatt_no": raw,
                    "permit_key": key,
                    "match_source": source,
                    "completion_year": int(completion_year) if completion_year.isdigit() else None,
                    "building_age": age,
                    "age_bin": bin_name,
                    "height_m": height_m,
                    "height_source": height_source,
                    "bud_floor": overlay_row.get(field_lookup.get("bud_floor", ""), ""),
                    "bud_const": overlay_row.get(field_lookup.get("bud_const", ""), ""),
                    "permit_id": candidate.get("permit_id", ""),
                    "structure": candidate.get("structure_raw", ""),
                },
                "geometry": geometry,
            }
        )
        resolved += 1

    out_geojson.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    collection = {
        "type": "FeatureCollection",
        "name": "Taipei building age 2001+ permit-joined subset",
        "metadata": {
            "scope": "Taipei building-license overlay subset; not full historical city coverage",
            "source_crs": "TWD97 / TM2 zone 121 (EPSG:3826)",
            "output_crs": "WGS84 (EPSG:4326)",
            "age_source": "Taipei historical use-permit completion date joined by permit key",
            "feature_count": len(features),
        },
        "features": features,
    }
    with out_geojson.open("w", encoding="utf-8") as handle:
        json.dump(collection, handle, ensure_ascii=False, separators=(",", ":"))

    total = len(dbf_rows)
    with report_path.open("w", encoding="utf-8") as handle:
        handle.write("Taipei 2001+ building-age GeoJSON build report\n")
        handle.write(f"Overlay records: {total:,}\n")
        handle.write(f"Age-resolved GeoJSON features: {resolved:,} ({resolved / max(total, 1):.1%})\n")
        handle.write(f"Unparsed permit key: {unparsed:,}\n")
        handle.write(f"Unmatched permit key: {unmatched:,}\n")
        handle.write(f"Ambiguous/no usable age: {ambiguous:,}\n")
        handle.write(f"Missing geometry after resolved join: {missing_geometry:,}\n")
        handle.write(f"Output bytes: {out_geojson.stat().st_size:,}\n")
        handle.write("\nAge bins:\n")
        for name in ("0-10", "10-20", "20-30", "30-40", "40-50", "50+"):
            handle.write(f"  {name}: {bins.get(name, 0):,}\n")
        handle.write("\nHeight sources:\n")
        for name, count in sorted(height_sources.items(), key=lambda item: (-item[1], item[0])):
            handle.write(f"  {name}: {count:,}\n")
        handle.write("\nGuardrail:\n")
        handle.write("  This file validates the 3D age-overlay pipeline for the permit-overlay subset.\n")
        handle.write("  It must not be interpreted as citywide historical building-age coverage.\n")
        handle.write("  Pre-2001 / older-building coverage requires an additional historical source.\n")

    print(f"Built {resolved:,} age-resolved features -> {out_geojson}")
    print(f"Report -> {report_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("shp", type=Path)
    parser.add_argument("dbf", type=Path)
    parser.add_argument("use_permits_csv", type=Path)
    parser.add_argument(
        "--out-geojson",
        type=Path,
        default=Path("public/generated/building_age_2001plus.geojson"),
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("data/derived/building_age_geojson_report.txt"),
    )
    args = parser.parse_args()
    return build(args.shp, args.dbf, args.use_permits_csv, args.out_geojson, args.report)


if __name__ == "__main__":
    raise SystemExit(main())
