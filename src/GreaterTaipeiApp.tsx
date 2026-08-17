import { useEffect, useMemo, useRef, useState } from "react";
import ArcGISMap from "@arcgis/core/Map.js";
import Basemap from "@arcgis/core/Basemap.js";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer.js";
import OpenStreetMapLayer from "@arcgis/core/layers/OpenStreetMapLayer.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import SceneView from "@arcgis/core/views/SceneView.js";
import { BUILDING_PROVIDERS } from "./providers/buildingProviders";

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

function makeAgeSymbol(color: string): any {
  return {
    type: "polygon-3d",
    symbolLayers: [
      {
        type: "extrude",
        material: { color },
        edges: { type: "solid", color: [73, 82, 94, 0.42], size: 0.45 },
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
    visualVariables: [{ type: "size", field: "height_m", valueUnit: "meters" }],
  };
}

export default function GreaterTaipeiApp() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<SceneView | null>(null);
  const taipeiRef = useRef<SceneLayer | null>(null);
  const newTaipeiRef = useRef<SceneLayer | null>(null);
  const cadastralRef = useRef<SceneLayer | null>(null);
  const ageRef = useRef<GeoJSONLayer | null>(null);

  const [status, setStatus] = useState("載入大台北 3D…");
  const [showTaipei, setShowTaipei] = useState(true);
  const [showNewTaipei, setShowNewTaipei] = useState(true);
  const [showCadastral, setShowCadastral] = useState(false);
  const [showAge, setShowAge] = useState(false);
  const [newTaipeiReady, setNewTaipeiReady] = useState(false);
  const [newTaipeiError, setNewTaipeiError] = useState<string | null>(null);
  const [ageReady, setAgeReady] = useState(false);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [ageFeatureCount, setAgeFeatureCount] = useState<number | null>(null);
  const [selectedAttributes, setSelectedAttributes] = useState<Attributes | null>(null);
  const [selectedLayerLabel, setSelectedLayerLabel] = useState<string | null>(null);

  const visibleAttributes = useMemo(() => {
    if (!selectedAttributes) return [];
    return Object.entries(selectedAttributes)
      .filter(([key]) => !key.toLowerCase().includes("shape"))
      .slice(0, 24);
  }, [selectedAttributes]);

  const statusText = useMemo(() => {
    const parts = [status];
    if (showTaipei) parts.push("台北 3D ON");
    if (showNewTaipei && newTaipeiReady) parts.push("新北 3D ON");
    if (showAge && ageReady) parts.push(`屋齡 ON${ageFeatureCount ? `（${ageFeatureCount.toLocaleString("zh-TW")} 棟）` : ""}`);
    if (newTaipeiError) parts.push("新北 3D ERR");
    if (ageError) parts.push("屋齡檔未載入");
    return parts.join(" · ");
  }, [status, showTaipei, showNewTaipei, newTaipeiReady, showAge, ageReady, ageFeatureCount, newTaipeiError, ageError]);

  useEffect(() => {
    if (taipeiRef.current) {
      taipeiRef.current.visible = showTaipei;
      taipeiRef.current.opacity = showAge ? 0.22 : 1;
    }
    if (newTaipeiRef.current) newTaipeiRef.current.visible = showNewTaipei && newTaipeiReady;
    if (cadastralRef.current) cadastralRef.current.visible = showCadastral;
    if (ageRef.current) ageRef.current.visible = showAge && ageReady;
  }, [showTaipei, showNewTaipei, newTaipeiReady, showCadastral, showAge, ageReady]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const taipeiProvider = BUILDING_PROVIDERS.taipeiLod1;
    const newTaipeiProvider = BUILDING_PROVIDERS.newTaipeiNlsc;
    const cadastralProvider = BUILDING_PROVIDERS.taipeiCadastral;

    const taipeiBuildings = new SceneLayer({
      url: taipeiProvider.url,
      title: taipeiProvider.label,
      outFields: ["*"],
      popupEnabled: false,
    });

    const newTaipeiBuildings = new SceneLayer({
      url: newTaipeiProvider.url,
      title: newTaipeiProvider.label,
      popupEnabled: false,
      visible: false,
      opacity: 0.94,
    });

    const cadastralBuildings = new SceneLayer({
      url: cadastralProvider.url,
      title: cadastralProvider.label,
      outFields: ["*"],
      popupEnabled: false,
      visible: false,
    });

    const ageBuildings = new GeoJSONLayer({
      url: AGE_GEOJSON_URL,
      title: "台北市建物屋齡（2001+ permit-joined subset）",
      outFields: ["*"],
      popupEnabled: false,
      visible: false,
      renderer: createAgeRenderer(),
      elevationInfo: { mode: "on-the-ground" },
    });

    taipeiRef.current = taipeiBuildings;
    newTaipeiRef.current = newTaipeiBuildings;
    cadastralRef.current = cadastralBuildings;
    ageRef.current = ageBuildings;

    const map = new ArcGISMap({
      basemap: new Basemap({ baseLayers: [new OpenStreetMapLayer()], title: "OpenStreetMap" }),
      layers: [newTaipeiBuildings, taipeiBuildings, cadastralBuildings, ageBuildings],
    });

    const view = new SceneView({
      container: mapContainerRef.current,
      map,
      qualityProfile: "high",
      camera: {
        position: { longitude: 121.51, latitude: 25.035, z: 3000 },
        heading: 345,
        tilt: 66,
      },
    });
    viewRef.current = view;

    let clickHandle: IHandle | null = null;
    let disposed = false;

    Promise.all([view.when(), taipeiBuildings.load(), cadastralBuildings.load()])
      .then(() => {
        if (disposed) return;
        setStatus("大台北主視圖已就緒");
        clickHandle = view.on("click", async (event) => {
          const response = await view.hitTest(event);
          const orderedLayers = [
            { layer: ageBuildings, label: "台北屋齡資料" },
            { layer: cadastralBuildings, label: "台北產權模型" },
            { layer: taipeiBuildings, label: "台北 3D 建築" },
            { layer: newTaipeiBuildings, label: "新北 3D 建築（NLSC）" },
          ];

          for (const candidate of orderedLayers) {
            const hit = response.results.find((result: any) => result.graphic?.layer === candidate.layer) as any | undefined;
            if (hit?.graphic?.attributes) {
              setSelectedAttributes(hit.graphic.attributes);
              setSelectedLayerLabel(candidate.label);
              return;
            }
          }

          setSelectedAttributes(null);
          setSelectedLayerLabel(null);
        });
      })
      .catch((error) => {
        console.error(error);
        if (!disposed) setStatus("台北 3D 載入失敗 · 請看 browser console");
      });

    newTaipeiBuildings
      .load()
      .then(() => {
        if (disposed) return;
        setNewTaipeiReady(true);
        setNewTaipeiError(null);
      })
      .catch((error) => {
        console.error("New Taipei NLSC layer failed to load", error);
        if (disposed) return;
        setNewTaipeiReady(false);
        setNewTaipeiError("NLSC 新北 3D 無法載入");
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
      taipeiRef.current = null;
      newTaipeiRef.current = null;
      cadastralRef.current = null;
      ageRef.current = null;
      view.destroy();
    };
  }, []);

  const jumpToBanqiao = async () => {
    const view = viewRef.current;
    if (!view) return;
    setStatus("正在移動到板橋…");
    try {
      await view.when();
      await view.goTo({ center: [121.4623, 25.0123], zoom: 15, heading: 20, tilt: 65 }, { duration: 1200 });
      setStatus("板橋視角已就位");
    } catch (error: any) {
      if (error?.name !== "AbortError") console.error("Banqiao goTo failed", error);
      setStatus(error?.name === "AbortError" ? "板橋移動已中止" : "板橋移動失敗");
    }
  };

  return (
    <main className="app-shell">
      <div ref={mapContainerRef} className="map-view" />

      <header className="glass top-bar">
        <div>
          <p className="eyebrow">TAIPEI-MAPS · GREATER TAIPEI v0.1 DEV</p>
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
            <p className="eyebrow">CITY LAYERS</p>
            <h2>大台北城市圖層</h2>
          </div>
          <button className="clear-button" onClick={() => void jumpToBanqiao()}>
            板橋定位
          </button>
        </div>

        <button className={`layer-card layer-button ${showTaipei ? "active" : ""}`} onClick={() => setShowTaipei((current) => !current)}>
          <div>
            <strong>台北 3D</strong>
            <span>臺北市都發局 · 2024 LOD1{showAge ? " · 屋齡開啟時淡化作背景" : ""}</span>
          </div>
          <span className={`layer-state ${showTaipei ? "on" : ""}`}>{showTaipei ? "ON" : "OFF"}</span>
        </button>

        <button
          className={`layer-card layer-button ${showNewTaipei ? "active" : ""}`}
          disabled={!newTaipeiReady}
          onClick={() => setShowNewTaipei((current) => !current)}
        >
          <div>
            <strong>新北 3D</strong>
            <span>
              {newTaipeiReady
                ? "國土測繪中心 NLSC · verified layer 5"
                : newTaipeiError
                  ? "新北 3D 載入失敗 · 請看 browser console"
                  : "正在載入新北 3D provider…"}
            </span>
          </div>
          <span className={`layer-state ${showNewTaipei ? "on" : ""}`}>
            {showNewTaipei && newTaipeiReady ? "ON" : newTaipeiReady ? "OFF" : newTaipeiError ? "ERR" : "WAIT"}
          </span>
        </button>

        <button className={`layer-card layer-button ${showCadastral ? "active" : ""}`} onClick={() => setShowCadastral((current) => !current)}>
          <div>
            <strong>台北產權細節</strong>
            <span>臺北市地政局 · 選配細部屬性</span>
          </div>
          <span className={`layer-state ${showCadastral ? "on" : ""}`}>{showCadastral ? "ON" : "OFF"}</span>
        </button>

        <button className={`layer-card layer-button age-layer ${showAge ? "active" : ""}`} disabled={!ageReady} onClick={() => setShowAge((current) => !current)}>
          <div>
            <strong>台北屋齡</strong>
            <span>
              {ageReady
                ? `官方建照套繪 × 使用執照 · 2001+${ageFeatureCount ? ` · ${ageFeatureCount.toLocaleString("zh-TW")} 棟` : ""}`
                : ageError
                  ? "尚未找到 generated building-age GeoJSON"
                  : "載入屋齡資料…"}
            </span>
          </div>
          <span className={`layer-state ${showAge ? "on" : ""}`}>{showAge ? "ON" : ageReady ? "OFF" : "WAIT"}</span>
        </button>

        {showAge && ageReady && (
          <div className="age-legend">
            <div className="legend-heading">
              <strong>屋齡色階</strong>
              <span>3D extrusion</span>
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
              灰色／未著色建築不是老屋；目前屋齡只涵蓋可精確 join 的 2001+ 子集。
            </div>
          </div>
        )}

        <div className="inspector-divider" />
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">BUILDING INSPECTOR</p>
            <h2>{selectedAttributes ? selectedLayerLabel ?? "建築資料" : "建築資訊"}</h2>
          </div>
          {selectedAttributes && <button className="clear-button" onClick={() => setSelectedAttributes(null)}>清除</button>}
        </div>

        {!selectedAttributes ? (
          <p className="empty-copy">點建築查看屬性。台北與新北現在是兩個明確 provider；屋齡目前只屬於台北分析層。</p>
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
          Taipei base: DUD LOD1_2024 · New Taipei base: NLSC I3S layer 5 · Age: Taipei permit-overlay × use-permit join · Detail: Taipei CadastralBuilding_2023
        </div>
      </aside>
    </main>
  );
}
