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

function normalizeCoordinateSource(value) {
  const source = value || 'overture_baseline';
  if (!['overture_baseline', 'osm_secondary'].includes(source)) throw new Error(`unsupported reviewed coordinate source: ${source}`);
  return source;
}

function reviewedOverrideMap(overrides = []) {
  const map = new Map();
  for (const override of overrides || []) {
    const osmId = String(override?.osm_canonical_id || '');
    const overtureId = String(override?.overture_canonical_id || '');
    if (!osmId || !overtureId) throw new Error('reviewed match override must include osm_canonical_id and overture_canonical_id');
    if (map.has(osmId)) throw new Error(`duplicate reviewed match override for OSM canonical id: ${osmId}`);
    map.set(osmId, { ...override, coordinate_source: normalizeCoordinateSource(override.coordinate_source) });
  }
  return map;
}

function reviewedClusterMap(overrides = []) {
  const map = new Map();
  for (const override of overrides || []) {
    const osmId = String(override?.osm_canonical_id || '');
    const survivorId = String(override?.surviving_overture_canonical_id || '');
    const retiredIds = [...new Set((override?.retired_overture_canonical_ids || []).map(String).filter(Boolean))].sort();
    if (!osmId || !survivorId || retiredIds.length === 0) {
      throw new Error('reviewed cluster override must include osm_canonical_id, surviving_overture_canonical_id, and retired_overture_canonical_ids');
    }
    if (retiredIds.includes(survivorId)) throw new Error(`reviewed cluster survivor cannot also be retired: ${survivorId}`);
    if (map.has(osmId)) throw new Error(`duplicate reviewed cluster override for OSM canonical id: ${osmId}`);
    map.set(osmId, {
      ...override,
      surviving_overture_canonical_id: survivorId,
      retired_overture_canonical_ids: retiredIds,
      coordinate_source: normalizeCoordinateSource(override.coordinate_source || 'osm_secondary'),
    });
  }
  return map;
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter(value => value != null && String(value) !== '').map(String))].sort();
}

function mergeReviewedClusterEvidence(survivor, retiredEntities, metadata) {
  const members = [survivor, ...retiredEntities];
  return {
    ...survivor,
    source_rows: members.reduce((sum, entity) => sum + Number(entity.source_rows || 0), 0),
    source_ids: uniqueSorted(members.flatMap(entity => entity.source_ids || [])),
    source_names: uniqueSorted(members.flatMap(entity => entity.source_names || [])),
    sources: uniqueSorted(members.flatMap(entity => entity.sources || [])),
    merge_reasons: uniqueSorted([...(survivor.merge_reasons || []), 'reviewed-cluster-override']),
    branch_conflict: Boolean(survivor.branch_conflict || retiredEntities.some(entity => entity.branch_conflict || (entity.branch && survivor.branch && entity.branch !== survivor.branch))),
    address_conflict: Boolean(survivor.address_conflict || retiredEntities.some(entity => entity.address_conflict || (entity.address && survivor.address && entity.address !== survivor.address))),
    reviewed_cluster_osm_canonical_id: metadata.osm_canonical_id,
    reviewed_cluster_retired_overture_ids: [...metadata.retired_overture_canonical_ids],
    reviewed_cluster_reason: metadata.reason || 'manual-qa',
  };
}

export function reconcileCanonicalPOI(overtureEntities, osmEntities, options = {}) {
  const baseline = [...(overtureEntities || [])].sort(stableEntityOrder);
  const secondary = [...(osmEntities || [])].sort(stableEntityOrder);
  const baselineIds = new Set(baseline.map(entity => entity.canonical_id));
  const baselineById = new Map(baseline.map(entity => [entity.canonical_id, entity]));
  const secondaryIds = new Set(secondary.map(entity => entity.canonical_id));
  const reviewedOverrides = reviewedOverrideMap(options.reviewedMatchOverrides || []);
  const reviewedClusters = reviewedClusterMap(options.reviewedClusterOverrides || []);
  const retiredBaselineIds = new Set();
  const clusterBySurvivor = new Map();
  const matched = [];
  const safeHoles = [];
  const unresolved = [];
  const coordinateOverrides = new Map();
  let reviewedMatchCount = 0;
  let reviewedClusterCount = 0;

  for (const osmId of reviewedOverrides.keys()) {
    if (!secondaryIds.has(osmId)) throw new Error(`reviewed match override OSM canonical id not found: ${osmId}`);
    if (reviewedClusters.has(osmId)) throw new Error(`OSM canonical id cannot be in both reviewed pair and cluster overrides: ${osmId}`);
  }

  for (const [osmId, cluster] of reviewedClusters) {
    if (!secondaryIds.has(osmId)) throw new Error(`reviewed cluster OSM canonical id not found: ${osmId}`);
    const survivor = baselineById.get(cluster.surviving_overture_canonical_id);
    if (!survivor) throw new Error(`reviewed cluster survivor not found: ${cluster.surviving_overture_canonical_id}`);
    const osm = secondary.find(entity => entity.canonical_id === osmId);
    const retiredEntities = cluster.retired_overture_canonical_ids.map(id => {
      const entity = baselineById.get(id);
      if (!entity) throw new Error(`reviewed cluster retired Overture canonical id not found: ${id}`);
      return entity;
    });
    for (const entity of [survivor, ...retiredEntities]) {
      if (entity.brand !== osm.brand || entity.category !== osm.category) throw new Error(`reviewed cluster brand/category mismatch: ${osmId} -> ${entity.canonical_id}`);
    }
    if (clusterBySurvivor.has(survivor.canonical_id)) throw new Error(`duplicate reviewed cluster survivor: ${survivor.canonical_id}`);
    for (const retired of retiredEntities) {
      if (retiredBaselineIds.has(retired.canonical_id)) throw new Error(`Overture canonical id retired by multiple reviewed clusters: ${retired.canonical_id}`);
      retiredBaselineIds.add(retired.canonical_id);
    }
    clusterBySurvivor.set(survivor.canonical_id, { ...cluster, osm_canonical_id: osmId, retiredEntities });
  }

  for (const override of reviewedOverrides.values()) {
    if (retiredBaselineIds.has(override.overture_canonical_id)) throw new Error(`reviewed pair override targets a retired cluster member: ${override.overture_canonical_id}`);
  }

  const activeBaseline = baseline.filter(entity => !retiredBaselineIds.has(entity.canonical_id));

  for (const osm of secondary) {
    const sameBrand = activeBaseline
      .filter(entity => entity.brand === osm.brand && entity.category === osm.category)
      .map(entity => ({ entity, distance_m: roundedDistance(entity, osm) }))
      .sort((a, b) => a.distance_m - b.distance_m || a.entity.canonical_id.localeCompare(b.entity.canonical_id));

    const cluster = reviewedClusters.get(osm.canonical_id);
    if (cluster) {
      const candidate = baselineById.get(cluster.surviving_overture_canonical_id);
      const distance = roundedDistance(candidate, osm);
      if (cluster.coordinate_source === 'osm_secondary') {
        coordinateOverrides.set(candidate.canonical_id, {
          coordinates: [...osm.coordinates],
          osm_canonical_id: osm.canonical_id,
          osm_source_ids: [...(osm.source_ids || [])],
          reason: `reviewed-cluster-override:${cluster.reason || 'manual-qa'}`,
        });
      }
      matched.push({
        osm_canonical_id: osm.canonical_id,
        overture_canonical_id: candidate.canonical_id,
        retired_overture_canonical_ids: [...cluster.retired_overture_canonical_ids],
        brand: osm.brand,
        category: osm.category,
        distance_m: distance,
        osm_name: osm.name,
        overture_name: candidate.name,
        decision: 'matched',
        match_reason: 'reviewed-cluster-override',
        reviewed_reason: cluster.reason || 'manual-qa',
        coordinate_source: cluster.coordinate_source,
      });
      reviewedClusterCount += 1;
      continue;
    }

    const reviewed = reviewedOverrides.get(osm.canonical_id);
    if (reviewed) {
      const candidate = baselineById.get(reviewed.overture_canonical_id);
      if (!candidate) throw new Error(`reviewed match override Overture canonical id not found: ${reviewed.overture_canonical_id}`);
      if (candidate.brand !== osm.brand || candidate.category !== osm.category) throw new Error(`reviewed match override brand/category mismatch: ${osm.canonical_id} -> ${candidate.canonical_id}`);
      const distance = roundedDistance(candidate, osm);
      if (reviewed.coordinate_source === 'osm_secondary') {
        coordinateOverrides.set(candidate.canonical_id, {
          coordinates: [...osm.coordinates], osm_canonical_id: osm.canonical_id, osm_source_ids: [...(osm.source_ids || [])], reason: `reviewed-pair-override:${reviewed.reason || 'manual-qa'}`,
        });
      }
      matched.push({
        osm_canonical_id: osm.canonical_id, overture_canonical_id: candidate.canonical_id, brand: osm.brand, category: osm.category, distance_m: distance,
        osm_name: osm.name, overture_name: candidate.name, decision: 'matched', match_reason: 'reviewed-pair-override', reviewed_reason: reviewed.reason || 'manual-qa', coordinate_source: reviewed.coordinate_source,
      });
      reviewedMatchCount += 1;
      continue;
    }

    const radius = reviewMax(osm.category);
    const withinReview = sameBrand.filter(candidate => candidate.distance_m <= radius);
    const highConfidence = withinReview.filter(candidate => pairMatchesCanonicalRules(candidate.entity, osm));

    if (highConfidence.length === 1) {
      const candidate = highConfidence[0];
      matched.push({ osm_canonical_id: osm.canonical_id, overture_canonical_id: candidate.entity.canonical_id, brand: osm.brand, category: osm.category, distance_m: candidate.distance_m, osm_name: osm.name, overture_name: candidate.entity.name, decision: 'matched', match_reason: 'canonical-v0.2' });
      continue;
    }
    if (highConfidence.length > 1) {
      unresolved.push({ osm_canonical_id: osm.canonical_id, brand: osm.brand, category: osm.category, osm_name: osm.name, decision: 'cross_source_unresolved', reason: 'multiple-high-confidence-matches', candidates: highConfidence.map(candidate => ({ overture_canonical_id: candidate.entity.canonical_id, name: candidate.entity.name, distance_m: candidate.distance_m })) });
      continue;
    }
    if (withinReview.length > 0) {
      unresolved.push({ osm_canonical_id: osm.canonical_id, brand: osm.brand, category: osm.category, osm_name: osm.name, decision: 'cross_source_unresolved', reason: 'nearby-same-brand-without-high-confidence-match', candidates: withinReview.map(candidate => ({ overture_canonical_id: candidate.entity.canonical_id, name: candidate.entity.name, distance_m: candidate.distance_m })) });
      continue;
    }

    const extendedAddressCandidates = sameBrand.filter(candidate => candidate.distance_m > radius && candidate.distance_m <= radius * 1.5 && pairMatchesExtendedAddressRules(candidate.entity, osm));
    if (extendedAddressCandidates.length === 1) {
      const candidate = extendedAddressCandidates[0], coordinateOverride = osmHasPreciseAddressNode(osm);
      if (coordinateOverride) coordinateOverrides.set(candidate.entity.canonical_id, { coordinates: [...osm.coordinates], osm_canonical_id: osm.canonical_id, osm_source_ids: [...(osm.source_ids || [])], reason: 'extended-address-match-osm-node' });
      matched.push({ osm_canonical_id: osm.canonical_id, overture_canonical_id: candidate.entity.canonical_id, brand: osm.brand, category: osm.category, distance_m: candidate.distance_m, osm_name: osm.name, overture_name: candidate.entity.name, decision: 'matched', match_reason: 'extended-address-containment', coordinate_source: coordinateOverride ? 'osm_secondary' : 'overture_baseline' });
      continue;
    }
    if (extendedAddressCandidates.length > 1) {
      unresolved.push({ osm_canonical_id: osm.canonical_id, brand: osm.brand, category: osm.category, osm_name: osm.name, decision: 'cross_source_unresolved', reason: 'multiple-extended-address-matches', candidates: extendedAddressCandidates.map(candidate => ({ overture_canonical_id: candidate.entity.canonical_id, name: candidate.entity.name, distance_m: candidate.distance_m })) });
      continue;
    }

    safeHoles.push({ ...osm, canonical_id: `buju-poi-osm-${String(osm.canonical_id).replace(/^buju-poi-/, '')}`, source_kind: 'osm_hole_fill', nearest_same_brand_distance_m: sameBrand[0]?.distance_m ?? null });
  }

  const finalEntities = [
    ...activeBaseline.map(entity => {
      const cluster = clusterBySurvivor.get(entity.canonical_id);
      let output = cluster ? mergeReviewedClusterEvidence(entity, cluster.retiredEntities, cluster) : { ...entity };
      const override = coordinateOverrides.get(entity.canonical_id);
      if (override) {
        output = {
          ...output,
          coordinates: [...override.coordinates],
          coordinate_source_kind: 'osm_secondary',
          coordinate_override_reason: override.reason,
          coordinate_osm_canonical_id: override.osm_canonical_id,
          coordinate_osm_source_ids: override.osm_source_ids,
        };
      }
      return { ...output, source_kind: output.source_kind || 'overture_baseline' };
    }),
    ...safeHoles,
  ].sort(stableEntityOrder);

  const finalIds = new Set();
  for (const entity of finalEntities) {
    if (finalIds.has(entity.canonical_id)) throw new Error(`duplicate final canonical id: ${entity.canonical_id}`);
    finalIds.add(entity.canonical_id);
  }
  for (const id of baselineIds) {
    if (!retiredBaselineIds.has(id) && !finalIds.has(id)) throw new Error(`baseline canonical id lost during reconciliation: ${id}`);
    if (retiredBaselineIds.has(id) && finalIds.has(id)) throw new Error(`retired baseline canonical id survived reconciliation: ${id}`);
  }

  matched.sort((a, b) => a.osm_canonical_id.localeCompare(b.osm_canonical_id));
  unresolved.sort((a, b) => a.osm_canonical_id.localeCompare(b.osm_canonical_id));
  safeHoles.sort(stableEntityOrder);

  return {
    matched,
    safeHoles,
    unresolved,
    finalEntities,
    retiredOvertureCanonicalIds: [...retiredBaselineIds].sort(),
    stats: {
      overture_baseline: baseline.length,
      osm_canonical: secondary.length,
      matched: matched.length,
      safe_holes: safeHoles.length,
      cross_source_unresolved: unresolved.length,
      reviewed_match_overrides: reviewedMatchCount,
      reviewed_cluster_overrides: reviewedClusterCount,
      retired_overture_canonical: retiredBaselineIds.size,
      coordinate_overrides: coordinateOverrides.size,
      final_canonical: finalEntities.length,
    },
  };
}
