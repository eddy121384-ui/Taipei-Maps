import { useEffect, useMemo, useRef, useState } from "react";
import ArcGISMap from "@arcgis/core/Map.js";
import Basemap from "@arcgis/core/Basemap.js";
import OpenStreetMapLayer from "@arcgis/core/layers/OpenStreetMapLayer.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import SceneView from "@arcgis/core/views/SceneView.js";
import { BUILDING_PROVIDERS } from "./providers/buildingProviders";

type Attributes = Record<string, unknown>;

interface IHandle {
  remove(): void;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat("zh-TW").format(value);
  return String(value);
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
            color: "#e7ebef",
            colorMixMode: "replace",
          },
          edges: {
            type: "solid",
            color: [78, 87, 98, 0.34],
            size: 0.45,
          },
        },
      ],
    },
  };
}

export default function GreaterTaipeiApp() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<SceneView | null>(null);
  const taipeiRef = useRef<SceneLayer | null>(null);
  const newTaipeiRef = useRef<SceneLayer | null>(null);
  const cadastralRef = useRef<SceneLayer | null>(null);

  const [status, setStatus] = useState("載入大台北地圖…");
  const [show3DBuildings, setShow3DBuildings] = useState(true);
  const [showCadastral, setShowCadastral] = useState(false);
  const [newTaipeiReady, setNewTaipeiReady] = useState(false);
  const [newTaipeiError, setNewTaipeiError] = useState<string | null>(null);
  const [selectedAttributes, setSelectedAttributes] = useState<Attributes | null>(null);
  const [selectedLayerLabel, setSelectedLayerLabel] = useState<string | null>(null);

  const visibleAttributes = useMemo(() => {
    if (!selectedAttributes) return [];
    return Object.entries(selectedAttributes)
      .filter(([key]) => !key.toLowerCase().includes("shape"))
      .slice(0, 24);
  }, [selectedAttributes]);

  const statusText = useMemo(() => {
    const parts = [status, show3DBuildings ? "3D 建築 ON" : "3D 建築 OFF"];
    if (newTaipeiError) parts.push("新北 3D ERR");
    return parts.join(" · ");
  }, [status, show3DBuildings, newTaipeiError]);

  useEffect(() => {
    if (taipeiRef.current) taipeiRef.current.visible = show3DBuildings;
    if (newTaipeiRef.current) {
      newTaipeiRef.current.visible = show3DBuildings && newTaipeiReady;
    }
    if (cadastralRef.current) {
      cadastralRef.current.visible = show3DBuildings && showCadastral;
    }
  }, [show3DBuildings, showCadastral, newTaipeiReady]);

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
      renderer: createNeutralBuildingRenderer(),
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

    taipeiRef.current = taipeiBuildings;
    newTaipeiRef.current = newTaipeiBuildings;
    cadastralRef.current = cadastralBuildings;

    const map = new ArcGISMap({
      basemap: new Basemap({
        baseLayers: [new OpenStreetMapLayer()],
        title: "OpenStreetMap",
      }),
      layers: [newTaipeiBuildings, taipeiBuildings, cadastralBuildings],
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

    return () => {
      disposed = true;
      clickHandle?.remove();
      viewRef.current = null;
      taipeiRef.current = null;
      newTaipeiRef.current = null;
      cadastralRef.current = null;
      view.destroy();
    };
  }, []);

  const jumpToBanqiao = async () => {
    const view = viewRef.current;
    if (!view) return;

    setStatus("正在移動到板橋…");
    try {
      await view.when();
      await view.goTo(
        { center: [121.4623, 25.0123], zoom: 15, heading: 20, tilt: 65 },
        { duration: 1200 },
      );
      setStatus("板橋視角已就位");
    } catch (error: any) {
      if (error?.name !== "AbortError") console.error("Banqiao goTo failed", error);
      setStatus(error?.name === "AbortError" ? "板橋移動已中止" : "板橋移動失敗");
    }
  };

  const openGlobalBuildings = () => {
    window.open("/overture-global-spike.html", "_blank", "noopener,noreferrer");
  };

  return (
    <main className="app-shell">
      <div ref={mapContainerRef} className="map-view" />

      <header className="glass top-bar">
        <div>
          <p className="eyebrow">TAIPEI-MAPS · GREATER TAIPEI v0.1 BASELINE</p>
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
            <p className="eyebrow">BASE MAP</p>
            <h2>穩定骨架</h2>
          </div>
          <button className="secondary-button" onClick={() => void jumpToBanqiao()}>
            板橋定位
          </button>
        </div>

        <button
          className={`layer-card layer-button ${show3DBuildings ? "active" : ""}`}
          onClick={() => setShow3DBuildings((current) => !current)}
        >
          <div>
            <strong>大台北 3D 建築</strong>
            <span>台北都發局 LOD1 + 新北 NLSC layer 5</span>
          </div>
          <span className={`layer-state ${show3DBuildings ? "on" : ""}`}>
            {show3DBuildings ? "ON" : "OFF"}
          </span>
        </button>

        <button
          className={`layer-card layer-button ${showCadastral ? "active" : ""}`}
          disabled={!show3DBuildings}
          onClick={() => setShowCadastral((current) => !current)}
        >
          <div>
            <strong>台北產權細節</strong>
            <span>臺北市地政局 2023 SceneLayer · 選配</span>
          </div>
          <span className={`layer-state ${showCadastral && show3DBuildings ? "on" : ""}`}>
            {showCadastral && show3DBuildings ? "ON" : "OFF"}
          </span>
        </button>

        <button className="layer-card layer-button" onClick={openGlobalBuildings}>
          <div>
            <strong>全球 3D 建築</strong>
            <span>Overture + MapLibre · 台北 / 東京 / 紐約與全球 fallback</span>
          </div>
          <span className="layer-state">OPEN</span>
        </button>

        {newTaipeiError ? <p className="warning-text">{newTaipeiError}</p> : null}

        <div className="baseline-note">
          <strong>Baseline 原則</strong>
          <p>
            大台北保留已驗證的地方政府 3D provider；全球 Overture 能力也保留，但目前仍是
            MapLibre 獨立視圖。兩個 renderer 尚未假裝成已完成的單一無縫地圖。
          </p>
        </div>

        <div className="inspector-divider" />

        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">INSPECTOR</p>
            <h2>{selectedLayerLabel ?? "點一棟建築"}</h2>
          </div>
          {selectedAttributes ? (
            <button
              className="secondary-button"
              onClick={() => {
                setSelectedAttributes(null);
                setSelectedLayerLabel(null);
              }}
            >
              清除
            </button>
          ) : null}
        </div>

        <div className="attribute-list">
          {visibleAttributes.length ? (
            visibleAttributes.map(([key, value]) => (
              <div className="attribute-row" key={key}>
                <span>{key}</span>
                <strong>{formatValue(value)}</strong>
              </div>
            ))
          ) : (
            <p className="empty-text">點選可辨識的台北／新北 3D 建築查看來源屬性。</p>
          )}
        </div>
      </aside>
    </main>
  );
}
