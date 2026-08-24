import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve(process.env.NEW_DEV_CACHE_DIR || '.cache/new-development');
const MOI_DIR = path.join(CACHE_DIR, 'moi');
const RAW_DIR = path.join(CACHE_DIR, 'moi-source-bytes');
const MANIFEST_PATH = path.join(CACHE_DIR, 'moi-encoding-manifest.json');
const ZIP_PATH = path.join(CACHE_DIR, 'lvr_buildcasecsv.zip');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function filesRecursive(root) {
  const out = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  await visit(root);
  return out;
}

function decodeStrict(buffer, encoding) {
  const decoded = new TextDecoder(encoding, { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  if (decoded.includes('\uFFFD')) throw new Error(`${encoding} decode produced U+FFFD`);
  return decoded;
}

function decodeOfficialCsv(buffer, filePath) {
  const failures = [];
  for (const encoding of ['utf-8', 'big5']) {
    try {
      const text = decodeStrict(buffer, encoding);
      if (!text.includes('BUILDCASE') || !text.includes('BUILDINGPERMITNO')) {
        throw new Error('decoded text does not expose expected MOI BUILDCASE headers');
      }
      return { encoding, text };
    } catch (error) {
      failures.push(`${encoding}: ${error?.message ?? error}`);
    }
  }
  throw new Error(`${filePath}: neither strict UTF-8 nor strict Big5 decode succeeded (${failures.join('; ')})`);
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const csvFiles = (await filesRecursive(MOI_DIR))
    .filter(file => file.toLowerCase().endsWith('.csv'))
    .sort();
  if (!csvFiles.length) throw new Error(`No CSV files found under ${MOI_DIR}`);

  await mkdir(RAW_DIR, { recursive: true });
  const rows = [];
  const counts = { 'utf-8': 0, big5: 0 };

  for (const filePath of csvFiles) {
    const rel = path.relative(MOI_DIR, filePath);
    const rawPath = path.join(RAW_DIR, `${rel}.source-bytes`);
    await mkdir(path.dirname(rawPath), { recursive: true });

    let rawBytes;
    if (await fileExists(rawPath)) {
      rawBytes = await readFile(rawPath);
    } else {
      rawBytes = await readFile(filePath);
      await writeFile(rawPath, rawBytes);
    }

    const decoded = decodeOfficialCsv(rawBytes, filePath);
    const normalizedBytes = Buffer.from(decoded.text, 'utf8');
    await writeFile(filePath, normalizedBytes);
    counts[decoded.encoding] += 1;

    rows.push({
      file: rel.replaceAll('\\', '/'),
      detected_source_encoding: decoded.encoding,
      source_bytes_sha256: sha256(rawBytes),
      normalized_utf8_sha256: sha256(normalizedBytes),
      source_bytes: rawBytes.length,
      normalized_utf8_bytes: normalizedBytes.length,
    });
  }

  const zipBytes = await readFile(ZIP_PATH);
  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    policy: 'Strict UTF-8 first, strict Big5 fallback; original source bytes preserved before normalization.',
    moi_zip_sha256: sha256(zipBytes),
    counts,
    files: rows,
  };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`MOI CSV encoding normalization: ${rows.length} file(s)`);
  console.log(`  UTF-8 source files: ${counts['utf-8']}`);
  console.log(`  Big5 source files: ${counts.big5}`);
  console.log(`  Raw source bytes preserved: ${RAW_DIR}`);
  console.log(`  Encoding manifest: ${MANIFEST_PATH}`);
}

await main();
