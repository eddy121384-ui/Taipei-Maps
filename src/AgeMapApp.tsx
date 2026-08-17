import { useEffect, useMemo, useRef, useState } from "react";
import ArcGISMap from "@arcgis/core/Map.js";
import Basemap from "@arcgis/core/Basemap.js";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer.js";
import OpenStreetMapLayer from "@arcgis/core/layers/OpenStreetMapLayer.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import SceneView from "@arcgis/core/views/SceneView.js";

const TAIPEI_LOD1_URL =
  "https://www.historygis.udd.gov.taipei/arcgis/rest/services/Hosted/LOD1_2024/SceneServer/layers/0";

const TAIPEI_CADASTRAL_URL =
  "https://3d.land.gov.taipei/arcgis/rest/services/Hosted/CadastralBuilding_2023/SceneServer/layers/0";

const NLSC_BUILDING_URL =
  "https://i3s.nlsc.gov.tw/building/i3s/SceneServer/layers/0";

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

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat("zh-TW").format(value);
  return String(value);
}

function makeAgeSymbol(color: string): any {
  return {
    type: "polygon-3d",
    symbolLayers: [
      {
        type: "extrude",
        material: { color },
        edges: {
          type: "solid",
          color: [73, 82, 94, 0.42],
          size: 0.45,
        },
      },
    ],
  };
}

function createAgeRenderer(): any {
  return {
    type: "unique-value",
    field: "age_bin",
    defaultSymbol: makeAgeSymbol("#cbd1d8"),
    defaultLabel: "其他 / 無資料",
    uniqueValueInfos: AGE_BINS.map((bin) => ({
      value: bin.value,
      label: bin.label,
      symbol: makeAgeSymbol(bin.color),
    })),
    visualVariables: [
      {
        type: "size",
        field: "height_m",
        valueUnit: "meters",
      },
    ],
  };
}

export default function AgeMapApp() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<SceneView | null>(null);
  const cityLayerRef = useRef<SceneLayer | null>(null);
  const nationalLayerRef = useRef<SceneLayer | null>(null);
  const cadastralLayerRef = useRef<SceneLayer | null>(null);
  const ageLayerRef = useRef<GeoJSONLayer | null>(null);

  const [status, setStatus] = useState("載入全市 3D 建築…");
  const [selectedAttributes, setSelectedAttributes] = useState<Attributes | null>(null);
  const [selectedLayerLabel, setSelectedLayerLabel] = useState<string | null>(null);

  const [showCity3D, setShowCity3D] = useState(true);
  const [showNational3D, setShowNational3D] = useState(false);
  const [showCadastral, setShowCadastral] = useState(false);
  const [showAgeOverlay, setShowAgeOverlay] = useState(false);
  const [nationalReady, setNationalReady] = useState(false);
  const [nationalError, setNationalError] = useState<string | null>(null);
  const [ageReady, setAgeReady] = useState(false);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [ageFeatureCount, setAgeFeatureCount] = useState<number | null>(null);

  const visibleAttributes = useMemo(() => {
    if (!selectedAttributes) return [];
    return Object.entries(selectedAttributes)
      .filter(([key]) => !key.toLowerCase().includes("shape"))
      .slice(0, 24);
  }, [selectedAttributes]);

  const statusText = useMemo(() => {
    if (showNational3D && nationalReady) return `${status} · NLSC 大台北 3D ON`;
    if (nationalError) return `${status} · NLSC 3D 測試失敗`;
    if (ageError) return `${status} · 屋齡檔未載入`;
    if (!ageReady) return `${status} · 準備屋齡 3D 圖層…`;
    if (showAgeOverlay) {
      return `${status} · 屋齡圖層 ON${ageFeatureCount ? `（${ageFeatureCount.toLocaleString("zh-TW")} 棟）` : ""}`;
    }
    return `${status} · 屋齡資料已就緒`;
  }, [status, nationalError, nationalReady, showNational3D, ageError, ageReady, showAgeOverlay, ageFeatureCount]);

  useEffect(() => {
    const cityLayer = cityLayerRef.current;
    const nationalLayer = nationalLayerRef.current;
    const cadastralLayer = cadastralLayerRef.current;
    const ageLayer = ageLayerRef.current;

    if (cityLayer) {
      cityLayer.visible = showCity3D;
      cityLayer.opacity = showAgeOverlay ? 0.22 : 1;
    }

    if (nationalLayer) nationalLayer.visible = showNational3D && nationalReady;
    if (cadastralLayer) cadastralLayer.visible = showCadastral;
    if (ageLayer) ageLayer.visible = showAgeOverlay && ageReady;
  }, [showCity3D, showNational3D, nationalReady, showCadastral, showAgeOverlay, ageReady]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const cityBuildings = new SceneLayer({
      url: TAIPEI_LOD1_URL,
      title: "臺北市全市積木模型（2024）",
      outFields: ["*"],
      popupEnabled: false,
    });

    const nationalBuildings = new SceneLayer({
      url: NLSC_BUILDING_URL,
      title: "國土測繪中心全國三維建物（NLSC I3S）",
      popupEnabled: false,
      visible: false,
      opacity: 0.94,
    });

    const cadastralBuildings = new SceneLayer({
      url: TAIPEI_CADASTRAL_URL,
      title: "臺北市三維產權建物",
      outFields: ["*"],
      popupEnabled: false,
      visible: false,
    });

    const ageBuildings = new GeoJSONLayer({
      url: AGE_GEOJSON_URL,
      title: "臺北市建物屋齡（2001+ permit-joined subset）",
      outFields: ["*"],
      popupEnabled: false,
      visible: false,
      renderer: createAgeRenderer(),
      elevationInfo: { mode: "on-the-ground" },
    });

    cityLayerRef.current = cityBuildings;
    nationalLayerRef.current = nationalBuildings;
    cadastralLayerRef.current = cadastralBuildings;
    ageLayerRef.current = ageBuildings;

    const basemap = new Basemap({
      baseLayers: [new OpenStreetMapLayer()],
      title: "OpenStreetMap",
    });

    const map = new ArcGISMap({
      basemap,
      layers: [nationalBuildings, cityBuildings, cadastralBuildings, ageBuildings],
    });

    const view = new SceneView({
      container: mapContainerRef.current,
      map,
      qualityProfile: "high",
      camera: {
        position: {
          longitude: 121.535,
          latitude: 25.045,
          z: 2600,
        },
        heading: 345,
        tilt: 66,
      },
    });
    viewRef.current = view;

    let clickHandle: IHandle | null = null;
    let disposed = false;

    Promise.all([view.when(), cityBuildings.load(), cadastralBuildings.load()])
      .then(() => {
        if (disposed) return;
        setStatus("全市 3D 建築已載入");

        clickHandle = view.on("click", async (event) => {
          const response = await view.hitTest(event);

          const ageHit = response.results.find(
            (result: any) => result.graphic?.layer === ageBuildings,
          ) as any | undefined;
          const cadastralHit = response.results.find(
            (result: any) => result.graphic?.layer === cadastralBuildings,
          ) as any | undefined;
          const cityHit = response.results.find(
            (result: any) => result.graphic?.layer === cityBuildings,
          ) as any | undefined;
          const nationalHit = response.results.find(
            (result: any) => result.graphic?.layer === nationalBuildings,
          ) as any | undefined;

          const chosen = ageHit ?? cadastralHit ?? cityHit ?? nationalHit;

          if (!chosen?.graphic?.attributes) {
            setSelectedAttributes(null);
            setSelectedLayerLabel(null);
            return;
          }

          setSelectedAttributes(chosen.graphic.attributes);
          if (chosen.graphic.layer === ageBuildings) {
            setSelectedLayerLabel("屋齡套繪資料");
          } else if (chosen.graphic.layer === cadastralBuildings) {
            setSelectedLayerLabel("產權模型屬性");
          } else if (chosen.graphic.layer === nationalBuildings) {
            setSelectedLayerLabel("NLSC 全國 3D 建物屬性");
          } else {
            setSelectedLayerLabel("全市白模屬性");
          }
        });
      })
      .catch((error) => {
        console.error(error);
        if (!disposed) setStatus("3D 建築載入失敗，請查看瀏覽器 console");
      });

    nationalBuildings
      .load()
      .then(() => {
        if (disposed) return;
        setNationalReady(true);
        setNationalError(null);
      })
      .catch((error) => {
        console.error("NLSC I3S building layer failed to load", error);
        if (disposed) return;
        setNationalReady(false);
        setNationalError("NLSC I3S 無法載入");
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
        console.error("Building-age GeoJSON failed to load", error);
        if (disposed) return;
        setAgeReady(false);
        setAgeError("找不到 generated building-age GeoJSON");
      });

    return () => {
      disposed = true;
      clickHandle?.remove();
      viewRef.current = null;
      cityLayerRef.current = null;
      nationalLayerRef.current = null;
      cadastralLayerRef.current = null;
      ageLayerRef.current = null;
      view.destroy();
    };
  }, []);

  const jumpToBanqiao = () => {
    const view = viewRef.current;
    if (!view) return;
    void view.goTo(
      {
        position: {
          longitude: 121.4623,
          latitude: 25.0123,
          z: 1900,
        },
        heading: 20,
        tilt: 65,
      },
      { duration: 1200 },
    );
  };

  return (
    <main className="app-shell">
      <div ref={mapContainerRef} className="map-view" />

      <header className="glass top-bar">
        <div>
          <p className="eyebrow">TAIPEI-MAPS · v0.0.5 PROVIDER SPIKE</p>
          <h1>3D Greater Taipei</h1>
        </div>
        <div className="status-dot-wrap">
          <span className="status-dot" />
          <span>{statusText}</span>
        </div>
      </header>

      <aside className="glass info-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">3D LAYERS</p>
            <h2>台北＋新北建築圖層</h2>
          </div>
          <button className="clear-button" onClick={jumpToBanqiao}>
            板橋測試
          </button>
        </div>

        <button
          className={`layer-card layer-button ${showCity3D ? "active" : ""}`}
          onClick={() => setShowCity3D((current) => !current)}
        >
          <div>
            <strong>台北市 3D 建築</strong>
            <span>
              2024 LOD1 · 都發局
              {showAgeOverlay ? " · 屋齡開啟時自動淡化作為背景" : ""}
            </span>
          </div>
          <span className={`layer-state ${showCity3D ? "on" : ""}`}>
            {showCity3D ? "ON" : "OFF"}
          </span>
        </button>

        <button
          className={`layer-card layer-button ${showNational3D ? "active" : ""}`}
          disabled={!nationalReady}
          onClick={() => setShowNational3D((current) => !current)}
        >
          <div>
            <strong>大台北 / 全國 3D（NLSC）</strong>
            <span>
              {nationalReady
                ? "國土測繪中心 · OGC I3S · 新北覆蓋測試"
                : nationalError
                  ? "NLSC I3S 載入失敗 · 請看 browser console"
                  : "正在測試 NLSC 全國三維建物服務…"}
            </span>
          </div>
          <span className={`layer-state ${showNational3D ? "on" : ""}`}>
            {showNational3D ? "ON" : nationalReady ? "OFF" : nationalError ? "ERR" : "WAIT"}
          </span>
        </button>

        {showNational3D && (
          <div className="age-source-note warning">
            NLSC 是全國建物層，台北市範圍會和 LOD1 重疊；比較新北時可先把「台北市 3D 建築」關掉，再按「板橋測試」。
          </div>
        )}

        <button
          className={`layer-card layer-button ${showCadastral ? "active" : ""}`}
          onClick={() => {
            setShowCadastral((current) => !current);
            setSelectedAttributes(null);
          }}
        >
          <div>
            <strong>台北產權模型</strong>
            <span>地政局 · 門牌 / 層數等細部屬性</span>
          </div>
          <span className={`layer-state ${showCadastral ? "on" : ""}`}>
            {showCadastral ? "ON" : "OFF"}
          </span>
        </button>

        <button
          className={`layer-card layer-button age-layer ${showAgeOverlay ? "active" : ""}`}
          disabled={!ageReady}
          onClick={() => setShowAgeOverlay((current) => !current)}
        >
          <div>
            <strong>台北屋齡圖層</strong>
            <span>
              {ageReady
                ? `官方建照套繪 × 使用執照 · 2001+${ageFeatureCount ? ` · ${ageFeatureCount.toLocaleString("zh-TW")} 棟` : ""}`
                : ageError
                  ? "尚未找到 public/generated/building_age_2001plus.geojson"
                  : "載入 permit-joined 3D GeoJSON…"}
            </span>
          </div>
          <span className={`layer-state ${showAgeOverlay ? "on" : ""}`}>
            {showAgeOverlay ? "ON" : ageReady ? "OFF" : "WAIT"}
          </span>
        </button>

        {showAgeOverlay && ageReady && (
          <div className="age-legend">
            <div className="legend-heading">
              <strong>屋齡色階</strong>
              <span>polygon 依真實 / 推估高度 3D extrusion</span>
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
              灰色背景建築不代表老屋；目前著色只涵蓋 permit-overlay 可精確 join 的 2001+ 子集。
            </div>
          </div>
        )}

        <div className="inspector-divider" />

        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">BUILDING INSPECTOR</p>
            <h2>{selectedAttributes ? selectedLayerLabel ?? "建築原始資料" : "建築資訊"}</h2>
          </div>
          {selectedAttributes && (
            <button className="clear-button" onClick={() => setSelectedAttributes(null)}>
              清除
            </button>
          )}
        </div>

        {!selectedAttributes ? (
          <p className="empty-copy">
            點選建築查看屬性。NLSC 目前先當作新北 / 全國 geometry provider spike；台北屋齡圖層仍優先命中 permit-joined polygon。
          </p>
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

        {ageReady ? (
          <div className="age-source-note">
            台北屋齡來源：官方建照套繪 polygon × 歷史使用執照 permit-key exact join；目前為 2001+ 驗證層。
          </div>
        ) : (
          <div className="age-source-note warning">
            {ageError
              ? "屋齡 GeoJSON 尚未存在。新版 start-taipei-maps.bat 會自動補資料。"
              : "正在載入屋齡 GeoJSON…"}
          </div>
        )}

        <div className="source-note">
          Taipei 3D: 都發局 LOD1_2024 · New Taipei / national spike: NLSC I3S · Age subset: 建照套繪 × 使用執照 · Detail: 台北地政局 CadastralBuilding_2023
        </div>
      </aside>
    </main>
  );
}

interface IHandle {
  remove(): void;
}
