export const DEFAULT_BUILDING_HEIGHT_M = 9.6;
export const MAX_PLAUSIBLE_BUILDING_HEIGHT_M = 600;
export const MIN_PLAUSIBLE_BUILDING_HEIGHT_M = 1.2;

function finiteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFinite(properties, keys) {
  for (const key of keys) {
    const value = finiteNumber(properties[key]);
    if (value !== null) return value;
  }
  return null;
}

function plausibleHeight(value) {
  return (
    Number.isFinite(value) &&
    value >= MIN_PLAUSIBLE_BUILDING_HEIGHT_M &&
    value <= MAX_PLAUSIBLE_BUILDING_HEIGHT_M
  );
}

function rounded(value) {
  return value == null ? null : Number(value.toFixed(3));
}

/**
 * Physical-height derivation for Taipei City Dashboard `tp_building_height`.
 *
 * Raw-field probe on 2026-08-20 established the actual WFS keys:
 * - roof elevation: `1_top_high`
 * - entrance/ground elevation: `1_ent_heig`
 * - surveyed building height: `1_bud_high`
 * - floor count: `1_floor`
 *
 * Older spike code accidentally queried `1_entr_heig` / `1_bd_high`, which do
 * not exist in the live WFS and forced almost every building to floors × 3.2 m.
 * Keep those misspelled aliases only as defensive backwards compatibility for
 * any locally cached experimental data.
 *
 * Derivation order:
 * 1. plausible roof elevation - entrance elevation
 * 2. plausible surveyed `1_bud_high`
 * 3. floors × 3.2 m
 * 4. generic 9.6 m
 */
export function deriveBuildingHeight(properties = {}) {
  const topElevation = firstFinite(properties, ["1_top_high", "屋頂高程"]);
  const entranceElevation = firstFinite(properties, ["1_ent_heig", "出入口高程", "1_entr_heig"]);
  const surveyedBuildingHeight = firstFinite(properties, ["1_bud_high", "1_bd_high"]);
  const floors = firstFinite(properties, ["1_floor"]);

  if (topElevation != null && entranceElevation != null) {
    const delta = topElevation - entranceElevation;
    if (plausibleHeight(delta)) {
      return {
        height_m: rounded(delta),
        source: "top_minus_entrance",
        top_elev_m: rounded(topElevation),
        ground_elev_m: rounded(entranceElevation),
      };
    }
  }

  if (plausibleHeight(surveyedBuildingHeight)) {
    return {
      height_m: rounded(surveyedBuildingHeight),
      source: "1_bud_high",
      top_elev_m: rounded(topElevation),
      ground_elev_m: rounded(entranceElevation),
    };
  }

  if (floors != null && floors >= 1 && floors <= 150) {
    const floorHeight = floors * 3.2;
    if (plausibleHeight(floorHeight)) {
      return {
        height_m: rounded(floorHeight),
        source: "floors_x3.2",
        top_elev_m: rounded(topElevation),
        ground_elev_m: rounded(entranceElevation),
      };
    }
  }

  return {
    height_m: DEFAULT_BUILDING_HEIGHT_M,
    source: "fallback_9.6m",
    top_elev_m: rounded(topElevation),
    ground_elev_m: rounded(entranceElevation),
  };
}
