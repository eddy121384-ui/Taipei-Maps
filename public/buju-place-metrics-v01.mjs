const EARTH_RADIUS_M = 6371008.8;
const DISTANCE_EPSILON_M = 1e-7;

export const DAILY_LIFE_RADII_M = Object.freeze({
  convenience_store: 500,
  supermarket: 800,
});

function assertPoint(point, label = 'point') {
  if (!point || typeof point !== 'object') throw new TypeError(`${label} must be an object with lon/lat`);
  const lon = Number(point.lon);
  const lat = Number(point.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new TypeError(`${label} lon/lat must be finite numbers`);
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new RangeError(`${label} lon/lat out of range`);
  return { lon, lat };
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

export function greatCircleDistanceMeters(a, b) {
  const p1 = assertPoint(a, 'point a');
  const p2 = assertPoint(b, 'point b');
  const lat1 = toRadians(p1.lat);
  const lat2 = toRadians(p2.lat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(p2.lon - p1.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalizedCanonicalFeature(feature) {
  if (!feature || feature.type !== 'Feature' || feature.geometry?.type !== 'Point') return null;
  const coordinates = feature.geometry.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;

  const properties = feature.properties || {};
  const category = properties.category;
  if (category !== 'convenience_store' && category !== 'supermarket') return null;

  const canonicalId = String(properties.canonical_id || '').trim();
  if (!canonicalId) throw new Error('supported canonical POI is missing canonical_id');

  return {
    canonical_id: canonicalId,
    category,
    name: properties.name || properties.brand || null,
    brand: properties.brand || null,
    lon,
    lat,
  };
}

function sameCanonicalRecord(a, b) {
  return a.category === b.category && a.lon === b.lon && a.lat === b.lat;
}

function prepareCanonicalPois(features) {
  if (!Array.isArray(features)) throw new TypeError('poiFeatures must be an array of GeoJSON Features');
  const byId = new Map();
  for (const feature of features) {
    const poi = normalizedCanonicalFeature(feature);
    if (!poi) continue;
    const existing = byId.get(poi.canonical_id);
    if (!existing) {
      byId.set(poi.canonical_id, poi);
      continue;
    }
    if (!sameCanonicalRecord(existing, poi)) {
      throw new Error(`conflicting duplicate canonical_id: ${poi.canonical_id}`);
    }
  }
  return [...byId.values()];
}

function isBetterNearest(candidate, current) {
  if (!current) return true;
  if (candidate.distance_m_raw < current.distance_m_raw - DISTANCE_EPSILON_M) return true;
  if (Math.abs(candidate.distance_m_raw - current.distance_m_raw) <= DISTANCE_EPSILON_M) {
    return candidate.canonical_id < current.canonical_id;
  }
  return false;
}

function publicNearest(nearest) {
  if (!nearest) return null;
  return {
    distance_m: Math.round(nearest.distance_m_raw * 10) / 10,
    canonical_id: nearest.canonical_id,
    name: nearest.name,
    brand: nearest.brand,
  };
}

export function computeDailyLifeMetrics(queryPoint, poiFeatures) {
  const query = assertPoint(queryPoint, 'queryPoint');
  const pois = prepareCanonicalPois(poiFeatures);

  let nearestConvenience = null;
  let nearestSupermarket = null;
  let convenienceCount500m = 0;
  let supermarketCount800m = 0;

  for (const poi of pois) {
    const distance = greatCircleDistanceMeters(query, poi);
    const candidate = { ...poi, distance_m_raw: distance };

    if (poi.category === 'convenience_store') {
      if (distance <= DAILY_LIFE_RADII_M.convenience_store + DISTANCE_EPSILON_M) convenienceCount500m += 1;
      if (isBetterNearest(candidate, nearestConvenience)) nearestConvenience = candidate;
    } else {
      if (distance <= DAILY_LIFE_RADII_M.supermarket + DISTANCE_EPSILON_M) supermarketCount800m += 1;
      if (isBetterNearest(candidate, nearestSupermarket)) nearestSupermarket = candidate;
    }
  }

  return {
    nearest_convenience_store: publicNearest(nearestConvenience),
    convenience_store_count_500m: convenienceCount500m,
    nearest_supermarket: publicNearest(nearestSupermarket),
    supermarket_count_800m: supermarketCount800m,
  };
}
