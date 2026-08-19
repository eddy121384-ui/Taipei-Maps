import { useEffect, useMemo, useRef, useState } from "react";
import ArcGISMap from "@arcgis/core/Map.js";
import Basemap from "@arcgis/core/Basemap.js";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer.js";
import OpenStreetMapLayer from "@arcgis/core/layers/OpenStreetMapLayer.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import SceneView from "@arcgis/core/views/SceneView.js";
import GlobalBuildingMap, { type MapCamera } from "./GlobalBuildingMap";
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

const GREATER_TAIPEI_BOUNDS = {
  west: 121.25,
  east: 122.05,
  south: 24.63,
  north: 25.32,
};

type Attributes = Record<string, unknown>;

interface IHandle {
  remove(): void;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat("zh-TW").format(value);
  return String(value);
}

function isInsideGreaterTaipei(center: [number, number]) {
  const [longitude, latitude] = center;
  return (
    longitude >= GREATER_TAIPEI_BOUNDS.west &&
    longitude <= GREATER_TAIPEI_BOUNDS.east &&
    latitude >= GREATER_TAIPEI_BOUNDS.south &&
    latitude <= GREATER_TAIPEI_BOUNDS.north
  );
}

function sceneCamera(view: SceneView): MapCamera | null {
  const center = view.center;
  const longitude = center?.longitude;
  const latitude = center?.latitude;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;

  return {
    center: [longitude as number, latitude as number],
    zoom: Number.isFinite(view.zoom) ? view.zoom : 12,
    pitch: Math.min(view.camera?.tilt ?? 55, 75),
    bearing: view.camera?.heading ?? 0,
  };
}

function createNeutralBuildingRenderer(): any {
  return {
    type: "simple",
    symbol: {
      type: "mesh-3d",
      symbolLayers: [
        {
          type: "fill",
          material: {
            color: "#e5e9ee",
            colorMixMode: "replace",
          },
          edges: {
            type: "solid",
            color: [74, 82, 92, 0.36],
            size: 0.45,
          },
        },
      ],
    },
  };
}

function makeAge3DSymbol(color: string): any {
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

function makeAgeFlatSymbol(color: string): any {
  return {
    type: "simple-fill",
    color,
    outline: {
      color: [66, 74, 84, 0.5],
      width: 0.55,
    },
  };
}

function createAgeRenderer(use3D: boolean): any {
  const symbol = use3D ? makeAge3DSymbol : makeAgeFlatSymbol;

  return {
    type: "unique-value",
    field: "age_bin",
    defaultSymbol: symbol("#cbd1d8"),
    defaultLabel: "其他 / 無資料",
    uniqueValueInfos: AGE_BINS.map((bin) => ({
      value: bin.value,
      label: bin.label,
      symbol: symbol(bin.color),
    })),
    ...(use3D
      ? {
          visualVariables: [{ type: "size", field: "height_m", valueUnit: "meters" }],
        }
      : {}),
  };
}

export default function GreaterTaipeiApp() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<SceneView | null>(null);
  const taipeiRef = useRef<SceneLayer | null>(null);
  const newTaipeiRef = useRef<SceneLayer | null>(null);
  const cadastralRef = useRef<SceneLayer | null>(null);
  const ageRef = useRef<GeoJSONLayer | null>(null);
  const globalModeRef = useRef(false);

  const [status, setStatus] = useState("載入大台北地圖…");
  const [show3DBuildings, setShow3DBuildings] = useState(true);
  const [showCadastral, setShowCadastral] = useState(false);
  const [showAge, setShowAge] = useState(false);
  const [newTaipeiReady, setNewTaipeiReady] = useState(false);
  const [newTaipeiError, setNewTaipeiError] = useState<string | null>(null);
  const [ageReady, setAgeReady] = useState(false);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [ageFeatureCount, setAgeFeatureCount] = useState<number | null>(null);
  const [selectedAttributes, setSelectedAttributes] = useState<Attributes | null>(null);
  const [selectedLayerLabel, setSelectedLayerLabel] = useState<string | null>(null);

  const [globalMode, setGlobalMode] = useState(false);
  const [globalReady, setGlobalReady] = useState(false);
  const [globalRelease, setGlobalRelease] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalTargetCamera, setGlobalTargetCamera] = useState<MapCamera | null>(null);

  const visibleAttributes = useMemo(() => {
    if (!selectedAttributes) return [];
    return Object.entries(selectedAttributes)
      .filter(([key]) => !key.toLowerCase().includes("shape"))
      .slice(0, 24);
  }, [selectedAttributes]);

  const statusText = useMemo(() => {
    if (globalMode) {
      const parts = [
        globalError
          ? "全球 Overture ERR"
          : globalReady
            ? `全球 Overture ${globalRelease ?? ""}`
            : "全球 Overture 載入中…",
        "Globe",
        show3DBuildings ? "3D 建築 ON" : "3D 建築 OFF",
      ];
      return parts.join(" · ");
    }

    const parts = [status, show3DBuildings ? "3D 建築 ON" : "3D 建築 OFF"];
    if (showAge && ageReady) {
      parts.push(
        `屋齡 ON${ageFeatureCount ? `（${ageFeatureCount.toLocaleString("zh-TW")} 棟）` : ""}`,
      );
    }
    if (newTaipeiError) parts.push("新北 3D ERR");
    if (ageError) parts.push("屋齡檔未載入");
    return parts.join(" · ");
  }, [
    globalMode,
    globalError,
    globalReady,
    globalRelease,
    status,
    show3DBuildings,
    showAge,
    ageReady,
    ageFeatureCount,
    newTaipeiError,
    ageError,
  ]);

  useEffect(() => {
    globalModeRef.current = globalMode;
  }, [globalMode]);

  useEffect(() => {
    if (taipeiRef.current) {
      taipeiRef.current.visible = show3DBuildings;
      taipeiRef.current.opacity = show3DBuildings && showAge ? 0.22 : 1;
    }

    if (newTaipeiRef.current) {
      newTaipeiRef.current.visible = show3DBuildings && newTaipeiReady;
      newTaipeiRef.current.opacity = show3DBuildings && showAge ? 0.28 : 0.94;
    }

    if (cadastralRef.current) {
      cadastralRef.current.visible = show3DBuildings && showCadastral;
    }

    if (ageRef.current) {
      ageRef.current.visible = showAge && ageReady;
      ageRef.current.renderer = createAgeRenderer(show3DBuildings);
      ageRef.current.opacity = show3DBuildings ? 1 : 0.76;
    }
  }, [show3DBuildings, showCadastral, showAge, ageReady, newTaipeiReady]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const taipeiProvider = BUILDING_PROVIDERS.taipeiLod1;
    const newTaipeiProvider = BUILDING_PROVIDERS.newTaipeiNlsc;
    const cadastralProvider = BUILDING_PROVIDERS.taipeiCadastral;
    const neutralBuildingRenderer = createNeutralBuildingRenderer();

    const taipeiBuildings = new SceneLayer({
      url: taipeiProvider.url,
      title: taipeiProvider.label,
      outFields: ["*"],
      popupEnabled: false,
      renderer: neutralBuildingRenderer,
    });

    const newTaipeiBuildings = new SceneLayer({
      url: newTaipeiProvider.url,
      title: newTaipeiProvider.label,
      popupEnabled: false,
      visible: false,
      opacity: 0.94,
      renderer: createNeutralBuildingRenderer(),
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
      renderer: createAgeRenderer(true),
      elevationInfo: { mode: "on-the-ground" },
    });

    taipeiRef.current = taipeiBuildings;
    newTaipeiRef.current = newTaipeiBuildings;
    cadastralRef.current = cadastralBuildings;
    ageRef.current = ageBuildings;

    const map = new ArcGISMap({
      basemap: new Basemap({
        baseLayers: [new OpenStreetMapLayer()],
        title: "OpenStreetMap",
      }),
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
    let stationaryHandle: IHandle | null = null;
    let disposed = false;

    Promise.all([view.when(), taipeiBuildings.load(), cadastralBuildings.load()])
      .then(() => {
        if (disposed) return;
        setStatus("大台北主視圖已就緒");

        stationaryHandle = view.watch("stationary", (stationary) => {
          if (!stationary || disposed || globalModeRef.current) return;
          const camera = sceneCamera(view);
          if (!camera || isInsideGreaterTaipei(camera.center)) return;

          globalModeRef.current = true;
          setGlobalTargetCamera(camera);
          setSelectedAttributes(null);
          setSelectedLayerLabel(null);
          setGlobalMode(true);
        });

        clickHandle = view.on("click", async (event) => {
          const response = await view.hitTest(event);
          const orderedLayers = [
            { layer: ageBuildings, label: "台北屋齡資料" },
            { layer: cadastralBuildings, label: "台北產權模型" },
            { layer: taipeiBuildings, label: "台北 3D 建築" },
            { layer: newTaipeiBuildings, label: "新北 3D 建築（NLSC）" },
          ];

          for (const candidate of orderedLayers) {
            const hit = response.results.find(
              (result: any) => result.graphic?.layer === candidate.layer,
            ) as any | undefined;

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
      stationaryHandle?.remove();
      viewRef.current = null;
      taipeiRef.current = null;
      newTaipeiRef.current = null;
      cadastralRef.current = null;
      ageRef.current = null;
      view.destroy();
    };
  }, []);

  const handoffToLocal = async (camera: MapCamera) => {
    globalModeRef.current = false;
    const view = viewRef.current;

    if (view) {
      try {
        await view.goTo(
          {
            center: camera.center,
            zoom: camera.zoom,
            heading: camera.bearing,
            tilt: Math.min(camera.pitch, 75),
          },
          { duration: 0 },
        );
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          console.error("Global → Greater Taipei camera handoff failed", error);
        }
      }
    }

    setGlobalMode(false);
    setGlobalTargetCamera(null);
    setSelectedAttributes(null);
    setSelectedLayerLabel(null);
  };

  const handleGlobalCameraChange = (camera: MapCamera) => {
    if (globalModeRef.current && isInsideGreaterTaipei(camera.center)) {
      void handoffToLocal(camera);
    }
  };

  const jumpToBanqiao = async () => {
    const camera: MapCamera = {
      center: [121.4623, 25.0123],
      zoom: 15,
      pitch: 65,
      bearing: 20,
    };

    if (globalModeRef.current) {
      await handoffToLocal(camera);
      setStatus("板橋視角已就位");
      return;
    }

    const view = viewRef.current;
    if (!view) return;

    setStatus("正在移動到板橋…");
    try {
      await view.when();
      await view.goTo(
        { center: camera.center, zoom: camera.zoom, heading: camera.bearing, tilt: camera.pitch },
        { duration: 1200 },
      );
      setStatus("板橋視角已就位");
    } catch (error: any) {
      if (error?.name !== "AbortError") console.error("Banqiao goTo failed", error);
      setStatus(error?.name === "AbortError" ? "板橋移動已中止" : "板橋移動失敗");
    }
  };

  return (
    <main className="app-shell">
      <div
        ref={mapContainerRef}
        className="map-view"
        style={{ visibility: globalMode ? "hidden" : "visible" }}
        aria-hidden={globalMode}
      />

      <GlobalBuildingMap
        visible={globalMode}
        showBuildings={show3DBuildings}
        targetCamera={globalTargetCamera}
        onReady={(release) => {
          setGlobalReady(true);
          setGlobalRelease(release);
          setGlobalError(null);
        }}
        onError={(message) => setGlobalError(message)}
        onCameraChange={handleGlobalCameraChange}
        onInspect={(attributes) => {
          setSelectedAttributes(attributes);
          setSelectedLayerLabel("全球 Overture 建築");
        }}
      />

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
            <p className="eyebrow">MAP LAYERS</p>
            <h2>大台北地圖圖層</h2>
          </div>
          <button className="clear-button" onClick={() => void jumpToBanqiao()}>
            板橋定位
          </button>
        </div>

        <button
          className={`layer-card layer-button ${show3DBuildings ? "active" : ""}`}
          onClick={() => setShow3DBuildings((current) => !current)}
        >
          <div>
            <strong>3D 建築</strong>
            <span>
              大台北官方白模；離開大台北後 Overture 全球建築在同一畫面自動接手
            </span>
          </div>
          <span className={`layer-state ${show3DBuildings ? "on" : ""}`}>
            {show3DBuildings ? "ON" : "OFF"}
          </span>
        </button>

        <button
          className={`layer-card layer-button ${showCadastral ? "active" : ""}`}
          disabled={!show3DBuildings || globalMode}
          onClick={() => setShowCadastral((current) => !current)}
        >
          <div>
            <strong>台北產權細節</strong>
            <span>
              {globalMode
                ? "僅大台北本地模式"
                : show3DBuildings
                  ? "臺北市地政局 · 選配細部 3D 屬性"
                  : "3D 建築關閉時暫停顯示"}
            </span>
          </div>
          <span className={`layer-state ${showCadastral && show3DBuildings && !globalMode ? "on" : ""}`}>
            {showCadastral && show3DBuildings && !globalMode ? "ON" : "OFF"}
          </span>
        </button>

        <div className={`layer-card ${globalMode ? "active" : ""}`}>
          <div>
            <strong>全球 3D fallback</strong>
            <span>
              {globalMode
                ? `Overture ${globalRelease ?? "載入中"} · MapLibre globe`
                : "AUTO · 離開大台北範圍後自動接手，不開新分頁"}
            </span>
          </div>
          <span className={`layer-state ${globalMode ? "on" : ""}`}>
            {globalMode ? "ACTIVE" : "AUTO"}
          </span>
        </div>

        {globalError ? <p className="warning-text">全球 Overture：{globalError}</p> : null}

        <div className="inspector-divider" />

        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">DATA LENSES</p>
            <h2>分析圖層</h2>
          </div>
        </div>

        <button
          className={`layer-card layer-button age-layer ${showAge ? "active" : ""}`}
          disabled={!ageReady || globalMode}
          onClick={() => setShowAge((current) => !current)}
        >
          <div>
            <strong>台北屋齡</strong>
            <span>
              {globalMode
                ? "僅大台北本地模式"
                : ageReady
                  ? `${show3DBuildings ? "3D 建物著色" : "平面 footprint"} · 2001+${ageFeatureCount ? ` · ${ageFeatureCount.toLocaleString("zh-TW")} 棟` : ""}`
                  : ageError
                    ? "尚未找到 generated building-age GeoJSON"
                    : "載入屋齡資料…"}
            </span>
          </div>
          <span className={`layer-state ${showAge && !globalMode ? "on" : ""}`}>
            {showAge && !globalMode ? "ON" : ageReady ? "OFF" : "WAIT"}
          </span>
        </button>

        <div className="layer-card" style={{ opacity: 0.58 }}>
          <div>
            <strong>屋齡 · 街廓</strong>
            <span>下一階段：街廓中位屋齡 / 老屋比例 choropleth</span>
          </div>
          <span className="layer-state">NEXT</span>
        </div>

        {showAge && ageReady && !globalMode && (
          <div className="age-legend">
            <div className="legend-heading">
              <strong>屋齡色階</strong>
              <span>{show3DBuildings ? "3D 建物著色" : "平面 footprint"}</span>
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
              未著色區域不是老屋；目前屋齡只涵蓋可精確 join 的 2001+ 子集。
            </div>
          </div>
        )}

        <div className="inspector-divider" />

        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">INSPECTOR</p>
            <h2>{selectedAttributes ? selectedLayerLabel ?? "地圖資料" : "位置資訊"}</h2>
          </div>
          {selectedAttributes && (
            <button className="clear-button" onClick={() => setSelectedAttributes(null)}>
              清除
            </button>
          )}
        </div>

        {!selectedAttributes ? (
          <p className="empty-copy">
            同一張地圖：大台北優先使用官方白模；離開本地 coverage 後自動 fallback 到全球 Overture。分析圖層仍與 3D 幾何分離。
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

        <div className="source-note">
          Basemap: OpenStreetMap · Greater Taipei local 3D: Taipei DUD LOD1_2024 + New Taipei NLSC layer 5 · Global fallback: Overture PMTiles + MapLibre globe · Age: Taipei permit-overlay × use-permit join
        </div>
      </aside>
    </main>
  );
}
