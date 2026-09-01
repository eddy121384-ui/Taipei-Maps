# BigFun Search Results Collector v0.2

Issue #77. Personal-research spike only.

## Purpose

Let the user browse BigFun normally and explicitly collect the listing cards already loaded on each current result page into a persistent local basket, then export the basket to 卜居 as temporary research inventory.

## Browser helper

Unpacked Chromium extension folder:

`tools/browser/bigfun-visible-helper-v01/`

Edge install/update:

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** for first install, or **Reload** after pulling a new revision.
4. Select the folder above.

The extension runs only on `https://www.ibigfun.com/*` and requests no extension permissions.

## Collection semantics

Collection is explicit and page-by-page:

1. Open the collector (`📦 卜居收集籃`).
2. It scans listing-like cards already loaded in the current BigFun result page DOM, including cards outside the current viewport when they are still rendered by BigFun.
3. Review the detected current-page rows; deselect any row if needed.
4. Click `＋ 收集本頁`.
5. Browse/turn to the next BigFun result page normally.
6. Open the collector and click `＋ 收集本頁` again.
7. The local basket persists across normal BigFun page navigation and deduplicates already-collected rows.
8. Click `📦 下載全部 JSON` when ready to import the complete basket into 卜居.

The helper does **not**:

- call BigFun APIs;
- use `fetch`/XHR;
- auto-scroll or automatically paginate;
- query inventory that BigFun has not loaded into the current page DOM;
- collect photos, full descriptions, phone numbers, owner identity, transcripts, or other personal data.

Therefore a BigFun map cluster count is not itself exportable inventory. The underlying homes must first be presented by BigFun as normal loaded result cards.

## Export schema

`schema: buju.bigfun-visible.v0.2`

The basket contains factual text/source fields captured from loaded result cards. `public/bigfun-visible-import-core-v01.mjs` normalizes them into minimal fields such as title, asking price, ping, age, bedrooms, floor, address text, source URL/page URL, capture time, and lat/lon only when already exposed as usable DOM data attributes.

All imported rows remain `verification_status=insufficient_location` until 卜居 resolves authoritative location/school truth.

## 卜居 desktop import

`public/bigfun-visible-import-desktop-v01.js` adds `📥 BigFun JSON` to the desktop engineering map.

Imported rows are stored in `sessionStorage` only and are not written into the #73 personal research snapshot. Rows with trustworthy coordinates can render temporary purple pins; rows without coordinates stay list-only.

## Physical smoke status

Edge authenticated smoke confirmed that image-backed detection can match one visible BigFun listing card to one candidate after selector tuning. v0.2 now needs a physical smoke for full current-page detection, page-to-page basket persistence/deduplication, and final JSON import into 卜居.
