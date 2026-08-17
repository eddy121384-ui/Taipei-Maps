import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AgeMapApp from "./AgeMapApp";
import NlscLayerProbe from "./NlscLayerProbe";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const showNlscProbe = params.has("nlscProbe");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {showNlscProbe ? <NlscLayerProbe /> : <AgeMapApp />}
  </StrictMode>,
);
