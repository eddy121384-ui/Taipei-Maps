# New Taipei 3D provider audit

Status: provider spike in progress (Issue #6)

## Corrected finding

NLSC's multi-dimensional national spatial information platform does publish national 3D building models through no-application OGC I3S / 3D Tiles web services, and NLSC lists New Taipei i-Land as an existing OGC I3S integration consumer.

However, the initially tested endpoint:

`https://i3s.nlsc.gov.tw/building/i3s/SceneServer/layers/0`

must **not** be treated as a nationwide layer. NCHC's public programming example uses this exact endpoint inside a `modelSetTaipei()` function, and the user's browser smoke test showed that with Taipei City's municipal LOD1 disabled, NLSC buildings still appeared on the Taipei side while New Taipei stayed flat.

A second public NCHC example uses `layers/4` specifically for Kaohsiung. This is additional evidence that individual layer IDs represent separate geographic building sets rather than one nationwide layer at ID 0.

## Verified sources

Official NLSC current service description:
- https://www.nlsc.gov.tw/cp.aspx?n=16733
- States that the multi-dimensional platform provides free online use and no-application OGC I3S / 3D Tiles network services.

Official NLSC integration examples:
- https://www.nlsc.gov.tw/cp.aspx?n=16734
- Lists `新北不動產愛連網` as an OGC I3S integration consumer.

Public NCHC programming-guide examples:
- https://doc-3dgdp.colife.org.tw/widgetdocument/src/02.16_MultiWindowWidget/MultiWindowWidget.html
- Uses `.../SceneServer/layers/0` in `modelSetTaipei()`.
- https://doc-3dgdp.colife.org.tw/widgetdocument/src/03.5_VROOM/03.5.2_VROOM_Develop/VROOM%E9%96%8B%E7%99%BC%E8%AA%AA%E6%98%8E.html
- Uses `.../SceneServer/layers/4` for Kaohsiung.

## Failed Node metadata probe

The first local enumerator used Node `fetch()` against `layers/0..30`. Every request returned `TypeError: fetch failed`, including layer 0, even though the same machine's browser/ArcGIS SceneLayer could load layer 0 successfully.

Therefore that result is a local Node networking/TLS-path failure, not evidence that the NLSC layer metadata endpoints are absent.

Do not spend more time debugging Node for this spike.

## Browser-based metadata probe

The current branch now includes `src/NlscLayerProbe.tsx` plus `start-nlsc-browser-probe.bat`.

The browser probe:

- uses the same `@arcgis/core` SceneLayer implementation as the working main map;
- calls `SceneLayer.load()` for `layers/0..30` sequentially;
- reads metadata/full extent only; it does not intentionally stream the full 3D geometry;
- reports title, spatial reference and extent;
- marks any extent containing the Banqiao test coordinate (121.4623, 25.0123) as a candidate;
- provides a copy-results button for the next diagnostic step.

## Next acceptance test

1. Run `start-nlsc-browser-probe.bat`.
2. Let the table finish scanning layers 0–30.
3. Copy the scan result and return it to the development chat.
4. Identify candidate layer(s) whose extent contains Banqiao.
5. Only then wire the verified New Taipei layer into the main Greater Taipei map.
6. Smoke-test Banqiao / Yonghe / Xindian / Sanchong.

## Architectural guardrail

Do not label an NLSC service layer as `nationwide`, `Greater Taipei`, or `New Taipei` from the hostname or service family alone. Verify the individual SceneServer layer metadata/extent first.
