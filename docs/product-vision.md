# Taipei-Maps / Greater Taipei — Product Vision

## One-line product idea

**把政府 GIS 的威力，做成一般人真的會拿來找房子的產品。**

Taipei-Maps should not feel like a government GIS portal with a property-search layer added on top. It should feel like a familiar consumer map that quietly exposes professional-grade city data when the user asks for it.

## Three reference models

### 1. Google Maps = interaction model

The map should feel immediately familiar:

- drag, zoom, rotate, tilt
- search an address / school / station / neighborhood
- no GIS vocabulary required before the user can do useful work
- progressive disclosure instead of a wall of specialist tools

The user should not need to learn the product before using it.

### 2. SimCity = city-reading model

The city itself is the object being explored.

A single 3D building universe can be recolored / filtered through different lenses:

- building age
- transaction price per ping
- recent price change
- transaction density
- redevelopment potential
- zoning / FAR utilization
- flooding risk
- school districts
- transit accessibility
- parks / open space

The mental model is closer to SimCity's `Land Value / Traffic / Density / Pollution` views than to a traditional property listing page.

Longer-term, a time slider could let the user watch the real city evolve through building completion, transit openings, redevelopment and transaction history.

A later research mode may also support constrained "what-if" scenarios (new station, zoning change, redevelopment completion, school-zone change), but this is not MVP scope.

### 3. Bloomberg = analytical model

The same geographic universe should support multiple data lenses without forcing the user to rebuild the context every time.

A building, block, school district or neighborhood should remain the same object while the active renderer changes.

Examples:

- `Age`
- `Price`
- `Price Change`
- `Liquidity / Transactions`
- `Redevelopment Potential`
- `Flood Risk`
- `School District`

This should eventually allow a user to move from visual discovery to evidence-backed comparison without leaving the map.

## Product formula

> **Map like Google. Read the city like SimCity. Analyze property like Bloomberg.**

This is the core UX/product principle.

## Benchmark: Tainan "府城南籍圈"

Tainan's land-information map is an important reference implementation because it demonstrates that the underlying public-sector data and workflows already exist in Taiwan: building age, 3D buildings, real-estate transactions, cadastral information, community information and other city layers can coexist in one map product.

The opportunity is not merely to reproduce those GIS capabilities. The opportunity is to invert the design priority:

- government GIS: professional data first, usability second
- Taipei-Maps: ordinary housing decision first, professional GIS underneath

## Current technical proof

The current prototype has already demonstrated that the core technical idea is feasible rather than speculative:

- Taipei full-city LOD1 3D buildings render in the browser
- official permit / use-permit records can be normalized and exact-joined for a meaningful subset
- 8,079 permit-joined buildings have been emitted as browser-ready GeoJSON and extruded in 3D
- building age can be encoded directly on 3D geometry
- official/public 3D providers can be treated as interchangeable provider layers
- the same renderer architecture can later be reused for other building attributes

The remaining challenge is mostly data engineering, coverage, UX, performance, product focus and distribution — not proving that browser-based 3D analytical city maps are possible.

## Commercialization hypothesis

**Hypothesis: Taipei-Maps / Greater Taipei may be one of the strongest candidates in the current project portfolio to become a first public commercial product.**

Why it is unusually promising:

1. There is an obvious consumer pain: people searching for homes must manually combine listings, school districts, transit, building age, price history, redevelopment, flooding and zoning from separate sources.
2. The value proposition is understandable without specialist training.
3. A meaningful free MVP can be built primarily on public/open data before requiring expensive proprietary data contracts.
4. The technical prototype already exists; this is no longer only a concept document.
5. The product can launch incrementally by geography and by data lens instead of requiring nationwide completeness on day one.
6. The visual output itself is shareable, which creates a potential organic distribution loop that a back-office financial tool does not naturally have.

This is a hypothesis to validate, not a claim that product-market fit already exists.

## Commercial MVP — deliberately narrow

Do **not** begin by recreating every municipal GIS function.

A credible first public version could be:

1. Greater Taipei map navigation and address search
2. reliable 3D building layer
3. building-age lens
4. transaction-price lens
5. school-district boundaries
6. MRT / walking-access context
7. click a building / block and get one concise research card
8. shareable URL preserving location + active layers

That is enough to answer a real housing-search question and test whether ordinary users return.

## What not to do yet

- do not become a listing marketplace on day one
- do not attempt all Taiwan counties before Greater Taipei works
- do not build a full SimCity-style forecasting engine before observational layers are useful
- do not confuse number of GIS layers with product value
- do not hide uncertainty: partial historical coverage, inferred joins and modeled scores must be labeled

## Possible business models to test later

Keep the public map useful for free. Monetization should attach to higher-value analysis rather than cripple basic map exploration.

Potential experiments:

- Pro research layers / historical time series
- saved areas, alerts and comparison workspaces
- redevelopment / zoning / transaction analytics
- professional plans for agents, appraisers, investors, developers or researchers
- embeddable / API products later, only after the consumer data model is stable

No pricing decision is made yet.

## Product test that matters

The milestone is not "we added another GIS layer."

The milestone is when a normal home buyer can open the site, type one place, turn on two or three understandable lenses, and discover something important about the neighborhood that would otherwise have required opening several government and property websites.

That is the product.