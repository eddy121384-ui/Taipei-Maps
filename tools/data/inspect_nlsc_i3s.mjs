#!/usr/bin/env node

const BASE = "https://i3s.nlsc.gov.tw/building/i3s/SceneServer/layers";
const MAX_LAYER_ID = 30;

const fmtExtent = (extent) => {
  if (!extent) return "—";
  const xmin = extent.xmin ?? extent.min?.[0];
  const ymin = extent.ymin ?? extent.min?.[1];
  const xmax = extent.xmax ?? extent.max?.[0];
  const ymax = extent.ymax ?? extent.max?.[1];
  const wkid = extent.spatialReference?.latestWkid ?? extent.spatialReference?.wkid ?? "?";
  if ([xmin, ymin, xmax, ymax].every((v) => typeof v === "number")) {
    return `${xmin.toFixed(5)}, ${ymin.toFixed(5)} → ${xmax.toFixed(5)}, ${ymax.toFixed(5)} (WKID ${wkid})`;
  }
  return JSON.stringify(extent);
};

console.log("============================================================");
console.log(" Taipei-Maps — NLSC building I3S layer enumerator");
console.log("============================================================");
console.log(`Base: ${BASE}`);
console.log("Known correction: layer 0 is Taipei in NCHC's public example.");
console.log("Scanning layer IDs 0..30 for metadata only; no 3D geometry is downloaded.\n");

let ok = 0;
for (let id = 0; id <= MAX_LAYER_ID; id += 1) {
  const url = `${BASE}/${id}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json,text/plain,*/*" },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      console.log(`[${String(id).padStart(2, "0")}] HTTP ${response.status}`);
      continue;
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.log(`[${String(id).padStart(2, "0")}] HTTP ${response.status} · non-JSON (${text.length} bytes)`);
      continue;
    }

    if (data?.error) {
      console.log(`[${String(id).padStart(2, "0")}] service error: ${JSON.stringify(data.error)}`);
      continue;
    }

    ok += 1;
    const name = data.name ?? data.alias ?? data.id ?? "(unnamed)";
    const extent = data.fullExtent ?? data.extent ?? data.store?.extent;
    const version = data.store?.version ?? data.version ?? data.serviceVersion ?? "?";
    const profile = data.layerType ?? data.store?.profile ?? data.store?.id ?? "?";

    console.log(`[${String(id).padStart(2, "0")}] OK  name=${name}`);
    console.log(`     extent=${fmtExtent(extent)}`);
    console.log(`     version=${version}  profile=${profile}`);
  } catch (error) {
    console.log(`[${String(id).padStart(2, "0")}] ERROR ${error?.name ?? "Error"}: ${error?.message ?? error}`);
  }
}

console.log(`\nDone. Metadata-readable layers: ${ok}`);
console.log("Paste this console output back into ChatGPT. We will identify the New Taipei layer by its metadata/extent instead of guessing another layer ID.");
