import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PMTiles, Protocol } from "pmtiles";

export type MapCamera = {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
};

type Props = {
  visible: boolean;
  showBuildings: boolean;
  targetCamera: MapCamera | null;
  onReady: (release: string) => void;
  onError: (message: string) => void;
  onCameraChange: (camera: MapCamera) => void;
  onInspect: (attributes: Record<string, unknown>) => void;
};

const OVERTURE_CANDIDATES = [
  {
    release: "2026-07-22.0",
    url: "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-07-22.0/buildings.pmtiles",
  },
  {
    release: "2026-06-17.0",
    url: "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-06-17.0/buildings.pmtiles",
  },
];

let protocolRegistered = false;
const protocol = new Protocol();

function currentCamera(map: maplibregl.Map): MapCamera {
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  };
}

export default function GlobalBuildingMap({
  visible,
  showBuildings,
  targetCamera,
  onReady,
  onError,
  onCameraChange,
  onInspect,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const targetRef = useRef<MapCamera | null>(targetCamera);
  const callbacksRef = useRef({ onReady, onError, onCameraChange, onInspect });

  useEffect(() => {
    callbacksRef.current = { onReady, onError, onCameraChange, onInspect };
  }, [onReady, onError, onCameraChange, onInspect]);

  useEffect(() => {
    targetRef.current = targetCamera;
    const map = mapRef.current;
    if (!map || !targetCamera) return;
    map.jumpTo({
      center: targetCamera.center,
      zoom: targetCamera.zoom,
      pitch: Math.min(targetCamera.pitch, 75),
      bearing: targetCamera.bearing,
    });
  }, [targetCamera]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const id of ["overture-building-3d", "overture-parts-3d"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showBuildings ? "visible" : "none");
      }
    }
  }, [showBuildings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !visible) return;
    requestAnimationFrame(() => map.resize());
  }, [visible]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    let map: maplibregl.Map | null = null;

    const boot = async () => {
      try {
        let selected: (typeof OVERTURE_CANDIDATES)[number] | null = null;
        let metadata: any = null;
        const failures: string[] = [];

        for (const candidate of OVERTURE_CANDIDATES) {
          try {
            const archive = new PMTiles(candidate.url);
            const [, candidateMetadata] = await Promise.all([
              archive.getHeader(),
              archive.getMetadata(),
            ]);
            selected = candidate;
            metadata = candidateMetadata;
            break;
          } catch (error: any) {
            failures.push(`${candidate.release}: ${error?.message ?? error}`);
          }
        }

        if (!selected) {
          throw new Error(`Overture PMTiles preflight failed: ${failures.join(" | ")}`);
        }

        const vectorLayers = Array.isArray(metadata?.vector_layers)
          ? metadata.vector_layers.map((item: any) => item?.id).filter(Boolean)
          : [];
        const hasBuilding = vectorLayers.includes("building");
        const hasParts = vectorLayers.includes("building_part");
        if (!hasBuilding) {
          throw new Error(`Overture PMTiles has no building source-layer: ${vectorLayers.join(", ")}`);
        }

        if (!protocolRegistered) {
          maplibregl.addProtocol("pmtiles", protocol.tile);
          protocolRegistered = true;
        }

        const heightExpr: any = [
          "case",
          [">", ["to-number", ["get", "height"], 0], 0],
          ["to-number", ["get", "height"], 0],
          [">", ["to-number", ["get", "num_floors"], 0], 0],
          ["*", ["to-number", ["get", "num_floors"], 0], 3.2],
          9.6,
        ];
        const baseExpr: any = ["to-number", ["get", "min_height"], 0];
        const parentWithoutParts: any = ["!=", ["get", "has_parts"], true];
        const start = targetRef.current ?? {
          center: [121.51, 25.035] as [number, number],
          zoom: 11,
          pitch: 58,
          bearing: -20,
        };

        const layers: any[] = [
          { id: "osm", type: "raster", source: "osm" },
          {
            id: "overture-building-3d",
            type: "fill-extrusion",
            source: "overtureBuildings",
            "source-layer": "building",
            minzoom: 14,
            ...(hasParts ? { filter: parentWithoutParts } : {}),
            layout: { visibility: showBuildings ? "visible" : "none" },
            paint: {
              "fill-extrusion-base": baseExpr,
              "fill-extrusion-height": heightExpr,
              "fill-extrusion-color": "#e2e7eb",
              "fill-extrusion-opacity": 0.9,
              "fill-extrusion-vertical-gradient": true,
            },
          },
        ];

        if (hasParts) {
          layers.push({
            id: "overture-parts-3d",
            type: "fill-extrusion",
            source: "overtureBuildings",
            "source-layer": "building_part",
            minzoom: 14,
            layout: { visibility: showBuildings ? "visible" : "none" },
            paint: {
              "fill-extrusion-base": baseExpr,
              "fill-extrusion-height": heightExpr,
              "fill-extrusion-color": "#cbd7df",
              "fill-extrusion-opacity": 0.95,
              "fill-extrusion-vertical-gradient": true,
            },
          });
        }

        if (cancelled || !containerRef.current) return;

        map = new maplibregl.Map({
          container: containerRef.current,
          center: start.center,
          zoom: start.zoom,
          pitch: Math.min(start.pitch, 75),
          bearing: start.bearing,
          maxPitch: 75,
          antialias: true,
          style: {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: "© OpenStreetMap contributors",
              },
              overtureBuildings: {
                type: "vector",
                url: `pmtiles://${selected.url}`,
                attribution: "© Overture Maps Foundation / source contributors",
              },
            },
            layers,
          } as any,
        });
        mapRef.current = map;

        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

        map.on("style.load", () => {
          map?.setProjection({ type: "globe" });
        });

        map.on("load", () => {
          if (cancelled || !map) return;
          callbacksRef.current.onReady(selected.release);
          if (visible) map.resize();
        });

        map.on("moveend", () => {
          if (!map) return;
          callbacksRef.current.onCameraChange(currentCamera(map));
        });

        map.on("click", (event) => {
          if (!map) return;
          const layerIds = ["overture-parts-3d", "overture-building-3d"].filter((id) =>
            Boolean(map?.getLayer(id)),
          );
          const features = map.queryRenderedFeatures(event.point, { layers: layerIds });
          const feature = features[0];
          if (!feature) return;
          callbacksRef.current.onInspect({
            ...(feature.properties ?? {}),
            source_layer: feature.sourceLayer ?? "—",
          });
        });

        map.on("error", (event: any) => {
          const message = event?.error?.message;
          if (message) callbacksRef.current.onError(message);
        });
      } catch (error: any) {
        if (!cancelled) callbacksRef.current.onError(error?.message ?? String(error));
      }
    };

    void boot();

    return () => {
      cancelled = true;
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="map-view"
      style={{ visibility: visible ? "visible" : "hidden" }}
      aria-hidden={!visible}
    />
  );
}
