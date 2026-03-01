import fetch from 'node-fetch';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
  statSync,
  renameSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================
// BATCH TRANSCRIPT EXTRACTION PIPELINE
// ============================================================
// Usage: node scripts/extract-transcripts.mjs [--dry-run]
//
// Reads output/manifest.json, fetches Loom transcripts via
// GraphQL, writes per-video markdown files in numbered folders.
//
// Requirements: EXTR-04, EXTR-05, EXTR-06, MKDN-01, MKDN-02, MKDN-03
//
// Exit codes:
//   0 = all succeeded or skipped (no failed fetches)
//   1 = one or more fetch failures
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'output', 'manifest.json');
const PROGRESS_PATH = join(ROOT, 'output', 'progress.json');
const PROGRESS_TMP = join(ROOT, 'output', 'progress.json.tmp');
const MISSING_LOG_PATH = join(ROOT, 'output', 'missing-transcripts.log');
const TRANSCRIPTS_DIR = join(ROOT, 'output', 'transcripts');

const LOOM_GRAPHQL_URL = 'https://www.loom.com/graphql';
const INTER_REQUEST_DELAY_MS = 2500;
const RETRY_BASE_DELAY_MS = 5000;
const RETRY_MAX_DELAY_MS = 60000;
const MAX_RETRIES = 3;

const DRY_RUN = process.argv.includes('--dry-run');

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- VTT parser — strips timestamps, voice tags, cue numbers, HTML tags ----
function parseVttToText(vtt) {
  return vtt
    .split('\n')
    .filter(
      (l) =>
        !l.includes('-->') &&
        l.trim() !== '' &&
        !l.match(/^\d+$/) &&
        !l.startsWith('WEBVTT') &&
        !l.startsWith('NOTE')
    )
    .map((l) =>
      l
        .replace(/<v[^>]*>/g, '')
        .replace(/<\/v>/g, '')
        .replace(/<\/?[a-z][^>]*>/g, '')
        .replace(/^\d+\s+/, '')
        .trim()
    )
    .filter((l) => l.length > 0)
    .join(' ')
    .trim();
}

// ---- Loom GraphQL request body (MUST be plain object, NOT array) ----
function buildRequestBody(videoId) {
  return {
    operationName: 'FetchVideoTranscript',
    variables: { videoId, password: null },
    query:
      'query FetchVideoTranscript($videoId: ID!, $password: String) { fetchVideoTranscript(videoId: $videoId, password: $password) { ... on VideoTranscriptDetails { captions_source_url transcription_status __typename } ... on GenericError { message __typename } __typename } }',
  };
}

// ---- Progress checkpoint (EXTR-05) ----
function loadProgress() {
  if (!existsSync(PROGRESS_PATH)) {
    return { completed: [] };
  }
  try {
    return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
  } catch {
    return { completed: [] };
  }
}

function saveProgress(progressObj) {
  writeFileSync(PROGRESS_TMP, JSON.stringify(progressObj, null, 2), 'utf8');
  renameSync(PROGRESS_TMP, PROGRESS_PATH);
}

// ---- Log missing videos ----
function logMissing(reason, sectionName, videoTitle, loomId) {
  const line = `${new Date().toISOString()}\t${reason}\t${sectionName}\t${videoTitle}\t${loomId ?? 'null'}\n`;
  appendFileSync(MISSING_LOG_PATH, line, 'utf8');
}

// ---- Markdown templates (MKDN-01) ----
function buildMarkdownWithTranscript(video, section, transcriptText) {
  return `# ${video.title}

**Section:** ${section.name}
**Loom ID:** ${video.loomId}

## Transcript

${transcriptText}
`;
}

function buildMarkdownStub(video, section) {
  return `# ${video.title}

**Section:** ${section.name}

## Transcript

*No transcript available: no Loom video ID*
`;
}

// ---- Fetch transcript with retry + exponential backoff (EXTR-04, EXTR-06) ----
async function fetchLoomTranscript(loomId) {
  let attemptDelay = RETRY_BASE_DELAY_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Step 1: Loom GraphQL — do NOT include x-loom-request-source header (causes 400)
      const res = await fetch(LOOM_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify(buildRequestBody(loomId)),
      });

      // Retry on rate limit or server errors
      if (res.status === 429 || res.status >= 500) {
        const waitMs = Math.min(attemptDelay, RETRY_MAX_DELAY_MS);
        console.log(
          `  [RETRY] Attempt ${attempt}/${MAX_RETRIES}: HTTP ${res.status} — waiting ${waitMs}ms`
        );
        await delay(waitMs);
        attemptDelay *= 2;
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${body.substring(0, 200)}`);
      }

      const json = await res.json();
      const transcript = json?.data?.fetchVideoTranscript;

      if (!transcript) {
        throw new Error(
          `Unexpected response structure — data.fetchVideoTranscript missing`
        );
      }

      if (transcript.__typename === 'GenericError') {
        throw new Error(`Loom GenericError: ${transcript.message}`);
      }

      // Check captions_source_url (NOT transcription_status — Loom returns "success" not "completed")
      const captionsUrl = transcript.captions_source_url;
      if (!captionsUrl) {
        throw new Error(
          `captions_source_url is null (transcription_status: "${transcript.transcription_status}")`
        );
      }

      // Step 2: Fetch VTT
      const vttRes = await fetch(captionsUrl);
      if (!vttRes.ok) {
        const body = await vttRes.text();
        throw new Error(`VTT fetch failed: HTTP ${vttRes.status}: ${body.substring(0, 200)}`);
      }

      const vttText = await vttRes.text();
      const plainText = parseVttToText(vttText);

      if (!plainText || plainText.length === 0) {
        throw new Error('VTT parsed to empty string');
      }

      return { success: true, text: plainText };
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        return { success: false, error: err.message };
      }
      const waitMs = Math.min(attemptDelay, RETRY_MAX_DELAY_MS);
      console.log(
        `  [RETRY] Attempt ${attempt}/${MAX_RETRIES}: ${err.message.substring(0, 100)} — waiting ${waitMs}ms`
      );
      await delay(waitMs);
      attemptDelay *= 2;
    }
  }

  return { success: false, error: 'Max retries exhausted' };
}

// ---- Main pipeline ----
async function main() {
  console.log('=== Batch Transcript Extraction Pipeline ===');
  if (DRY_RUN) {
    console.log('[DRY RUN MODE — no files will be written, no network calls made]');
  }

  // Load manifest
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    console.error(`Failed to read manifest.json: ${err.message}`);
    process.exit(1);
  }

  const totalVideos = manifest.sections.reduce((n, s) => n + s.videos.length, 0);
  console.log(
    `Loaded manifest: ${manifest.sections.length} sections, ${totalVideos} videos\n`
  );

  if (DRY_RUN) {
    console.log('Dry run complete — manifest loaded successfully.');
    process.exit(0);
  }

  // Load progress checkpoint (EXTR-05)
  const progress = loadProgress();
  const completedSet = new Set(progress.completed);
  console.log(`Checkpoint: ${completedSet.size} previously completed videos\n`);

  // Ensure output directories exist
  mkdirSync(TRANSCRIPTS_DIR, { recursive: true });

  let fetched = 0;
  let skipped = 0;
  let stubs = 0;
  let failed = 0;
  let firstFetch = true;

  for (const section of manifest.sections) {
    if (section.videos.length === 0) continue;

    // Build section folder path (MKDN-02)
    const sectionSlug = `${pad(section.order)}-${slugify(section.name)}`;
    const sectionDir = join(TRANSCRIPTS_DIR, sectionSlug);
    mkdirSync(sectionDir, { recursive: true });

    for (const video of section.videos) {
      // Build output file path (MKDN-03)
      const videoSlug = `${pad(video.order)}-${slugify(video.title)}`;
      const outPath = join(sectionDir, `${videoSlug}.md`);

      // Skip if already in checkpoint OR file already exists and is non-empty
      if (completedSet.has(video.mdId)) {
        console.log(`[SKIP] ${sectionSlug}/${videoSlug}.md (checkpoint)`);
        skipped++;
        continue;
      }

      if (existsSync(outPath)) {
        try {
          const stat = statSync(outPath);
          if (stat.size > 0) {
            console.log(`[SKIP] ${sectionSlug}/${videoSlug}.md (file exists)`);
            completedSet.add(video.mdId);
            progress.completed = Array.from(completedSet);
            saveProgress(progress);
            skipped++;
            continue;
          }
        } catch {
          // Proceed to re-process
        }
      }

      // Handle null loomId — write stub (MKDN-01)
      if (!video.loomId) {
        const markdown = buildMarkdownStub(video, section);
        writeFileSync(outPath, markdown, 'utf8');
        logMissing('null_loom_id', section.name, video.title, null);
        completedSet.add(video.mdId);
        progress.completed = Array.from(completedSet);
        saveProgress(progress);
        console.log(`[STUB] ${sectionSlug}/${videoSlug}.md`);
        stubs++;
        continue;
      }

      // Apply 2500ms inter-request delay before EVERY Loom API call (EXTR-06)
      if (!firstFetch) {
        await delay(INTER_REQUEST_DELAY_MS);
      }
      firstFetch = false;

      // Fetch transcript
      const result = await fetchLoomTranscript(video.loomId);

      if (result.success) {
        const wordCount = result.text.split(/\s+/).filter(Boolean).length;
        const markdown = buildMarkdownWithTranscript(video, section, result.text);
        writeFileSync(outPath, markdown, 'utf8');
        completedSet.add(video.mdId);
        progress.completed = Array.from(completedSet);
        saveProgress(progress);
        console.log(`[OK] ${sectionSlug}/${videoSlug}.md (${wordCount.toLocaleString()} words)`);
        fetched++;
      } else {
        // Log failure — do NOT write markdown, do NOT mark complete (EXTR-04)
        logMissing('fetch_failed', section.name, video.title, video.loomId);
        console.log(
          `[FAIL] ${sectionSlug}/${videoSlug}.md — ${result.error.substring(0, 100)}`
        );
        failed++;
      }
    }
  }

  // Summary
  console.log(
    `\nDone: ${fetched} fetched, ${skipped} skipped, ${stubs} stubs, ${failed} failed`
  );

  // Exit codes: 0 = no failures, 1 = any failures (CI-friendly)
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`Unhandled error: ${err.message}`);
  process.exit(1);
});
