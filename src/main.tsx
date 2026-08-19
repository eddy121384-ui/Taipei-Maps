import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@arcgis/core/assets/esri/themes/light/main.css";
import "./styles.css";
import GreaterTaipeiApp from "./GreaterTaipeiApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GreaterTaipeiApp />
  </StrictMode>,
);
