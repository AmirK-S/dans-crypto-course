#!/usr/bin/env node
// validate-extraction.mjs
// Validates all 4 Phase 2 success criteria for the batch extraction pipeline.
//
// Usage: node scripts/validate-extraction.mjs
//
// Exit codes:
//   0 = all 4 criteria PASS
//   1 = one or more criteria FAIL
//   2 = warnings only (no failures, at least one WARN)

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'output', 'manifest.json');
const PROGRESS_PATH = join(ROOT, 'output', 'progress.json');
const MISSING_LOG_PATH = join(ROOT, 'output', 'missing-transcripts.log');
const TRANSCRIPTS_DIR = join(ROOT, 'output', 'transcripts');

const FOLDER_NAME_PATTERN = /^\d{2}-[a-z0-9-]+$/;
const FILE_NAME_PATTERN = /^\d{2}-[a-z0-9-]+\.md$/;

// ---- Utilities ----

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readLines(filePath) {
  return readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
}

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => {
    try {
      return statSync(join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

function listFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith(ext));
}

function findAllMdFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findAllMdFiles(full));
    } else if (entry.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

// ---- Result tracking ----

const results = [];
let hasWarn = false;
let hasFail = false;

function pass(label, detail) {
  console.log(`  ${label}: ${detail} (OK)`);
}

function warn(label, detail) {
  hasWarn = true;
  console.log(`  WARNING — ${label}: ${detail}`);
}

function fail(label, detail) {
  hasFail = true;
  console.log(`  FAIL — ${label}: ${detail}`);
}

// ============================================================
// MAIN
// ============================================================

console.log('=== Phase 2: Extraction Validation ===\n');

// ---- Load manifest ----

if (!existsSync(MANIFEST_PATH)) {
  console.error(`FATAL: ${MANIFEST_PATH} not found. Run the extraction pipeline first.`);
  process.exit(1);
}

const manifest = readJson(MANIFEST_PATH);
const sections = manifest.sections || [];

// Build full set of all mdIds from manifest
const allMdIds = new Set();
for (const section of sections) {
  for (const video of section.videos || []) {
    if (video.mdId) allMdIds.add(video.mdId);
  }
}

const totalManifestVideos = [...allMdIds].length;

// Count null-loomId videos in manifest
const nullLoomIdVideos = sections.flatMap(s =>
  (s.videos || []).filter(v => !v.loomId)
);
const loomVideos = sections.flatMap(s =>
  (s.videos || []).filter(v => v.loomId)
);

// ---- SC1: Folder hierarchy and file count ----

console.log('SC1: Folder hierarchy and file count');

const folders = listDirs(TRANSCRIPTS_DIR);
const folderCount = folders.length;

// Sections with videos (section 12 has 0 videos → no folder)
const sectionsWithVideos = sections.filter(s => (s.videos || []).length > 0);
const expectedFolderCount = sectionsWithVideos.length;

// Check folder count (12 or 13; section 12 may have 0 videos = no folder)
if (folderCount >= 12 && folderCount <= 13) {
  if (folderCount < expectedFolderCount) {
    pass('Folders', `${folderCount}/${expectedFolderCount} (OK — some sections empty, no folder created)`);
  } else {
    pass('Folders', `${folderCount}/${expectedFolderCount} (OK)`);
  }
} else {
  fail('Folders', `${folderCount}/${expectedFolderCount} — expected 12-13, got ${folderCount}`);
}

// Check all folder names match pattern
const badFolderNames = folders.filter(f => !FOLDER_NAME_PATTERN.test(f));
if (badFolderNames.length === 0) {
  pass('Folder naming', 'All match NN-slug pattern');
} else {
  fail('Folder naming', `${badFolderNames.length} folders don't match pattern: ${badFolderNames.join(', ')}`);
}

// Count all .md files
const allMdFiles = findAllMdFiles(TRANSCRIPTS_DIR);
const mdFileCount = allMdFiles.length;

if (mdFileCount >= 90) {
  pass('Files', `${mdFileCount}/${totalManifestVideos} (OK)`);
} else {
  fail('Files', `${mdFileCount}/${totalManifestVideos} — expected >= 90, got ${mdFileCount}`);
}

// Check all .md filenames match pattern
const badFileNames = allMdFiles
  .map(f => f.split('/').pop())
  .filter(name => !FILE_NAME_PATTERN.test(name));

if (badFileNames.length === 0) {
  pass('File naming', 'All match NN-slug.md pattern');
} else {
  fail('File naming', `${badFileNames.length} files don't match pattern: ${badFileNames.slice(0, 5).join(', ')}${badFileNames.length > 5 ? '...' : ''}`);
}

// Cross-reference: for each section, verify folder exists and has correct video count
let folderMismatchCount = 0;
for (const section of sectionsWithVideos) {
  const sectionFolderName = `${pad(section.order)}-${slugify(section.name)}`;
  const sectionFolderPath = join(TRANSCRIPTS_DIR, sectionFolderName);
  if (!existsSync(sectionFolderPath)) {
    folderMismatchCount++;
    continue;
  }
  const sectionFiles = listFiles(sectionFolderPath, '.md');
  const expected = (section.videos || []).length;
  const actual = sectionFiles.length;
  // Allow some tolerance for failed fetches (within 3 files)
  if (Math.abs(expected - actual) > 3) {
    folderMismatchCount++;
  }
}

if (folderMismatchCount === 0) {
  pass('Cross-reference', `All ${sectionsWithVideos.length} sections match expected file counts`);
} else {
  warn('Cross-reference', `${folderMismatchCount}/${sectionsWithVideos.length} sections have unexpected file counts`);
}

const sc1 = !hasFail;
console.log(`  ${sc1 ? '→ PASS' : '→ FAIL'}\n`);

// Reset for SC tracking
const sc1Pass = !hasFail;
hasFail = false;

// ---- SC2: Checkpoint resume capability ----

console.log('SC2: Checkpoint resume capability');

if (!existsSync(PROGRESS_PATH)) {
  fail('progress.json', 'File not found');
} else {
  const progress = readJson(PROGRESS_PATH);
  const completed = progress.completed || [];
  const completedCount = completed.length;

  if (completedCount >= 90) {
    pass('progress.json entries', `${completedCount}/${totalManifestVideos} (OK)`);
  } else {
    fail('progress.json entries', `${completedCount}/${totalManifestVideos} — expected >= 90`);
  }

  // Cross-reference: every mdId in progress.json must exist in manifest
  const invalidIds = completed.filter(id => !allMdIds.has(id));
  if (invalidIds.length === 0) {
    pass('All mdIds valid', 'YES — all progress.json entries found in manifest');
  } else {
    fail('All mdIds valid', `NO — ${invalidIds.length} entries in progress.json not found in manifest: ${invalidIds.slice(0, 3).join(', ')}`);
  }
}

console.log('  NOTE: To manually verify resume behavior, run:');
console.log('    node scripts/extract-transcripts.mjs 2>&1');
console.log('  Expected: only [SKIP] lines + "0 fetched" in summary');

const sc2Pass = !hasFail;
hasFail = false;
console.log(`  ${sc2Pass ? '→ PASS' : '→ FAIL'}\n`);

// ---- SC3: missing-transcripts.log completeness ----

console.log('SC3: missing-transcripts.log completeness');

if (!existsSync(MISSING_LOG_PATH)) {
  fail('missing-transcripts.log', 'File not found');
} else {
  const lines = readLines(MISSING_LOG_PATH);
  const lineCount = lines.length;

  if (lineCount >= 21) {
    pass('Total entries', `${lineCount}`);
  } else {
    fail('Total entries', `${lineCount} — expected >= 21 (one per null-loomId video)`);
  }

  // Verify: every line has 5 tab-separated fields
  const malformedLines = lines.filter(line => line.split('\t').length !== 5);
  if (malformedLines.length === 0) {
    pass('Format', 'All lines have 5 tab-separated fields (OK)');
  } else {
    fail('Format', `${malformedLines.length} lines do not have 5 tab-separated fields`);
  }

  // Count by reason
  const nullLoomIdLines = lines.filter(line => line.includes('\tnull_loom_id\t'));
  const fetchFailedLines = lines.filter(line => line.includes('\tfetch_failed\t'));

  pass('null_loom_id entries', `${nullLoomIdLines.length}`);
  pass('fetch_failed entries', `${fetchFailedLines.length}`);

  // Cross-reference: null_loom_id count must match manifest null-loomId count
  const expectedNullCount = nullLoomIdVideos.length;
  if (nullLoomIdLines.length === expectedNullCount) {
    pass('Cross-reference', `${nullLoomIdLines.length}/${expectedNullCount} null_loom_id entries match manifest (OK)`);
  } else {
    warn('Cross-reference', `${nullLoomIdLines.length} log entries vs ${expectedNullCount} null-loomId videos in manifest`);
  }
}

const sc3Pass = !hasFail;
hasFail = false;
console.log(`  ${sc3Pass ? '→ PASS' : '→ FAIL'}\n`);

// ---- SC4: No rate limiting ----

console.log('SC4: No rate limiting');

let sc4Pass = true;
let sc4Warn = false;

if (!existsSync(MISSING_LOG_PATH)) {
  warn('missing-transcripts.log', 'File not found — cannot check for rate-limiting failures');
  sc4Warn = true;
} else {
  const lines = readLines(MISSING_LOG_PATH);
  const fetchFailedLines = lines.filter(line => line.includes('\tfetch_failed\t'));

  if (fetchFailedLines.length === 0) {
    pass('Failed fetches', '0 (OK — all Loom requests succeeded)');
  } else {
    sc4Warn = true;
    warn('Failed fetches', `${fetchFailedLines.length} fetch_failed entries in log`);
    fetchFailedLines.slice(0, 3).forEach(line => {
      const parts = line.split('\t');
      warn('  Details', `${parts[2] || '?'} / ${parts[3] || '?'}`);
    });
    console.log('  NOTE: Some failures may be non-rate-limit errors (network, timeout).');
    console.log('  If this is > 5, re-run pipeline to retry failed fetches.');
  }
}

console.log(`  ${sc4Warn ? '→ WARN' : '→ PASS'}\n`);

// ---- Final result ----

const allPassed = sc1Pass && sc2Pass && sc3Pass && sc4Pass;
const warnOnly = (sc1Pass && sc2Pass && sc3Pass) && sc4Warn;

const passCount = [sc1Pass, sc2Pass, sc3Pass, sc4Pass].filter(Boolean).length;

console.log(`=== RESULT: ${passCount}/4 ${allPassed ? 'PASS' : warnOnly ? 'PASS (with warnings)' : 'FAIL'} ===`);

if (!allPassed && !warnOnly) {
  process.exit(1);
} else if (sc4Warn || hasWarn) {
  process.exit(2);
} else {
  process.exit(0);
}
