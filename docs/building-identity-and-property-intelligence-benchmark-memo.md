# Building Identity & Property Intelligence Benchmark Memo

Date: 2026-08-19

## Why this memo exists

The Taipei-Maps experiments have reached a point where the key problem is no longer "how do we draw 3D buildings?" The harder and more valuable problem is **how to define a canonical building/property object that can survive across multiple data sources, geometries, update cycles, and analytical lenses**.

Recent benchmark research into 3DBAG (Netherlands), Helsinki 3D, LandInsight, and Nimbus suggests that mature property/city-data systems separate **identity, registry attributes, geometry, freshness, and user-facing analysis** instead of asking one polygon layer to do everything.

## 1. 3DBAG: canonical building identity comes before geometry parts

3DBAG is especially relevant because it separates a canonical building object from its different geometry representations.

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

The important idea is that **a geometry part is not itself the building identity**. Multiple geometry parts can belong to the same building object.

This directly maps to the Taipei problem:

- `taipei_vioc:tp_building_height` is useful visual geometry.
- City Dashboard `building_age` gives age/address records.
- Overture gives a global building fallback.
- None of these alone should be assumed to equal a canonical Taipei building object.

3DBAG also treats geometry freshness explicitly. Taipei-Maps should therefore expect cases such as:

```text
Registry: building completed in 2025
Geometry capture: 2023
→ geometry is stale even though the building object is current
```

References:
- https://docs.3dbag.nl/en/
- https://docs.3dbag.nl/en/schema/layers/
- https://docs.3dbag.nl/en/schema/attributes/

## 2. Helsinki 3D: semantic city objects, not just layers

Helsinki's 3D urban data model suggests that a building should have identifiers linking multiple data streams, while geometry, construction year, floor count, point-cloud-derived shape and other attributes attach to the same semantic object.

For Taipei-Maps, "layer" should be treated as a visualization concern rather than the primary data model.

```text
Building object
Parcel object
School object
Station object
...
```

Reference:
- https://www.hel.fi/en/decision-making/information-on-helsinki/maps-and-geospatial-data/helsinki-3d

## 3. LandInsight: hide GIS complexity from the user

The user should select a site/property and have the relevant intelligence gather around that object.

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

References:
- https://land.tech/products/landinsight
- https://support.land.tech/en/articles/9716934-getting-to-know-map-controls-map-tools

## 4. Nimbus: identity resolution may be the real moat

The valuable layer is not merely the map renderer. It is the system that resolves different source datasets into one property identity.

Taipei-Maps may eventually need its own canonical identifier, for example:

```text
taipei_building_id
```

The exact identifier is not decided. It might map to an official government building identifier if one exists, or be our own crosswalk key linking authoritative source IDs.

The key question becomes:

> Which stable identity can connect registry records, cadastral records, visual geometry, addresses, permits, and analytical lenses?

References:
- https://www.nimbusmaps.co.uk/data-services
- https://www.nimbusmaps.co.uk/commercial-developer

## 5. Working Taipei-Maps target model

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
             age                         MapLibre / ArcGIS
             price                       2D / 3D
             school
             flood
             transit
             redevelopment
```

**Registry/identity is truth about the object. Geometry is a representation of that object.** A stale or missing 3D geometry must not make the building disappear from analytical layers.

## 6. Interpretation of current Taipei experiments

### `building_age`

Current evidence says City Dashboard `building_age` behaves like address/doorplate-level records, not one row per physical building.

Therefore:
- useful age/registry source
- not canonical building identity
- `constr_yr` should be treated as durable age source of truth

### `tp_building_height`

The strict-join experiment improved point-in-polygon coverage relative to Overture but increased construction-year conflicts.

Therefore:
- strong candidate for fast visual extrusion geometry
- not proven as canonical physical-building identity
- its polygons may represent geometry/roof/extrusion parts rather than one-building-one-polygon objects

### Overture

Overture remains valuable as:
- global fallback building universe
- world-scale 2.5D/3D baseline
- disposable test bed for spatial methodology

It should not override a better local authoritative identity model.

## 7. Revised research question

Old question:

> Which polygon layer should we use as "the building"?

New question:

> **What official or reproducible identifier in Taipei is closest to the role of the Dutch BAG building ID, and how can we map all current source layers back to it?**

Candidate areas to inspect next:

- cadastral building data
- building registration / building-number identifiers
- occupancy-permit identifiers
- building-license crosswalks
- `building_cadastralmap`
- parcel / building-number relationships
- whether `tp_building_height` contains grouping/parent identifiers that can collapse visual parts back to one building object

## 8. Near-term engineering decision

Do **not** replace the current project architecture with a single "best" polygon source yet.

Near-term sequence:

1. Audit candidate Taipei identity layers.
2. Identify stable IDs and relationship fields.
3. Test whether visual geometry parts can be grouped back to one canonical building.
4. Re-run the same Xinyi strict join against candidate building identities.
5. Only after identity is credible, scale age assignment citywide.
6. Keep geometry freshness separate from registry freshness.

## 9. Product-level takeaway

Taipei-Maps should aim for three layers of value:

1. **City engine** — fast 2D/3D map and building geometry.
2. **Property identity graph** — canonical building/property objects joining multiple government datasets.
3. **Consumer intelligence UX** — age, price, school, flood, transit, redevelopment, permits and freshness presented around the selected place.

The map is the interface. The long-term moat is likely the identity/crosswalk layer underneath it.

## 10. Working slogan

> Geometry tells us what the city looks like.  
> Registry tells us what the building is.  
> Events tell us what it is becoming.  
> Identity keeps all three attached to the same object.

This memo is a research/architecture checkpoint, not a final schema decision.
