# AlleyGuide partnership / feed audit v0.1

Issue: #67

Access date: 2026-08-29 (Taipei)

## Verdict

**Supply-side B2B partnership capability: confirmed publicly.**

**Public third-party developer API / inventory feed: not found in the public web audit; therefore unconfirmed, not assumed absent.**

The correct next step is a direct partnership inquiry, not reverse engineering or scraping AlleyGuide's consumer site.

## Evidence

### Existing broker-group partnerships

Recent UDN / Economic Daily coverage reports that AlleyGuide:

- works with nearly ten major real-estate brokerage groups across Taiwan
- has more than 100,000 listings described as exclusive inventory
- consolidates duplicate advertisements for the same physical home so users can inspect multiple broker listings in one object view
- integrates fragmented listing information into one map-first experience

References:

- https://tech.udn.com/tech/story/123154/9309569
- https://money.udn.com/money/story/5621/9309208

This is strong evidence that AlleyGuide already operates a broker-supply integration layer. It does **not** establish that the same feed is available to third-party products.

### Consumer product / public listing surface

AlleyGuide public listing pages expose enough fields to make it an attractive inventory partner candidate, including:

- asking total price
- asking unit price when available
- total/main/attached/common area
- building age
- floor / total floors
- layout
- parking
- street-level location
- community/building identity when available
- broker company / franchise / agent lineage
- stable AlleyGuide listing URL

Example:

- https://www.alleyguide.com.tw/listing/hFIbZ5yNA

### Public contact route

Google Play currently identifies the developer as **巷導科技有限公司** and publishes:

- developer email: `customer@alleyguide.com.tw`
- support email: `yuan@foundi.info`
- phone: `+886 933 884 496`
- registered/public developer address: 臺北市大安區信義路4段1號2樓

Reference:

- https://play.google.com/store/apps/details?id=tw.com.alleyguide.app

The Ministry of Economic Affairs company registry confirms Alley Guide Ltd. and business scopes including information software, data processing, and electronic information supply services.

Reference:

- https://findbiz.nat.gov.tw/fts/company/60788668

## Public API / feed search result

Targeted searches of AlleyGuide's public domain and the general web did not surface:

- developer documentation
- API keys / developer portal
- public listing feed specification
- public partner API terms
- webhook/update protocol

This only means **no public documentation was found**. It must not be interpreted as proof that an API/feed does not exist privately.

## What 卜居 should ask for

A partnership inquiry should request a minimal **read-only live inventory feed/API** rather than full content replication.

Required contract questions:

1. **Identity**
   - stable canonical-home ID if AlleyGuide already performs duplicate collapse
   - stable source-listing ID for each underlying broker listing
   - source brokerage / franchise lineage

2. **Location**
   - lat/lon precision available to partners
   - exact vs masked address policy
   - whether location precision differs before/after user authentication

3. **Core fields**
   - asking total price
   - asking unit price
   - total / main area
   - layout
   - floor / total floors
   - age / completion year
   - parking
   - community/building identity
   - update timestamp

4. **Lifecycle**
   - active / pending / removed / sold status
   - update latency / refresh frequency
   - deletion/tombstone semantics
   - price-change history availability

5. **Rights / presentation**
   - right to render minimal listing metadata as pins/cards inside 卜居
   - right to display brokerage attribution
   - whether photos/descriptions may be shown; default assumption should be **no** unless explicitly licensed
   - requirement to deep-link to AlleyGuide vs original broker listing

6. **Commercial / operational**
   - API/feed pricing
   - rate limits
   - geographic coverage
   - expected SLA
   - caching/rehosting restrictions
   - whether a prototype/sandbox account is available

## Minimum viable partnership for School District Live Inventory

卜居 does **not** need the complete AlleyGuide product surface.

A useful v0.1 feed can be only:

```text
canonical_home_id
source_listing_ids[]
status
lon / lat (or precise location token)
asking_price
area
layout
floor
building/community
updated_at
source/broker attribution
handoff_url
```

Then 卜居 adds its own differentiated analysis:

```text
AlleyGuide authorized inventory
        ↓
official Taipei 115 school-catchment verification
        ↓
Location Summary / later Market metrics
        ↓
one canonical home pin
        ↓
source handoff
```

## Partnership positioning

The pitch should **not** be "we want to copy your inventory marketplace".

The complementary position is:

> 卜居 is an environment-first buyer research layer. We want authorized minimal live inventory to connect an officially verified place/school catchment to available homes, while preserving AlleyGuide/broker attribution and handing the user to the source for the transaction conversation.

That reduces channel conflict and makes the requested data scope much smaller.

## Current recommendation

**AlleyGuide is the first inventory-partner inquiry candidate.**

Reasons:

- demonstrated multi-broker supply integration
- explicit duplicate-consolidation value
- map/location-first product DNA is compatible with 卜居
- consumer listings expose the core physical-home fields we need
- public contact path exists

Until authorized access is established, treat AlleyGuide as a research/benchmark/handoff source only. Do not build an automated production extractor against the consumer site.
