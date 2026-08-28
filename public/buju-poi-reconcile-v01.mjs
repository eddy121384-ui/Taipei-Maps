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

function roundedDistance(a, b) {
  return Math.round(haversine(a.coordinates, b.coordinates) * 10) / 10;
}

function stableEntityOrder(a, b) {
  return `${a.category}|${a.brand}|${a.canonical_id}`.localeCompare(`${b.category}|${b.brand}|${b.canonical_id}`, 'zh-Hant');
}

export function reconcileCanonicalPOI(overtureEntities, osmEntities) {
  const baseline = [...(overtureEntities || [])].sort(stableEntityOrder);
  const secondary = [...(osmEntities || [])].sort(stableEntityOrder);
  const baselineIds = new Set(baseline.map(entity => entity.canonical_id));
  const matched = [];
  const safeHoles = [];
  const unresolved = [];

  for (const osm of secondary) {
    const sameBrand = baseline
      .filter(entity => entity.brand === osm.brand && entity.category === osm.category)
      .map(entity => ({ entity, distance_m: roundedDistance(entity, osm) }))
      .sort((a, b) => a.distance_m - b.distance_m || a.entity.canonical_id.localeCompare(b.entity.canonical_id));

    const withinReview = sameBrand.filter(candidate => candidate.distance_m <= reviewMax(osm.category));
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

    safeHoles.push({
      ...osm,
      canonical_id: `buju-poi-osm-${String(osm.canonical_id).replace(/^buju-poi-/, '')}`,
      source_kind: 'osm_hole_fill',
      nearest_same_brand_distance_m: sameBrand[0]?.distance_m ?? null,
    });
  }

  const finalEntities = [
    ...baseline.map(entity => ({ ...entity, source_kind: entity.source_kind || 'overture_baseline' })),
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
      final_canonical: finalEntities.length,
    },
  };
}
