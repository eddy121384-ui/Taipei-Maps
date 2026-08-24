import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve(process.env.NEW_DEV_CACHE_DIR || '.cache/new-development');
const MANIFEST_PATH = path.join(CACHE_DIR, 'moi-encoding-manifest.json');
const AUDIT_PATH = path.resolve('public/generated/taipei_new_developments_official.audit.json');

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const audit = JSON.parse(await readFile(AUDIT_PATH, 'utf8'));

audit.source_encodings = {
  moi_presale_csv: {
    policy: manifest.policy,
    counts: manifest.counts,
    files: manifest.files,
  },
};

audit.source_hashes_sha256 = audit.source_hashes_sha256 || {};
audit.source_hashes_sha256.moi_presale_zip_original = manifest.moi_zip_sha256;
audit.provenance_notes = [
  ...(Array.isArray(audit.provenance_notes) ? audit.provenance_notes : []),
  'MOI CSV files are parsed from UTF-8 normalized copies. Original extracted bytes are preserved under .cache/new-development/moi-source-bytes and their SHA-256 hashes are recorded in source_encodings.',
];

await writeFile(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log('Audit encoding provenance attached.');
console.log(`  MOI source encodings: UTF-8=${manifest.counts?.['utf-8'] ?? 0}, Big5=${manifest.counts?.big5 ?? 0}`);
console.log(`  Original MOI ZIP SHA-256: ${manifest.moi_zip_sha256}`);
