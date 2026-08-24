import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve(process.env.NEW_DEV_CACHE_DIR || '.cache/new-development');
const SCOPE_MANIFEST_PATH = path.join(CACHE_DIR, 'moi-taipei-scope-manifest.json');
const DATASET_PATH = path.resolve('public/generated/taipei_new_developments_official.json');
const AUDIT_PATH = path.resolve('public/generated/taipei_new_developments_official.audit.json');

const scope = JSON.parse(await readFile(SCOPE_MANIFEST_PATH, 'utf8'));
const dataset = JSON.parse(await readFile(DATASET_PATH, 'utf8'));
const audit = JSON.parse(await readFile(AUDIT_PATH, 'utf8'));

const cityScope = {
  source_city_code: scope.source_city_code,
  source_city: scope.source_city,
  canonical_input_file: scope.canonical_input_file,
  canonical_input_sha256: scope.canonical_input_sha256,
  isolated_non_taipei_buildcase_count: scope.isolated_non_taipei_buildcase_count,
  policy: scope.policy,
};

dataset.source_scope = cityScope;
audit.source_scope = cityScope;
audit.provenance_notes = [
  ...(Array.isArray(audit.provenance_notes) ? audit.provenance_notes : []),
  'MOI BUILDCASE input is explicitly scoped to city code A (臺北市) before any construction-permit join. Non-Taipei BUILDCASE files are preserved outside parser input and cannot collide on locally-issued permit numbers.',
];

await writeFile(DATASET_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
await writeFile(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

console.log('Taipei city-scope provenance attached.');
console.log(`  MOI canonical input: ${scope.canonical_input_file}`);
console.log(`  Source city: ${scope.source_city_code} = ${scope.source_city}`);
console.log(`  Non-Taipei BUILDCASE files isolated: ${scope.isolated_non_taipei_buildcase_count}`);
