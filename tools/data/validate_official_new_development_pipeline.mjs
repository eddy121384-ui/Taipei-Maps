import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const manifestPath = 'tools/data/new-development-sources.json';
const pipelinePath = 'tools/data/build_official_new_development_pipeline.mjs';
const batPath = 'build-official-new-development-pipeline.bat';

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const pipeline = await readFile(pipelinePath, 'utf8');
const bat = await readFile(batPath, 'utf8');

const requiredSources = [
  'moi_presale_projects',
  'taipei_construction_permits_historical',
  'taipei_construction_permits_current',
  'taipei_building_permit_overlay',
];
for (const key of requiredSources) {
  if (!manifest?.sources?.[key]) throw new Error(`missing source registry entry: ${key}`);
  const row = manifest.sources[key];
  if (!String(row.dataset_page || '').startsWith('https://')) throw new Error(`${key}: missing HTTPS dataset_page`);
  if (!String(row.download_url || '').startsWith('https://')) throw new Error(`${key}: missing HTTPS download_url`);
  if (!/Government Open Data License v1\.0/i.test(String(row.license || ''))) throw new Error(`${key}: unexpected license declaration`);
}

for (const needle of [
  'BUILDINGPERMITNO',
  'extractPermitKeys',
  'parsePermitXml',
  'permit_join_nonspatial',
  'geometry: null',
  'No MOI projects joined to Taipei permit data',
  'taipei_new_developments_official.json',
  'taipei_new_developments_official.audit.json',
]) {
  if (!pipeline.includes(needle)) throw new Error(`pipeline contract missing: ${needle}`);
}

for (const forbidden of ['591.com', 'sinyi.com', 'yungching.com', 'geocode', 'nominatim']) {
  if (pipeline.toLowerCase().includes(forbidden)) throw new Error(`official pipeline unexpectedly contains non-official/fallback dependency: ${forbidden}`);
}

for (const needle of [
  'new-development-sources.json',
  'lvr_buildcasecsv.zip',
  'taipei-permits-historical.xml',
  'taipei-permits-current.xml',
  'build_official_new_development_pipeline.mjs',
  'FAIL - pipeline stopped',
]) {
  if (!bat.includes(needle)) throw new Error(`BAT contract missing: ${needle}`);
}

// Parse as an ES module by stripping imports and the final top-level await invocation.
const syntaxProbe = pipeline
  .replace(/^import .*?;\r?\n/gm, '')
  .replace(/await main\(\);\s*$/, 'main();');
new vm.Script(`(async () => {\n${syntaxProbe}\n})`, { filename: pipelinePath });

console.log(JSON.stringify({
  status: 'PASS',
  source_registry: requiredSources,
  canonical_join: 'MOI BUILDINGPERMITNO -> Taipei construction permit exact normalized key',
  geometry_policy: 'NULL until official spatial join is validated',
  commercial_scrapers: 'ABSENT',
  fail_closed: true,
}, null, 2));
