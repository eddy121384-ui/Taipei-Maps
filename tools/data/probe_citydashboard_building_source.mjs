import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = 'https://citydashboard.taipei/';
const OUT = path.resolve('data/derived/citydashboard_building_source_probe.txt');
const MARKERS = [
  'tp_building_height84-18p8j0',
  'taipei_building_3d_source',
  '1_top_high',
];

function redact(text) {
  return String(text)
    .replace(/pk\.[A-Za-z0-9._-]+/g, '[REDACTED_MAPBOX_PUBLIC_TOKEN]')
    .replace(/([?&](?:access_token|token)=)[^&"'\s]+/gi, '$1[REDACTED]');
}

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Taipei-Maps-source-forensics/0.1 (+public client bundle audit)',
        accept: 'text/html,application/javascript,application/json,application/xml,text/xml,*/*',
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function unique(values) {
  return [...new Set(values)];
}

function scriptUrls(html) {
  const out = [];
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    try { out.push(new URL(match[1], ROOT).href); } catch {}
  }
  return unique(out);
}

function nearbyContexts(text, marker, radius = 1800) {
  const out = [];
  let from = 0;
  while (out.length < 5) {
    const idx = text.indexOf(marker, from);
    if (idx < 0) break;
    out.push(text.slice(Math.max(0, idx - radius), Math.min(text.length, idx + marker.length + radius)));
    from = idx + marker.length;
  }
  return out;
}

function extractCandidateUrls(text) {
  const values = [];
  for (const re of [
    /mapbox:\/\/[^"'`\s)\\]+/g,
    /https?:\/\/[^"'`\s)\\]+/g,
  ]) {
    for (const m of text.matchAll(re)) values.push(redact(m[0]));
  }
  return unique(values).slice(0, 80);
}

async function inspectLiveBundles(report) {
  report.push('=== Phase 1: live production bundle fingerprint ===');
  let html;
  try {
    html = await fetchText(ROOT);
  } catch (error) {
    report.push(`ERROR fetching ${ROOT}: ${error.message || error}`);
    report.push('');
    return;
  }

  const scripts = scriptUrls(html).filter((u) => /\.m?js(?:\?|$)/i.test(u));
  report.push(`HTML fetched: ${html.length.toLocaleString()} chars`);
  report.push(`JS assets discovered: ${scripts.length}`);

  const matches = [];
  for (const [index, url] of scripts.entries()) {
    try {
      const body = await fetchText(url, 30000);
      const hitMarkers = MARKERS.filter((m) => body.includes(m));
      if (!hitMarkers.length) continue;
      const contexts = [];
      for (const marker of hitMarkers) contexts.push(...nearbyContexts(body, marker));
      matches.push({ url, bytes: body.length, hitMarkers, contexts, urls: extractCandidateUrls(contexts.join('\n')) });
      report.push(`MATCH ${index + 1}/${scripts.length}: ${url}`);
    } catch (error) {
      report.push(`WARN asset failed: ${url} :: ${error.message || error}`);
    }
  }

  report.push(`Matched JS assets: ${matches.length}`);
  if (!matches.length) {
    report.push('No known building marker was found in the currently discoverable JS assets.');
    report.push('This may mean code-splitting/lazy chunks are only requested after entering the dashboard map, or marker names changed in production.');
    report.push('');
    return;
  }

  for (const [i, match] of matches.entries()) {
    report.push('');
    report.push(`--- matched asset ${i + 1} ---`);
    report.push(`URL: ${match.url}`);
    report.push(`Size: ${match.bytes.toLocaleString()} chars`);
    report.push(`Markers: ${match.hitMarkers.join(', ')}`);
    report.push(`Candidate URLs near marker (${match.urls.length}):`);
    for (const url of match.urls) report.push(`  ${url}`);
    report.push('Sanitized contexts:');
    for (const [j, context] of match.contexts.entries()) {
      report.push(`  [context ${j + 1}]`);
      report.push(redact(context).replace(/\s+/g, ' ').slice(0, 4200));
    }
  }
  report.push('');
}

function parseLayerNames(xml) {
  const names = [];
  for (const m of xml.matchAll(/<(?:\w+:)?Name>([^<]+)<\/(?:\w+:)?Name>/g)) names.push(m[1].trim());
  return unique(names);
}

async function inspectGeoServer(report) {
  report.push('=== Phase 2: public City Dashboard GeoServer cross-check ===');
  const capabilityUrls = [
    `${ROOT}geo_server/ows?service=WFS&version=1.1.0&request=GetCapabilities`,
    `${ROOT}geo_server/wfs?service=WFS&version=1.1.0&request=GetCapabilities`,
    `${ROOT}geo_server/ows?service=WFS&version=1.0.0&request=GetCapabilities`,
  ];

  let xml = null;
  let sourceUrl = null;
  for (const url of capabilityUrls) {
    try {
      const body = await fetchText(url, 30000);
      if (/FeatureType|WFS_Capabilities/i.test(body)) {
        xml = body;
        sourceUrl = url;
        break;
      }
    } catch (error) {
      report.push(`WARN capabilities failed: ${url} :: ${error.message || error}`);
    }
  }

  if (!xml) {
    report.push('No readable public WFS GetCapabilities response was found.');
    report.push('');
    return;
  }

  report.push(`Capabilities: ${sourceUrl}`);
  report.push(`Capabilities size: ${xml.length.toLocaleString()} chars`);
  const names = parseLayerNames(xml);
  const candidates = names.filter((n) => /building|height|建物|建築/i.test(n) || n.includes('tp_building_height84-18p8j0'));
  report.push(`Feature/type names parsed: ${names.length}`);
  report.push(`Building/height candidates: ${candidates.length}`);
  for (const name of candidates.slice(0, 100)) report.push(`  ${name}`);

  const exact = names.find((n) => n === 'taipei_vioc:tp_building_height84-18p8j0' || n.endsWith(':tp_building_height84-18p8j0'));
  if (!exact) {
    report.push('Exact City Dashboard Mapbox source-layer name was NOT found in public WFS capabilities.');
    report.push('That supports (but does not prove) the idea that the fast building tileset is a separately published Mapbox derivative rather than a direct GeoServer layer.');
    report.push('');
    return;
  }

  report.push(`Exact candidate found: ${exact}`);
  const featureUrl = `${ROOT}geo_server/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${encodeURIComponent(exact)}&maxFeatures=1&outputFormat=application%2Fjson`;
  try {
    const body = await fetchText(featureUrl, 30000);
    const data = JSON.parse(body);
    const feature = data?.features?.[0];
    if (!feature) {
      report.push('Exact WFS layer responded, but no feature was returned.');
    } else {
      report.push(`Sample geometry: ${feature.geometry?.type || 'unknown'}`);
      report.push(`Sample property fields: ${Object.keys(feature.properties || {}).join(', ')}`);
      if (Object.prototype.hasOwnProperty.call(feature.properties || {}, '1_top_high')) {
        report.push(`Sample 1_top_high: ${feature.properties['1_top_high']}`);
      }
    }
  } catch (error) {
    report.push(`Exact layer sample query failed: ${error.message || error}`);
  }
  report.push('');
}

async function main() {
  const report = [];
  report.push('Taipei-Maps — Taipei City Dashboard building-source forensic probe');
  report.push(`Run at: ${new Date().toISOString()}`);
  report.push('Purpose: identify public source lineage for the City Dashboard fast 3D building layer.');
  report.push('Guardrail: Mapbox access tokens are redacted and must not be reused.');
  report.push('');

  await inspectLiveBundles(report);
  await inspectGeoServer(report);

  report.push('=== Known contract from official open-source frontend ===');
  report.push('source id: taipei_building_3d_source');
  report.push('source type: vector');
  report.push('source URL: build-time VITE_MAPBOXTILE');
  report.push('source-layer: tp_building_height84-18p8j0');
  report.push('height field: 1_top_high');
  report.push('renderer: fill-extrusion');
  report.push('minzoom: 14');
  report.push('');
  report.push('Next decision:');
  report.push('- if a public authoritative footprint+height endpoint is found, build a tiny Xinyi MapLibre A/B from it;');
  report.push('- if only a private/protected Mapbox derivative is found, trace the derivative back to official DUD/open-data inputs instead of reusing City Dashboard credentials/tiles.');

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, report.join('\n'), 'utf8');
  console.log(report.join('\n'));
  console.log(`\nReport saved to: ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
