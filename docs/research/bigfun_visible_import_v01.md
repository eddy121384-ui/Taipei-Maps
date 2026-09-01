# BigFun Search Results Collector v0.3

Issue #77. Personal-research spike only.

## Purpose

Let the user browse BigFun normally, collect the listing cards already loaded on each current result page into a persistent local basket, then import the accumulated basket into 卜居 temporary inventory.

## Edge / Chromium helper

Folder: `tools/browser/bigfun-visible-helper-v01/`

Install/reload in Edge via `edge://extensions` → Developer mode → Load unpacked / Reload.

The helper runs only on `https://www.ibigfun.com/*` and requests no extension permissions.

## Collection flow

1. Open BigFun normal map/list results.
2. Open `📦 卜居收集籃` (left side; panel can be dragged).
3. Review current-page detected cards and their `相關地址`.
4. Click `＋ 收集本頁`.
5. Turn the BigFun page normally and collect again.
6. Basket persists in localStorage and deduplicates rows.
7. Download `buju.bigfun-visible.v0.3` JSON.
8. Import with `📥 BigFun JSON` in 卜居.

The helper does not auto-scroll, auto-paginate, call BigFun APIs, use XHR/fetch, or read internal endpoints. Map cluster counts are not converted into homes until BigFun renders the underlying normal result cards.

## Address preservation

v0.3 explicitly extracts the BigFun card field `相關地址` and stores it as `address_text`. The original multi-line card text is also preserved for parsing/provenance.

The address is shown in 卜居 as **BigFun 相關地址 — 尚未官方驗證**. It must not be relabeled as an official address.

## Map placement in 卜居

If the imported BigFun DOM already exposes trustworthy coordinates, those coordinates are used.

Otherwise, when a BigFun related address is available, 卜居 performs a research-only address geocode using the OpenStreetMap Nominatim public search service:

- user-triggered by the JSON import / relocate action;
- one request at a time, minimum 1100 ms between network requests;
- localStorage cache by normalized address;
- maximum 50 uncached network requests per run;
- Taipei bounding guard;
- endpoint can be overridden at runtime via `BUJU_GEOCODER_ENDPOINT` or `localStorage['buju.geocoder.endpoint']`;
- successful results are labeled `location_basis=address-geocode-osm` and displayed as **approximate, non-official** pins;
- failed/unresolved addresses stay list-only; no fake coordinates.

This is deliberately for small, user-triggered personal-research batches only. It is not a recurring/bulk geocoding pipeline. UI includes OpenStreetMap attribution and a link to the Nominatim usage policy.

## Import semantics

Imported rows remain temporary/session-only and do not modify the #73 persistent snapshot. School truth remains `insufficient_location` until the existing official resolver verifies it.

## Physical smoke status

The v0.2 Edge smoke confirmed full-page collection: 20 detected / 20 collected on a BigFun result page. The same smoke exposed three v0.3 fixes now implemented:

- preserve BigFun `相關地址` through JSON into 卜居;
- address-geocode imported rows into approximate map pins;
- move the helper launcher/panel away from BigFun right-side pagination and make the panel draggable.

Next physical smoke: collect at least two pages, confirm `相關地址` survives the export, import JSON, wait for progressive pin placement, and verify the BigFun pagination remains unobstructed.
