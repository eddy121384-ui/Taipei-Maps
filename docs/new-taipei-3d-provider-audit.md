# New Taipei 3D provider audit

Status: provider spike in progress (Issue #6)

## Finding

New Taipei does not need to wait for a New Taipei-specific public SceneServer to test citywide 3D coverage.

The National Land Surveying and Mapping Center (NLSC) publishes national 3D building models through no-application OGC I3S / 3D Tiles web services. NLSC also lists New Taipei i-Land as an existing consumer of its OGC I3S service.

Candidate nationwide building endpoint used by public/NCHC examples:

`https://i3s.nlsc.gov.tw/building/i3s/SceneServer/layers/0`

## Evidence

Official NLSC current service description:
- https://www.nlsc.gov.tw/cp.aspx?n=16733
- States that the multi-dimensional platform provides free online use and no-application OGC I3S / 3D Tiles network services.

Official NLSC integration examples:
- https://www.nlsc.gov.tw/cp.aspx?n=16734
- Lists `新北不動產愛連網` as an OGC I3S integration consumer.

Official NLSC FAQ:
- https://www.moi.gov.tw/News_toggle3.aspx?PageSize=30&_CSN=0&n=174&page=73&sms=9015
- Confirms 3D building models are one of the I3S / 3D Tiles service categories and notes the 20 m DTM preprocessing/alignment consideration.

Public NCHC programming-guide example:
- https://doc-3dgdp.colife.org.tw/widgetdocument/src/02.16_MultiWindowWidget/MultiWindowWidget.html
- Uses `https://i3s.nlsc.gov.tw/building/i3s/SceneServer/layers/0` directly with an OGC I3S layer.

## Current spike design

`src/AgeMapApp.tsx` now includes the NLSC nationwide I3S as an optional SceneLayer:

- OFF by default so Taipei LOD1 behavior is unchanged.
- Independent toggle labeled `大台北 / 全國 3D（NLSC）`.
- `板橋測試` camera shortcut for a quick New Taipei smoke test.
- NLSC service loads asynchronously and cannot block the existing Taipei layers.
- No wildcard `outFields` are requested for the NLSC spike; treat it as a geometry provider first.

## Browser acceptance test

1. Start Taipei-Maps.
2. Wait for `大台北 / 全國 3D（NLSC）` to change from WAIT to OFF.
3. Turn the NLSC layer ON.
4. Turn `台北市 3D 建築` OFF to avoid overlapping city geometry.
5. Click `板橋測試`.
6. Confirm buildings stream in around Banqiao.
7. Pan through Yonghe, Xindian and Sanchong and compare loading latency with Taipei LOD1.
8. If NLSC stays ERR, inspect browser console for CORS / I3S-version / service metadata errors.

## Architectural implication if accepted

Likely provider policy:

- Taipei municipal LOD1 inside Taipei City when we want the best municipal geometry/service behavior.
- NLSC national I3S as the Greater-Taipei / nationwide fallback geometry provider, including New Taipei.
- Analytical attributes (age, price, school, redevelopment, etc.) remain separate joined layers rather than depending on the 3D geometry provider.

Do not yet describe the New Taipei municipal 3D system itself as an openly reusable SceneServer. The verified public reuse path in this spike is NLSC.