import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./analysis-mode.css";

const Analysis2DApp = lazy(() => import("./Analysis2DApp"));
const GreaterTaipeiApp = lazy(() => import("./GreaterTaipeiApp"));
const NlscLayerProbe = lazy(() => import("./NlscLayerProbe"));

const params = new URLSearchParams(window.location.search);
const showNlscProbe = params.has("nlscProbe");
const show3D = params.get("mode") === "3d";

function returnTo2D() {
  const next = new URLSearchParams(window.location.search);
  next.delete("mode");
  const query = next.toString();
  window.location.href = `${window.location.pathname}${query ? `?${query}` : ""}`;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<div className="app-loading">載入地圖介面…</div>}>
      {showNlscProbe ? <NlscLayerProbe /> : show3D ? <GreaterTaipeiApp /> : <Analysis2DApp />}
      {!showNlscProbe && show3D && (
        <button className="presentation-return-button" type="button" onClick={returnTo2D}>
          ← 回 2D 分析
        </button>
      )}
    </Suspense>
  </StrictMode>,
);
