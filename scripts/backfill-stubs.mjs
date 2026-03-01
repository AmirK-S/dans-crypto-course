// ============================================================
// STUB BACKFILL SCRIPT
// ============================================================
// Reads output/skool-content.json (created by extract-skool-content.js)
// and overwrites the 21 stub markdown files with real content.
//
// Usage: node scripts/backfill-stubs.mjs
//
// Content types handled:
//   youtube  — page has a YouTube embed (URL captured)
//   text     — page has text/body content
//   empty    — genuine placeholder page (no content published yet)
//
// Checkpoint/resume: skips mdIds already in progress.json backfilled array.
// ============================================================

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'output', 'manifest.json');
const SKOOL_CONTENT_PATH = join(ROOT, 'output', 'skool-content.json');
const PROGRESS_PATH = join(ROOT, 'output', 'progress.json');
const PROGRESS_TMP = join(ROOT, 'output', 'progress.json.tmp');
const MISSING_LOG_PATH = join(ROOT, 'output', 'missing-transcripts.log');
const TRANSCRIPTS_DIR = join(ROOT, 'output', 'transcripts');

// ---- Utilities (copied from extract-transcripts.mjs — MUST match exactly) ----

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

// ---- Progress checkpoint ----

function loadProgress() {
  if (!existsSync(PROGRESS_PATH)) {
    return { completed: [], backfilled: [] };
  }
  try {
    const p = JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
    if (!p.backfilled) p.backfilled = [];
    return p;
  } catch {
    return { completed: [], backfilled: [] };
  }
}

function saveProgress(progressObj) {
  writeFileSync(PROGRESS_TMP, JSON.stringify(progressObj, null, 2), 'utf8');
  renameSync(PROGRESS_TMP, PROGRESS_PATH);
}

// ---- Markdown generators ----

function buildYoutubeMarkdown(entry, sectionName) {
  return `# ${entry.title}

**Section:** ${sectionName}
**Source:** YouTube (${entry.youtubeUrl})

## Content

*YouTube video embed — transcript not available via Loom pipeline.*
*Watch at: ${entry.youtubeUrl}*
`;
}

function buildTextMarkdown(entry, sectionName) {
  return `# ${entry.title}

**Section:** ${sectionName}

## Content

${entry.textContent}
`;
}

function buildEmptyMarkdown(entry, sectionName) {
  return `# ${entry.title}

**Section:** ${sectionName}

## Content

*This lesson is a placeholder — no content has been published yet.*
`;
}

// ---- Update missing-transcripts.log ----
// Removes null_loom_id entries for mdIds that now have content (youtube or text).
// Keeps entries for genuine empty placeholders (updates reason to "empty_placeholder").
// Keeps entries with reason fetch_failed (unrelated to backfill).

function updateMissingLog(backfilledEntries) {
  if (!existsSync(MISSING_LOG_PATH)) return;

  const lines = readFileSync(MISSING_LOG_PATH, 'utf8').split('\n').filter(Boolean);

  // Build map of mdId -> entry for quick lookup
  const backfilledMap = new Map(backfilledEntries.map((e) => [e.mdId, e]));

  const updatedLines = [];
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 5) {
      updatedLines.push(line);
      continue;
    }

    const [timestamp, reason, sectionName, videoTitle] = parts;

    // Find the matching entry by title + section (mdId isn't in the log)
    let matchedEntry = null;
    for (const [, entry] of backfilledMap) {
      if (entry.title === videoTitle && entry.section === sectionName) {
        matchedEntry = entry;
        break;
      }
    }

    if (!matchedEntry) {
      // Not a backfill target — keep as-is
      updatedLines.push(line);
      continue;
    }

    if (matchedEntry.contentType === 'empty') {
      // Genuine empty placeholder — update reason
      updatedLines.push(
        `${timestamp}\tempty_placeholder\t${sectionName}\t${videoTitle}\tnull`
      );
    } else {
      // youtube or text — remove from log (now has real content)
      // Don't push to updatedLines
    }
  }

  writeFileSync(MISSING_LOG_PATH, updatedLines.join('\n') + (updatedLines.length > 0 ? '\n' : ''), 'utf8');
}

// ---- Main ----

async function main() {
  console.log('=== Stub Backfill Script ===');

  // Load manifest
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    console.error(`Failed to read manifest.json: ${err.message}`);
    process.exit(1);
  }

  // Load skool-content.json
  if (!existsSync(SKOOL_CONTENT_PATH)) {
    console.error(`output/skool-content.json not found.`);
    console.error(`Run scripts/extract-skool-content.js in the browser first, then save results to output/skool-content.json`);
    process.exit(1);
  }

  let skoolContent;
  try {
    skoolContent = JSON.parse(readFileSync(SKOOL_CONTENT_PATH, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse skool-content.json: ${err.message}`);
    process.exit(1);
  }

  console.log(`Loaded ${skoolContent.length} entries from skool-content.json`);

  // Load progress checkpoint
  const progress = loadProgress();
  const backfilledSet = new Set(progress.backfilled);
  console.log(`Checkpoint: ${backfilledSet.size} previously backfilled\n`);

  // Build a lookup map: mdId -> { section, video } from manifest
  const manifestLookup = new Map();
  for (const section of manifest.sections) {
    for (const video of section.videos) {
      manifestLookup.set(video.mdId, { section, video });
    }
  }

  let updated = 0;
  let skipped = 0;
  let youtube = 0;
  let text = 0;
  let empty = 0;
  const backfilledEntries = [];

  for (const entry of skoolContent) {
    const { mdId } = entry;

    // Skip if already backfilled (checkpoint/resume)
    if (backfilledSet.has(mdId)) {
      console.log(`[SKIP] ${entry.title} (already backfilled)`);
      skipped++;
      continue;
    }

    // Find manifest entry
    const manifestEntry = manifestLookup.get(mdId);
    if (!manifestEntry) {
      console.warn(`[WARN] mdId not found in manifest: ${mdId} (${entry.title})`);
      continue;
    }

    const { section, video } = manifestEntry;
    const sectionSlug = `${pad(section.order)}-${slugify(section.name)}`;
    const videoSlug = `${pad(video.order)}-${slugify(video.title)}`;
    const filePath = join(TRANSCRIPTS_DIR, sectionSlug, `${videoSlug}.md`);

    // Generate markdown based on contentType
    let markdown;
    if (entry.contentType === 'youtube') {
      markdown = buildYoutubeMarkdown(entry, section.name);
      youtube++;
    } else if (entry.contentType === 'text') {
      markdown = buildTextMarkdown(entry, section.name);
      text++;
    } else {
      markdown = buildEmptyMarkdown(entry, section.name);
      empty++;
    }

    // Write file (overwrite stub)
    writeFileSync(filePath, markdown, 'utf8');
    console.log(`[UPDATED] ${sectionSlug}/${videoSlug}.md (${entry.contentType})`);

    // Update checkpoint
    backfilledSet.add(mdId);
    progress.backfilled = Array.from(backfilledSet);
    saveProgress(progress);

    backfilledEntries.push(entry);
    updated++;
  }

  // Update missing-transcripts.log
  if (backfilledEntries.length > 0) {
    updateMissingLog(backfilledEntries);
    console.log(`\nUpdated missing-transcripts.log`);
  }

  // Summary
  console.log(`\nDone: ${updated} updated (${youtube} youtube, ${text} text, ${empty} empty), ${skipped} skipped`);
}

main().catch((err) => {
  console.error(`Unhandled error: ${err.message}`);
  process.exit(1);
});
