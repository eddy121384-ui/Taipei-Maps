# 卜居居民模擬 / Trial Living Concept

Status: concept only — do not implement before core Place data / metrics are trustworthy.

## Core idea

Turn 卜居 from a map that explains a place into a lightweight real-world life simulator.

Instead of only showing static metrics such as distance to transit, schools, healthcare and daily-life POIs, the user can place a simulated resident / household into a location and watch a compressed daily routine play out.

Working product framing:

> 在決定住哪之前，先住一天。

Possible mode names:

- 卜居：試住人生
- 卜居：一日居民
- 卜居：居民模擬器

## Phase 1 — Location-level simulation

Question answered:

> 住在這個地點如何？

A persona / household follows a deterministic or lightly stochastic routine using real spatial data.

Examples:

- home → school / childcare → transit → work
- transit → supermarket → home
- home → clinic / hospital under a healthcare scenario
- weekend home → park / market / daily-life destination

Inputs should come from canonical spatial data and Place Metrics, not invented narrative.

Potential outputs:

- walking distance and time
- detour time
- transit access
- school / childcare access
- grocery convenience
- healthcare access
- daily travel distance
- time cost
- later: weather, terrain, transport disruption, household spending

The simulation is primarily a visual / interactive explanation layer over Place Intelligence, not a separate game engine.

## Phase 2 — Property-level simulation

Future expansion once 卜居 has actual listing / inventory data:

Question answered:

> 住在這棟房子如何？

This is materially different from location-only simulation. The simulated household should combine the surrounding place with property-specific attributes.

Potential property inputs:

- exact building / entrance location
- floor
- elevator availability
- building age
- unit size / layout
- orientation / daylight where data exists
- parking
- management / common facilities
- asking price / rent
- management fee
- school catchment tied to the address
- distance from actual building entrance to transit / POIs

Possible simulated effects:

- stroller / elderly vertical access
- elevator waiting / walk-up friction
- carrying groceries from store to unit
- school drop-off from the actual building entrance
- parking / vehicle ownership routines
- monthly housing + transport + daily-life cost
- household-specific suitability

This creates a progression from:

```text
住在這個地點如何？
        ↓
住在這棟房子如何？
        ↓
這個價格值得嗎？
```

and fits the broader product sequence:

```text
Place → Market → Property → Inventory
```

## Product principle

Do not simulate fake emotions or produce arbitrary lifestyle scores.

The useful version is a real-world simulation driven by observed / canonical data:

```text
canonical city data
    ↓
Place Metrics
    ↓
resident / household routine
    ↓
interactive life simulation
```

Later, when property and inventory data exist:

```text
canonical city data + building/property data + listing data
    ↓
property-aware resident simulation
```

## Why this may matter

The simulation can answer a question that static real-estate portals usually present only as disconnected facts:

> 如果我真的搬到這裡，我的一天會怎麼過？

It can serve both as a serious residential-research interface and as a playful discovery / engagement mode.

The long-run concept could generalize beyond Taipei into a real-world "live here" simulator for other cities, but Taipei should remain the proving ground.

## Guardrail

Do not open a large simulation side project now. First finish trustworthy canonical POI, Place Metrics and Location Summary foundations. The first prototype, when appropriate, should be tiny: one or two personas, a compressed 20-second day, a handful of real routes / errands, and measurable outputs.
