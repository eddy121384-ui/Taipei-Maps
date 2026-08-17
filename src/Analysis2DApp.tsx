import { useEffect, useMemo, useRef, useState } from "react";
import ArcGISMap from "@arcgis/core/Map.js";
import Basemap from "@arcgis/core/Basemap.js";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer.js";
import OpenStreetMapLayer from "@arcgis/core/layers/OpenStreetMapLayer.js";
import MapView from "@arcgis/core/views/MapView.js";

const AGE_GEOJSON_URL = "/generated/building_age_2001plus.geojson";

const AGE_BINS = [
  { value: "0-10", label: "0–10 年", color: "#73b7ff" },
  { value: "10-20", label: "10–20 年", color: "#66d4a9" },
  { value: "20-30", label: "20–30 年", color: "#d4dc63" },
  { value: "30-40", label: "30–40 年", color: "#f0b45a" },
  { value: "40-50", label: "40–50 年", color: "#ea7d49" },
  { value: "50+", label: "50+ 年", color: "#d14b4b" },
] as const;

type Attributes = Record<string, unknown>;

interface IHandle {
  remove(): void;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat("zh-TW").format(value);
  return String(value);
}

function makeFlatAgeSymbol(color: string): any {
  return {
    type: "simple-fill",
    color,
    outline: {
      color: [60, 69, 80, 0.38],
      width: 0.45,
    },
  };
}

function createFlatAgeRenderer(): any {
  return {
    type: "unique-value",
    field: "age_bin",
    defaultSymbol: makeFlatAgeSymbol("#cbd1d8"),
    defaultLabel: "其他 / 無資料",
    uniqueValueInfos: AGE_BINS.map((bin) => ({
      value: bin.value,
      label: bin.label,
      symbol: makeFlatAgeSymbol(bin.color),
    })),
  };
}

function readInitialView() {
  const params = new URLSearchParams(window.location.search);
  const lon = Number(params.get("lon"));
  const lat = Number(params.get("lat"));
  const zoom = Number(params.get("zoom"));

  return {
    center:
      Number.isFinite(lon) && Number.isFinite(lat)
        ? ([lon, lat] as [number, number])
        : ([121.51, 25.035] as [number, number]),
    zoom: Number.isFinite(zoom) ? zoom : 13,
  };
}

export default function Analysis2DApp() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const ageRef = useRef<GeoJSONLayer | null>(null);

  const [status, setStatus] = useState("載入 2D 分析地圖…");
  const [showAge, setShowAge] = useState(false);
  const [ageReady, setAgeReady] = useState(false);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [ageFeatureCount, setAgeFeatureCount] = useState<number | null>(null);
  const [selectedAttributes, setSelectedAttributes] = useState<Attributes | null>(null);

  const visibleAttributes = useMemo(() => {
    if (!selectedAttributes) return [];
    return Object.entries(selectedAttributes)
      .filter(([key]) => !key.toLowerCase().includes("shape"))
      .slice(0, 20);
  }, [selectedAttributes]);

  const statusText = useMemo(() => {
    const parts = [status, "2D ANALYSIS"];
    if (showAge && ageReady) {
      parts.push(`屋齡 ON${ageFeatureCount ? `（${ageFeatureCount.toLocaleString("zh-TW")} 棟）` : ""}`);
    }
    if (ageError) parts.push("屋齡檔未載入");
    return parts.join(" · ");
  }, [status, showAge, ageReady, ageFeatureCount, ageError]);

  useEffect(() => {
    if (ageRef.current) ageRef.current.visible = showAge && ageReady;
  }, [showAge, ageReady]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initial = readInitialView();
    const ageBuildings = new GeoJSONLayer({
      url: AGE_GEOJSON_URL,
      title: "台北市建物屋齡（2D · 2001+ permit-joined subset）",
      outFields: ["*"],
      popupEnabled: false,
      visible: false,
      opacity: 0.76,
      renderer: createFlatAgeRenderer(),
    });
    ageRef.current = ageBuildings;

    const map = new ArcGISMap({
      basemap: new Basemap({
        baseLayers: [new OpenStreetMapLayer()],
        title: "OpenStreetMap",
      }),
      layers: [ageBuildings],
    });

    const view = new MapView({
      container: mapContainerRef.current,
      map,
      center: initial.center,
      zoom: initial.zoom,
      constraints: { rotationEnabled: false },
    });
    viewRef.current = view;

    let clickHandle: IHandle | null = null;
    let disposed = false;

    view
      .when()
      .then(() => {
        if (disposed) return;
        setStatus("2D 分析地圖已就緒");
        clickHandle = view.on("click", async (event) => {
          const response = await view.hitTest(event);
          const ageHit = response.results.find(
            (result: any) => result.graphic?.layer === ageBuildings,
          ) as any | undefined;

          setSelectedAttributes(ageHit?.graphic?.attributes ?? null);
        });
      })
      .catch((error) => {
        console.error(error);
        if (!disposed) setStatus("2D 地圖載入失敗 · 請看 browser console");
      });

    ageBuildings
      .load()
      .then(async () => {
        if (disposed) return;
        const count = await ageBuildings.queryFeatureCount().catch(() => null);
        if (disposed) return;
        setAgeFeatureCount(count);
        setAgeReady(true);
        setAgeError(null);
      })
      .catch((error) => {
        console.error("2D building-age GeoJSON failed to load", error);
        if (disposed) return;
        setAgeReady(false);
        setAgeError("找不到 generated building-age GeoJSON");
      });

    return () => {
      disposed = true;
      clickHandle?.remove();
      viewRef.current = null;
      ageRef.current = null;
      view.destroy();
    };
  }, []);

  const switchTo3D = () => {
    const params = new URLSearchParams(window.location.search);
    const view = viewRef.current;
    params.set("mode", "3d");
    if (view?.center) {
      params.set("lon", view.center.longitude.toFixed(6));
      params.set("lat", view.center.latitude.toFixed(6));
      params.set("zoom", view.zoom.toFixed(2));
    }
    window.location.search = params.toString();
  };

  return (
    <main className="app-shell">
      <div ref={mapContainerRef} className="map-view" />

      <header className="glass top-bar">
        <div>
          <p className="eyebrow">TAIPEI-MAPS · GREATER TAIPEI v0.1 DEV</p>
          <h1>Greater Taipei Analysis Map</h1>
        </div>
        <div className="status-dot-wrap">
          <span className="status-dot" />
          <span>{statusText}</span>
        </div>
      </header>

      <aside className="glass info-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">PRESENTATION</p>
            <h2>分析視角</h2>
          </div>
        </div>

        <div className="mode-switch" aria-label="Map presentation mode">
          <button className="mode-button active" type="button">2D 分析</button>
          <button className="mode-button" type="button" onClick={switchTo3D}>3D 城市</button>
        </div>

        <div className="age-source-note">
          2D 是預設分析模式：目前不載入台北／新北 3D SceneLayer，只保留底圖與分析資料。3D 需要時再開。
        </div>

        <div className="inspector-divider" />

        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">DATA LENSES</p>
            <h2>資料圖層</h2>
          </div>
        </div>

        <button
          className={`layer-card layer-button age-layer ${showAge ? "active" : ""}`}
          disabled={!ageReady}
          onClick={() => setShowAge((current) => !current)}
        >
          <div>
            <strong>屋齡 · 建築平面</strong>
            <span>
              {ageReady
                ? `平面 footprint 著色 · 2001+${ageFeatureCount ? ` · ${ageFeatureCount.toLocaleString("zh-TW")} 棟` : ""}`
                : ageError
                  ? "尚未找到 generated building-age GeoJSON"
                  : "載入屋齡資料…"}
            </span>
          </div>
          <span className={`layer-state ${showAge ? "on" : ""}`}>
            {showAge ? "ON" : ageReady ? "OFF" : "WAIT"}
          </span>
        </button>

        <div className="layer-card planned-card">
          <div>
            <strong>屋齡 · 街廓</strong>
            <span>下一階段：街廓中位屋齡 / 老屋比例 choropleth</span>
          </div>
          <span className="layer-state">NEXT</span>
        </div>

        {showAge && ageReady && (
          <div className="age-legend">
            <div className="legend-heading">
              <strong>屋齡色階</strong>
              <span>2D polygon fill</span>
            </div>
            <div className="legend-list">
              {AGE_BINS.map((bin) => (
                <div className="legend-row" key={bin.value}>
                  <span className="legend-swatch" style={{ background: bin.color }} />
                  <span>{bin.label}</span>
                </div>
              ))}
            </div>
            <div className="age-source-note warning">
              未著色建築不是老屋；目前仍只涵蓋可精確 join 的 2001+ 子集。
            </div>
          </div>
        )}

        <div className="inspector-divider" />

        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">INSPECTOR</p>
            <h2>{selectedAttributes ? "屋齡資料" : "位置資訊"}</h2>
          </div>
          {selectedAttributes && (
            <button className="clear-button" onClick={() => setSelectedAttributes(null)}>清除</button>
          )}
        </div>

        {!selectedAttributes ? (
          <p className="empty-copy">開啟屋齡後可點平面建築查看原始屬性。街廓版完成後，這裡會改成更適合一般人的區段摘要。</p>
        ) : (
          <dl className="attribute-list">
            {visibleAttributes.map(([key, value]) => (
              <div className="attribute-row" key={key}>
                <dt>{key}</dt>
                <dd>{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="source-note">
          Basemap: OpenStreetMap · Age: Taipei permit-overlay × use-permit exact join · Presentation: 2D MapView
        </div>
      </aside>
    </main>
  );
}
