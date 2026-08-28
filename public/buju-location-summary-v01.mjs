import {
  computeDailyLifeMetrics,
  greatCircleDistanceMeters,
} from './buju-place-metrics-v01.mjs';

const DISTANCE_EPSILON_M = 1e-7;

function assertFeatureArray(features, label) {
  if (!Array.isArray(features)) throw new TypeError(`${label} must be an array of GeoJSON Features`);
  return features;
}

function pointCoordinates(feature) {
  if (!feature || feature.type !== 'Feature' || feature.geometry?.type !== 'Point') return null;
  const coordinates = feature.geometry.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  return { lon, lat };
}

function isBetterNearest(candidate, current) {
  if (!current) return true;
  if (candidate.distance_m_raw < current.distance_m_raw - DISTANCE_EPSILON_M) return true;
  if (Math.abs(candidate.distance_m_raw - current.distance_m_raw) <= DISTANCE_EPSILON_M) {
    return candidate.stable_key < current.stable_key;
  }
  return false;
}

function nearestRecord(queryPoint, features, normalizer) {
  let nearest = null;
  for (const feature of features) {
    const coordinates = pointCoordinates(feature);
    if (!coordinates) continue;
    const normalized = normalizer(feature, coordinates);
    if (!normalized) continue;
    const distance = greatCircleDistanceMeters(queryPoint, coordinates);
    const candidate = { ...normalized, ...coordinates, distance_m_raw: distance };
    if (isBetterNearest(candidate, nearest)) nearest = candidate;
  }
  return nearest;
}

function roundedDistance(value) {
  return Math.round(value * 10) / 10;
}

function normalizeMrtFeature(feature) {
  const properties = feature.properties || {};
  const name = String(properties.station_name || '').trim();
  if (!name) return null;
  const location = String(properties.location || '').trim() || null;
  return {
    stable_key: `mrt|${name}|${location || ''}`,
    name,
    location,
    source: properties.source || null,
  };
}

function publicMrt(nearest) {
  if (!nearest) return null;
  return {
    distance_m: roundedDistance(nearest.distance_m_raw),
    name: nearest.name,
    location: nearest.location,
    coordinates: [nearest.lon, nearest.lat],
    source: nearest.source,
  };
}

function normalizeHealthcareFeature(feature, expectedType) {
  const properties = feature.properties || {};
  if (properties.facility_type !== expectedType) return null;
  const name = String(properties.facility_name || '').trim();
  if (!name) return null;
  const address = String(properties.address || '').trim() || null;
  const district = String(properties.district || '').trim() || null;
  const facilityCode = String(properties.facility_code || '').trim() || null;
  const campusGroupId = String(properties.campus_group_id || '').trim() || null;
  return {
    stable_key: [
      expectedType,
      facilityCode || '',
      campusGroupId || '',
      name,
      address || '',
    ].join('|'),
    name,
    address,
    district,
    facility_code: facilityCode,
    campus_group_id: campusGroupId,
    source: properties.source || null,
  };
}

function publicHealthcare(nearest) {
  if (!nearest) return null;
  return {
    distance_m: roundedDistance(nearest.distance_m_raw),
    name: nearest.name,
    address: nearest.address,
    district: nearest.district,
    facility_code: nearest.facility_code,
    campus_group_id: nearest.campus_group_id,
    coordinates: [nearest.lon, nearest.lat],
    source: nearest.source,
  };
}

export function nearestMrtStation(queryPoint, mrtStationFeatures) {
  const features = assertFeatureArray(mrtStationFeatures, 'mrtStationFeatures');
  return publicMrt(nearestRecord(queryPoint, features, normalizeMrtFeature));
}

export function nearestHealthcareFacility(queryPoint, healthcareFeatures, facilityType) {
  if (facilityType !== 'hospital' && facilityType !== 'clinic') {
    throw new TypeError('facilityType must be hospital or clinic');
  }
  const features = assertFeatureArray(healthcareFeatures, 'healthcareFeatures');
  return publicHealthcare(nearestRecord(
    queryPoint,
    features,
    (feature) => normalizeHealthcareFeature(feature, facilityType),
  ));
}

function unavailableSchool(reason) {
  return {
    status: 'unavailable',
    reason: String(reason || 'school resolver unavailable'),
    academic_year: null,
    district: null,
    village: null,
    neighbors: [],
    elementary_school_district: null,
    junior_school_district: null,
  };
}

export async function computeLocationSummary(queryPoint, sources) {
  if (!sources || typeof sources !== 'object') throw new TypeError('sources must be an object');
  const poiFeatures = assertFeatureArray(sources.poiFeatures, 'poiFeatures');
  const mrtStationFeatures = assertFeatureArray(sources.mrtStationFeatures, 'mrtStationFeatures');
  const healthcareFeatures = assertFeatureArray(sources.healthcareFeatures, 'healthcareFeatures');

  const dailyLife = computeDailyLifeMetrics(queryPoint, poiFeatures);
  const nearestMrt = nearestMrtStation(queryPoint, mrtStationFeatures);
  const nearestHospital = nearestHealthcareFacility(queryPoint, healthcareFeatures, 'hospital');
  const nearestClinic = nearestHealthcareFacility(queryPoint, healthcareFeatures, 'clinic');

  let school;
  if (typeof sources.resolveSchoolDistricts !== 'function') {
    school = unavailableSchool('school resolver not provided');
  } else {
    try {
      const resolved = await sources.resolveSchoolDistricts(queryPoint);
      school = resolved && typeof resolved === 'object'
        ? resolved
        : unavailableSchool('school resolver returned no result');
    } catch (error) {
      school = unavailableSchool(error?.message || error);
    }
  }

  return {
    schema_version: 'location-summary-v0.1',
    query: { lon: Number(queryPoint.lon), lat: Number(queryPoint.lat) },
    daily_life: dailyLife,
    transit: {
      nearest_mrt_station: nearestMrt,
    },
    healthcare: {
      nearest_hospital: nearestHospital,
      nearest_clinic: nearestClinic,
    },
    school,
  };
}
