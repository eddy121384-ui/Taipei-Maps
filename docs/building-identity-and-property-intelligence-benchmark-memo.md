# Building Identity & Property Intelligence Benchmark Memo

Date: 2026-08-19

## Why this memo exists

The Taipei-Maps experiments have reached a point where the key problem is no longer "how do we draw 3D buildings?" The harder and more valuable problem is **how to define a canonical building/property object that can survive across multiple data sources, geometries, update cycles, and analytical lenses**.

Recent benchmark research into 3DBAG (Netherlands), Helsinki 3D, LandInsight, and Nimbus suggests that mature property/city-data systems separate **identity, registry attributes, geometry, freshness, and user-facing analysis** instead of asking one polygon layer to do everything.

This memo records the research result and turns it into a working architecture hypothesis for Taipei-Maps so we do not lose the reasoning while continuing the current Taipei building-age / building-identity work.

---

## 1. Benchmark result: 3DBAG is the strongest architecture reference

3DBAG is especially relevant because it separates a canonical building object from its different geometry representations.

Conceptually:

```text
Building identity
  ↓
registry attributes
  ↓
multiple geometry representations
  ├─ canonical footprint
  ├─ LoD1.2
  ├─ LoD1.3
  └─ LoD2.2
```

The important idea is not the exact Dutch schema. It is that **a geometry part is not itself the building identity**. Multiple geometry parts can belong to the same building object.

This directly maps to the Taipei problem we just observed:

- `taipei_vioc:tp_building_height` produces many extrusion polygons and is useful as visual geometry.
- City Dashboard `building_age` gives age/address records.
- Overture gives a global building fallback.
- None of these alone should be assumed to equal a canonical Taipei building object.

### Geometry freshness

3DBAG also treats geometry freshness as explicit metadata. This is important because a building registry may know a building has been built or changed before a new 3D capture exists.

Taipei-Maps should therefore expect cases such as:

```text
Registry: building completed in 2025
Geometry capture: 2023
→ geometry is stale even though the building object is current
```

This supports a future `geometry_status` / `geometry_date` concept rather than pretending a 3D model is always current.

Reference:
- https://docs.3dbag.nl/en/
- https://docs.3dbag.nl/en/schema/layers/
- https://docs.3dbag.nl/en/schema/attributes/

---

## 2. Helsinki 3D: treat the city as semantic objects, not just layers

Helsinki's 3D urban data model is useful as the city-government analogue.

The important design lesson is that a building can have identifiers linking multiple data streams, while geometry, construction year, floor count, point-cloud-derived shape, and other attributes are attached to the same semantic object.

For Taipei-Maps, this suggests that "layer" should be treated as a **visualization concern**, not as the primary data model.

Instead of:

```text
building-age layer
building-height layer
permit layer
school layer
```

we should aim toward:

```text
Building object
Parcel object
School object
Station object
...
```

and let the map render different views of those objects.

Reference:
- https://www.hel.fi/en/decision-making/information-on-helsinki/maps-and-geospatial-data/helsinki-3d

---

## 3. LandInsight: product UX should hide GIS complexity

LandInsight is useful mainly as a product/interaction benchmark.

Its lesson is that the user should not have to think like a GIS operator. The user selects a site/property and the relevant intelligence gathers around that object.

For Taipei-Maps, the equivalent interaction should eventually be:

```text
Select a building / parcel
  ↓
Age
Price
School district
Flood risk
Transit
Planning / redevelopment
Building permits / occupancy permits
Geometry freshness
```

The data may come from many sources, but the user should see one coherent property record.

Reference:
- https://land.tech/products/landinsight
- https://support.land.tech/en/articles/9716934-getting-to-know-map-controls-map-tools

---

## 4. Nimbus: identity resolution is likely the real moat

Nimbus is the strongest commercial reminder that the hard problem is not the map renderer. The valuable layer is the system that resolves different source datasets into one property identity.

The product implication is that Taipei-Maps may eventually need its own canonical identifier, for example:

```text
taipei_building_id
```

The exact identifier is not decided yet. It might map to an official government building identifier if one exists, or it might be our own crosswalk key linking authoritative source IDs.

The important point is that **we should stop asking which single polygon is "the building"** and instead ask:

> Which stable identity can connect registry records, cadastral records, visual geometry, addresses, permits, and analytical lenses?

Reference:
- https://www.nimbusmaps.co.uk/data-services
- https://www.nimbusmaps.co.uk/commercial-developer

---

## 5. Working Taipei-Maps target model

Current architecture hypothesis:

```text
                    Taipei Building Object

                      taipei_building_id
                              │
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
     Registry              Geometry               Events
     ────────              ────────               ──────
     address               footprint              building permit
     constr_yr             2.5D parts             occupancy permit
     floors                3D I3S                 demolition
     structure             geometry source        urban renewal
     parcel/building refs  geometry date          reconstruction
                              │
                              ↓
                       geometry freshness

                              │
                ┌─────────────┴─────────────┐
                ↓                           ↓
             Lenses                      Renderer
             ──────                      ────────
             age                         MapLibre
             price                       2D / 3D
             school
             flood
             transit
             redevelopment
```

### Important principle

**Registry/identity is truth about the object. Geometry is a representation of that object.**

A stale or missing 3D geometry must not make the building disappear from analytical layers.

---

## 6. How this changes interpretation of current Taipei experiments

### `building_age`

Current evidence says City Dashboard `building_age` behaves like address/doorplate-level records, not one row per physical building.

Therefore:
- useful age/registry source
- not canonical building identity
- `constr_yr` should be treated as durable age source of truth

### `tp_building_height`

Current strict-join experiment shows this layer improves point-in-polygon coverage relative to Overture, but also increases construction-year conflicts.

Therefore:
- strong candidate for fast visual extrusion geometry
- not yet proven as canonical physical-building identity
- its many polygons may represent geometry parts / roof parts / visual extrusion pieces rather than one-building-one-polygon objects

### Overture

Overture remains valuable as:
- global fallback building universe
- world-scale 2.5D/3D baseline
- disposable test bed for spatial methodology

It should not automatically override a better local authoritative identity model.

---

## 7. Revised research question

Old question:

> Which polygon layer should we use as "the building"?

New question:

> **What official or reproducible identifier in Taipei is closest to the role of the Dutch BAG building ID, and how can we map all current source layers back to it?**

Candidate areas to inspect next:

- cadastral building data
- building registration / building number identifiers
- occupancy permit identifiers
- building-license crosswalks
- `building_cadastralmap`
- parcel / building-number relationships
- whether `tp_building_height` contains hidden grouping/parent identifiers that can collapse visual parts back to one building object

---

## 8. Near-term engineering decision

Do **not** replace the current project architecture with a single "best" polygon source yet.

Near-term sequence:

1. Audit candidate Taipei identity layers (`building_cadastralmap`, building/license/permit-related datasets).
2. Identify stable IDs and relationship fields.
3. Test whether `tp_building_height` visual parts can be grouped back to one canonical building.
4. Re-run the same Xinyi strict join against candidate building identities.
5. Only after identity is credible, scale age assignment citywide.
6. Keep geometry freshness separate from registry freshness.

---

## 9. Product-level takeaway

Benchmark systems suggest Taipei-Maps should aim for three layers of value:

1. **City engine** — fast 2D/3D map and building geometry.
2. **Property identity graph** — canonical building/property objects joining multiple government datasets.
3. **Consumer intelligence UX** — age, price, school, flood, transit, redevelopment, permits, and freshness presented around the selected place.

The map is the interface. The long-term moat is likely the identity/crosswalk layer underneath it.

---

## 10. Working slogan for this architecture

> Geometry tells us what the city looks like.  
> Registry tells us what the building is.  
> Events tell us what it is becoming.  
> Identity keeps all three attached to the same object.

This memo is a research/architecture checkpoint, not a final schema decision.
