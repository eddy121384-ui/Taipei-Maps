import http from "node:http";
import { exec } from "node:child_process";

const host = "127.0.0.1";
const port = 5188;

const html = String.raw`<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Taipei-Maps NLSC I3S Probe</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
    body { margin: 0; background: #0b0f14; color: #eef4f8; }
    main { max-width: 1280px; margin: 0 auto; padding: 24px; }
    h1 { margin: 4px 0 8px; font-size: 28px; }
    p { color: #aeb9c3; line-height: 1.6; }
    button { background: #27313a; color: #fff; border: 1px solid #52606b; border-radius: 10px; padding: 9px 14px; cursor: pointer; }
    .summary { margin: 16px 0; padding: 14px; border: 1px solid #355d45; border-radius: 12px; background: #12251a; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 9px; border-bottom: 1px solid #25303a; text-align: left; vertical-align: top; }
    th { position: sticky; top: 0; background: #151c23; }
    tr.hit { background: #13301f; }
    .ok { color: #78e29a; } .err { color: #ff8f8f; } .wait { color: #e2c66b; }
    code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
  </style>
  <script type="module" src="https://js.arcgis.com/5.1/"></script>
</head>
<body>
<main>
  <div style="font-size:12px;letter-spacing:.13em;color:#8997a3">TAIPEI-MAPS · NLSC BROWSER PROBE · NO VITE</div>
  <h1>NLSC I3S layer scanner</h1>
  <p>直接由瀏覽器透過 ArcGIS 官方 CDN 載入 SceneLayer，只讀取 layer metadata / extent。掃描 <code>layers/0–30</code>，並標記 extent 是否包含板橋。</p>
  <p id="progress">載入 ArcGIS SDK…</p>
  <div id="summary" class="summary" style="display:none"></div>
  <button id="copy" disabled>複製掃描結果</button>
  <div style="overflow:auto;margin-top:14px;border:1px solid #25303a;border-radius:12px;max-height:72vh">
    <table>
      <thead><tr><th>Layer</th><th>Status</th><th>Title</th><th>WKID</th><th>Extent</th><th>板橋</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
</main>
<script type="module">
  const BASE = "https://i3s.nlsc.gov.tw/building/i3s/SceneServer/layers";
  const BANQIAO = { lon: 121.4623, lat: 25.0123 };
  const results = Array.from({ length: 31 }, (_, id) => ({ id, status: "WAIT" }));
  const tbody = document.getElementById("rows");
  const progress = document.getElementById("progress");
  const summary = document.getElementById("summary");
  const copyButton = document.getElementById("copy");

  function mercator(lon, lat) {
    const x = lon * 20037508.34 / 180;
    let y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
    y = y * 20037508.34 / 180;
    return { x, y };
  }

  function containsBanqiao(wkid, e) {
    if (!e) return null;
    if (wkid === 4326 || wkid === 4490) {
      return BANQIAO.lon >= e.xmin && BANQIAO.lon <= e.xmax && BANQIAO.lat >= e.ymin && BANQIAO.lat <= e.ymax;
    }
    if (wkid === 3857 || wkid === 102100 || wkid === 102113) {
      const p = mercator(BANQIAO.lon, BANQIAO.lat);
      return p.x >= e.xmin && p.x <= e.xmax && p.y >= e.ymin && p.y <= e.ymax;
    }
    return null;
  }

  function fmt(v) {
    if (!Number.isFinite(v)) return "—";
    return Math.abs(v) > 1000 ? v.toFixed(1) : v.toFixed(5);
  }

  function render() {
    tbody.innerHTML = results.map(r => {
      const statusClass = r.status === "OK" ? "ok" : r.status === "ERR" ? "err" : "wait";
      const extent = r.extent ? `${fmt(r.extent.xmin)}, ${fmt(r.extent.ymin)} → ${fmt(r.extent.xmax)}, ${fmt(r.extent.ymax)}` : "—";
      const bq = r.contains === true ? "YES" : r.contains === false ? "no" : "—";
      return `<tr class="${r.contains === true ? "hit" : ""}"><td>${r.id}</td><td class="${statusClass}">${r.status}</td><td>${r.title ?? r.error ?? "—"}</td><td>${r.wkid ?? "—"}</td><td style="white-space:nowrap">${extent}</td><td>${bq}</td></tr>`;
    }).join("");
  }

  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function scanOne(SceneLayer, id) {
    const layer = new SceneLayer({ url: `${BASE}/${id}`, popupEnabled: false });
    try {
      await withTimeout(layer.load(), 9000, `layer ${id}`);
      const e = layer.fullExtent;
      const wkid = e?.spatialReference?.wkid ?? e?.spatialReference?.latestWkid ?? null;
      results[id] = {
        id,
        status: "OK",
        title: layer.title || "(no title)",
        wkid,
        extent: e ? { xmin: e.xmin, ymin: e.ymin, xmax: e.xmax, ymax: e.ymax } : null,
        contains: containsBanqiao(wkid, e),
      };
    } catch (error) {
      results[id] = { id, status: "ERR", error: error?.message ?? String(error) };
    } finally {
      try { layer.destroy(); } catch {}
      render();
    }
  }

  async function run() {
    render();
    try {
      const [SceneLayer] = await $arcgis.import(["@arcgis/core/layers/SceneLayer.js"]);
      progress.textContent = "ArcGIS SDK 已載入，正在掃描 NLSC layers/0–30…";

      const concurrency = 4;
      let next = 0;
      async function worker() {
        while (true) {
          const id = next++;
          if (id > 30) return;
          progress.textContent = `掃描中… layer ${id}/30`;
          await scanOne(SceneLayer, id);
        }
      }
      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      const ok = results.filter(r => r.status === "OK");
      const hits = ok.filter(r => r.contains === true);
      progress.textContent = `掃描完成：${ok.length} 個 metadata 可讀 layer。`;
      summary.style.display = "block";
      summary.innerHTML = hits.length
        ? `<strong>板橋 extent 候選：</strong> ${hits.map(r => `layer ${r.id} (${r.title})`).join("、")}`
        : `<strong>目前沒有自動判定為板橋 YES 的 layer。</strong> 請把掃描結果貼回 ChatGPT；若 NLSC 使用其他座標系，我們會從 extent/title 繼續判讀。`;
      copyButton.disabled = false;
    } catch (error) {
      progress.textContent = `ArcGIS CDN 載入失敗：${error?.message ?? error}`;
    }
  }

  copyButton.addEventListener("click", async () => {
    const text = results.filter(r => r.status !== "WAIT").map(r => {
      if (r.status === "ERR") return `[${String(r.id).padStart(2,"0")}] ERR ${r.error}`;
      const e = r.extent;
      return `[${String(r.id).padStart(2,"0")}] OK title=${r.title} wkid=${r.wkid ?? "?"} extent=${e ? `${fmt(e.xmin)},${fmt(e.ymin)},${fmt(e.xmax)},${fmt(e.ymax)}` : "?"} banqiao=${r.contains === true ? "YES" : r.contains === false ? "no" : "?"}`;
    }).join("\n");
    await navigator.clipboard.writeText(text);
    copyButton.textContent = "已複製";
  });

  run();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}/`;
  console.log("==============================================");
  console.log("  Taipei-Maps NLSC probe — lightweight mode");
  console.log("==============================================");
  console.log(`Probe ready: ${url}`);
  console.log("No Vite / npm bundling is used.");
  console.log("Leave this window open while the browser scan runs.");

  if (process.platform === "win32") {
    exec(`start "" "${url}"`, { shell: "cmd.exe" });
  }
});
