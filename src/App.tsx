import { useEffect, useMemo, useRef, useState } from "react";
import ArcGISMap from "@arcgis/core/Map.js";
import Basemap from "@arcgis/core/Basemap.js";
import OpenStreetMapLayer from "@arcgis/core/layers/OpenStreetMapLayer.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import SceneView from "@arcgis/core/views/SceneView.js";

const TAIPEI_LOD1_URL =
  "https://www.historygis.udd.gov.taipei/arcgis/rest/services/Hosted/LOD1_2024/SceneServer/layers/0";

const TAIPEI_CADASTRAL_URL =
  "https://3d.land.gov.taipei/arcgis/rest/services/Hosted/CadastralBuilding_2023/SceneServer/layers/0";

type Attributes = Record<string, unknown>;

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat("zh-TW").format(value);
  return String(value);
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const cadastralLayerRef = useRef<SceneLayer | null>(null);
  const [status, setStatus] = useState("載入全市 3D 建築…");
  const [selectedAttributes, setSelectedAttributes] = useState<Attributes | null>(null);
  const [showCadastral, setShowCadastral] = useState(false);

  const visibleAttributes = useMemo(() => {
    if (!selectedAttributes) return [];
    return Object.entries(selectedAttributes)
      .filter(([key]) => !key.toLowerCase().includes("shape"))
      .slice(0, 18);
  }, [selectedAttributes]);

  useEffect(() => {
    if (cadastralLayerRef.current) {
      cadastralLayerRef.current.visible = showCadastral;
    }
  }, [showCadastral]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const cityBuildings = new SceneLayer({
      url: TAIPEI_LOD1_URL,
      title: "臺北市全市積木模型（2024）",
      popupEnabled: false,
    });

    const cadastralBuildings = new SceneLayer({
      url: TAIPEI_CADASTRAL_URL,
      title: "臺北市三維產權建物",
      outFields: ["*"],
      popupEnabled: false,
      visible: false,
    });
    cadastralLayerRef.current = cadastralBuildings;

    const basemap = new Basemap({
      baseLayers: [new OpenStreetMapLayer()],
      title: "OpenStreetMap",
    });

    const map = new ArcGISMap({
      basemap,
      layers: [cityBuildings, cadastralBuildings],
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

    let clickHandle: IHandle | null = null;

    Promise.all([view.when(), cityBuildings.load(), cadastralBuildings.load()])
      .then(() => {
        setStatus("全市 3D 建築已載入 · 可切換產權模型查看詳細資料");

        clickHandle = view.on("click", async (event) => {
          const response = await view.hitTest(event);
          const cadastralHit = response.results.find(
            (result: any) => result.graphic?.layer === cadastralBuildings,
          ) as any | undefined;

          setSelectedAttributes(cadastralHit?.graphic?.attributes ?? null);
        });
      })
      .catch((error) => {
        console.error(error);
        setStatus("3D 建築載入失敗，請查看瀏覽器 console");
      });

    return () => {
      clickHandle?.remove();
      cadastralLayerRef.current = null;
      view.destroy();
    };
  }, []);

  return (
    <main className="app-shell">
      <div ref={mapContainerRef} className="map-view" />

      <header className="glass top-bar">
        <div>
          <p className="eyebrow">TAIPEI-MAPS · v0.0.2</p>
          <h1>3D Taipei</h1>
        </div>
        <div className="status-dot-wrap">
          <span className="status-dot" />
          <span>{status}</span>
        </div>
      </header>

      <aside className="glass info-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">3D LAYERS</p>
            <h2>台北建築圖層</h2>
          </div>
        </div>

        <div className="layer-card">
          <div>
            <strong>全市 3D 建築</strong>
            <span>2024 LOD1 · 都發局</span>
          </div>
          <span className="layer-state on">ON</span>
        </div>

        <button
          className={`layer-card layer-button ${showCadastral ? "active" : ""}`}
          onClick={() => {
            setShowCadastral((current) => !current);
            setSelectedAttributes(null);
          }}
        >
          <div>
            <strong>產權模型</strong>
            <span>地政局 · 有門牌 / 層數 / 完工日期等欄位</span>
          </div>
          <span className={`layer-state ${showCadastral ? "on" : ""}`}>
            {showCadastral ? "ON" : "OFF"}
          </span>
        </button>

        <div className="inspector-divider" />

        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">BUILDING INSPECTOR</p>
            <h2>{selectedAttributes ? "建築原始資料" : "建築資訊"}</h2>
          </div>
          {selectedAttributes && (
            <button className="clear-button" onClick={() => setSelectedAttributes(null)}>
              清除
            </button>
          )}
        </div>

        {!showCadastral ? (
          <p className="empty-copy">
            全市白模用來完整呈現台北建築量體。若要點建築查看地政屬性，請開啟上方「產權模型」圖層。
          </p>
        ) : !selectedAttributes ? (
          <p className="empty-copy">
            產權模型已開啟。點選有產權模型覆蓋的建築，這裡會顯示臺北市 SceneServer 回傳的原始欄位。
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
          Base 3D: 臺北市都發局 LOD1_2024 · Detail: 臺北市地政局 CadastralBuilding_2023
        </div>
      </aside>
    </main>
  );
}

interface IHandle {
  remove(): void;
}
