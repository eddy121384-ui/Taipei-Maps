import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve(process.env.NEW_DEV_CACHE_DIR || '.cache/new-development');
const MOI_MANIFEST_PATH = path.join(CACHE_DIR, 'moi-encoding-manifest.json');
const PERMIT_MANIFEST_PATH = path.join(CACHE_DIR, 'taipei-permit-encoding-manifest.json');
const AUDIT_PATH = path.resolve('public/generated/taipei_new_developments_official.audit.json');

const moiManifest = JSON.parse(await readFile(MOI_MANIFEST_PATH, 'utf8'));
const permitManifest = JSON.parse(await readFile(PERMIT_MANIFEST_PATH, 'utf8'));
const audit = JSON.parse(await readFile(AUDIT_PATH, 'utf8'));

audit.source_encodings = {
  moi_presale_csv: {
    declared_encoding: moiManifest.declared_encoding || null,
    policy: moiManifest.policy,
    counts: moiManifest.counts,
    total_replacement_sequence_count: moiManifest.total_replacement_sequence_count ?? 0,
    total_quarantined_row_count: moiManifest.total_quarantined_row_count ?? 0,
    ignored_non_buildcase_file_count: moiManifest.ignored_non_buildcase_file_count ?? 0,
    files: moiManifest.files,
  },
  taipei_permit_xml: {
    policy: permitManifest.policy,
    files: permitManifest.files,
  },
};

audit.source_hashes_sha256 = audit.source_hashes_sha256 || {};
audit.source_hashes_sha256.moi_presale_zip_original = moiManifest.moi_zip_sha256;
for (const file of permitManifest.files || []) {
  audit.source_hashes_sha256[`${file.source}_xml_original`] = file.source_bytes_sha256;
}

audit.provenance_notes = [
  ...(Array.isArray(audit.provenance_notes) ? audit.provenance_notes : []),
  'MOI BUILDCASE CSV files are parsed from UTF-8 normalized copies. Non-BUILDCASE sibling tables are physically isolated from this pipeline rather than being interpreted as project rows.',
  'If the officially-declared UTF-8 MOI stream contains isolated malformed byte sequences, the pipeline quarantines the entire affected CSV record instead of guessing characters; quarantined counts and samples are recorded in source_encodings.',
  'Taipei permit XML honors its BOM/XML encoding declaration. Original XML bytes are preserved before UTF-8 normalization; if declared/default UTF-8 contains isolated malformed bytes, the entire repeated XML record containing them is quarantined. Markup corruption or excessive quarantines fail closed.',
];

await writeFile(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log('Audit encoding provenance attached.');
for (const [encoding, count] of Object.entries(moiManifest.counts || {})) {
  console.log(`  MOI source encoding path ${encoding}: ${count} file(s)`);
}
console.log(`  MOI replacement sequences detected: ${moiManifest.total_replacement_sequence_count ?? 0}`);
console.log(`  MOI BUILDCASE rows quarantined: ${moiManifest.total_quarantined_row_count ?? 0}`);
console.log(`  MOI sibling tables isolated: ${moiManifest.ignored_non_buildcase_file_count ?? 0}`);
for (const file of permitManifest.files || []) {
  console.log(`  ${file.source}: ${file.decode_mode}; replacements=${file.replacement_sequence_count}; quarantined records=${file.quarantined_record_count}`);
}
console.log(`  Original MOI ZIP SHA-256: ${moiManifest.moi_zip_sha256}`);
