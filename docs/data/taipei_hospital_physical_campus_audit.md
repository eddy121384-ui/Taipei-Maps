# Taipei hospital physical-campus audit

Issue: #52  
Scope: Taipei City hospital points for buyer-side accessibility research  
Audit date: 2026-08-25

## Why this audit exists

The Taipei Department of Health hospital list is an authoritative licensing/institution baseline, but a licensing record is not always a 1:1 representation of a real hospital campus. For a buyer-side map, the relevant question is physical access: where can a resident actually reach a hospital site?

This audit therefore distinguishes:

- **institution record**: legal / medical-provider representation;
- **physical campus**: a geographically distinct hospital site;
- **multi-building single campus**: several door numbers/buildings that should remain one map site;
- **co-located legal facilities**: separate provider records at the same campus, which may need later metric de-duplication but are not missing-campus problems.

## Official cross-check sources

1. Taipei Department of Health open data baseline: `臺北市公私立醫療院所`
   - dataset id: `ffdd5753-30db-4c38-b65f-b77892773d60`
   - hospital resource: `04a3d195-ee97-467a-b066-e471ff99d15d`
   - https://data.taipei/dataset/detail?id=ffdd5753-30db-4c38-b65f-b77892773d60

2. Ministry of Health and Welfare: `108-114年醫院評鑑及教學醫院評鑑合格名單`
   - current consolidated list published 2026-03-17
   - https://www.mohw.gov.tw/dl-99552-9299c250-c16f-4227-b655-506ad172b598.html
   - Taipei entries are rows 14-50 (37 accreditation entries).

3. Facility official sites are used when the MOHW row still collapses named campuses, especially Taipei City Hospital.

## Result

### Confirmed physical-campus reconciliation groups

#### A. Taipei City Hospital — `0101090517`

The source/licensing representation collapses multiple real campuses. The map registry intentionally resolves this parent institution into 9 distinct physical sites:

1. 中興院區 — 鄭州路145號
2. 仁愛院區 — 仁愛路四段10號
3. 忠孝院區 — 同德路87號
4. 陽明院區 — 雨聲街105號
5. 松德院區 — 松德路309號
6. 和平院區 — 中華路二段33號
7. 婦幼院區 — 福州街12號
8. 林森院區 — 林森北路530號
9. 昆明院區／中醫中心 — 昆明街100號

This fixes the observed Fuyou omission and also avoids leaving Linsen/Kunming collapsed into one licensing representation.

#### B. Tri-Service General Hospital — `0501110514`

MOHW explicitly lists `三軍總醫院附設民眾診療服務處及其汀州院區` with two geographically distinct Taipei addresses:

1. 內湖院區 — 內湖區成功路二段325號
2. 汀州院區 — 中正區汀州路三段40號

These are real separate campuses and must be two hospital points. The Songshan branch has its own provider record (`0501010019`) and remains a separate baseline hospital.

## Full Taipei accreditation sweep

The latest MOHW consolidated list was reviewed row-by-row for Taipei entries 14-50. `split` means a physical-campus registry is required. `one site` means multiple door numbers are interpreted as buildings/entrances of the same hospital campus unless stronger official campus evidence appears.

| MOHW row | Institution | Audit disposition |
|---:|---|---|
| 14 | 臺北市立聯合醫院中興院區 | registry: Taipei City Hospital |
| 15 | 臺北市立聯合醫院仁愛院區 | registry: Taipei City Hospital |
| 16 | 臺北市立聯合醫院忠孝院區 | registry: Taipei City Hospital |
| 17 | 臺北市立聯合醫院陽明院區 | registry: Taipei City Hospital |
| 18 | 臺北市立聯合醫院和平婦幼院區及其婦幼院區 | **split: 和平 + 婦幼** |
| 19 | 臺北市立聯合醫院林森中醫昆明院區 | registry: 林森 + 昆明/中醫中心 |
| 20 | 臺大醫院癌醫中心分院 | standalone physical site |
| 21 | 臺大醫院總院 | one campus / multi-building addresses |
| 22 | 臺大醫院兒童醫院 | separate legal facility, co-located with main campus; Phase B metric de-dupe candidate |
| 23 | 臺大醫院北護分院 | one campus; multiple adjacent building addresses |
| 24 | 三軍總醫院松山分院 | standalone physical site / separate provider code |
| 25 | 三軍總醫院附設民眾診療服務處及其汀州院區 | **split: 內湖 + 汀州** |
| 26 | 臺北榮民總醫院 | one campus / multi-building addresses |
| 27 | 臺北市立關渡醫院 | standalone physical site |
| 28 | 中山醫院 | standalone physical site |
| 29 | 郵政醫院 | standalone physical site |
| 30 | 西園醫院 | one campus / multiple nearby buildings |
| 31 | 台北長庚紀念醫院 (paired accreditation with 林口長庚) | Taipei site is one campus; cross-city institution is not a Taipei split |
| 32 | 國泰綜合醫院 (paired accreditation with 汐止國泰) | Taipei site is one campus; cross-city institution is not a Taipei split |
| 33 | 臺安醫院 | one campus / adjacent door numbers |
| 34 | 中心綜合醫院 | standalone physical site |
| 35 | 宏恩綜合醫院 | one campus / nearby buildings |
| 36 | 馬偕紀念醫院 (paired accreditation with 淡水馬偕) | Taipei site is one campus; cross-city institution is not a Taipei split |
| 37 | 馬偕兒童醫院 | separate legal facility, co-located with Taipei Mackay; Phase B metric de-dupe candidate |
| 38 | 康寧醫院 | standalone physical site |
| 39 | 新光吳火獅紀念醫院 | one campus / multi-building addresses |
| 40 | 振興醫院 | standalone physical site |
| 41 | 和信治癌中心醫院 | standalone physical site |
| 42 | 中國醫藥大學附設醫院臺北分院 | one campus / adjacent addresses |
| 43 | 臺北醫學大學附設醫院 | one campus / adjacent addresses |
| 44 | 萬芳醫院 | standalone physical site |
| 45 | 仁濟醫院 | one hospital campus; official site uses 廣州街200、243號 for hospital/support buildings |
| 46 | 博仁綜合醫院 | one campus / adjacent addresses |
| 47 | 秀傳醫院 | one campus / adjacent addresses |
| 48 | 協和婦女醫院 | one campus / nearby building addresses |
| 49 | 臺北市北投健康管理醫院 | standalone physical site |
| 50 | 景美醫院 | one campus / nearby building addresses |

## Explicit non-split rules

Do **not** automatically split a hospital merely because the official address field contains commas, semicolons, multiple street numbers or several buildings. Examples include NTUH main campus, Taipei Veterans General Hospital, Taipei Chang Gung, Cathay, Shin Kong, TMUH, Renci and Jingmei.

A registry split requires strong evidence that the addresses are separately named/operated hospital campuses (for example `及其汀州院區`) or an official hospital campus directory showing distinct sites.

## Phase B: physical-site de-duplication for metrics

This audit fixes missing campuses. A different problem remains: two legal hospital records can occupy the same physical campus. Examples currently flagged:

- NTUH main hospital + NTUH Children's Hospital;
- Mackay Memorial Hospital + Mackay Children's Hospital.

Rendering both legal facilities can be useful, but future accessibility metrics such as `hospital_sites_within_2km` should probably count a shared physical site once while retaining facility capabilities separately. This should use a `physical_site_id` / facility-membership model rather than deleting provider records.

## Acceptance tests

The healthcare validator must fail unless:

- cache schema is current;
- every registry group is fully materialized;
- every campus in a group has a distinct official address;
- no raw parent record leaks past reconciliation;
- Fuyou exists independently at `臺北市中正區福州街12號`;
- Tri-Service Tingzhou exists independently at `臺北市中正區汀州路三段40號`;
- clinic and hospital-site count guards still pass.
