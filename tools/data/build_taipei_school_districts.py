#!/usr/bin/env python3
"""Build Taipei-Maps canonical 115 academic-year school-district assignments.

Sources are official Taipei City PDFs. This parser is deliberately fail-closed:
it verifies source hashes/page counts, district/village counts, neighbor syntax, and
rule overlap before writing the runtime dataset.

Known PDF table-extraction defects are handled only as explicit, source-audited
exceptions. Beitou elementary uses vertically merged village cells, while Shilin
Tianhe has one neighbor rule continued across a PDF page break.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

import pdfplumber

PARSER_VERSION = "1.0.1"
ACADEMIC_YEAR = 115
ROOT = Path(__file__).resolve().parents[2] if "tools/data" in str(Path(__file__).as_posix()) else Path.cwd()
DEFAULT_OUT = ROOT / "public" / "taipei-school-districts-115.js"
DEFAULT_CACHE = ROOT / ".cache" / "school-districts-115"

SOURCES = {
    "elementary": {
        "url": "https://www-ws.gov.taipei/001/Upload/311/relfile/14031/9406402/906d54d2-a79d-4730-afa7-3692c9a37dbb.pdf",
        "sha256": "4073872696146eabfb8e5cb76078b340269829798a0410d21b3a0b56aa92ae97",
        "pages": 14,
        "filename": "taipei-elementary-115.pdf",
        "description": "臺北市115學年度國民小學學區里鄰對照表",
    },
    "junior": {
        "url": "https://www-ws.gov.taipei/Download.ashx?icon=..pdf&n=6Ie65YyX5biCMTE15a245bm05bqm5YWs56uL5ZyL5rCR5Lit5a246YeM6YSw5a245Y2A5bCN54Wn6KGoLnBkZg%3D%3D&u=LzAwMS9VcGxvYWQvMzQyL3JlbGZpbGUvMzY5NjcvOTUzMDQ1OS9iNWU3NDMwMS1kZjFiLTRhMWMtODU1MC1hNDgxNTBkZGJhZGUucGRm",
        "sha256": "72ac0509a01c458b2151378ef23c6c6dac609f4ee0e8c10413ab52a1319b4236",
        "pages": 8,
        "filename": "taipei-junior-115.pdf",
        "description": "臺北市115學年度公立國民中學里鄰學區對照表",
    },
}

DISTRICT_VILLAGE_COUNTS = {
    "松山": 33,
    "信義": 41,
    "大安": 53,
    "中山": 42,
    "中正": 31,
    "大同": 25,
    "萬華": 36,
    "文山": 43,
    "南港": 20,
    "內湖": 39,
    "士林": 51,
    "北投": 42,
}
DISTRICTS = list(DISTRICT_VILLAGE_COUNTS)

# pdfplumber sees the school cell for 中山區晴光里 as blank because the official
# PDF merges it vertically with 新喜里. The screenshot/table states both rows are
# 新興、北安共同學區, so keep this as an explicit parser exception rather than a
# generic fill-down heuristic.
JUNIOR_MERGED_SCHOOL_EXCEPTIONS = {
    ("中山", "晴光"): "新興、北安共同學區",
}

# Official elementary PDF: 士林區天和里 is split across the page break. The first
# page contains neighbors 1-17 and 18; the next page begins with neighbors 19-21,
# but pdfplumber loses the village association for that continuation row.
# Keep the exact missing continuation explicit; overlap validation will fail loud
# if a future parser/version starts extracting the row by itself.
ELEMENTARY_PAGE_BREAK_RULE_EXCEPTIONS = {
    ("士林", "天和"): {"spec": "19-21", "school": "三玉、天母共同學區"},
}

# Official elementary PDF page 14. Beitou village cells are vertically centered
# across multiple neighbor-rule rows, so table extraction shifts rules between
# villages. These 42 internal Taipei villages are intentionally source-audited
# here. The external New Taipei row (淡水區福德里) is excluded from Taipei neighbor
# geometry coverage.
BEITOU_ELEMENTARY = {
    "長安": {"rules": [{"spec": "1-9,12", "school": "北投"}, {"spec": "11,15-23", "school": "逸仙"}, {"spec": "10,13,14", "school": "逸仙、北投共同學區"}]},
    "清江": {"rules": [{"spec": "1-10", "school": "北投"}, {"spec": "11-27", "school": "清江"}]},
    "大同": {"all": "北投"},
    "八仙": {"rules": [{"spec": "1-6,13-15,18", "school": "清江"}, {"spec": "7-12,16,17", "school": "立農"}]},
    "奇岩": {"all": "清江"},
    "溫泉": {"rules": [{"spec": "2", "school": "北投"}, {"spec": "1,3-23", "school": "逸仙"}]},
    "中和": {"all": "逸仙、文化共同學區"},
    "文化": {"all": "文化"},
    "泉源": {"rules": [{"spec": "1,3", "school": "義方"}, {"spec": "2,4-16", "school": "泉源"}]},
    "智仁": {"all": "文化"},
    "秀山": {"all": "逸仙、文化共同學區"},
    "中庸": {"rules": [{"spec": "1-4,6-9,15", "school": "義方"}, {"spec": "5,10-14", "school": "文化"}]},
    "中心": {"rules": [{"spec": "1-8,11-19", "school": "逸仙"}, {"spec": "9-10,20-21", "school": "義方"}]},
    "開明": {"all": "義方"},
    "林泉": {"rules": [{"spec": "1,3-6,10-15", "school": "逸仙"}, {"spec": "2,7-9,16,17", "school": "逸仙、義方共同學區"}]},
    "關渡": {"all": "關渡"},
    "一德": {"all": "關渡"},
    "桃源": {"all": "桃源"},
    "稻香": {"all": "桃源"},
    "豐年": {"all": "文化"},
    "石牌": {"all": "文林"},
    "榮光": {"all": "石牌"},
    "大屯": {"rules": [{"spec": "1,8", "school": "義方"}, {"spec": "2-7,9,10", "school": "大屯"}]},
    "裕民": {"rules": [{"spec": "14,15,18-20,22-24", "school": "石牌"}, {"spec": "1-13,16,17,21", "school": "明德"}]},
    "永和": {"all": "天母"},
    "永欣": {"all": "天母"},
    "湖山": {"rules": [{"spec": "4-8", "school": "湖山、陽明山共同學區"}, {"spec": "1-3,9-18", "school": "湖山"}]},
    "湖田": {"rules": [{"spec": "2-10", "school": "湖田"}, {"spec": "1", "school": "湖田、湖山共同學區"}]},
    "東華": {"rules": [{"spec": "1-14,16", "school": "立農"}, {"spec": "15,17,18", "school": "石牌"}]},
    "永明": {"all": "石牌"},
    "立農": {"rules": [{"spec": "1-5", "school": "石牌"}, {"spec": "7-23,25", "school": "立農"}, {"spec": "6,24", "school": "石牌、立農共同學區"}]},
    "立賢": {"rules": [{"spec": "4,5,13-16", "school": "石牌"}, {"spec": "1-3,6-12", "school": "立農"}]},
    "吉慶": {"all": "石牌"},
    "吉利": {"all": "石牌"},
    "尊賢": {"rules": [{"spec": "1,11,13,14,16", "school": "立農"}, {"spec": "2-10,12,15,17-20", "school": "石牌"}]},
    "振華": {"rules": [{"spec": "11,17-19,26,27", "school": "石牌"}, {"spec": "1-10,12-16,20-25", "school": "明德"}]},
    "榮華": {"rules": [{"spec": "2-21", "school": "明德"}, {"spec": "1", "school": "天母、明德共同學區"}]},
    "文林": {"all": "文林"},
    "建民": {"all": "文林"},
    "福興": {"all": "石牌"},
    "洲美": {"all": "文林、士林、文昌共同學區"},
    "中央": {"all": "北投"},
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download_source(kind: str, cache_dir: Path, offline: bool) -> Path:
    meta = SOURCES[kind]
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / meta["filename"]
    if target.exists() and sha256(target) == meta["sha256"]:
        return target
    if offline:
        raise RuntimeError(f"{kind}: cached PDF missing or checksum mismatch: {target}")
    print(f"Downloading {kind}: {meta['url']}", file=sys.stderr)
    req = urllib.request.Request(meta["url"], headers={"User-Agent": "Taipei-Maps school-district importer/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        target.write_bytes(response.read())
    actual = sha256(target)
    if actual != meta["sha256"]:
        target.unlink(missing_ok=True)
        raise RuntimeError(f"{kind}: official PDF checksum changed: expected {meta['sha256']}, got {actual}")
    return target


def district_name(value: str | None) -> str | None:
    text = "".join((value or "").split()).replace("表", "")
    match = re.search(r"([\u4e00-\u9fff]+)區", text)
    return match.group(1) if match else None


def neighbor_spec(value: str | None) -> str:
    text = str(value or "").replace("\r", "\n")
    # A PDF line break after a hyphen is a wrapped range (e.g. 19-\n20), not a separator.
    text = re.sub(r"-\s*\n\s*", "-", text)
    text = re.sub(r"\n+", ",", text)
    text = "".join(text.split())
    for old, new in [
        ("鄰", ""), ("～", "-"), ("－", "-"), ("—", "-"), ("–", "-"),
        ("、", ","), ("，", ","), ("。", ","), ("．", ","), (".", ","), ("至", "-"),
    ]:
        text = text.replace(old, new)
    text = re.sub(r",+", ",", text).strip(",")
    return text


def normalize_school(value: str | None, level: str) -> tuple[str, str]:
    raw = "".join((value or "").split())
    raw = raw.replace("﹑", "、").replace("，", "、").replace(",", "、").replace("．", "、")
    if not raw:
        return "", ""
    note = ""
    match = re.search(r"([（(].*?[）)])", raw)
    if match:
        note = match.group(1).replace("(", "（").replace(")", "）")
        raw = (raw[: match.start()] + raw[match.end() :]).strip()
    raw = raw.replace("共同學區。", "共同學區")
    if level == "elementary":
        raw = re.sub(r"^([^、]+)及([^、]+)國小共同學區$", r"\1、\2共同學區", raw)
    return raw, note


def collapse_rows(rows: list[dict]) -> dict:
    unique: list[dict] = []
    seen = set()
    for row in rows:
        sig = (row["spec"], row["school"], row.get("note", ""))
        if sig not in seen:
            seen.add(sig)
            unique.append(row)
    if len(unique) == 1 and unique[0]["spec"] == "":
        out = {"all": unique[0]["school"]}
        if unique[0].get("note"):
            out["note"] = unique[0]["note"]
        return out
    rules = []
    for row in unique:
        if not row["spec"]:
            raise RuntimeError(f"mixed whole/split rows: {unique}")
        rule = {"spec": row["spec"], "school": row["school"]}
        if row.get("note"):
            rule["note"] = row["note"]
        rules.append(rule)
    return {"rules": rules}


def extract_pdf(path: Path, level: str) -> dict[str, dict]:
    expected_pages = SOURCES[level]["pages"]
    groups: dict[str, list[dict]] = {}
    with pdfplumber.open(path) as pdf:
        if len(pdf.pages) != expected_pages:
            raise RuntimeError(f"{level}: expected {expected_pages} pages, got {len(pdf.pages)}")
        for page_no, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()
            if not tables:
                raise RuntimeError(f"{level}: page {page_no} has no extractable table")
            table = tables[0]
            if not table or len(table) < 3:
                raise RuntimeError(f"{level}: page {page_no} table shape changed")
            header = table[0]
            markers = []
            for index, cell in enumerate(header):
                district = district_name(cell)
                if district:
                    markers.append((index, district))
            if not markers:
                raise RuntimeError(f"{level}: page {page_no} has no district header")
            # Elementary pages contain one district laid out as two side-by-side triplets.
            if level == "elementary":
                markers = [(0, markers[0][1])]
            markers.append((len(header), None))

            for marker_index in range(len(markers) - 1):
                start, district = markers[marker_index]
                end = markers[marker_index + 1][0]
                for col in range(start, end, 3):
                    if col + 2 >= end:
                        continue
                    current_village = None
                    for row in table[2:]:
                        padded = (row + [None] * len(header))[: len(header)]
                        village = "".join((padded[col] or "").split())
                        spec = neighbor_spec(padded[col + 1])
                        school, note = normalize_school(padded[col + 2], level)
                        if village:
                            current_village = village
                        if current_village and (district, current_village) in JUNIOR_MERGED_SCHOOL_EXCEPTIONS and not spec and not school:
                            school = JUNIOR_MERGED_SCHOOL_EXCEPTIONS[(district, current_village)]
                        if not current_village or not school:
                            continue
                        # Rows explicitly naming another district/city are useful source notes but cannot
                        # be joined to this Taipei district's neighbor geometry. The home-district row wins.
                        if "區" in current_village:
                            continue
                        key = f"{district}|{current_village}"
                        groups.setdefault(key, []).append({
                            "spec": spec,
                            "school": school,
                            **({"note": note} if note else {}),
                        })

    out: dict[str, dict] = {}
    for key, rows in groups.items():
        # Beitou elementary is replaced below by its explicit audited exception table.
        if level == "elementary" and key.startswith("北投|"):
            continue
        out[key] = collapse_rows(rows)
    if level == "elementary":
        out.update({f"北投|{village}": entry for village, entry in BEITOU_ELEMENTARY.items()})
        for (district, village), rule in ELEMENTARY_PAGE_BREAK_RULE_EXCEPTIONS.items():
            key = f"{district}|{village}"
            entry = out.get(key)
            if not entry or not isinstance(entry.get("rules"), list):
                raise RuntimeError(f"elementary page-break exception target changed: {key}")
            entry["rules"].append(dict(rule))
    return out


def expand_spec(spec: str) -> set[int]:
    numbers: set[int] = set()
    if not spec:
        raise RuntimeError("empty neighbor spec")
    for token in spec.split(","):
        if re.fullmatch(r"\d+", token):
            numbers.add(int(token))
            continue
        match = re.fullmatch(r"(\d+)-(\d+)", token)
        if not match:
            raise RuntimeError(f"invalid neighbor token: {token!r} in {spec!r}")
        start, end = map(int, match.groups())
        if start > end:
            raise RuntimeError(f"descending neighbor range: {token}")
        numbers.update(range(start, end + 1))
    return numbers


def validate(level: str, table: dict[str, dict]) -> dict:
    counts = Counter(key.split("|", 1)[0] for key in table)
    if dict(counts) != DISTRICT_VILLAGE_COUNTS:
        mismatch = {
            district: {"actual": counts[district], "expected": expected}
            for district, expected in DISTRICT_VILLAGE_COUNTS.items()
            if counts[district] != expected
        }
        raise RuntimeError(f"{level}: district/village counts changed: {mismatch}")
    if len(table) != sum(DISTRICT_VILLAGE_COUNTS.values()):
        raise RuntimeError(f"{level}: expected 456 Taipei villages, got {len(table)}")

    whole = split = rules = notes = 0
    for key, entry in table.items():
        district, village, *rest = key.split("|")
        if rest or district not in DISTRICT_VILLAGE_COUNTS or not village:
            raise RuntimeError(f"{level}: invalid key {key!r}")
        has_all = isinstance(entry.get("all"), str) and bool(entry["all"].strip())
        has_rules = isinstance(entry.get("rules"), list) and bool(entry["rules"])
        if has_all == has_rules:
            raise RuntimeError(f"{level}: {key} must have exactly one of all/rules")
        if has_all:
            whole += 1
            notes += int(bool(entry.get("note")))
            continue
        split += 1
        occupied: dict[int, str] = {}
        for rule in entry["rules"]:
            if not isinstance(rule.get("school"), str) or not rule["school"].strip():
                raise RuntimeError(f"{level}: {key} has empty school")
            numbers = expand_spec(rule.get("spec", ""))
            rules += 1
            notes += int(bool(rule.get("note")))
            for neighbor in numbers:
                if neighbor in occupied:
                    raise RuntimeError(
                        f"{level}: {key} neighbor {neighbor} overlaps {occupied[neighbor]!r} / {rule['school']!r}"
                    )
                occupied[neighbor] = rule["school"]
    return {"villages": len(table), "whole": whole, "split": split, "rules": rules, "notes": notes, "districtCounts": dict(counts)}


def build_dataset(elementary: dict, junior: dict) -> dict:
    summary = {
        "elementary": validate("elementary", elementary),
        "junior": validate("junior", junior),
    }
    return {
        "academicYear": ACADEMIC_YEAR,
        "jurisdiction": "臺北市",
        "coverage": {
            "districts": DISTRICTS,
            "exactNeighborLevel": True,
            "status": "citywide",
        },
        "sources": {
            "assignment": {
                "authority": "臺北市教育局",
                "description": "115學年度官方里鄰學區對照表",
                "elementary": {
                    "title": SOURCES["elementary"]["description"],
                    "url": SOURCES["elementary"]["url"],
                    "sha256": SOURCES["elementary"]["sha256"],
                    "pages": SOURCES["elementary"]["pages"],
                },
                "junior": {
                    "title": SOURCES["junior"]["description"],
                    "url": SOURCES["junior"]["url"],
                    "sha256": SOURCES["junior"]["sha256"],
                    "pages": SOURCES["junior"]["pages"],
                },
            },
            "geometry": {
                "authority": "臺北市民政局",
                "description": "官方鄰界 geometry",
                "endpoint": "https://arcgis.tpgos.gov.taipei/arcgis/rest/services/CA/CIVILMAP_V3/MapServer/16/query",
            },
        },
        "generated": {
            "parser": "tools/data/build_taipei_school_districts.py",
            "parserVersion": PARSER_VERSION,
            "validation": summary,
            "exceptions": {
                "elementaryBeitou": "Official PDF page 14 uses vertically merged village cells; 42 Taipei villages are source-audited in parser exception table.",
                "elementaryShilinTianhePageBreak": "Official elementary PDF continues 士林區天和里 neighbors 19-21 on the next page; pdfplumber loses the village association, so the continuation is explicit.",
                "juniorZhongshanQingguang": "Official PDF merges 晴光里 school cell with 新喜里; explicit fill is 新興、北安共同學區.",
            },
        },
        "levels": {
            "elementary": elementary,
            "junior": junior,
        },
    }


def write_js(dataset: dict, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(dataset, ensure_ascii=False, indent=2, separators=(",", ": "))
    text = "// Generated by tools/data/build_taipei_school_districts.py. Do not hand-edit.\n"
    text += "(()=>{\n  const dataset=" + payload.replace("\n", "\n  ") + ";\n"
    text += "  window.TaipeiMapsSchoolDistrictData115=dataset;\n})();\n"
    out_path.write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--offline", action="store_true", help="Use only checksum-verified cached PDFs")
    parser.add_argument("--elementary-pdf", type=Path)
    parser.add_argument("--junior-pdf", type=Path)
    args = parser.parse_args()

    paths = {}
    for level, arg_path in [("elementary", args.elementary_pdf), ("junior", args.junior_pdf)]:
        path = arg_path or download_source(level, args.cache_dir, args.offline)
        if sha256(path) != SOURCES[level]["sha256"]:
            raise RuntimeError(f"{level}: checksum mismatch for {path}")
        paths[level] = path

    elementary = extract_pdf(paths["elementary"], "elementary")
    junior = extract_pdf(paths["junior"], "junior")
    dataset = build_dataset(elementary, junior)
    write_js(dataset, args.out)
    print(json.dumps(dataset["generated"]["validation"], ensure_ascii=False, indent=2))
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
