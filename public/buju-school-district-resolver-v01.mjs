function assertPoint(point) {
  if (!point || typeof point !== 'object') throw new TypeError('queryPoint must be an object with lon/lat');
  const lon = Number(point.lon);
  const lat = Number(point.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new TypeError('queryPoint lon/lat must be finite numbers');
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new RangeError('queryPoint lon/lat out of range');
  return { lon, lat };
}

function cleanDistrict(value) {
  return String(value || '').trim().replace(/市$/, '').replace(/區$/, '');
}

function cleanVillage(value) {
  return String(value || '').trim().replace(/里$/, '');
}

function canonicalVillage(properties) {
  const sdf = String(properties?.SDFNAME || '').trim();
  const fromSdf = sdf.match(/^(.+?)里\s*\d/);
  return cleanVillage(fromSdf?.[1] || properties?.LIE_NAME);
}

function neighborNumbers(value) {
  return [...new Set((String(value ?? '').match(/\d+/g) || []).map(Number).filter(Number.isFinite))]
    .sort((a, b) => a - b);
}

export function parseNeighborSpec(spec) {
  const out = new Set();
  for (const token of String(spec || '').replace(/、/g, ',').split(',').map((s) => s.trim()).filter(Boolean)) {
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      for (let value = Number(range[1]); value <= Number(range[2]); value += 1) out.add(value);
    } else if (/^\d+$/.test(token)) {
      out.add(Number(token));
    }
  }
  return out;
}

function assignmentForNeighbor(entry, neighbor) {
  if (!entry) return null;
  if (entry.all) return entry.all;
  for (const rule of entry.rules || []) {
    if (parseNeighborSpec(rule.spec).has(neighbor)) return rule.school || null;
  }
  return null;
}

export function resolveAssignmentFromDataset(dataset, level, district, village, neighbors) {
  if (!dataset?.levels?.[level]) return null;
  const entry = dataset.levels[level][`${cleanDistrict(district)}|${cleanVillage(village)}`];
  if (!entry) return null;
  if (entry.all) return entry.all;
  if (!Array.isArray(neighbors) || !neighbors.length) return null;
  const assignments = neighbors.map((neighbor) => assignmentForNeighbor(entry, neighbor));
  if (assignments.some((assignment) => !assignment)) return null;
  const unique = [...new Set(assignments)];
  return unique.length === 1 ? unique[0] : null;
}

function geometryIdentity(feature, index) {
  const properties = feature?.properties || {};
  if (properties.f_id != null) return `f:${properties.f_id}`;
  if (properties.SDFKEY) return `s:${properties.SDFKEY}`;
  return `i:${index}:${properties.SECT_NAME || ''}:${properties.LIE_NAME || ''}:${properties.LI_NO || ''}`;
}

function dedupeFeatures(features) {
  const seen = new Set();
  const out = [];
  for (let index = 0; index < features.length; index += 1) {
    const feature = features[index];
    const key = geometryIdentity(feature, index);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(feature);
  }
  return out;
}

function unavailable(reason, extra = {}) {
  return {
    status: 'unavailable',
    reason,
    academic_year: null,
    district: null,
    village: null,
    neighbors: [],
    elementary_school_district: null,
    junior_school_district: null,
    ...extra,
  };
}

function unresolved(reason, details) {
  return {
    status: 'unresolved',
    reason,
    ...details,
  };
}

export async function resolveTaipeiSchoolDistricts(queryPoint, options = {}) {
  const query = assertPoint(queryPoint);
  const dataset = options.dataset;
  if (!dataset?.sources?.geometry?.endpoint || !dataset?.levels?.elementary || !dataset?.levels?.junior) {
    return unavailable('Taipei school district dataset missing or malformed');
  }

  const coverageDistricts = new Set(dataset.coverage?.districts || []);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required');

  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'f_id,SECT_NAME,LIE_NAME,LIE_CODE,LI_NO,SDFKEY,SDFNAME',
    returnGeometry: 'false',
    geometry: `${query.lon},${query.lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    f: 'geojson',
  });

  const response = await fetchImpl(`${dataset.sources.geometry.endpoint}?${params}`, { cache: 'no-store' });
  if (!response?.ok) throw new Error(`Taipei neighbor geometry HTTP ${response?.status ?? 'unknown'}`);
  const payload = await response.json();
  if (payload?.error) throw new Error(`Taipei neighbor geometry API ${JSON.stringify(payload.error)}`);

  const features = dedupeFeatures(Array.isArray(payload?.features) ? payload.features : []);
  if (!features.length) return unavailable('query point is outside supported Taipei neighbor geometry');

  const identities = new Map();
  for (const feature of features) {
    const properties = feature.properties || {};
    const district = cleanDistrict(properties.SECT_NAME);
    const village = canonicalVillage(properties);
    const neighbors = neighborNumbers(properties.LI_NO);
    if (!district || !village || !neighbors.length) continue;
    const identity = `${district}|${village}|${neighbors.join(',')}`;
    if (!identities.has(identity)) identities.set(identity, { feature, district, village, neighbors });
  }

  if (!identities.size) return unavailable('official neighbor geometry returned no usable neighbor identity');
  if (identities.size > 1) {
    return unresolved('query point intersects multiple official neighbor identities', {
      academic_year: dataset.academicYear || null,
      district: null,
      village: null,
      neighbors: [],
      elementary_school_district: null,
      junior_school_district: null,
      candidates: [...identities.keys()].sort(),
    });
  }

  const [{ feature, district, village, neighbors }] = [...identities.values()];
  if (coverageDistricts.size && !coverageDistricts.has(district)) {
    return unavailable('query point is outside Taipei school assignment coverage', {
      academic_year: dataset.academicYear || null,
      district,
      village,
      neighbors,
    });
  }

  if (typeof options.ensureDistrictLoaded === 'function') {
    await options.ensureDistrictLoaded(district);
  }

  const elementary = resolveAssignmentFromDataset(dataset, 'elementary', district, village, neighbors);
  const junior = resolveAssignmentFromDataset(dataset, 'junior', district, village, neighbors);
  const details = {
    academic_year: dataset.academicYear || null,
    district,
    village,
    neighbors,
    elementary_school_district: elementary,
    junior_school_district: junior,
    geometry_feature_id: feature?.properties?.f_id ?? null,
    geometry_key: feature?.properties?.SDFKEY || null,
    source: {
      assignment_authority: dataset.sources?.assignment?.authority || null,
      geometry_authority: dataset.sources?.geometry?.authority || null,
    },
  };

  if (!elementary || !junior) return unresolved('official neighbor resolved but one or more school assignments are missing', details);
  return { status: 'resolved', reason: null, ...details };
}
