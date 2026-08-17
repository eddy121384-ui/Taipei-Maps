import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const GreaterTaipeiApp = lazy(() => import("./GreaterTaipeiApp"));
const NlscLayerProbe = lazy(() => import("./NlscLayerProbe"));

const params = new URLSearchParams(window.location.search);
const showNlscProbe = params.has("nlscProbe");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<div className="app-loading">載入地圖介面…</div>}>
      {showNlscProbe ? <NlscLayerProbe /> : <GreaterTaipeiApp />}
    </Suspense>
  </StrictMode>,
);
