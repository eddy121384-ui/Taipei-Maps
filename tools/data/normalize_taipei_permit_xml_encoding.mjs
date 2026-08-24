import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve(process.env.NEW_DEV_CACHE_DIR || '.cache/new-development');
const RAW_DIR = path.join(CACHE_DIR, 'taipei-permit-source-bytes');
const MANIFEST_PATH = path.join(CACHE_DIR, 'taipei-permit-encoding-manifest.json');

const SOURCES = [
  { name: 'taipei_historical', file: path.join(CACHE_DIR, 'taipei-permits-historical.xml') },
  { name: 'taipei_current', file: path.join(CACHE_DIR, 'taipei-permits-current.xml') },
];

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

function normalizeEncodingLabel(value) {
  const label = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  if (['utf8', 'utf-8'].includes(label)) return 'utf-8';
  if (['big5', 'big-5', 'cp950', 'windows-950', 'ms950'].includes(label)) return 'big5';
  if (['utf-16', 'utf-16le'].includes(label)) return 'utf-16le';
  if (label === 'utf-16be') return 'utf-16be';
  return label || null;
}

function detectXmlEncoding(buffer) {
  let bom = null;
  let bomEncoding = null;
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    bom = 'EF BB BF';
    bomEncoding = 'utf-8';
  } else if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    bom = 'FF FE';
    bomEncoding = 'utf-16le';
  } else if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    bom = 'FE FF';
    bomEncoding = 'utf-16be';
  }

  // XML declarations are ASCII-compatible for UTF-8/Big5. Removing NULs also
  // makes UTF-16 declarations visible enough for a declaration hint.
  const head = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('latin1').replace(/\u0000/g, '');
  const match = head.match(/<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i);
  const declared = match ? normalizeEncodingLabel(match[1]) : null;
  const encoding = bomEncoding || declared || 'utf-8';
  return { encoding, declared, bom };
}

function replacementCount(value) {
  let count = 0;
  for (const ch of value) if (ch === '\uFFFD') count += 1;
  return count;
}

function strictDecode(buffer, encoding) {
  const decoded = new TextDecoder(encoding, { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  const literalReplacementCount = replacementCount(decoded);
  if (literalReplacementCount) {
    throw new Error(`${encoding} decoded text contains ${literalReplacementCount} literal U+FFFD marker(s)`);
  }
  return decoded;
}

function xmlTokenInfo(token) {
  if (!token.startsWith('<')) return null;
  if (token.startsWith('<?') || token.startsWith('<!--') || token.startsWith('<![') || token.startsWith('<!DOCTYPE')) return null;
  if (token.startsWith('</')) {
    return { kind: 'close', name: token.slice(2, -1).trim().split(/\s+/)[0] };
  }
  if (token.startsWith('<!')) return null;
  const selfClosing = /\/\s*>$/.test(token);
  const raw = token.slice(1, selfClosing ? token.lastIndexOf('/') : -1).trim();
  const name = raw.split(/\s+/)[0];
  return name ? { kind: selfClosing ? 'self' : 'open', name } : null;
}

function validateXmlStructure(xml, sourceName) {
  const stack = [];
  const tokenRegex = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<[^>]+>/g;
  let match;
  while ((match = tokenRegex.exec(xml)) !== null) {
    const info = xmlTokenInfo(match[0]);
    if (!info || info.kind === 'self') continue;
    if (info.kind === 'open') {
      stack.push(info.name);
      continue;
    }
    const openName = stack.pop();
    if (!openName || openName !== info.name) {
      throw new Error(`${sourceName}: XML structure mismatch <${openName ?? 'none'}> ... </${info.name}>`);
    }
  }
  if (stack.length) throw new Error(`${sourceName}: XML ended with ${stack.length} unclosed tag(s)`);
}

function inferRepeatedRecordTag(xml, sourceName) {
  const stack = [];
  const counts = new Map();
  const tokenRegex = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<[^>]+>/g;
  let match;

  while ((match = tokenRegex.exec(xml)) !== null) {
    const info = xmlTokenInfo(match[0]);
    if (!info) continue;
    if (info.kind === 'close') {
      stack.pop();
      continue;
    }
    const depth = stack.length + 1;
    const key = `${depth}|${info.name}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (info.kind === 'open') stack.push(info.name);
  }

  const candidates = [...counts.entries()]
    .map(([key, count]) => {
      const [depthText, ...nameParts] = key.split('|');
      return { depth: Number(depthText), name: nameParts.join('|'), count };
    })
    .filter(row => row.depth >= 2 && row.depth <= 6 && row.count >= 10)
    .sort((a, b) => a.depth - b.depth || b.count - a.count || a.name.localeCompare(b.name));

  if (!candidates.length) throw new Error(`${sourceName}: could not infer a repeated XML record element for quarantine`);
  const shallowest = candidates[0].depth;
  return candidates.filter(row => row.depth === shallowest).sort((a, b) => b.count - a.count)[0];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quarantineUtf8ReplacementMarkers(buffer, sourceName) {
  // A source may be byte-valid UTF-8 yet already contain literal U+FFFD characters.
  // Treat those markers with the same fail-closed policy as malformed UTF-8: never
  // guess the missing character; quarantine the entire repeated permit record.
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
  const replacements = replacementCount(decoded);
  if (!replacements) throw new Error(`${sourceName}: UTF-8 fallback found no U+FFFD marker`);

  const record = inferRepeatedRecordTag(decoded, sourceName);
  const escaped = escapeRegex(record.name);
  const recordRegex = new RegExp(`<${escaped}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${escaped}\\s*>`, 'g');
  let totalRecords = 0;
  let quarantinedRecords = 0;
  const quarantinedSamples = [];

  const sanitized = decoded.replace(recordRegex, block => {
    totalRecords += 1;
    if (!block.includes('\uFFFD')) return block;
    quarantinedRecords += 1;
    if (quarantinedSamples.length < 20) {
      quarantinedSamples.push({
        record_ordinal_1_based: totalRecords,
        replacement_count: replacementCount(block),
        preview: block.replace(/\s+/g, ' ').slice(0, 220),
      });
    }
    return '';
  });

  if (!totalRecords) throw new Error(`${sourceName}: inferred record <${record.name}> but matched zero complete records`);
  if (sanitized.includes('\uFFFD')) {
    throw new Error(`${sourceName}: U+FFFD remains outside quarantinable <${record.name}> records; refusing to alter XML structure`);
  }

  const maxAllowed = Math.max(100, Math.ceil(totalRecords * 0.005));
  if (quarantinedRecords > maxAllowed) {
    throw new Error(`${sourceName}: quarantined ${quarantinedRecords}/${totalRecords} XML records, exceeding safety gate ${maxAllowed}`);
  }

  validateXmlStructure(sanitized, sourceName);
  return {
    text: sanitized,
    mode: 'utf-8-with-record-quarantine',
    replacement_count: replacements,
    record_tag: record.name,
    source_record_count: totalRecords,
    quarantined_record_count: quarantinedRecords,
    quarantine_rate: quarantinedRecords / totalRecords,
    quarantined_samples: quarantinedSamples,
  };
}

function decodeOfficialXml(buffer, sourceName) {
  const detected = detectXmlEncoding(buffer);
  const supported = new Set(['utf-8', 'big5', 'utf-16le', 'utf-16be']);
  if (!supported.has(detected.encoding)) {
    throw new Error(`${sourceName}: unsupported XML encoding declaration: ${detected.encoding}`);
  }

  try {
    const text = strictDecode(buffer, detected.encoding);
    validateXmlStructure(text, sourceName);
    return {
      text,
      mode: `strict-${detected.encoding}`,
      detected,
      replacement_count: 0,
      record_tag: null,
      source_record_count: null,
      quarantined_record_count: 0,
      quarantine_rate: 0,
      quarantined_samples: [],
    };
  } catch (strictError) {
    if (detected.encoding !== 'utf-8') {
      throw new Error(`${sourceName}: strict ${detected.encoding} decode/validation failed: ${strictError?.message ?? strictError}`);
    }

    const quarantined = quarantineUtf8ReplacementMarkers(buffer, sourceName);
    return { ...quarantined, detected, strict_error: strictError?.message ?? String(strictError) };
  }
}

async function normalizeSource(source) {
  const rawPath = path.join(RAW_DIR, `${path.basename(source.file)}.source-bytes`);
  let rawBytes;
  if (await exists(rawPath)) rawBytes = await readFile(rawPath);
  else {
    rawBytes = await readFile(source.file);
    await writeFile(rawPath, rawBytes);
  }

  const decoded = decodeOfficialXml(rawBytes, source.name);
  const normalized = Buffer.from(decoded.text, 'utf8');
  await writeFile(source.file, normalized);

  // Prove that the exact bytes consumed by the canonical parser are valid UTF-8
  // and contain no literal replacement marker. This closes the gap between the
  // normalizer's verdict and the downstream read path.
  const writtenBytes = await readFile(source.file);
  const writtenText = new TextDecoder('utf-8', { fatal: true }).decode(writtenBytes).replace(/^\uFEFF/, '');
  if (writtenText.includes('\uFFFD')) {
    throw new Error(`${source.name}: post-write verification found literal U+FFFD in normalized XML`);
  }
  validateXmlStructure(writtenText, `${source.name}_postwrite`);

  return {
    source: source.name,
    file: path.basename(source.file),
    xml_declared_encoding: decoded.detected.declared,
    bom: decoded.detected.bom,
    decode_mode: decoded.mode,
    strict_error: decoded.strict_error ?? null,
    source_bytes_sha256: sha256(rawBytes),
    normalized_utf8_sha256: sha256(writtenBytes),
    source_bytes: rawBytes.length,
    normalized_utf8_bytes: writtenBytes.length,
    replacement_sequence_count: decoded.replacement_count,
    inferred_record_tag: decoded.record_tag,
    source_record_count: decoded.source_record_count,
    quarantined_record_count: decoded.quarantined_record_count,
    quarantine_rate: decoded.quarantine_rate,
    quarantined_samples: decoded.quarantined_samples,
    post_write_verified_no_ufffd: true,
  };
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  for (const source of SOURCES) {
    if (!(await exists(source.file))) throw new Error(`Required Taipei permit XML missing: ${source.file}`);
  }

  const files = [];
  for (const source of SOURCES) files.push(await normalizeSource(source));

  const manifest = {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    policy: 'Honor XML BOM/declaration with strict decoding. A byte-valid UTF-8 source that already contains literal U+FFFD is not accepted as clean: the entire repeated permit record containing each U+FFFD marker is quarantined rather than guessing the missing character. Malformed markup or excessive quarantines fail closed. Normalized output is reread and verified before canonical parsing.',
    files,
  };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Taipei permit XML normalization: ${files.length} file(s)`);
  for (const file of files) {
    console.log(`  ${file.source}: ${file.decode_mode}; declared=${file.xml_declared_encoding ?? 'none'}; U+FFFD=${file.replacement_sequence_count}; quarantined=${file.quarantined_record_count}; postwrite=PASS`);
  }
  console.log(`  Raw source bytes preserved: ${RAW_DIR}`);
  console.log(`  XML encoding manifest: ${MANIFEST_PATH}`);
}

await main();
