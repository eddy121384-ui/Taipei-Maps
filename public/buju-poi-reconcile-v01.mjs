import { buildCanonical, haversine, reviewMax } from './buju-poi-canonical-v02.mjs';

function syntheticFeature(entity, dataset) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [...entity.coordinates] },
    properties: {
      id: `${dataset}:${entity.canonical_id}`,
      '@name': entity.name || (entity.branch ? `${entity.brand} ${entity.branch}` : entity.brand),
      brand: { names: { primary: entity.brand } },
      addresses: entity.address || '',
      sources: [{ dataset }],
    },
  };
}

export function pairMatchesCanonicalRules(overtureEntity, osmEntity) {
  if (!overtureEntity || !osmEntity) return false;
  if (overtureEntity.brand !== osmEntity.brand || overtureEntity.category !== osmEntity.category) return false;
  const result = buildCanonical([
    syntheticFeature(overtureEntity, 'BujuOvertureCanonical'),
    syntheticFeature(osmEntity, 'BujuOSMCanonical'),
  ]);
  return result.entities.length === 1 && result.entities[0].source_rows === 2;
}

function normalizeAddressForCrossSource(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/臺/g, '台')
    .replace(/taiwan|\btw\b/gi, '')
    .replace(/^\s*\d{3,6}/, '')
    .replace(/[\s,，、;；。．\.\-–—_]/g, '');
}

function hasStreetNumber(address) {
  return /(?:路|街|大道|巷|弄)[^號号]{0,30}\d+(?:號|号)/.test(address);
}

export function pairMatchesExtendedAddressRules(overtureEntity, osmEntity) {
  if (!overtureEntity || !osmEntity) return false;
  if (overtureEntity.brand !== osmEntity.brand || overtureEntity.category !== osmEntity.category) return false;
  const a = normalizeAddressForCrossSource(overtureEntity.address);
  const b = normalizeAddressForCrossSource(osmEntity.address);
  if (!a || !b) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < 8 || !hasStreetNumber(shorter)) return false;
  return longer.includes(shorter);
}

function roundedDistance(a, b) {
  return Math.round(haversine(a.coordinates, b.coordinates) * 10) / 10;
}

function stableEntityOrder(a, b) {
  return `${a.category}|${a.brand}|${a.canonical_id}`.localeCompare(`${b.category}|${b.brand}|${b.canonical_id}`, 'zh-Hant');
}

function osmHasPreciseAddressNode(osm) {
  return Boolean(String(osm?.address || '').trim()) && Array.isArray(osm?.osm_objects) && osm.osm_objects.some(object => object?.osm_type === 'node');
}

function reviewedOverrideMap(overrides = []) {
  const map = new Map();
  for (const override of overrides || []) {
    const osmId = String(override?.osm_canonical_id || '');
    const overtureId = String(override?.overture_canonical_id || '');
    if (!osmId || !overtureId) throw new Error('reviewed match override must include osm_canonical_id and overture_canonical_id');
    if (map.has(osmId)) throw new Error(`duplicate reviewed match override for OSM canonical id: ${osmId}`);
    const coordinateSource = override.coordinate_source || 'overture_baseline';
    if (!['overture_baseline', 'osm_secondary'].includes(coordinateSource)) throw new Error(`unsupported reviewed coordinate source: ${coordinateSource}`);
    map.set(osmId, { ...override, coordinate_source: coordinateSource });
  }
  return map;
}

export function reconcileCanonicalPOI(overtureEntities, osmEntities, options = {}) {
  const baseline = [...(overtureEntities || [])].sort(stableEntityOrder);
  const secondary = [...(osmEntities || [])].sort(stableEntityOrder);
  const baselineIds = new Set(baseline.map(entity => entity.canonical_id));
  const baselineById = new Map(baseline.map(entity => [entity.canonical_id, entity]));
  const secondaryIds = new Set(secondary.map(entity => entity.canonical_id));
  const reviewedOverrides = reviewedOverrideMap(options.reviewedMatchOverrides || []);
  const matched = [];
  const safeHoles = [];
  const unresolved = [];
  const coordinateOverrides = new Map();
  let reviewedMatchCount = 0;

  for (const osmId of reviewedOverrides.keys()) {
    if (!secondaryIds.has(osmId)) throw new Error(`reviewed match override OSM canonical id not found: ${osmId}`);
  }

  for (const osm of secondary) {
    const sameBrand = baseline
      .filter(entity => entity.brand === osm.brand && entity.category === osm.category)
      .map(entity => ({ entity, distance_m: roundedDistance(entity, osm) }))
      .sort((a, b) => a.distance_m - b.distance_m || a.entity.canonical_id.localeCompare(b.entity.canonical_id));

    const reviewed = reviewedOverrides.get(osm.canonical_id);
    if (reviewed) {
      const candidate = baselineById.get(reviewed.overture_canonical_id);
      if (!candidate) throw new Error(`reviewed match override Overture canonical id not found: ${reviewed.overture_canonical_id}`);
      if (candidate.brand !== osm.brand || candidate.category !== osm.category) {
        throw new Error(`reviewed match override brand/category mismatch: ${osm.canonical_id} -> ${candidate.canonical_id}`);
      }
      const distance = roundedDistance(candidate, osm);
      if (reviewed.coordinate_source === 'osm_secondary') {
        coordinateOverrides.set(candidate.canonical_id, {
          coordinates: [...osm.coordinates],
          osm_canonical_id: osm.canonical_id,
          osm_source_ids: [...(osm.source_ids || [])],
          reason: `reviewed-pair-override:${reviewed.reason || 'manual-qa'}`,
        });
      }
      matched.push({
        osm_canonical_id: osm.canonical_id,
        overture_canonical_id: candidate.canonical_id,
        brand: osm.brand,
        category: osm.category,
        distance_m: distance,
        osm_name: osm.name,
        overture_name: candidate.name,
        decision: 'matched',
        match_reason: 'reviewed-pair-override',
        reviewed_reason: reviewed.reason || 'manual-qa',
        coordinate_source: reviewed.coordinate_source,
      });
      reviewedMatchCount += 1;
      continue;
    }

    const radius = reviewMax(osm.category);
    const withinReview = sameBrand.filter(candidate => candidate.distance_m <= radius);
    const highConfidence = withinReview.filter(candidate => pairMatchesCanonicalRules(candidate.entity, osm));

    if (highConfidence.length === 1) {
      const candidate = highConfidence[0];
      matched.push({
        osm_canonical_id: osm.canonical_id,
        overture_canonical_id: candidate.entity.canonical_id,
        brand: osm.brand,
        category: osm.category,
        distance_m: candidate.distance_m,
        osm_name: osm.name,
        overture_name: candidate.entity.name,
        decision: 'matched',
        match_reason: 'canonical-v0.2',
      });
      continue;
    }

    if (highConfidence.length > 1) {
      unresolved.push({
        osm_canonical_id: osm.canonical_id,
        brand: osm.brand,
        category: osm.category,
        osm_name: osm.name,
        decision: 'cross_source_unresolved',
        reason: 'multiple-high-confidence-matches',
        candidates: highConfidence.map(candidate => ({
          overture_canonical_id: candidate.entity.canonical_id,
          name: candidate.entity.name,
          distance_m: candidate.distance_m,
        })),
      });
      continue;
    }

    if (withinReview.length > 0) {
      unresolved.push({
        osm_canonical_id: osm.canonical_id,
        brand: osm.brand,
        category: osm.category,
        osm_name: osm.name,
        decision: 'cross_source_unresolved',
        reason: 'nearby-same-brand-without-high-confidence-match',
        candidates: withinReview.map(candidate => ({
          overture_canonical_id: candidate.entity.canonical_id,
          name: candidate.entity.name,
          distance_m: candidate.distance_m,
        })),
      });
      continue;
    }

    const extendedAddressCandidates = sameBrand.filter(candidate =>
      candidate.distance_m > radius &&
      candidate.distance_m <= radius * 1.5 &&
      pairMatchesExtendedAddressRules(candidate.entity, osm),
    );

    if (extendedAddressCandidates.length === 1) {
      const candidate = extendedAddressCandidates[0];
      const coordinateOverride = osmHasPreciseAddressNode(osm);
      if (coordinateOverride) {
        coordinateOverrides.set(candidate.entity.canonical_id, {
          coordinates: [...osm.coordinates],
          osm_canonical_id: osm.canonical_id,
          osm_source_ids: [...(osm.source_ids || [])],
          reason: 'extended-address-match-osm-node',
        });
      }
      matched.push({
        osm_canonical_id: osm.canonical_id,
        overture_canonical_id: candidate.entity.canonical_id,
        brand: osm.brand,
        category: osm.category,
        distance_m: candidate.distance_m,
        osm_name: osm.name,
        overture_name: candidate.entity.name,
        decision: 'matched',
        match_reason: 'extended-address-containment',
        coordinate_source: coordinateOverride ? 'osm_secondary' : 'overture_baseline',
      });
      continue;
    }

    if (extendedAddressCandidates.length > 1) {
      unresolved.push({
        osm_canonical_id: osm.canonical_id,
        brand: osm.brand,
        category: osm.category,
        osm_name: osm.name,
        decision: 'cross_source_unresolved',
        reason: 'multiple-extended-address-matches',
        candidates: extendedAddressCandidates.map(candidate => ({
          overture_canonical_id: candidate.entity.canonical_id,
          name: candidate.entity.name,
          distance_m: candidate.distance_m,
        })),
      });
      continue;
    }

    safeHoles.push({
      ...osm,
      canonical_id: `buju-poi-osm-${String(osm.canonical_id).replace(/^buju-poi-/, '')}`,
      source_kind: 'osm_hole_fill',
      nearest_same_brand_distance_m: sameBrand[0]?.distance_m ?? null,
    });
  }

  const finalEntities = [
    ...baseline.map(entity => {
      const override = coordinateOverrides.get(entity.canonical_id);
      if (!override) return { ...entity, source_kind: entity.source_kind || 'overture_baseline' };
      return {
        ...entity,
        coordinates: [...override.coordinates],
        source_kind: entity.source_kind || 'overture_baseline',
        coordinate_source_kind: 'osm_secondary',
        coordinate_override_reason: override.reason,
        coordinate_osm_canonical_id: override.osm_canonical_id,
        coordinate_osm_source_ids: override.osm_source_ids,
      };
    }),
    ...safeHoles,
  ].sort(stableEntityOrder);

  const finalIds = new Set();
  for (const entity of finalEntities) {
    if (finalIds.has(entity.canonical_id)) throw new Error(`duplicate final canonical id: ${entity.canonical_id}`);
    finalIds.add(entity.canonical_id);
  }
  for (const id of baselineIds) {
    if (!finalIds.has(id)) throw new Error(`baseline canonical id lost during reconciliation: ${id}`);
  }

  matched.sort((a, b) => a.osm_canonical_id.localeCompare(b.osm_canonical_id));
  unresolved.sort((a, b) => a.osm_canonical_id.localeCompare(b.osm_canonical_id));
  safeHoles.sort(stableEntityOrder);

  return {
    matched,
    safeHoles,
    unresolved,
    finalEntities,
    stats: {
      overture_baseline: baseline.length,
      osm_canonical: secondary.length,
      matched: matched.length,
      safe_holes: safeHoles.length,
      cross_source_unresolved: unresolved.length,
      reviewed_match_overrides: reviewedMatchCount,
      coordinate_overrides: coordinateOverrides.size,
      final_canonical: finalEntities.length,
    },
  };
}
