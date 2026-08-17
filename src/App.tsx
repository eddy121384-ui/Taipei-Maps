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

const CURRENT_YEAR = new Date().getFullYear();

const AGE_BINS = [
  { label: "0–10 年", color: "#73b7ff" },
  { label: "10–20 年", color: "#66d4a9" },
  { label: "20–30 年", color: "#d4dc63" },
  { label: "30–40 年", color: "#f0b45a" },
  { label: "40–50 年", color: "#ea7d49" },
  { label: "50+ 年", color: "#d14b4b" },
] as const;

type Attributes = Record<string, unknown>;
type LayerKey = "city" | "cadastral";
type AgeMode = "ageYears" | "builtYear";

type LayerField = {
  name: string;
  alias?: string;
  type?: string;
};

type AgeSource = {
  layerKey: LayerKey;
  sourceLabel: string;
  fieldName: string;
  fieldAlias: string;
  fieldType: string;
  mode: AgeMode;
  expression: string;
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat("zh-TW").format(value);
  return String(value);
}

function normalizeFieldType(type?: string) {
  return (type ?? "").toLowerCase();
}

function isNumericFieldType(type?: string) {
  const normalized = normalizeFieldType(type);
  return [
    "small-integer",
    "integer",
    "single",
    "double",
    "long",
    "esrifieldtypesmallinteger",
    "esrifieldtypeinteger",
    "esrifieldtypesingle",
    "esrifieldtypedouble",
    "esrifieldtypebiginteger",
  ].includes(normalized);
}

function isDateFieldType(type?: string) {
  const normalized = normalizeFieldType(type);
  return ["date", "date-only", "timestamp-offset", "esrifieldtypedate"].includes(normalized);
}

function makeMeshSymbol(color: string): any {
  return {
    type: "mesh-3d",
    symbolLayers: [
      {
        type: "fill",
        material: {
          color,
          colorMixMode: "replace",
        },
        edges: {
          type: "solid",
          color: [92, 101, 112, 0.36],
          size: 0.55,
        },
      },
    ],
  };
}

function normalizeFieldText(field: LayerField) {
  return `${field.name} ${field.alias ?? ""}`.toLowerCase();
}

function buildAgeExpression(field: LayerField, mode: AgeMode) {
  const ref = `$feature["${field.name}"]`;

  if (mode === "ageYears") {
    if (isDateFieldType(field.type)) {
      return `IIf(IsEmpty(${ref}), Null, DateDiff(Date(), ${ref}, 'years'))`;
    }

    if (isNumericFieldType(field.type)) {
      return `IIf(IsEmpty(${ref}), Null, Number(${ref}))`;
    }

    return `
      var raw = Trim(Text(${ref}));
      if (IsEmpty(raw)) { return Null; }
      var parsed = Date(raw);
      if (IsEmpty(parsed)) { return Null; }
      return DateDiff(Date(), parsed, 'years');
    `;
  }

  if (isDateFieldType(field.type)) {
    return `IIf(IsEmpty(${ref}), Null, Year(${ref}))`;
  }

  if (isNumericFieldType(field.type)) {
    return `IIf(IsEmpty(${ref}), Null, Number(${ref}))`;
  }

  return `
    var raw = Trim(Text(${ref}));
    if (IsEmpty(raw)) { return Null; }

    var parsed = Date(raw);
    if (!IsEmpty(parsed)) { return Year(parsed); }

    var firstFour = Number(Left(raw, 4));
    if (!IsEmpty(firstFour) && firstFour > 1800 && firstFour < 2200) { return firstFour; }

    return Null;
  `;
}

function detectAgeSource(fields: LayerField[], layerKey: LayerKey): AgeSource | null {
  const candidates = fields
    .map((field) => {
      const haystack = normalizeFieldText(field);

      if (
        haystack.includes("objectid") ||
        haystack.includes("globalid") ||
        haystack.includes("shape") ||
        haystack.includes("created") ||
        haystack.includes("creation") ||
        haystack.includes("edit") ||
        haystack.includes("updated") ||
        haystack.includes("修改") ||
        haystack.includes("建立時間")
      ) {
        return null;
      }

      let score = 0;
      let mode: AgeMode = "builtYear";

      if (/屋齡|building.?age|house.?age/.test(haystack)) {
        score = 130;
        mode = "ageYears";
      }

      if (
        /建築完成|建物完成|完成日期|完工|竣工|完竣|completion|completed|year.?built|built.?year|build.?year|finish/.test(
          haystack,
        )
      ) {
        score = Math.max(score, 120);
        mode = "builtYear";
      }

      if (/使用執照.*日期|license.*date/.test(haystack)) {
        score = Math.max(score, 92);
        mode = "builtYear";
      }

      if (/建築.*年|建物.*年|完工.*年|竣工.*年/.test(haystack)) {
        score = Math.max(score, 90);
        mode = "builtYear";
      }

      if (/year/.test(haystack)) {
        score = Math.max(score, 60);
      }

      if (/date|日期/.test(haystack)) {
        score = Math.max(score, 55);
      }

      if (score === 0) return null;

      return { field, score, mode };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score) as Array<{
    field: LayerField;
    score: number;
    mode: AgeMode;
  }>;

  if (!candidates.length) return null;

  const best = candidates[0];
  return {
    layerKey,
    sourceLabel: layerKey === "city" ? "全市 3D 白模" : "產權模型",
    fieldName: best.field.name,
    fieldAlias: best.field.alias ?? best.field.name,
    fieldType: best.field.type ?? "unknown",
    mode: best.mode,
    expression: buildAgeExpression(best.field, best.mode),
  };
}

function createAgeRenderer(source: AgeSource): any {
  const symbols = {
    newest: makeMeshSymbol("#73b7ff"),
    newish: makeMeshSymbol("#66d4a9"),
    mid: makeMeshSymbol("#d4dc63"),
    warm: makeMeshSymbol("#f0b45a"),
    older: makeMeshSymbol("#ea7d49"),
    oldest: makeMeshSymbol("#d14b4b"),
    unknown: makeMeshSymbol("#cbd1d8"),
  };

  const classBreakInfos =
    source.mode === "ageYears"
      ? [
          { minValue: 0, maxValue: 10, label: "0–10 年", symbol: symbols.newest },
          { minValue: 10.0001, maxValue: 20, label: "10–20 年", symbol: symbols.newish },
          { minValue: 20.0001, maxValue: 30, label: "20–30 年", symbol: symbols.mid },
          { minValue: 30.0001, maxValue: 40, label: "30–40 年", symbol: symbols.warm },
          { minValue: 40.0001, maxValue: 50, label: "40–50 年", symbol: symbols.older },
          { minValue: 50.0001, maxValue: 1000, label: "50+ 年", symbol: symbols.oldest },
        ]
      : [
          { minValue: 1800, maxValue: CURRENT_YEAR - 50, label: "50+ 年", symbol: symbols.oldest },
          {
            minValue: CURRENT_YEAR - 49,
            maxValue: CURRENT_YEAR - 40,
            label: "40–50 年",
            symbol: symbols.older,
          },
          {
            minValue: CURRENT_YEAR - 39,
            maxValue: CURRENT_YEAR - 30,
            label: "30–40 年",
            symbol: symbols.warm,
          },
          {
            minValue: CURRENT_YEAR - 29,
            maxValue: CURRENT_YEAR - 20,
            label: "20–30 年",
            symbol: symbols.mid,
          },
          {
            minValue: CURRENT_YEAR - 19,
            maxValue: CURRENT_YEAR - 10,
            label: "10–20 年",
            symbol: symbols.newish,
          },
          {
            minValue: CURRENT_YEAR - 9,
            maxValue: CURRENT_YEAR + 1,
            label: "0–10 年",
            symbol: symbols.newest,
          },
        ];

  return {
    type: "class-breaks",
    valueExpression: source.expression,
    valueExpressionTitle: source.mode === "ageYears" ? "建物屋齡（年）" : "建築完成年",
    classBreakInfos,
    defaultSymbol: symbols.unknown,
    defaultLabel: "無屋齡資料",
  };
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const cityLayerRef = useRef<SceneLayer | null>(null);
  const cadastralLayerRef = useRef<SceneLayer | null>(null);

  const [status, setStatus] = useState("載入全市 3D 建築…");
  const [selectedAttributes, setSelectedAttributes] = useState<Attributes | null>(null);
  const [selectedLayerLabel, setSelectedLayerLabel] = useState<string | null>(null);

  const [showCity3D, setShowCity3D] = useState(true);
  const [showCadastral, setShowCadastral] = useState(false);
  const [showAgeOverlay, setShowAgeOverlay] = useState(false);
  const [ageSource, setAgeSource] = useState<AgeSource | null>(null);

  const visibleAttributes = useMemo(() => {
    if (!selectedAttributes) return [];
    return Object.entries(selectedAttributes)
      .filter(([key]) => !key.toLowerCase().includes("shape"))
      .slice(0, 20);
  }, [selectedAttributes]);

  const statusText = useMemo(() => {
    if (!ageSource) return `${status} · 尚未偵測到可用屋齡欄位`;
    if (showAgeOverlay) return `${status} · 屋齡圖層 ON（${ageSource.sourceLabel}）`;
    return `${status} · 屋齡資料可用`;
  }, [status, ageSource, showAgeOverlay]);

  useEffect(() => {
    const cityLayer = cityLayerRef.current;
    const cadastralLayer = cadastralLayerRef.current;

    if (cityLayer) cityLayer.visible = showCity3D;

    if (cadastralLayer) {
      const ageNeedsCadastral = showAgeOverlay && ageSource?.layerKey === "cadastral";
      cadastralLayer.visible = showCadastral || ageNeedsCadastral;
    }
  }, [showCity3D, showCadastral, showAgeOverlay, ageSource]);

  useEffect(() => {
    const cityLayer = cityLayerRef.current;
    const cadastralLayer = cadastralLayerRef.current;

    if (!cityLayer || !cadastralLayer) return;

    cityLayer.renderer = null;
    cadastralLayer.renderer = null;

    if (!showAgeOverlay || !ageSource) return;

    const target = ageSource.layerKey === "city" ? cityLayer : cadastralLayer;
    target.renderer = createAgeRenderer(ageSource);
  }, [showAgeOverlay, ageSource]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const cityBuildings = new SceneLayer({
      url: TAIPEI_LOD1_URL,
      title: "臺北市全市積木模型（2024）",
      outFields: ["*"],
      popupEnabled: false,
    });

    const cadastralBuildings = new SceneLayer({
      url: TAIPEI_CADASTRAL_URL,
      title: "臺北市三維產權建物",
      outFields: ["*"],
      popupEnabled: false,
      visible: false,
    });

    cityLayerRef.current = cityBuildings;
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
        const cityAge = detectAgeSource((cityBuildings.fields as LayerField[]) ?? [], "city");
        const cadastralAge = detectAgeSource(
          (cadastralBuildings.fields as LayerField[]) ?? [],
          "cadastral",
        );

        const detectedAgeSource = cityAge ?? cadastralAge;
        setAgeSource(detectedAgeSource);
        setStatus("全市 3D 建築已載入");

        console.info("Taipei-Maps age source", detectedAgeSource);
        console.info(
          "LOD1 fields",
          cityBuildings.fields?.map((field) => ({
            name: field.name,
            alias: field.alias,
            type: field.type,
          })),
        );
        console.info(
          "Cadastral fields",
          cadastralBuildings.fields?.map((field) => ({
            name: field.name,
            alias: field.alias,
            type: field.type,
          })),
        );

        clickHandle = view.on("click", async (event) => {
          const response = await view.hitTest(event);

          const cadastralHit = response.results.find(
            (result: any) => result.graphic?.layer === cadastralBuildings,
          ) as any | undefined;

          const cityHit = response.results.find(
            (result: any) => result.graphic?.layer === cityBuildings,
          ) as any | undefined;

          const chosen = cadastralHit ?? cityHit;

          if (!chosen?.graphic?.attributes) {
            setSelectedAttributes(null);
            setSelectedLayerLabel(null);
            return;
          }

          const isCadastral = chosen.graphic.layer === cadastralBuildings;
          setSelectedAttributes(chosen.graphic.attributes);
          setSelectedLayerLabel(isCadastral ? "產權模型屬性" : "全市白模屬性");
        });
      })
      .catch((error) => {
        console.error(error);
        setStatus("3D 建築載入失敗，請查看瀏覽器 console");
      });

    return () => {
      clickHandle?.remove();
      cityLayerRef.current = null;
      cadastralLayerRef.current = null;
      view.destroy();
    };
  }, []);

  const cadastralForcedByAge = showAgeOverlay && ageSource?.layerKey === "cadastral";

  return (
    <main className="app-shell">
      <div ref={mapContainerRef} className="map-view" />

      <header className="glass top-bar">
        <div>
          <p className="eyebrow">TAIPEI-MAPS · v0.0.3</p>
          <h1>3D Taipei</h1>
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
            <h2>台北建築圖層</h2>
          </div>
        </div>

        <button
          className={`layer-card layer-button ${showCity3D ? "active" : ""}`}
          onClick={() => setShowCity3D((current) => !current)}
        >
          <div>
            <strong>全市 3D 建築</strong>
            <span>2024 LOD1 · 都發局 · 3D 幾何總開關</span>
          </div>
          <span className={`layer-state ${showCity3D ? "on" : ""}`}>
            {showCity3D ? "ON" : "OFF"}
          </span>
        </button>

        <button
          className={`layer-card layer-button ${showCadastral || cadastralForcedByAge ? "active" : ""}`}
          onClick={() => {
            setShowCadastral((current) => !current);
            setSelectedAttributes(null);
          }}
        >
          <div>
            <strong>產權模型</strong>
            <span>
              地政局 · 有門牌 / 層數 / 完工日期等欄位
              {cadastralForcedByAge ? " · 屋齡圖層目前自動使用" : ""}
            </span>
          </div>
          <span className={`layer-state ${showCadastral || cadastralForcedByAge ? "on" : ""}`}>
            {cadastralForcedByAge && !showCadastral ? "AUTO" : showCadastral ? "ON" : "OFF"}
          </span>
        </button>

        <button
          className={`layer-card layer-button age-layer ${showAgeOverlay ? "active" : ""}`}
          disabled={!ageSource}
          onClick={() => setShowAgeOverlay((current) => !current)}
        >
          <div>
            <strong>屋齡圖層</strong>
            <span>
              {ageSource
                ? `資料：${ageSource.sourceLabel} · ${ageSource.fieldAlias}`
                : "目前資料服務未偵測到可直接使用的屋齡 / 完工年欄位"}
            </span>
          </div>
          <span className={`layer-state ${showAgeOverlay ? "on" : ""}`}>
            {showAgeOverlay ? "ON" : "OFF"}
          </span>
        </button>

        {showAgeOverlay && ageSource && (
          <div className="age-legend">
            <div className="legend-heading">
              <strong>屋齡色階</strong>
              <span>{ageSource.mode === "ageYears" ? "直接使用屋齡" : "由建築完成年換算"}</span>
            </div>
            <div className="legend-list">
              {AGE_BINS.map((bin) => (
                <div className="legend-row" key={bin.label}>
                  <span className="legend-swatch" style={{ background: bin.color }} />
                  <span>{bin.label}</span>
                </div>
              ))}
              <div className="legend-row muted">
                <span className="legend-swatch unknown" />
                <span>無資料</span>
              </div>
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
            點一棟目前可選取的 3D 建築，這裡會顯示資料服務回傳的原始欄位。屋齡圖層會優先嘗試使用全市白模；若沒有可用欄位，才自動退到產權模型。
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

        {ageSource ? (
          <div className="age-source-note">
            屋齡來源：{ageSource.sourceLabel} / {ageSource.fieldAlias} ({ageSource.fieldName})
          </div>
        ) : (
          <div className="age-source-note warning">
            尚未找到可直接著色的屋齡欄位。若白模與產權模型都沒有 cached attribute，下一步會改用外部建物資料做 spatial join。
          </div>
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
