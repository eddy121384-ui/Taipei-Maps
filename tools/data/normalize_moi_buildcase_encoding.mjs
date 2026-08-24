import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve(process.env.NEW_DEV_CACHE_DIR || '.cache/new-development');
const MOI_DIR = path.join(CACHE_DIR, 'moi');
const RAW_DIR = path.join(CACHE_DIR, 'moi-source-bytes');
const IGNORED_DIR = path.join(CACHE_DIR, 'moi-ignored-non-buildcase');
const MANIFEST_PATH = path.join(CACHE_DIR, 'moi-encoding-manifest.json');
const ZIP_PATH = path.join(CACHE_DIR, 'lvr_buildcasecsv.zip');
const REQUIRED_HEADERS = ['TOWN', 'BUILDCASE', 'BUILDINGPERMITNO'];
const BUILDCASE_FILE_RE = /_lvr_buildcase\.csv$/i;

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

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (quoted) throw new Error('CSV ended inside a quoted field');
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function csvField(value) {
  const s = String(value ?? '');
  if (!/[",\r\n]/.test(s)) return s;
  return `"${s.replaceAll('"', '""')}"`;
}

function serializeCsv(rows) {
  return `${rows.map(row => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}

function normalizedHeader(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().replace(/[\s_\-]/g, '').toUpperCase();
}

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const normalized = rows[i].map(normalizedHeader);
    if (REQUIRED_HEADERS.every(name => normalized.includes(name))) {
      const index = new Map();
      rows[i].forEach((value, column) => index.set(normalizedHeader(value), column));
      return { rowIndex: i, index };
    }
  }
  return null;
}

function replacementCount(text) {
  let count = 0;
  for (const ch of text) if (ch === '\uFFFD') count += 1;
  return count;
}

function decodeStrict(buffer, encoding) {
  const decoded = new TextDecoder(encoding, { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  if (decoded.includes('\uFFFD')) throw new Error(`${encoding} decode produced U+FFFD`);
  return decoded;
}

function validateExpectedHeader(decoded) {
  const rows = parseCsv(decoded);
  const header = findHeader(rows);
  if (!header) throw new Error('decoded text does not expose expected MOI BUILDCASE headers');
  return { rows, header };
}

function quarantineMalformedUtf8(buffer, filePath) {
  // data.gov.tw declares this resource UTF-8. If the byte stream contains isolated
  // malformed sequences, never guess replacement characters. Decode with U+FFFD only
  // to locate affected CSV records, then remove those entire records from parser input.
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
  const replacements = replacementCount(decoded);
  if (!replacements) throw new Error(`${filePath}: strict UTF-8 failed but lenient UTF-8 found no replacement marker`);

  const { rows, header } = validateExpectedHeader(decoded);
  if (rows[header.rowIndex].some(value => value.includes('\uFFFD'))) {
    throw new Error(`${filePath}: malformed UTF-8 touches the schema header; refusing to guess`);
  }

  const kept = rows.slice(0, header.rowIndex + 1);
  const quarantined = [];
  const projectCol = header.index.get('BUILDCASE');
  const permitCol = header.index.get('BUILDINGPERMITNO');

  for (let i = header.rowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row.some(value => value.includes('\uFFFD'))) {
      kept.push(row);
      continue;
    }
    quarantined.push({
      csv_row_number_1_based: i + 1,
      replacement_count: replacementCount(row.join('\u001f')),
      project_name_with_replacement: projectCol === undefined ? null : row[projectCol] || null,
      building_permit_no_with_replacement: permitCol === undefined ? null : row[permitCol] || null,
    });
  }

  const dataRowCount = Math.max(0, rows.length - header.rowIndex - 1);
  const quarantineRate = dataRowCount ? quarantined.length / dataRowCount : 0;
  const maxAllowedRows = Math.max(25, Math.ceil(dataRowCount * 0.005));
  if (quarantined.length > maxAllowedRows) {
    throw new Error(
      `${filePath}: declared UTF-8 contains ${replacements} replacement sequence(s) across ${quarantined.length}/${dataRowCount} data row(s) ` +
      `(${(quarantineRate * 100).toFixed(3)}%); exceeds safety gate ${maxAllowedRows} rows`,
    );
  }

  return {
    encoding: 'utf-8-declared-with-row-quarantine',
    text: serializeCsv(kept),
    replacement_count: replacements,
    quarantined_rows: quarantined.length,
    source_data_rows: dataRowCount,
    quarantine_rate: quarantineRate,
    quarantined_samples: quarantined.slice(0, 25),
  };
}

function decodeOfficialCsv(buffer, filePath) {
  const failures = [];
  try {
    const text = decodeStrict(buffer, 'utf-8');
    validateExpectedHeader(text);
    return {
      encoding: 'utf-8',
      text,
      replacement_count: 0,
      quarantined_rows: 0,
      source_data_rows: null,
      quarantine_rate: 0,
      quarantined_samples: [],
    };
  } catch (error) {
    failures.push(`utf-8: ${error?.message ?? error}`);
  }

  // Retain a strict Big5 compatibility check because legacy MOI real-estate files
  // have historically appeared in Big5. Never use a lossy Big5 decode.
  try {
    const text = decodeStrict(buffer, 'big5');
    validateExpectedHeader(text);
    return {
      encoding: 'big5',
      text,
      replacement_count: 0,
      quarantined_rows: 0,
      source_data_rows: null,
      quarantine_rate: 0,
      quarantined_samples: [],
    };
  } catch (error) {
    failures.push(`big5: ${error?.message ?? error}`);
  }

  try {
    return quarantineMalformedUtf8(buffer, filePath);
  } catch (error) {
    failures.push(`declared-utf8-quarantine: ${error?.message ?? error}`);
  }

  throw new Error(`${filePath}: no safe decode path succeeded (${failures.join('; ')})`);
}

async function isolateNonBuildcaseCsv(allCsvFiles) {
  const nonBuildcase = allCsvFiles.filter(file => !BUILDCASE_FILE_RE.test(path.basename(file)));

  // A fresh extraction contains the sibling MOI tables again. Reset the isolation
  // directory so its manifest always corresponds to the current extracted ZIP.
  if (nonBuildcase.length) {
    await rm(IGNORED_DIR, { recursive: true, force: true });
    await mkdir(IGNORED_DIR, { recursive: true });

    for (const filePath of nonBuildcase) {
      const rel = path.relative(MOI_DIR, filePath);
      const target = path.join(IGNORED_DIR, rel);
      await mkdir(path.dirname(target), { recursive: true });
      await rename(filePath, target);
    }
  }

  if (!(await fileExists(IGNORED_DIR))) return [];
  const isolatedFiles = (await filesRecursive(IGNORED_DIR)).filter(file => file.toLowerCase().endsWith('.csv')).sort();
  return Promise.all(isolatedFiles.map(async filePath => {
    const bytes = await readFile(filePath);
    return {
      file: path.relative(IGNORED_DIR, filePath).replaceAll('\\', '/'),
      source_bytes_sha256: sha256(bytes),
      source_bytes: bytes.length,
      reason: 'non_buildcase_sibling_table',
    };
  }));
}

async function main() {
  const allFiles = await filesRecursive(MOI_DIR);
  const allCsvFiles = allFiles.filter(file => file.toLowerCase().endsWith('.csv')).sort();
  if (!allCsvFiles.length) throw new Error(`No CSV files found under ${MOI_DIR}`);

  const ignoredNonBuildcaseFiles = await isolateNonBuildcaseCsv(allCsvFiles);
  const csvFiles = (await filesRecursive(MOI_DIR))
    .filter(file => BUILDCASE_FILE_RE.test(path.basename(file)))
    .sort();
  if (!csvFiles.length) throw new Error(`No *_lvr_buildcase.csv files found under ${MOI_DIR}`);

  await mkdir(RAW_DIR, { recursive: true });
  const rows = [];
  const counts = {};
  let totalQuarantinedRows = 0;
  let totalReplacementCount = 0;

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
    counts[decoded.encoding] = (counts[decoded.encoding] ?? 0) + 1;
    totalQuarantinedRows += decoded.quarantined_rows;
    totalReplacementCount += decoded.replacement_count;

    rows.push({
      file: rel.replaceAll('\\', '/'),
      detected_source_encoding: decoded.encoding,
      source_bytes_sha256: sha256(rawBytes),
      normalized_utf8_sha256: sha256(normalizedBytes),
      source_bytes: rawBytes.length,
      normalized_utf8_bytes: normalizedBytes.length,
      replacement_sequence_count: decoded.replacement_count,
      quarantined_row_count: decoded.quarantined_rows,
      source_data_rows: decoded.source_data_rows,
      quarantine_rate: decoded.quarantine_rate,
      quarantined_samples: decoded.quarantined_samples,
    });
  }

  const zipBytes = await readFile(ZIP_PATH);
  const manifest = {
    schema_version: 3,
    generated_at: new Date().toISOString(),
    declared_encoding: 'UTF-8',
    scope_policy: 'Only *_lvr_buildcase.csv belongs to the presale project filing pipeline. Other CSV sibling tables from the official ZIP are preserved outside parser scope and explicitly audited.',
    policy: 'Strict UTF-8 first; strict Big5 compatibility fallback; if the declared UTF-8 byte stream has isolated malformed sequences, quarantine entire affected CSV records rather than guessing replacement characters.',
    moi_zip_sha256: sha256(zipBytes),
    counts,
    total_replacement_sequence_count: totalReplacementCount,
    total_quarantined_row_count: totalQuarantinedRows,
    ignored_non_buildcase_file_count: ignoredNonBuildcaseFiles.length,
    ignored_non_buildcase_files: ignoredNonBuildcaseFiles,
    files: rows,
  };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`MOI BUILDCASE CSV normalization: ${rows.length} file(s)`);
  console.log(`  Non-BUILDCASE sibling CSVs isolated: ${ignoredNonBuildcaseFiles.length}`);
  for (const [encoding, count] of Object.entries(counts)) {
    console.log(`  ${encoding}: ${count} file(s)`);
  }
  console.log(`  Replacement sequences detected: ${totalReplacementCount}`);
  console.log(`  Entire BUILDCASE CSV rows quarantined: ${totalQuarantinedRows}`);
  console.log(`  Raw BUILDCASE source bytes preserved: ${RAW_DIR}`);
  console.log(`  Ignored sibling tables preserved: ${IGNORED_DIR}`);
  console.log(`  Encoding/scope manifest: ${MANIFEST_PATH}`);
}

await main();