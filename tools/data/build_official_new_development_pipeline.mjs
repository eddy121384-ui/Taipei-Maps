import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve(process.env.NEW_DEV_CACHE_DIR || '.cache/new-development');
const MOI_DIR = path.join(CACHE_DIR, 'moi');
const HISTORICAL_XML = path.join(CACHE_DIR, 'taipei-permits-historical.xml');
const CURRENT_XML = path.join(CACHE_DIR, 'taipei-permits-current.xml');
const OUT_DIR = path.resolve('public/generated');
const OUT_PATH = path.join(OUT_DIR, 'taipei_new_developments_official.json');
const AUDIT_PATH = path.join(OUT_DIR, 'taipei_new_developments_official.audit.json');

const TAIPEI_DISTRICTS = new Set([
  '中正區', '大同區', '中山區', '松山區', '大安區', '萬華區',
  '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區',
]);

const REQUIRED_MOI_COLUMNS = [
  'TOWN', 'BUILDCASE', 'LOCATION', 'BUILDER', 'HOUSEHOLD', 'USEZONING',
  'MAINUSE', 'MAINMATERIAL', 'DECLAREDATE', 'SELLINGPERIOD', 'BUILDINGLANDS',
  'BUILDINGPERMITDATE', 'BUILDINGPERMITNO',
];

function text(value) {
  return String(value ?? '').normalize('NFKC').replace(/\u0000/g, '').trim();
}

function compact(value) {
  return text(value).replace(/[\s\u3000]+/g, '');
}

function xmlDecode(value) {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function canonicalTagName(name) {
  return text(name).replace(/^.*:/, '').replace(/[\s_\-]/g, '').toLowerCase();
}

function stableId(parts) {
  return createHash('sha256').update(parts.map(text).join('|')).digest('hex').slice(0, 20);
}

async function sha256File(filePath) {
  const buffer = await readFile(filePath);
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

function normalizedHeader(value) {
  return text(value).replace(/^\uFEFF/, '').replace(/[\s_\-]/g, '').toUpperCase();
}

function findMoiHeader(rows, filePath) {
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const normalized = rows[i].map(normalizedHeader);
    if (normalized.includes('BUILDCASE') && normalized.includes('BUILDINGPERMITNO') && normalized.includes('TOWN')) {
      const index = new Map();
      rows[i].forEach((value, column) => index.set(normalizedHeader(value), column));
      const missing = REQUIRED_MOI_COLUMNS.filter(column => !index.has(normalizedHeader(column)));
      if (missing.length) throw new Error(`${filePath}: MOI schema missing columns: ${missing.join(', ')}`);
      return { rowIndex: i, index };
    }
  }
  return null;
}

function valueAt(row, index, name) {
  const column = index.get(normalizedHeader(name));
  return column === undefined ? '' : text(row[column]);
}

function extractPermitKeys(rawValue) {
  const raw = text(rawValue);
  if (!raw) return [];
  const source = raw.normalize('NFKC');
  const keys = new Set();

  // Taipei's common public form: 113建字第0123號, optionally with a revision suffix.
  const regex = /(\d{2,3})\s*建\s*字\s*第?\s*0*(\d+)(?:\s*[-之]\s*0*(\d+))?\s*號?/g;
  for (const match of source.matchAll(regex)) {
    const year = String(Number(match[1]));
    const serial = String(Number(match[2]));
    const suffix = match[3] ? String(Number(match[3])) : '';
    keys.add(`roc:${year}:build:${serial}${suffix ? `:${suffix}` : ''}`);
  }

  // Fail-soft audit key. Never used to claim a Taipei join unless the same compact key exists in Taipei permit data.
  if (!keys.size && source.includes('建') && source.includes('字')) {
    const fallback = compact(source).replace(/[()（）\[\]【】第號,，、.;；:：]/g, '').toLowerCase();
    if (fallback) keys.add(`raw:${fallback}`);
  }

  return [...keys];
}

async function loadMoiRows() {
  const allFiles = await filesRecursive(MOI_DIR);
  const csvFiles = allFiles.filter(file => file.toLowerCase().endsWith('.csv'));
  if (!csvFiles.length) throw new Error(`No CSV files found under ${MOI_DIR}`);

  const records = [];
  const usedFiles = [];
  for (const filePath of csvFiles) {
    const buffer = await readFile(filePath);
    const input = buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (input.includes('\uFFFD')) throw new Error(`${filePath}: UTF-8 decode contains replacement characters`);
    const rows = parseCsv(input);
    const header = findMoiHeader(rows, filePath);
    if (!header) continue;

    usedFiles.push(filePath);
    for (let i = header.rowIndex + 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row.some(value => text(value))) continue;
      const projectName = valueAt(row, header.index, 'BUILDCASE');
      const permitNo = valueAt(row, header.index, 'BUILDINGPERMITNO');
      const number = valueAt(row, header.index, 'NUMBER') || valueAt(row, header.index, '編號');
      if (!projectName && !permitNo) continue;

      records.push({
        town: valueAt(row, header.index, 'TOWN'),
        project_name: projectName,
        location: valueAt(row, header.index, 'LOCATION'),
        builder: valueAt(row, header.index, 'BUILDER'),
        household: valueAt(row, header.index, 'HOUSEHOLD'),
        use_zoning: valueAt(row, header.index, 'USEZONING'),
        main_use: valueAt(row, header.index, 'MAINUSE'),
        main_material: valueAt(row, header.index, 'MAINMATERIAL'),
        declare_date: valueAt(row, header.index, 'DECLAREDATE'),
        selling_period: valueAt(row, header.index, 'SELLINGPERIOD'),
        building_lands: valueAt(row, header.index, 'BUILDINGLANDS'),
        building_permit_date: valueAt(row, header.index, 'BUILDINGPERMITDATE'),
        building_permit_no: permitNo,
        first_registration_date: valueAt(row, header.index, 'FIRSTREGISTRATIONDATE'),
        source_number: number,
        permit_keys: extractPermitKeys(permitNo),
      });
    }
  }

  if (!usedFiles.length) throw new Error('CSV files existed, but none contained the expected MOI BUILDCASE schema');
  if (records.length < 100) throw new Error(`MOI project row count unexpectedly small: ${records.length}`);
  return { records, usedFiles };
}

function firstField(fields, aliases) {
  const normalizedAliases = aliases.map(canonicalTagName);
  for (const [key, values] of fields.entries()) {
    const canonical = canonicalTagName(key);
    if (normalizedAliases.includes(canonical)) return text(values[0]);
  }
  for (const [key, values] of fields.entries()) {
    const canonical = canonicalTagName(key);
    if (normalizedAliases.some(alias => canonical.includes(alias) || alias.includes(canonical))) return text(values[0]);
  }
  return '';
}

function mapPermitRecord(fields, sourceName) {
  const permitNo = firstField(fields, ['執照號碼', '建造執照號碼', '建照號碼', 'BUILDINGPERMITNO', 'permitno', 'licenseno']);
  if (!permitNo) return null;
  const keys = extractPermitKeys(permitNo);
  if (!keys.length) return null;

  return {
    source: sourceName,
    permit_no: permitNo,
    permit_keys: keys,
    permit_year: firstField(fields, ['執照年度', '年度', 'year']),
    issue_date: firstField(fields, ['發照日期', '核發日期', 'issuedate']),
    address: firstField(fields, ['建築地點', '地址', '建築地址', 'location', 'address']),
    land_lot: firstField(fields, ['地段號', '地號', 'landlot']),
    household: firstField(fields, ['戶數', 'household']),
    use_zoning: firstField(fields, ['使用分區', 'usezoning']),
    builder: firstField(fields, ['起造人', 'builder']),
    floors_above: firstField(fields, ['地上層數']),
    floors_below: firstField(fields, ['地下層數']),
  };
}

function parsePermitXml(xml, sourceName) {
  const records = [];
  const stack = [];
  const tokenRegex = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]+>|[^<]+/g;
  let match;

  while ((match = tokenRegex.exec(xml)) !== null) {
    const token = match[0];
    if (!token) continue;
    if (token.startsWith('<?') || token.startsWith('<!--')) continue;

    if (token.startsWith('<![CDATA[')) {
      if (stack.length) stack[stack.length - 1].text += match[1] ?? '';
      continue;
    }

    if (token.startsWith('</')) {
      const closeName = token.slice(2, -1).trim().split(/\s+/)[0];
      const node = stack.pop();
      if (!node) throw new Error(`${sourceName}: malformed XML close tag ${closeName}`);
      if (canonicalTagName(node.name) !== canonicalTagName(closeName)) {
        throw new Error(`${sourceName}: XML tag mismatch <${node.name}> ... </${closeName}>`);
      }

      const ownText = text(xmlDecode(node.text));
      if (node.fields.size) {
        const mapped = mapPermitRecord(node.fields, sourceName);
        if (mapped) records.push(mapped);
      }

      if (stack.length && !node.fields.size && ownText) {
        const parent = stack[stack.length - 1];
        if (!parent.fields.has(node.name)) parent.fields.set(node.name, []);
        parent.fields.get(node.name).push(ownText);
      }
      continue;
    }

    if (token.startsWith('<')) {
      if (token.startsWith('<!')) continue;
      const selfClosing = /\/\s*>$/.test(token);
      const raw = token.slice(1, selfClosing ? token.lastIndexOf('/') : -1).trim();
      const name = raw.split(/\s+/)[0];
      if (!name) continue;
      const node = { name, text: '', fields: new Map() };
      stack.push(node);
      if (selfClosing) stack.pop();
      continue;
    }

    if (stack.length) stack[stack.length - 1].text += token;
  }

  if (stack.length) throw new Error(`${sourceName}: XML ended with ${stack.length} unclosed tag(s)`);

  const dedup = new Map();
  for (const row of records) {
    const key = `${row.permit_keys.join('|')}|${row.address}|${row.land_lot}`;
    if (!dedup.has(key)) dedup.set(key, row);
  }
  return [...dedup.values()];
}

async function loadPermitFile(filePath, sourceName, minimumRows) {
  const raw = await readFile(filePath, 'utf8');
  if (raw.includes('\uFFFD')) throw new Error(`${sourceName}: UTF-8 decode contains replacement characters`);
  const rows = parsePermitXml(raw, sourceName);
  if (rows.length < minimumRows) {
    throw new Error(`${sourceName}: parsed only ${rows.length} permit rows; expected at least ${minimumRows}. Schema may have changed.`);
  }
  return rows;
}

function indexPermits(rows) {
  const index = new Map();
  for (const row of rows) {
    for (const key of row.permit_keys) {
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(row);
    }
  }
  return index;
}

function canonicalProject(row, matches) {
  const matchedPermitKeys = [...new Set(matches.flatMap(match => match.permit_keys))];
  const permit = matches[0];
  return {
    id: row.source_number || stableId([row.project_name, row.building_permit_no, row.building_lands]),
    project_name: row.project_name,
    district: row.town,
    filed_location: row.location,
    builder: row.builder,
    household: row.household,
    use_zoning: row.use_zoning,
    main_use: row.main_use,
    main_material: row.main_material,
    declare_date: row.declare_date,
    selling_period_filed: row.selling_period,
    building_lands: row.building_lands,
    building_permit_date_filed: row.building_permit_date,
    building_permit_no_filed: row.building_permit_no,
    first_registration_date: row.first_registration_date,
    permit_keys: matchedPermitKeys,
    taipei_permit: {
      permit_no: permit.permit_no,
      permit_year: permit.permit_year,
      issue_date: permit.issue_date,
      address: permit.address,
      land_lot: permit.land_lot,
      household: permit.household,
      use_zoning: permit.use_zoning,
      builder: permit.builder,
      floors_above: permit.floors_above,
      floors_below: permit.floors_below,
      source: permit.source,
    },
    location_precision: 'permit_join_nonspatial',
    geometry: null,
    provenance: ['MOI_PRESALE_FILING', 'TAIPEI_CONSTRUCTION_PERMIT'],
  };
}

async function main() {
  for (const required of [MOI_DIR, HISTORICAL_XML, CURRENT_XML]) {
    await stat(required).catch(() => { throw new Error(`Required input missing: ${required}`); });
  }

  console.log('[1/4] Parsing MOI presale filing CSV...');
  const moi = await loadMoiRows();
  console.log(`  MOI rows: ${moi.records.length.toLocaleString()} from ${moi.usedFiles.length} CSV file(s)`);

  console.log('[2/4] Parsing Taipei historical construction permits...');
  const historical = await loadPermitFile(HISTORICAL_XML, 'taipei_historical', 1000);
  console.log(`  Historical Taipei permit rows: ${historical.length.toLocaleString()}`);

  console.log('[3/4] Parsing Taipei current-year construction permits...');
  const current = await loadPermitFile(CURRENT_XML, 'taipei_current', 10);
  console.log(`  Current Taipei permit rows: ${current.length.toLocaleString()}`);

  const permitIndex = indexPermits([...historical, ...current]);
  const projects = [];
  const unmatchedDistrictNameCandidates = [];
  const noPermitKey = [];
  let ambiguousPermitJoinCount = 0;

  for (const row of moi.records) {
    const matches = [];
    const seen = new Set();
    for (const key of row.permit_keys) {
      for (const permit of permitIndex.get(key) ?? []) {
        const identity = `${permit.source}|${permit.permit_no}|${permit.address}|${permit.land_lot}`;
        if (!seen.has(identity)) {
          seen.add(identity);
          matches.push(permit);
        }
      }
    }

    if (matches.length) {
      if (matches.length > 1) ambiguousPermitJoinCount += 1;
      projects.push(canonicalProject(row, matches));
    } else if (!row.permit_keys.length) {
      if (TAIPEI_DISTRICTS.has(row.town)) noPermitKey.push(row);
    } else if (TAIPEI_DISTRICTS.has(row.town)) {
      unmatchedDistrictNameCandidates.push(row);
    }
  }

  if (!projects.length) {
    throw new Error('No MOI projects joined to Taipei permit data. Refusing to emit an empty canonical dataset.');
  }

  projects.sort((a, b) => (b.declare_date || '').localeCompare(a.declare_date || '') || a.project_name.localeCompare(b.project_name, 'zh-Hant'));

  const now = new Date().toISOString();
  const sourceHashes = {
    moi_csv: Object.fromEntries(await Promise.all(moi.usedFiles.map(async file => [path.relative(CACHE_DIR, file), await sha256File(file)]))),
    taipei_permits_historical_xml: await sha256File(HISTORICAL_XML),
    taipei_permits_current_xml: await sha256File(CURRENT_XML),
  };

  const dataset = {
    type: 'TaipeiMapsOfficialNewDevelopmentDataset',
    schema_version: 1,
    generated_at: now,
    coverage_note: 'Canonical rows require an exact normalized construction-permit join between MOI presale filing data and Taipei City construction-permit data. Geometry is intentionally null until the official spatial join is implemented.',
    source_license: 'Government Open Data License v1.0',
    projects,
  };

  const audit = {
    schema_version: 1,
    generated_at: now,
    cache_dir: CACHE_DIR,
    counts: {
      moi_rows: moi.records.length,
      taipei_historical_permits: historical.length,
      taipei_current_permits: current.length,
      canonical_taipei_projects: projects.length,
      ambiguous_permit_joins: ambiguousPermitJoinCount,
      unmatched_taipei_district_name_candidates: unmatchedDistrictNameCandidates.length,
      taipei_district_name_candidates_without_parseable_permit_key: noPermitKey.length,
    },
    source_hashes_sha256: sourceHashes,
    unresolved_samples: {
      unmatched_permit: unmatchedDistrictNameCandidates.slice(0, 25).map(row => ({
        town: row.town,
        project_name: row.project_name,
        building_permit_no: row.building_permit_no,
        building_lands: row.building_lands,
      })),
      no_parseable_permit_key: noPermitKey.slice(0, 25).map(row => ({
        town: row.town,
        project_name: row.project_name,
        building_permit_no: row.building_permit_no,
        building_lands: row.building_lands,
      })),
    },
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  await writeFile(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

  console.log('[4/4] Official new-development canonical dataset built');
  console.log(`  Canonical Taipei projects: ${projects.length.toLocaleString()}`);
  console.log(`  Ambiguous exact-key joins: ${ambiguousPermitJoinCount.toLocaleString()} (retained for audit)`);
  console.log(`  Unmatched Taipei-district-name candidates: ${unmatchedDistrictNameCandidates.length.toLocaleString()}`);
  console.log(`  District-name candidates without parseable permit key: ${noPermitKey.length.toLocaleString()}`);
  console.log(`  Output: ${OUT_PATH}`);
  console.log(`  Audit:  ${AUDIT_PATH}`);
  console.log('  Geometry: intentionally NOT inferred in v0.1');
}

await main();
