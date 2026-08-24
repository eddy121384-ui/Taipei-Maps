import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve(process.env.NEW_DEV_CACHE_DIR || '.cache/new-development');
const MOI_DIR = path.join(CACHE_DIR, 'moi');
const ISOLATED_DIR = path.join(CACHE_DIR, 'moi-ignored-non-taipei-buildcase');
const MANIFEST_PATH = path.join(CACHE_DIR, 'moi-taipei-scope-manifest.json');
const TARGET_FILE = 'a_lvr_buildcase.csv';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(MOI_DIR))) throw new Error(`MOI directory missing: ${MOI_DIR}`);

  const entries = await readdir(MOI_DIR, { withFileTypes: true });
  const buildcaseFiles = entries
    .filter(entry => entry.isFile() && /_lvr_buildcase\.csv$/i.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const target = buildcaseFiles.find(name => name.toLowerCase() === TARGET_FILE);
  if (!target) {
    throw new Error(`Taipei MOI BUILDCASE file not found: ${TARGET_FILE}. Found: ${buildcaseFiles.join(', ') || '(none)'}`);
  }

  await mkdir(ISOLATED_DIR, { recursive: true });
  const isolated = [];

  for (const name of buildcaseFiles) {
    if (name.toLowerCase() === TARGET_FILE) continue;
    const source = path.join(MOI_DIR, name);
    const destination = path.join(ISOLATED_DIR, name);
    const bytes = await readFile(source);
    await copyFile(source, destination);
    await unlink(source);
    isolated.push({
      file: name,
      sha256: sha256(bytes),
      bytes: bytes.length,
    });
  }

  const remaining = (await readdir(MOI_DIR, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /_lvr_buildcase\.csv$/i.test(entry.name))
    .map(entry => entry.name);

  if (remaining.length !== 1 || remaining[0].toLowerCase() !== TARGET_FILE) {
    throw new Error(`Taipei scope gate failed. Remaining BUILDCASE files: ${remaining.join(', ') || '(none)'}`);
  }

  const targetBytes = await readFile(path.join(MOI_DIR, remaining[0]));
  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_city_code: 'A',
    source_city: '臺北市',
    canonical_input_file: remaining[0],
    canonical_input_sha256: sha256(targetBytes),
    isolated_non_taipei_buildcase_count: isolated.length,
    isolated_non_taipei_buildcase_files: isolated,
    policy: 'Taipei canonical rows may only originate from MOI city-code A BUILDCASE data. Other city BUILDCASE files are preserved outside the parser input and never joined to Taipei permits by permit number alone.',
  };

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log('MOI Taipei city-scope gate: PASS');
  console.log(`  Canonical input: ${remaining[0]} (A = 臺北市)`);
  console.log(`  Non-Taipei BUILDCASE files isolated: ${isolated.length}`);
  console.log(`  Scope manifest: ${MANIFEST_PATH}`);
}

await main();
