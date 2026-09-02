# BigFun Search Results Collector v0.4

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

The collector explicitly extracts the BigFun card field `相關地址` and stores it as `address_text`. The original rendered card text is also preserved for parsing/provenance.

The address is shown in 卜居 as **BigFun 相關地址**. The BigFun address is a source fact; official school truth remains a separate verification step.

## Why the v0.3 locator failed

v0.3 sent full Taiwan doorplate strings to the public OpenStreetMap Nominatim geocoder. The addresses were preserved correctly, but Nominatim is not an authoritative/full-coverage Taiwan house-number database and the physical smoke returned unresolved results for the imported batch.

v0.4 removes Nominatim from the primary pipeline.

## Taipei official doorplate locator v0.4

Source dataset: 臺北市政府資料大平臺 — `臺北市門牌位置數值資料`.

- dataset page: https://data.taipei/dataset/detail?id=b7c8e724-1e98-45ee-a0bd-f3840623ed97
- resource: https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=ce76ca0c-7f94-4935-ab47-1d2a41ca2abb
- provider: 臺北市政府民政局
- update frequency: monthly
- license: 政府資料開放授權條款-第1版

The source CSV is currently about 119 MB. The BigFun smoke launcher runs:

`node tools/data/build_taipei_doorplate_index_v01.mjs --if-missing`

On the first run it downloads the CSV into ignored `public/generated/`, normalizes Taipei doorplate strings, converts TWD97 TM2 coordinates to WGS84 when needed, and builds an ignored local address→coordinate index. Later runs reuse the generated index.

The local desktop server exposes only a localhost lookup route:

`/__buju/taipei-doorplate?address=...`

The imported BigFun address is matched against that local official index. Successful matches use `location_basis=taipei-official-doorplate` and render purple price pins. No BigFun API or external geocoder is involved in this step.

If the official index is missing, the UI tells the user to rerun `start-bigfun-visible-import-smoke.bat`. If a particular address is absent from the official index, it stays list-only; no fake coordinate is created.

## Import semantics

Imported rows remain temporary/session-only and do not modify the #73 persistent snapshot. BigFun address preservation and map placement do not themselves assert school eligibility; school truth still needs the existing official school resolver.

## Physical smoke status

Edge smoke confirmed full-page collection (20 detected / 20 collected), persistent basket behavior, and BigFun `相關地址` preservation. The same smoke exposed three fixes already landed: move the collector away from pagination, preserve address text into 卜居, and replace the unsuccessful Nominatim locator with the local Taipei official doorplate index.

Next physical smoke: rerun `start-bigfun-visible-import-smoke.bat`, allow the first-time official doorplate download/index build to finish, import the same BigFun JSON, and confirm matching homes become purple pins with `臺北市官方門牌座標` status.
