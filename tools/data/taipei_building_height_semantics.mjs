export const DEFAULT_BUILDING_HEIGHT_M = 9.6;
export const MAX_PLAUSIBLE_BUILDING_HEIGHT_M = 600;
export const MIN_PLAUSIBLE_BUILDING_HEIGHT_M = 1.2;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
 * Taipei City Dashboard `tp_building_height` exposes surveyed vertical values.
 * `1_top_high` can exceed 1000 m in mountain areas, so it is an absolute roof
 * elevation rather than a physical building height. `1_entr_heig` is the
 * entrance/ground elevation. The physically meaningful extrusion height is
 * therefore roof elevation minus entrance elevation when both are usable.
 *
 * Fallback order is intentionally conservative:
 * 1. roof elevation - entrance elevation
 * 2. `1_bd_high` when it is already a plausible physical height
 * 3. floors × 3.2 m
 * 4. generic 9.6 m
 */
export function deriveBuildingHeight(properties = {}) {
  const topElevation = finiteNumber(properties["1_top_high"]);
  const entranceElevation = finiteNumber(properties["1_entr_heig"]);
  const surveyedBuildingHeight = finiteNumber(properties["1_bd_high"]);
  const floors = finiteNumber(properties["1_floor"]);

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
      source: "1_bd_high",
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
