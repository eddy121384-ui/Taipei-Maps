export type BuildingProviderRole = "base-geometry" | "detail";

export type BuildingProvider = {
  id: string;
  label: string;
  agency: string;
  geography: string;
  role: BuildingProviderRole;
  url: string;
  verified: boolean;
  notes: string;
};

export const BUILDING_PROVIDERS = {
  taipeiLod1: {
    id: "taipei-lod1-2024",
    label: "台北市 3D 建築",
    agency: "臺北市都市發展局",
    geography: "臺北市",
    role: "base-geometry",
    url: "https://www.historygis.udd.gov.taipei/arcgis/rest/services/Hosted/LOD1_2024/SceneServer/layers/0",
    verified: true,
    notes: "2024 full-city LOD1. Browser smoke-tested as the Taipei municipal base geometry provider. Base geometry style is overridden by the app; provider-native color is not product semantics.",
  },
  newTaipeiNlsc: {
    id: "new-taipei-nlsc-layer-5",
    label: "新北市 3D 建築",
    agency: "國土測繪中心（NLSC）",
    geography: "新北市",
    role: "base-geometry",
    url: "https://i3s.nlsc.gov.tw/building/i3s/SceneServer/layers/5",
    verified: true,
    notes: "NLSC I3S layer 5 (I3s - 114 F). Browser metadata scan and dedicated smoke test confirmed broad New Taipei urban coverage. Provider textures/colors are intentionally replaced by the app neutral base renderer.",
  },
  taipeiCadastral: {
    id: "taipei-cadastral-2023",
    label: "台北產權模型",
    agency: "臺北市地政局",
    geography: "臺北市（產權模型覆蓋）",
    role: "detail",
    url: "https://3d.land.gov.taipei/arcgis/rest/services/Hosted/CadastralBuilding_2023/SceneServer/layers/0",
    verified: true,
    notes: "Optional detail provider with cadastral/building attributes. Coverage is not identical to the full-city LOD1 layer.",
  },
} as const satisfies Record<string, BuildingProvider>;
