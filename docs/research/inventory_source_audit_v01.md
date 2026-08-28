# Inventory Source Audit v0.1

Issue: #67

Research branch: `research/inventory-source-audit-v01`

Access date: 2026-08-29 (Taipei)

## Question

For the official 115 academic-year catchments of **金華國中** and **中正國中**, what current asking-price inventory can a buyer discover, where is it, and which source strategy is legally and technically sustainable for 卜居?

This is a source audit. It is **not** authorization to scrape any provider.

---

## Preliminary verdict

The market is not a 591-only problem.

Two different provider classes already exist:

1. **Direct listing marketplaces** — 591, 樂屋網
2. **Aggregation / comparison products** — 巷導, 5168 實價登錄比價王

The strongest early signal is that 卜居 should **not** begin by building four independent crawlers.

- 5168 explicitly markets itself as organizing asking prices from multiple broker sources.
- 巷導 explicitly describes its product as solving fragmented housing information through data integration + map technology, and exposes public listing pages with broker/franchise lineage.
- 591 and 樂屋 both expose rich live inventory, but their published terms explicitly restrict unauthorized automated crawling/extraction.

Therefore the likely next architecture is **aggregator/partnership-first, with external handoff as a safe fallback**, rather than scrape-first.

This remains provisional until the benchmark sample and source-rights audit are completed.

---

## Source comparison — first pass

| Source | Product type | School/keyword discovery | Public listing detail | Location quality seen | Duplicate signal | Automated-ingestion status | Early role |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 591 | direct marketplace + community pages | Yes; school/keyword/map surfaces | Rich | Detail coordinates existed in archived #46 research; public pages also expose area/community/location text | **High**; same physical/community unit often appears under many brokers | **Explicitly restricted without authorization** | Coverage benchmark + user handoff; partnership only for ingestion |
| 巷導 | map-first aggregation product | Search-engine-indexed listings; product is location-first | Rich | Usually street/section + in-product map; enough to investigate further | Unknown collapse policy; broker/franchise lineage is visible | **Unclear**; terms/feed rights still to verify | Strong partnership / aggregator candidate |
| 樂屋網 | direct marketplace | Yes; keyword + district + map | Rich | Street/section + nearby MRT distances; exact coordinate availability still to audit | **High**; identical home specs can appear several times | **Explicitly restricted without written consent** | Coverage benchmark + user handoff; partnership only for ingestion |
| 5168 / Houseprice | aggregator / comparison + market analytics | Yes; region/map/transit; public ecosystem says multi-broker asking-price comparison | Rich product concept; web indexing varies by surface | Product claims address/history/listing comparison; exact exportable location still to audit | Product explicitly analyzes how many listings may refer to an object | **Unclear**; no ingestion permission established | **Strongest aggregator-first candidate so far** |

### Legal / operational distinction

A public browser page existing does not imply automated reuse rights.

#### 591

Published service terms explicitly state that, without explicit authorization, third parties may not use web crawlers / spiders / robots / automated download methods to continuously search, obtain, extract, or use site content.

Reference:
- https://m.591.com.tw/v2/terms/service

Implication: the archived #46 prototype remains useful technical research, but production ingestion requires an authorized feed/partnership or a different source strategy.

#### 樂屋網

Published intellectual-property terms state that third parties may not scrape, reproduce, distribute, retransmit, modify, resell, or continuously collect listing information using crawlers or equivalent automated methods without written consent / rights.

Reference:
- https://extra.rakuya.com.tw/faq/%E7%B6%B2%E7%AB%99%E7%9B%B8%E9%97%9C-%E6%99%BA%E6%85%A7%E8%B2%A1%E7%94%A2%E6%AC%8A%E7%9B%B8%E9%97%9C%E6%A2%9D%E6%AC%BE_339.html

Implication: excellent benchmark/handoff source, not a scrape-first production source.

#### 巷導

Official store description says the product uses **data integration and map technology to solve fragmented housing information** and is built around location-first discovery.

References:
- https://www.alleyguide.com.tw/
- https://play.google.com/store/apps/details?id=tw.com.alleyguide.app

Public listing pages observed in search expose price, unit price, building area, age, floor, layout, street/section location, school marketing text, broker company/franchise, and stable AlleyGuide listing URLs.

No public source-rights/API permission has yet been established. This must be treated as **unclear**, not assumed permitted.

#### 5168 / Houseprice

The official LINE account describes the service as organizing **asking-price comparisons across major broker sources**. The consumer app describes 200k+ live homes (marketing claim; verify before using as a quantitative benchmark), map/region/transit search, community live inventory, price analysis, favorites, and alerts.

A broker Chrome extension description also says it can analyze likely address, historical asking price, and how many listings exist for an object while browsing major broker sites.

References:
- https://page.line.me/399tasev
- https://play.google.com/store/apps/details?id=com.houseprice.hp5168
- https://chromewebstore.google.com/detail/%E9%87%91%E7%89%8C%E6%88%BF%E4%BB%B2-5168%E5%AF%A6%E5%83%B9%E7%99%BB%E9%8C%84%E6%AF%94%E5%83%B9%E7%8E%8B/dmbemmhmhfjoiehocmomfognglhnjean

This makes 5168 the most obvious existing product to test as an **aggregation / canonical-home partner**, rather than merely another redundant listing portal.

No production feed/API rights have yet been established.

---

## Benchmark observations — 金華國中

These are **discovery samples**, not a complete inventory count and not yet official-catchment validated by 卜居.

### 巷導 examples

1. **羅斯福路三段 / 大安區**
   - asking: 3,090 萬
   - ~169.8 萬/坪
   - total: 18.2 坪
   - 8F / 15F
   - listing markets 金華國中
   - stable listing page observed

2. **臨沂街 / 中正區**
   - asking: 4,980 萬
   - ~115.2 萬/坪
   - total: 43.23 坪
   - 4F
   - listing markets 幸安國小 / 金華國中
   - broker/franchise lineage visible

Public examples:
- https://www.alleyguide.com.tw/listing/vQLANqlFJ
- https://www.alleyguide.com.tw/listing/tpmrLUsub

### 樂屋 examples

Search results expose, among others:

- 永康麗園: 7,680 萬, 63.41 坪, ~121.12 萬/坪
- 大安 MONEY 賦寓: 2,860 萬, 17.89 坪, ~159.87 萬/坪
- 愛國東路 small unit: 2,000 萬, 11.69 坪, ~171.09 萬/坪
- 臨沂雅典: 4,588 萬, 37.58 坪, ~130.31 萬/坪

Reference search surface:
- https://www.rakuya.com.tw/sell/result?keyword=%E9%87%91%E8%8F%AF%E5%9C%8B%E4%B8%AD&zipcode=106

### 591 examples

591 public/community search surfaces expose multiple 金華-related listings around 師大 / 台電大樓 / 東門, including repeated broker marketing of what appear to be the same building or unit characteristics.

Reference example:
- https://market.591.com.tw/1789198/sale?nearby=1

### 5168 examples

Search-indexed / partner surfaces show 金華/中正 dual-school listings, but direct consumer-web benchmark extraction needs a cleaner audit pass. 5168's bigger value may be its aggregation and historical-asking-price layer rather than raw keyword-search ergonomics.

---

## Benchmark observations — 中正國中

Again: discovery sample only. Official catchment verification comes later.

### Duplicate signal: 樂屋

A very strong same-home duplicate cluster is visible for:

**羅斯福路一段 / 3F / ~37.7 坪 / 3房 / asking 3,958 萬 / ~104.99 萬坪**

Several separate broker listings appear with effectively identical physical-home attributes and price.

This proves why `listing_count != home_count`.

Reference:
- https://www.rakuya.com.tw/sell/result?keyword=%E4%B8%AD%E6%AD%A3%E5%9C%8B%E4%B8%AD&zipcode=100

### Duplicate signal: 591

`花齊匯` public sale page shows many broker listings at ~146.6–146.7 萬/坪 for a 1-room product, including visually repeated entries / identical attributes.

`中正藏璽` also shows repeated 3-room / double-parking offers at the same ~80.8 萬/坪 figure from different brokers.

References:
- https://market.591.com.tw/35969/sale
- https://market.591.com.tw/7043/sale

### 巷導 examples

Observed examples include:

- 信義路二段: 4,380 萬, 25.32 坪, ~173 萬/坪
- 杭州南路二段: 3,990 萬, 39.75 坪, ground floor
- 和平西路一段: 5,638 萬 including parking, 3-room ground-floor/garden product
- 愛國東路: 4,800 萬, 35.96 坪, 10F / 12F

References:
- https://www.alleyguide.com.tw/listing/txuaeuBFy
- https://www.alleyguide.com.tw/listing/8Dz1gqF5
- https://www.alleyguide.com.tw/listing/by98RsxN2
- https://www.alleyguide.com.tw/listing/hFIbZ5yNA

### 5168 cross-source duplicate candidate

A public 5168-indexed surface shows a **杭州南路二段 / 中正國中 / ground-floor / 3,990 萬** offer.

That highly resembles the AlleyGuide 3,990 萬 杭州南路二段 ground-floor listing above and is a good first **cross-platform canonical-home candidate**.

Do not yet declare it the same physical home until additional attributes are compared.

---

## Canonical-home implications

The first dedupe model should be explainable and conservative.

### Strong structured signals

- normalized street / section or coordinates
- community / building identity
- total area
- main area
- floor / total floors
- layout
- parking state
- asking price

### Candidate match policy

A future audit/prototype should distinguish:

- `exact_candidate`: many structured fields agree
- `probable_candidate`: location + area + floor + layout agree but one field differs
- `ambiguous`: insufficient location or physical-home identity

Do not collapse merely because titles are similar.

Do not use photos/text fingerprints unless rights and operational terms permit it.

---

## What our school polygon changes

All four platforms may contain broker marketing text such as `金華國中學區` or `中正國中學區`.

卜居 should treat that text only as a **discovery hint**.

The product trust layer is:

```text
external live listing candidate
    ↓
usable location / coordinate
    ↓
Taipei official 115 neighbor-level catchment resolver
    ↓
verified / unresolved / outside catchment
```

This is a genuine product differentiator: even if inventory discovery comes from a partner/aggregator, **school-district truth remains ours**.

---

## Current recommendation

### Do not build a production 591 crawler.

The terms evidence alone is enough to reject that as the default architecture.

### Do not build four provider adapters yet.

The existence of mature aggregation products means that would likely recreate expensive work before we know the coverage gap.

### Next audit priority

1. **5168 first** — determine whether a commercial/authorized feed or partnership can expose its multi-broker canonicalized inventory to a third-party product.
2. **巷導 second** — determine whether its integration layer is proprietary-only or available for partnership/feed use; inspect whether its listing identity already collapses duplicates.
3. Keep **591 + 樂屋** as independent coverage benchmarks and user handoff destinations.
4. Manually construct a 20–30 candidate benchmark set across 金華／中正 and measure cross-platform overlap.
5. For candidates with usable location, run official 卜居 catchment verification before calling them 金華/中正 inventory.

### Provisional product architecture

```text
Authorized aggregator/feed candidate
            ↓
normalize minimal listing fields
            ↓
Canonical Home reconciliation
            ↓
Official 115 school-catchment verification
            ↓
卜居 map: one home pin
            ↓
source links / broker attribution
```

Fallback if no authorized feed is available:

```text
卜居 official school polygon + analysis
            ↓
source-specific search/handoff links
```

That fallback is less magical, but legally and operationally robust.

---

## Remaining work before #67 closes

- [ ] clean 20–30 listing benchmark table across the two catchments
- [ ] quantify within-source duplicate rate in the sample
- [ ] quantify cross-source overlap in the sample
- [ ] grade location precision per source
- [ ] verify whether 5168 offers partner/API/feed access
- [ ] verify whether 巷導 offers partner/API/feed access
- [ ] identify original-source-link behavior for aggregator listings
- [ ] run a small subset through official 115 catchment verification
- [ ] choose Aggregator-first vs Multi-feed vs Handoff-only implementation path
