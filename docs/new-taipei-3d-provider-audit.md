# New Taipei 3D provider audit

Status: provider spike in progress (Issue #6)

## Corrected finding

NLSC provides national 3D building data and no-application OGC I3S / 3D Tiles services, but individual `SceneServer/layers/{id}` entries are regional / batch-specific rather than a single nationwide geometry layer.

Verified evidence so far:

- `layers/0` loads successfully but is Taipei-oriented; browser smoke testing showed New Taipei remained flat when using it alone.
- NCHC public examples call `layers/0` from a Taipei-specific setup function.
- NCHC public examples use `layers/4` for Kaohsiung, confirming different layer IDs can represent different regional datasets.
- Browser metadata enumeration of `layers/0–30` completed successfully.
- For the Banqiao test point `121.4623, 25.0123`, the scanner found only two bounding-box candidates:
  - `layer 0` — title `I3s - 台北市`
  - `layer 5` — title `I3s - 114 F`
- Because layer 0 is already known to be Taipei-only in actual geometry coverage, layer 5 is now the primary New Taipei candidate for a direct geometry smoke test.

Important: a bounding-box extent containing Banqiao is not sufficient proof of actual building coverage. Layer 5 must render geometry around Banqiao before it is accepted as the New Taipei provider.

## Direct layer-5 smoke test

The branch now includes a lightweight one-click test:

`start-new-taipei-smoke-test.bat`

It launches a browser page on a tiny Node built-in HTTP server and loads only:

`https://i3s.nlsc.gov.tw/building/i3s/SceneServer/layers/5`

No Taipei municipal LOD1 is loaded in this test, so any 3D buildings visible around the Banqiao camera must come from NLSC layer 5.

Acceptance:

1. Open the layer-5 smoke test.
2. Wait until the status says the current view has finished streaming.
3. Confirm whether 3D buildings appear around Banqiao.
4. If yes, repeat nearby panning toward Yonghe / Xindian / Sanchong to understand real coverage.
5. Only after actual geometry is confirmed should layer 5 be wired into the main Greater Taipei map.

## Evidence sources

Official NLSC service description:
- https://www.nlsc.gov.tw/cp.aspx?n=16733
- NLSC states the multi-dimensional platform provides free online use and no-application OGC I3S / 3D Tiles network services.

Official NLSC integration examples:
- https://www.nlsc.gov.tw/cp.aspx?n=16734
- Lists `新北不動產愛連網` as an OGC I3S integration consumer.

Public NCHC programming-guide example:
- https://doc-3dgdp.colife.org.tw/widgetdocument/src/02.16_MultiWindowWidget/MultiWindowWidget.html
- Uses `layers/0` from a Taipei-specific setup function.

Public NCHC VR example:
- Uses `layers/4` for Kaohsiung, further showing that layer IDs are not a single nationwide layer.

## Guardrail

Do not label an NLSC layer as `nationwide`, `Greater Taipei`, or `New Taipei` based only on the service-family hostname or a broad bounding extent. Verify actual geometry at the target city first.