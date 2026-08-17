import http from "node:http";
import { exec } from "node:child_process";

const host = "127.0.0.1";
const port = 5189;

const html = String.raw`<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Taipei-Maps — NLSC layer 5 Banqiao smoke test</title>
  <style>
    html, body, #view { width: 100%; height: 100%; margin: 0; }
    body { font-family: Inter, system-ui, sans-serif; background: #0b0f14; }
    #panel {
      position: fixed; z-index: 10; top: 16px; right: 16px; width: min(390px, calc(100vw - 32px));
      padding: 16px 18px; border-radius: 16px; color: #eef4f8;
      background: rgba(14, 21, 27, .92); border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 18px 50px rgba(0,0,0,.25); backdrop-filter: blur(12px);
    }
    .eyebrow { font-size: 11px; letter-spacing: .14em; color: #8fa1af; font-weight: 800; }
    h1 { margin: 5px 0 8px; font-size: 22px; }
    p { margin: 7px 0; line-height: 1.55; color: #b7c2ca; font-size: 13px; }
    #status { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: #172129; color: #e6edf2; }
    .ok { background: #153322 !important; color: #8ff0ad !important; }
    .err { background: #3b1b1b !important; color: #ff9c9c !important; }
    button { margin-top: 10px; margin-right: 7px; padding: 8px 11px; border-radius: 9px; border: 1px solid #52606b; background: #27313a; color: #fff; cursor: pointer; }
    code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
  </style>
  <script type="module" src="https://js.arcgis.com/5.1/"></script>
</head>
<body>
  <div id="view"></div>
  <section id="panel">
    <div class="eyebrow">TAIPEI-MAPS · NEW TAIPEI PROVIDER SPIKE</div>
    <h1>NLSC layer 5 · 板橋實機測試</h1>
    <p>掃描器顯示 layer 5（<code>I3s - 114 F</code>）的 extent 包含板橋。這頁只載這一層，不混入台北 LOD1，避免誤判。</p>
    <p>目標：板橋座標 <code>121.4623, 25.0123</code></p>
    <div id="status">載入 ArcGIS SDK…</div>
    <button id="banqiao">回到板橋</button>
    <button id="wide">拉遠一點</button>
  </section>

<script type="module">
  const LAYER_URL = "https://i3s.nlsc.gov.tw/building/i3s/SceneServer/layers/5";
  const BANQIAO = [121.4623, 25.0123];
  const status = document.getElementById("status");

  function setStatus(text, kind = "") {
    status.textContent = text;
    status.className = kind;
  }

  try {
    const [ArcGISMap, Basemap, OpenStreetMapLayer, SceneLayer, SceneView] = await $arcgis.import([
      "@arcgis/core/Map.js",
      "@arcgis/core/Basemap.js",
      "@arcgis/core/layers/OpenStreetMapLayer.js",
      "@arcgis/core/layers/SceneLayer.js",
      "@arcgis/core/views/SceneView.js",
    ]);

    const layer = new SceneLayer({
      url: LAYER_URL,
      title: "NLSC layer 5 — I3s 114 F candidate",
      popupEnabled: false,
      visible: true,
    });

    const map = new ArcGISMap({
      basemap: new Basemap({ baseLayers: [new OpenStreetMapLayer()] }),
      layers: [layer],
    });

    const view = new SceneView({
      container: "view",
      map,
      qualityProfile: "high",
      center: BANQIAO,
      zoom: 15,
      heading: 20,
      tilt: 65,
    });

    setStatus("正在載入 NLSC layer 5 metadata…");
    await Promise.all([view.when(), layer.load()]);
    setStatus("layer 5 metadata 已載入：" + (layer.title || "I3s - 114 F") + "。正在串流板橋 3D tile…", "ok");

    const layerView = await view.whenLayerView(layer);
    const updateStatus = () => {
      if (layerView.updating) {
        setStatus("layer 5 已連線，正在串流板橋 3D tile…", "ok");
      } else {
        setStatus("layer 5 已完成目前視野串流。請直接看板橋是否有 3D 建築；若仍是平面，代表 extent 包含板橋但實際 geometry 未覆蓋這裡。", "ok");
      }
    };
    layerView.watch("updating", updateStatus);
    updateStatus();

    document.getElementById("banqiao").addEventListener("click", () => {
      void view.goTo({ center: BANQIAO, zoom: 15, heading: 20, tilt: 65 }, { duration: 900 });
    });
    document.getElementById("wide").addEventListener("click", () => {
      void view.goTo({ center: BANQIAO, zoom: 13, heading: 20, tilt: 60 }, { duration: 900 });
    });
  } catch (error) {
    console.error(error);
    setStatus("載入失敗：" + (error?.message ?? String(error)), "err");
  }
</script>
</body>
</html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}/`;
  console.log("=================================================");
  console.log("  Taipei-Maps — NLSC layer 5 Banqiao smoke test");
  console.log("=================================================");
  console.log(`Smoke test ready: ${url}`);
  console.log("This page loads only NLSC layer 5; Taipei LOD1 is NOT loaded.");
  console.log("Leave this window open while testing in the browser.");

  if (process.platform === "win32") {
    exec(`start "" "${url}"`, { shell: "cmd.exe" });
  }
});