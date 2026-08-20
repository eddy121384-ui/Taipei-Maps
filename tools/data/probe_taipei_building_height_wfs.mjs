const ENDPOINTS = [
  "https://citydashboard.taipei/geo_server/taipei_vioc/ows",
  "https://citydashboard.taipei/geo_server/ows",
];

const TYPE_NAME = "taipei_vioc:tp_building_height";
const USER_AGENT = "Taipei-Maps/0.1 citywide-provider-probe";

function makeUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, application/geo+json, application/xml, text/xml, */*",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}; ${text.slice(0, 300).replace(/\s+/g, " ")}`);
  }
  return { text, bytes: Buffer.byteLength(text) };
}

function parseHitCount(xml) {
  const match = xml.match(/(?:numberMatched|numberOfFeatures)=["'](\d+)["']/i);
  return match ? Number(match[1]) : null;
}

function parseCapabilitiesExtent(xml) {
  const idx = xml.indexOf(TYPE_NAME);
  if (idx < 0) return null;
  const chunk = xml.slice(Math.max(0, idx - 1000), idx + 6000);

  const lower = chunk.match(/<[^>]*LowerCorner[^>]*>\s*([\d.+-]+)\s+([\d.+-]+)\s*<\/[^>]*LowerCorner>/i);
  const upper = chunk.match(/<[^>]*UpperCorner[^>]*>\s*([\d.+-]+)\s+([\d.+-]+)\s*<\/[^>]*UpperCorner>/i);
  if (lower && upper) {
    return {
      west: Number(lower[1]),
      south: Number(lower[2]),
      east: Number(upper[1]),
      north: Number(upper[2]),
      source: "WGS84BoundingBox",
    };
  }

  const legacy = chunk.match(/<LatLongBoundingBox[^>]*minx=["']([\d.+-]+)["'][^>]*miny=["']([\d.+-]+)["'][^>]*maxx=["']([\d.+-]+)["'][^>]*maxy=["']([\d.+-]+)["']/i);
  if (legacy) {
    return {
      west: Number(legacy[1]),
      south: Number(legacy[2]),
      east: Number(legacy[3]),
      north: Number(legacy[4]),
      source: "LatLongBoundingBox",
    };
  }

  return null;
}

async function getHits(base) {
  const attempts = [
    {
      version: "2.0.0",
      params: { service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: TYPE_NAME, resultType: "hits" },
    },
    {
      version: "1.0.0",
      params: { service: "WFS", version: "1.0.0", request: "GetFeature", typeName: TYPE_NAME, resultType: "hits" },
    },
  ];

  for (const attempt of attempts) {
    try {
      const { text } = await fetchText(makeUrl(base, attempt.params));
      const count = parseHitCount(text);
      if (Number.isFinite(count)) return { count, version: attempt.version };
    } catch {
      // try the next version
    }
  }
  return null;
}

async function getSample(base, startIndex = 0, count = 500) {
  const attempts = [
    {
      version: "2.0.0",
      params: {
        service: "WFS",
        version: "2.0.0",
        request: "GetFeature",
        typeNames: TYPE_NAME,
        outputFormat: "application/json",
        srsName: "EPSG:4326",
        startIndex,
        count,
      },
    },
    {
      version: "1.0.0",
      params: {
        service: "WFS",
        version: "1.0.0",
        request: "GetFeature",
        typeName: TYPE_NAME,
        outputFormat: "application/json",
        srsName: "EPSG:4326",
        maxFeatures: count,
      },
    },
  ];

  for (const attempt of attempts) {
    try {
      const { text, bytes } = await fetchText(makeUrl(base, attempt.params));
      const geojson = JSON.parse(text);
      if (geojson?.type === "FeatureCollection" && Array.isArray(geojson.features)) {
        return { version: attempt.version, geojson, bytes };
      }
    } catch {
      // try the next version
    }
  }
  return null;
}

function firstFeatureId(sample) {
  const feature = sample?.geojson?.features?.[0];
  return feature?.id ?? feature?.properties?.OBJECTID ?? feature?.properties?.objectid ?? null;
}

for (const base of ENDPOINTS) {
  console.log("\n============================================================");
  console.log(`Endpoint: ${base}`);

  try {
    const capabilitiesUrl = makeUrl(base, { service: "WFS", request: "GetCapabilities" });
    const capabilities = await fetchText(capabilitiesUrl);
    console.log(`GetCapabilities: OK (${capabilities.bytes.toLocaleString()} bytes)`);
    console.log("Layer extent:", parseCapabilitiesExtent(capabilities.text) ?? "not parsed");

    const hits = await getHits(base);
    console.log("Citywide feature count:", hits ? `${hits.count.toLocaleString()} (WFS ${hits.version})` : "hits query unsupported / not parsed");

    const sample = await getSample(base, 0, 500);
    if (!sample) throw new Error("could not fetch a GeoJSON sample");

    const features = sample.geojson.features;
    const bytesPerFeature = features.length ? sample.bytes / features.length : null;
    console.log(`500-feature sample: ${features.length.toLocaleString()} features, ${sample.bytes.toLocaleString()} bytes (WFS ${sample.version})`);
    console.log("Approx bytes / feature:", bytesPerFeature ? Math.round(bytesPerFeature).toLocaleString() : "n/a");
    if (hits?.count && bytesPerFeature) {
      const estimate = hits.count * bytesPerFeature;
      console.log(`Very rough monolithic GeoJSON estimate: ${(estimate / 1024 / 1024).toFixed(1)} MiB`);
    }

    const propertyKeys = Object.keys(features[0]?.properties ?? {});
    console.log(`Property keys (${propertyKeys.length}):`, propertyKeys.join(", "));

    const page0 = await getSample(base, 0, 2);
    const page2 = await getSample(base, 2, 2);
    const id0 = firstFeatureId(page0);
    const id2 = firstFeatureId(page2);
    const pagingLooksDifferent = id0 !== null && id2 !== null && String(id0) !== String(id2);
    console.log("Paging probe:", {
      firstPageFirstId: id0,
      secondPageFirstId: id2,
      startIndexLooksEffective: pagingLooksDifferent,
    });

    console.log("RESULT: usable endpoint");
    process.exit(0);
  } catch (error) {
    console.warn(`Endpoint failed: ${error?.message ?? error}`);
  }
}

throw new Error("All public tp_building_height WFS probes failed.");
