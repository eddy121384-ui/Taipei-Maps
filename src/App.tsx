import { useEffect, useMemo, useRef, useState } from "react";
import ArcGISMap from "@arcgis/core/Map.js";
import Basemap from "@arcgis/core/Basemap.js";
import OpenStreetMapLayer from "@arcgis/core/layers/OpenStreetMapLayer.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import SceneView from "@arcgis/core/views/SceneView.js";

const TAIPEI_BUILDINGS_URL =
  "https://3d.land.gov.taipei/arcgis/rest/services/Hosted/CadastralBuilding_2023/SceneServer/layers/0";

type Attributes = Record<string, unknown>;

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat("zh-TW").format(value);
  return String(value);
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("載入 3D 台北建築…");
  const [selectedAttributes, setSelectedAttributes] = useState<Attributes | null>(null);

  const visibleAttributes = useMemo(() => {
    if (!selectedAttributes) return [];
    return Object.entries(selectedAttributes)
      .filter(([key]) => !key.toLowerCase().includes("shape"))
      .slice(0, 18);
  }, [selectedAttributes]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const buildings = new SceneLayer({
      url: TAIPEI_BUILDINGS_URL,
      title: "臺北市三維產權建物",
      outFields: ["*"],
      popupEnabled: false,
    });

    const basemap = new Basemap({
      baseLayers: [new OpenStreetMapLayer()],
      title: "OpenStreetMap",
    });

    const map = new ArcGISMap({
      basemap,
      layers: [buildings],
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

    Promise.all([view.when(), buildings.load()])
      .then(() => {
        setStatus("3D 建築已載入 · 點一棟建築查看原始屬性");

        clickHandle = view.on("click", async (event) => {
          const response = await view.hitTest(event);
          const buildingHit = response.results.find((result: any) => result.graphic?.layer === buildings) as
            | any
            | undefined;

          setSelectedAttributes(buildingHit?.graphic?.attributes ?? null);
        });
      })
      .catch((error) => {
        console.error(error);
        setStatus("3D 建築載入失敗，請查看瀏覽器 console");
      });

    return () => {
      clickHandle?.remove();
      view.destroy();
    };
  }, []);

  return (
    <main className="app-shell">
      <div ref={mapContainerRef} className="map-view" />

      <header className="glass top-bar">
        <div>
          <p className="eyebrow">TAIPEI-MAPS · v0.0.1</p>
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
            <p className="eyebrow">BUILDING INSPECTOR</p>
            <h2>{selectedAttributes ? "建築原始資料" : "點一棟建築"}</h2>
          </div>
          {selectedAttributes && (
            <button className="clear-button" onClick={() => setSelectedAttributes(null)}>
              清除
            </button>
          )}
        </div>

        {!selectedAttributes ? (
          <p className="empty-copy">
            用滑鼠拖曳旋轉、滾輪縮放、右鍵或 Ctrl + 拖曳調整視角。點選建築後，這裡會先直接顯示臺北市 SceneServer 回傳的欄位。
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
          Source: 臺北市多維度測繪管理系統 · CadastralBuilding_2023
        </div>
      </aside>
    </main>
  );
}

interface IHandle {
  remove(): void;
}
