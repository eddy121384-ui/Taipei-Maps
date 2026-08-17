import { useEffect, useMemo, useState } from "react";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";

const BASE = "https://i3s.nlsc.gov.tw/building/i3s/SceneServer/layers";
const BANQIAO = { lon: 121.4623, lat: 25.0123 };

type ProbeRow = {
  id: number;
  status: "WAIT" | "OK" | "ERR";
  title?: string;
  wkid?: number | null;
  xmin?: number;
  ymin?: number;
  xmax?: number;
  ymax?: number;
  containsBanqiao?: boolean | null;
  error?: string;
};

function lonLatToWebMercator(lon: number, lat: number) {
  const x = (lon * 20037508.34) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return { x, y };
}

function containsBanqiao(
  wkid: number | null | undefined,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
): boolean | null {
  if (wkid === 4326 || wkid === 4490) {
    return BANQIAO.lon >= xmin && BANQIAO.lon <= xmax && BANQIAO.lat >= ymin && BANQIAO.lat <= ymax;
  }

  if (wkid === 3857 || wkid === 102100 || wkid === 102113) {
    const p = lonLatToWebMercator(BANQIAO.lon, BANQIAO.lat);
    return p.x >= xmin && p.x <= xmax && p.y >= ymin && p.y <= ymax;
  }

  return null;
}

function fmt(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return Math.abs(value) > 1000 ? value.toFixed(1) : value.toFixed(5);
}

export default function NlscLayerProbe() {
  const [rows, setRows] = useState<ProbeRow[]>(
    Array.from({ length: 31 }, (_, id) => ({ id, status: "WAIT" })),
  );
  const [running, setRunning] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const next: ProbeRow[] = [];

      for (let id = 0; id <= 30; id += 1) {
        if (cancelled) return;

        try {
          const layer = new SceneLayer({
            url: `${BASE}/${id}`,
            popupEnabled: false,
          });
          await layer.load();

          const extent = layer.fullExtent;
          const wkid = extent?.spatialReference?.wkid ?? extent?.spatialReference?.latestWkid ?? null;
          const row: ProbeRow = {
            id,
            status: "OK",
            title: layer.title || "(no title)",
            wkid,
          };

          if (extent) {
            row.xmin = extent.xmin;
            row.ymin = extent.ymin;
            row.xmax = extent.xmax;
            row.ymax = extent.ymax;
            row.containsBanqiao = containsBanqiao(
              wkid,
              extent.xmin,
              extent.ymin,
              extent.xmax,
              extent.ymax,
            );
          }

          next.push(row);
          layer.destroy();
        } catch (error: any) {
          next.push({
            id,
            status: "ERR",
            error: error?.message ?? String(error),
          });
        }

        if (!cancelled) {
          setRows((current) => {
            const copy = [...current];
            copy[id] = next[next.length - 1];
            return copy;
          });
        }
      }

      if (!cancelled) setRunning(false);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const candidates = useMemo(
    () => rows.filter((row) => row.status === "OK" && row.containsBanqiao === true),
    [rows],
  );

  const copyText = async () => {
    const text = rows
      .filter((row) => row.status !== "WAIT")
      .map((row) => {
        if (row.status === "ERR") return `[${String(row.id).padStart(2, "0")}] ERR ${row.error}`;
        return `[${String(row.id).padStart(2, "0")}] OK title=${row.title} wkid=${row.wkid ?? "?"} extent=${fmt(row.xmin)},${fmt(row.ymin)},${fmt(row.xmax)},${fmt(row.ymax)} banqiao=${row.containsBanqiao === null || row.containsBanqiao === undefined ? "?" : row.containsBanqiao ? "YES" : "no"}`;
      })
      .join("\n");
    await navigator.clipboard.writeText(text);
  };

  return (
    <main style={{ minHeight: "100vh", overflow: "auto", padding: 24, background: "#0b0f14", color: "#f7f9fb" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <p className="eyebrow">TAIPEI-MAPS · NLSC BROWSER PROBE</p>
        <h1 style={{ marginBottom: 10 }}>NLSC I3S layer scanner</h1>
        <p style={{ color: "rgba(239,244,249,.72)", lineHeight: 1.6 }}>
          這個版本不使用 Node fetch。它直接在瀏覽器裡用與主地圖相同的 ArcGIS SceneLayer.load() 掃描 layers/0–30，只讀 metadata / extent，不下載整座城市幾何。
        </p>
        <p style={{ color: "rgba(239,244,249,.72)" }}>
          板橋測試點：{BANQIAO.lon}, {BANQIAO.lat} · {running ? "掃描中…" : "掃描完成"}
        </p>

        {candidates.length > 0 && (
          <div style={{ margin: "16px 0", padding: 14, border: "1px solid rgba(120,226,154,.35)", borderRadius: 12, background: "rgba(120,226,154,.08)" }}>
            <strong>板橋 extent 候選：</strong> {candidates.map((row) => `layer ${row.id} (${row.title})`).join("、")}
          </div>
        )}

        <button className="clear-button" onClick={() => void copyText()} style={{ marginBottom: 14 }}>
          複製掃描結果
        </button>

        <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,.06)" }}>
                {['Layer','Status','Title','WKID','Extent','板橋'].map((h) => (
                  <th key={h} style={{ padding: 10, textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.1)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ background: row.containsBanqiao ? "rgba(120,226,154,.08)" : undefined }}>
                  <td style={{ padding: 9, borderBottom: "1px solid rgba(255,255,255,.06)" }}>{row.id}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid rgba(255,255,255,.06)" }}>{row.status}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid rgba(255,255,255,.06)" }}>{row.title ?? row.error ?? "—"}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid rgba(255,255,255,.06)" }}>{row.wkid ?? "—"}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid rgba(255,255,255,.06)", whiteSpace: "nowrap" }}>
                    {row.status === "OK" ? `${fmt(row.xmin)}, ${fmt(row.ymin)} → ${fmt(row.xmax)}, ${fmt(row.ymax)}` : "—"}
                  </td>
                  <td style={{ padding: 9, borderBottom: "1px solid rgba(255,255,255,.06)", fontWeight: row.containsBanqiao ? 800 : 400 }}>
                    {row.containsBanqiao === true ? "YES" : row.containsBanqiao === false ? "no" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
