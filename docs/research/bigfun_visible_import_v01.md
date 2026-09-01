# BigFun Visible Results Import v0.1

Issue #77. Personal-research spike only.

## Purpose

Let the user browse BigFun normally, then explicitly export only listing facts currently visible in the browser UI and load them into 卜居 as temporary research inventory.

## Browser helper

Chrome unpacked extension folder:

`tools/browser/bigfun-visible-helper-v01/`

Install once:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select the folder above.

The extension runs only on `https://www.ibigfun.com/*` and requests no extension permissions.

## Capture semantics

Capture happens only after the user clicks `📥 卜居匯出`.

The helper:

- scans only DOM elements currently intersecting the viewport;
- requires listing-like visible text (price plus property details);
- previews candidates before export;
- lets the user select which rows to export;
- exports visible text, same-origin source URL, page URL, capture time, and coordinates only when they are already present as visible DOM data attributes.

It does **not**:

- call BigFun APIs;
- use `fetch`/XHR;
- paginate or scroll automatically;
- read hidden background inventory;
- collect photos, full descriptions, phone numbers, owner identity, transcripts, or other personal data.

## Export schema

`schema: buju.bigfun-visible.v0.1`

Each row is normalized by `public/bigfun-visible-import-core-v01.mjs` into minimal factual fields:

- title
- asking_wan
- total_ping
- age_years
- bedrooms
- floor
- address_text
- source_url/page_url
- captured_at
- lat/lon only if available in the captured visible DOM

All imported rows remain `verification_status=insufficient_location` until 卜居 resolves authoritative location/school truth.

## 卜居 desktop import

`public/bigfun-visible-import-desktop-v01.js` adds `📥 BigFun JSON` to the desktop engineering map.

Imported rows are stored in `sessionStorage` only and are not written into the #73 personal research snapshot. Rows with trustworthy coordinates can render temporary purple pins; rows without coordinates stay list-only.

## Physical smoke target

The first authenticated-browser smoke should answer:

1. Does the helper detect real BigFun listing cards rather than container noise?
2. Are price / ping / age / bedrooms parsed correctly?
3. Do source links point to the intended visible listing?
4. Does BigFun expose any usable coordinates in visible DOM attributes?
5. Does the exported JSON load cleanly into 卜居?

If card detection is noisy, tune selectors/heuristics using screenshots or a user-saved HTML sample. Do not compensate by calling internal APIs.
