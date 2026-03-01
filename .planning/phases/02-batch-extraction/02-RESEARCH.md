# Phase 2: Batch Extraction - Research

**Researched:** 2026-03-01
**Domain:** Node.js batch pipeline — sequential Loom GraphQL fetching, disk checkpointing, file system hierarchy generation, markdown file writing, rate limiting
**Confidence:** HIGH — Phase 1 validated all external APIs live; Phase 2 is pure Node.js work on confirmed foundations

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXTR-04 | Loom transcript fetched per video via GraphQL endpoint (no video download) | Fully validated in Phase 1 — 5/5 transcripts fetched from live course. GraphQL query, headers, VTT parsing all confirmed. Code exists in `scripts/test-loom-batch.mjs`. |
| EXTR-05 | Progress state file tracks completed video IDs (resume on failure) | Implement as a flat JSON file (`output/progress.json`) written after each successful video. On startup, load progress file and skip already-completed loomIds. Standard Node.js `fs.readFileSync`/`fs.writeFileSync` pattern — no library needed. |
| EXTR-06 | Rate limiting with exponential backoff between Loom API calls | `test-loom-batch.mjs` uses 2000ms fixed delay; confirmed working for 5 videos. For 74 videos, use sequential (not parallel) fetch with 2s–3s delay between GraphQL calls. Exponential backoff on HTTP 429/5xx — cap at 60s, 3 retries. |
| MKDN-01 | Per-video markdown file created with title, section, and full transcript | Pure Node.js `fs.writeFileSync`. Markdown template: `# {title}\n\n**Section:** {section}\n\n## Transcript\n\n{transcript}`. No library needed. |
| MKDN-02 | Files organized in folder hierarchy matching course structure (13 sections) | `fs.mkdirSync({ recursive: true })` creates nested folders. Folder name pattern: `{padded_section_order}-{slugified_section_name}/`. Node.js `path.join` for path construction. |
| MKDN-03 | Filenames are sortable with numeric prefixes (01-, 02-) | Zero-padded video order prefix: `{padded_video_order}-{slugified_title}.md`. Padding to 2 digits sufficient (max ~20 videos per section). Slugify = lowercase + replace non-alphanumeric with hyphens + collapse consecutive hyphens. |
</phase_requirements>

---

## Summary

Phase 2 is a straightforward Node.js batch pipeline. The Loom GraphQL + VTT parsing approach is fully proven by Phase 1 (5/5 live fetches, all producing 2,000–5,000+ word transcripts). The only new work is: sequential iteration over `manifest.json`, a checkpoint file for resumability, exponential backoff for rate limiting, folder creation, and markdown file writing.

The manifest has 95 videos across 13 sections, of which 74 have `loomId` non-null. The 21 videos with `loomId: null` are text-only lessons or "Coming Soon" placeholders — the pipeline must handle these gracefully: skip Loom fetch, write a minimal markdown stub with a note, and log to `missing-transcripts.log`. This distinction (null loomId vs failed fetch) must be tracked separately in the progress checkpoint and log file.

The main risk for Phase 2 is Loom rate limiting. The Phase 1 batch test used a 2000ms fixed delay between 5 requests, all successful. For 74 requests, the safe pattern is sequential execution (never parallel), 2–3 second fixed delay, and exponential backoff on any 429 or 5xx response (starting at 5s, doubling, capping at 60s, max 3 retries per video). At 3s/video, 74 videos takes ~3.7 minutes — acceptable. The pipeline should log every request's outcome so partial runs are diagnosable.

**Primary recommendation:** Write a single `scripts/extract-transcripts.mjs` pipeline script. Read `manifest.json`, load `output/progress.json` (create if missing), iterate videos sequentially, fetch Loom transcripts with retry/backoff, write markdown files per video, append to `missing-transcripts.log` for nulls/failures, update `progress.json` after each success. No external libraries beyond existing `node-fetch`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node-fetch` | v3.x (ESM, already installed) | HTTP requests to Loom GraphQL + VTT URLs | Already in `package.json`; proven in Phase 1 |
| Node.js `fs` (built-in) | 22 LTS | Read manifest, write progress checkpoint, write markdown files, append to log | No install; sufficient for all I/O in this phase |
| Node.js `path` (built-in) | 22 LTS | Cross-platform path joining for nested folder structure | No install; prevents path separator bugs |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None (hand-written slug) | — | Convert section/video titles to safe folder/file names | Simple regex; no library needed for ~80 known strings |
| `chalk` v5 | Already ESM-compatible | Colored terminal output for progress | Optional; only if readability matters — project already noted it's ESM-only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sequential loop with delay | `p-limit` / `bottleneck` for concurrency | Parallel fetching risks rate limiting — sequential is safer for an undocumented API. Concurrency adds no benefit when Loom is the bottleneck, not local CPU. |
| Custom checkpoint JSON | SQLite via `better-sqlite3` | SQLite is overkill for 74 records; a flat JSON file read/written atomically is sufficient and has zero dependencies |
| Hand-written slugify | `slugify` npm package | The course has fixed titles known at research time; a simple `toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')` is sufficient and dependency-free |
| `node-fetch` | built-in `fetch` (Node 22) | Node 22 ships global `fetch`; could drop `node-fetch` dependency. However, `node-fetch` is already installed and proven in Phase 1 — no benefit in switching mid-project |

**Installation:**
```bash
# No new installs required — node-fetch already in package.json
# All other tooling is Node.js built-ins
```

---

## Architecture Patterns

### Recommended Project Structure

```
scripts/
├── extract-transcripts.mjs   # Phase 2 main pipeline script
output/
├── manifest.json             # Phase 1 artifact — input to pipeline
├── progress.json             # Checkpoint file — created/updated per video
├── missing-transcripts.log   # Append-only log for null/failed fetches
└── transcripts/              # Generated output folder hierarchy
    ├── 01-introduction-to-the-course/
    │   └── 01-introduction.md
    ├── 02-the-basics/
    │   ├── 01-start-here-how-to-learn-crypto-as-a-beginner.md
    │   └── 02-complete-beginners-video-guide.md
    └── ...
```

### Pattern 1: Progress Checkpoint (Resume on Failure)

**What:** A JSON file tracking which video IDs have been successfully processed. Loaded at startup; updated atomically after each successful write.

**When to use:** Any batch pipeline over external API calls where partial failure is likely.

**Example:**
```javascript
// Source: Standard Node.js pattern; no external library
import { readFileSync, writeFileSync, existsSync } from 'fs';

const PROGRESS_PATH = 'output/progress.json';

function loadProgress() {
  if (!existsSync(PROGRESS_PATH)) return { completed: [] };
  try {
    return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
  } catch {
    return { completed: [] };
  }
}

function saveProgress(progress) {
  // Write to temp file first, then rename — prevents corrupt checkpoint on crash
  const tmp = PROGRESS_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(progress, null, 2), 'utf8');
  // fs.renameSync is atomic on same filesystem
  import('fs').then(({ renameSync }) => renameSync(tmp, PROGRESS_PATH));
}

// Usage in main loop:
const progress = loadProgress();
const completedSet = new Set(progress.completed);

for (const video of allVideos) {
  if (completedSet.has(video.loomId)) {
    console.log(`[SKIP] ${video.title} — already completed`);
    continue;
  }
  // ... fetch and write ...
  completedSet.add(video.loomId);
  saveProgress({ completed: [...completedSet], lastUpdated: new Date().toISOString() });
}
```

**Critical note on null-loomId videos:** Videos with `loomId: null` do NOT get added to `progress.completed` — they are skipped at the manifest level and logged to `missing-transcripts.log`. The checkpoint only tracks videos where a Loom fetch was attempted and succeeded.

### Pattern 2: Exponential Backoff for Rate Limiting

**What:** On HTTP 429 (rate limited) or 5xx (server error), wait with increasing delay before retry.

**When to use:** Any repeated call to an external API without a published rate limit.

**Example:**
```javascript
// Source: Standard pattern; verified against Phase 1 behavior (2000ms delay worked for 5 calls)
async function fetchWithRetry(fn, maxRetries = 3, baseDelayMs = 5000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), 60000);
        console.warn(`[RETRY ${attempt + 1}/${maxRetries}] ${err.message} — waiting ${delayMs}ms`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

// Fixed delay between all requests (not just retries):
const INTER_REQUEST_DELAY_MS = 2500; // 2.5s between each video fetch

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
```

### Pattern 3: Folder Hierarchy and Filename Generation

**What:** Create numbered, sortable folder and file names from section/video order and title.

**Example:**
```javascript
// Source: Standard Node.js fs pattern
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getVideoOutputPath(baseDir, section, video) {
  const sectionFolder = `${pad(section.order)}-${slugify(section.name)}`;
  const videoFile = `${pad(video.order)}-${slugify(video.title)}.md`;
  return join(baseDir, sectionFolder, videoFile);
}

function ensureDirExists(filePath) {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
}

// Usage:
const outputPath = getVideoOutputPath('output/transcripts', section, video);
ensureDirExists(outputPath);
writeFileSync(outputPath, markdownContent, 'utf8');
```

### Pattern 4: Markdown File Template

**What:** Fixed template for MKDN-01 output. Title, section, and full transcript.

**Example:**
```javascript
function buildMarkdown(video, section, transcript) {
  return [
    `# ${video.title}`,
    ``,
    `**Section:** ${section.name}`,
    `**Section Order:** ${section.order}`,
    `**Video Order:** ${video.order}`,
    `**Loom ID:** ${video.loomId}`,
    ``,
    `## Transcript`,
    ``,
    transcript,
    ``,
  ].join('\n');
}

// For null-loomId videos, write a stub:
function buildStubMarkdown(video, section, reason) {
  return [
    `# ${video.title}`,
    ``,
    `**Section:** ${section.name}`,
    `**Section Order:** ${section.order}`,
    `**Video Order:** ${video.order}`,
    ``,
    `## Transcript`,
    ``,
    `*No transcript available: ${reason}*`,
    ``,
  ].join('\n');
}
```

### Pattern 5: missing-transcripts.log Format

**What:** Append-only log file, one record per line, TSV or structured for easy grep.

**Example:**
```javascript
import { appendFileSync } from 'fs';

function logMissing(logPath, reason, video, section) {
  const line = [
    new Date().toISOString(),
    reason,                    // 'null_loom_id' | 'fetch_failed' | 'empty_transcript'
    section.name,
    video.title,
    video.loomId || 'null',
  ].join('\t') + '\n';
  appendFileSync(logPath, line, 'utf8');
}
```

### Anti-Patterns to Avoid

- **Parallel fetches to Loom:** Even `Promise.all` with 5 concurrent requests risks triggering rate limiting on an undocumented API. Use `for...of` with sequential awaits and a fixed delay.
- **Writing markdown before the transcript fetch succeeds:** Partial file writes on crash create corrupt output files that look complete. Always write atomically — write to `.tmp` first, rename to final path.
- **Using loomId as checkpoint key for null-loomId videos:** Null loomIds are not unique — multiple videos can have `loomId: null`. Use `video.mdId` (unique per video, always non-null) as the primary key in progress tracking, or use a composite `${section.order}-${video.order}` key.
- **Silent failure:** If a transcript fetch fails after all retries, do NOT write an empty file and mark success. Log to `missing-transcripts.log` and continue. The success criterion is that gaps are visible, not that 100% succeed.
- **Building a complex progress format:** The checkpoint file only needs to track which videos are done. A flat array of completed identifiers is sufficient — no nested structure needed.
- **Crashing on the first video failure:** The pipeline must `try/catch` each video independently. One failed fetch must not abort the entire run.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP requests | Custom TCP client | `node-fetch` (already installed) | Already proven in Phase 1 |
| Atomic file writes | Custom locking | Write to `.tmp` then `fs.renameSync` | `rename` is atomic on same filesystem; no library needed |
| Progress persistence | SQLite or Redis | Flat `progress.json` with `renameSync` | 74 records max; JSON is readable and debuggable without tooling |
| Rate limiting | Token bucket / leaky bucket library | Simple `await delay(2500)` loop | Loom has no published rate limit; fixed conservative delay is predictable and requires zero dependencies |
| Folder creation | Recursive mkdir implementation | `fs.mkdirSync(path, { recursive: true })` | Built into Node.js 10+; handles all edge cases |
| Title slugification | `slugify` npm package | 3-line regex function | Fixed corpus of 95 known strings; npm package adds fragile transitive dependencies |

**Key insight:** Phase 2 is I/O and sequencing, not algorithmic complexity. The entire pipeline is ~150–200 lines of straightforward Node.js. The complexity is in correctness (checkpoint atomicity, failure isolation, log completeness) not in the implementation stack.

---

## Common Pitfalls

### Pitfall 1: Using loomId as Checkpoint Key When loomId Can Be Null

**What goes wrong:** Progress file stores loomIds as completed keys. Multiple videos have `loomId: null` — collisions in the key space, or the first null-id video being skipped for all subsequent null-id videos.

**Why it happens:** The natural key for "Loom fetch complete" is the loomId. But null is not unique.

**How to avoid:** Use `video.mdId` as the checkpoint key — it is the Skool lesson ID, always a non-null 32-char hex string, and unique per video across the entire course. The progress file stores completed mdIds regardless of whether the video has a loomId.

**Warning signs:** Pipeline skips multiple videos after the first null-loomId video.

### Pitfall 2: Transcription Status "success" Not "completed"

**What goes wrong:** Pipeline checks `transcription_status === 'completed'` and treats "success" as a failure or unprocessed state, logging real transcripts as missing.

**Why it happens:** Loom documentation says "completed" but the live API returns "success" (confirmed in Phase 1 STATE.md decision log).

**How to avoid:** Check `captions_source_url !== null` as the primary success condition, not `transcription_status`. Log the status value alongside the URL for diagnosability. Do not gate on the string value of `transcription_status`.

**Warning signs:** All videos logged to `missing-transcripts.log` with error "transcription_status not completed".

### Pitfall 3: VTT Duplicate Lines Due to Overlapping Cue Timing

**What goes wrong:** Loom VTT files sometimes repeat text across overlapping cue windows. The naïve line-join produces double phrases: "Alright guys Alright guys let me show you...".

**Why it happens:** VTT cues can overlap in time (e.g., cue 1: 00:00.000 → 00:03.000, cue 2: 00:02.000 → 00:05.000) with the same spoken word appearing in both. The Phase 1 parser joins all non-timestamp lines, including overlapping ones.

**How to avoid:** After joining, run a deduplication pass: if consecutive words repeat, collapse them. OR: parse only cues where the start time is >= the previous cue's end time. The existing `parseVttToText` from Phase 1 does not deduplicate — test for this by checking if Phase 1's previews look clean (they do, per `loom-test-results.json`). If transcripts look clean in Phase 1, this may not be an active issue — monitor output quality.

**Warning signs:** Transcript contains repeated phrases: "word word word".

### Pitfall 4: Filename Collisions from Slugification

**What goes wrong:** Two different video titles slugify to the same filename. E.g., "Crypto: 101" and "Crypto - 101" both become `crypto-101.md`.

**Why it happens:** Slugification strips special characters; different punctuation produces the same output.

**How to avoid:** After computing the file path, check if it already exists. If collision detected, append the video's `order` number as a suffix: `crypto-101-2.md`. For 95 known videos, this is unlikely but defensive code is cheap.

**Warning signs:** `writeFileSync` call for the second video silently overwrites the first.

### Pitfall 5: Long Filenames Causing File System Issues

**What goes wrong:** Some video titles are very long (e.g., "Start Here - How to learn Crypto as a beginner" = 48 chars + `.md` = 51 chars). Not a problem at this length, but confirm the longest titles.

**Why it happens:** macOS HFS+ limit is 255 bytes; Linux ext4 is 255 bytes. All current titles are well within limits.

**How to avoid:** Truncate slug at 80 characters if needed: `slug.substring(0, 80).replace(/-$/, '')`. Unlikely to be needed — verify longest title in manifest (the longest appears to be ~50 characters).

**Warning signs:** `ENAMETOOLONG` error from `writeFileSync`.

### Pitfall 6: Race Between progress.json Write and Script Kill

**What goes wrong:** Script is killed (Ctrl+C, OOM, timeout) between writing the markdown file and updating `progress.json`. On restart, the pipeline re-fetches and re-writes an already-complete video.

**Why it happens:** Non-atomic two-step: (1) write markdown, (2) update checkpoint. Kill between steps leaves checkpoint out of sync.

**How to avoid:** The consequence is mild — re-writing an identical markdown file is idempotent. The pipeline should check if the output markdown file already exists AND has non-zero size as a secondary completion check. If the file exists and is non-empty, skip regardless of checkpoint state.

**Warning signs:** Duplicate API calls logged for videos that should have been skipped.

---

## Code Examples

Verified patterns from official sources and Phase 1 codebase:

### Full Pipeline Loop (reference skeleton)

```javascript
// Source: Based on patterns from scripts/test-loom-batch.mjs (Phase 1, verified working)
import fetch from 'node-fetch';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH  = join(__dirname, '..', 'output', 'manifest.json');
const PROGRESS_PATH  = join(__dirname, '..', 'output', 'progress.json');
const MISSING_LOG    = join(__dirname, '..', 'output', 'missing-transcripts.log');
const OUTPUT_DIR     = join(__dirname, '..', 'output', 'transcripts');
const DELAY_MS       = 2500;

// ---- Helpers ----
function pad(n, w = 2) { return String(n).padStart(w, '0'); }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadProgress() {
  if (!existsSync(PROGRESS_PATH)) return new Set();
  try { return new Set(JSON.parse(readFileSync(PROGRESS_PATH, 'utf8')).completed); }
  catch { return new Set(); }
}

function saveProgress(completedSet) {
  const tmp = PROGRESS_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify({ completed: [...completedSet], updatedAt: new Date().toISOString() }, null, 2));
  renameSync(tmp, PROGRESS_PATH);
}

function logMissing(reason, section, video) {
  const line = [new Date().toISOString(), reason, section.name, video.title, video.loomId || 'null'].join('\t') + '\n';
  appendFileSync(MISSING_LOG, line, 'utf8');
}

// ---- Loom GraphQL (from Phase 1 test-loom-batch.mjs) ----
async function fetchTranscript(loomId) {
  const res = await fetch('https://www.loom.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      operationName: 'FetchVideoTranscript',
      variables: { videoId: loomId, password: null },
      query: 'query FetchVideoTranscript($videoId: ID!, $password: String) { fetchVideoTranscript(videoId: $videoId, password: $password) { ... on VideoTranscriptDetails { captions_source_url transcription_status __typename } ... on GenericError { message __typename } __typename } }',
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} from Loom GraphQL`);
  const json = await res.json();
  const data = json?.data?.fetchVideoTranscript;
  if (!data || data.__typename === 'GenericError') throw new Error(data?.message || 'GenericError');
  if (!data.captions_source_url) throw new Error(`captions_source_url null (status: ${data.transcription_status})`);

  const vttRes = await fetch(data.captions_source_url);
  if (!vttRes.ok) throw new Error(`VTT fetch HTTP ${vttRes.status}`);
  const vtt = await vttRes.text();
  return parseVttToText(vtt);
}

function parseVttToText(vtt) {
  return vtt.split('\n')
    .filter(l => !l.includes('-->') && l.trim() !== '' && !l.match(/^\d+$/) && !l.startsWith('WEBVTT') && !l.startsWith('NOTE'))
    .map(l => l.replace(/<v[^>]*>/g, '').replace(/<\/v>/g, '').replace(/<\/?[a-z][^>]*>/g, '').replace(/^\d+\s+/, '').trim())
    .filter(l => l.length > 0)
    .join(' ').trim();
}

// ---- Main ----
async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const completed = loadProgress();
  let fetched = 0, skipped = 0, missing = 0, failed = 0;

  for (const section of manifest.sections) {
    for (const video of section.videos) {
      // Use mdId as checkpoint key (unique, never null)
      if (completed.has(video.mdId)) { skipped++; continue; }

      const outputPath = join(OUTPUT_DIR, `${pad(section.order)}-${slugify(section.name)}`, `${pad(video.order)}-${slugify(video.title)}.md`);

      // Secondary check: file already exists and non-empty
      if (existsSync(outputPath) && readFileSync(outputPath, 'utf8').length > 0) {
        completed.add(video.mdId);
        saveProgress(completed);
        skipped++;
        continue;
      }

      // Null loomId — write stub, log, continue
      if (!video.loomId) {
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, `# ${video.title}\n\n**Section:** ${section.name}\n\n## Transcript\n\n*No transcript available: no Loom video ID*\n`, 'utf8');
        logMissing('null_loom_id', section, video);
        completed.add(video.mdId);
        saveProgress(completed);
        missing++;
        continue;
      }

      // Fetch transcript with retry
      let transcript = null;
      for (let attempt = 0; attempt <= 3; attempt++) {
        try {
          transcript = await fetchTranscript(video.loomId);
          break;
        } catch (err) {
          if (attempt < 3) {
            const wait = Math.min(5000 * Math.pow(2, attempt), 60000);
            console.warn(`  [RETRY ${attempt + 1}/3] ${err.message} — waiting ${wait}ms`);
            await delay(wait);
          } else {
            console.error(`  [FAIL] ${section.name} / ${video.title}: ${err.message}`);
            logMissing('fetch_failed', section, video);
            failed++;
          }
        }
      }

      if (transcript) {
        mkdirSync(dirname(outputPath), { recursive: true });
        const md = `# ${video.title}\n\n**Section:** ${section.name}\n**Loom ID:** ${video.loomId}\n\n## Transcript\n\n${transcript}\n`;
        writeFileSync(outputPath, md, 'utf8');
        completed.add(video.mdId);
        saveProgress(completed);
        fetched++;
        console.log(`  [OK] ${section.name} / ${video.title} (${transcript.split(/\s+/).length} words)`);
      }

      await delay(DELAY_MS);
    }
  }

  console.log(`\nDone: ${fetched} fetched, ${skipped} skipped, ${missing} missing loomId, ${failed} failed`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

### Key Numbers from Phase 1 (Validated)

```
manifest.json:
  - 13 sections (orders 1–13)
  - 95 total videos
  - 74 with loomId (will attempt fetch)
  - 21 with loomId: null (stub + log, no fetch)
  - Section 12 "Putting Everything Together" = 0 videos (empty placeholder)

Phase 1 batch test results (loom-test-results.json):
  - Response times: 543ms–2062ms per video (first request slower due to cold start)
  - Transcript sizes: 10,658–27,899 characters (2,002–5,148 words)
  - 0 failures across 5 diverse sections

Timing estimate for full run:
  - 74 Loom videos × 2.5s inter-request delay = ~3.1 min base
  - Add avg 1s fetch time = ~4.4 min total for a clean run
  - With 3 retries × 60s max per failure = worst case per video = 3.1 min extra
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Parallel batch fetching | Sequential with fixed delay | Driven by Loom undocumented API caution | 4–5 min runtime is acceptable vs risk of ban |
| File-per-run log | Append-only `missing-transcripts.log` | Best practice | Survives multi-run resumption; gaps always visible |
| Progress in manifest.json | Separate `progress.json` | Phase 2 design decision | Input manifest stays clean; progress state isolated |

**Deprecated/outdated:**
- Batched GraphQL array requests `[{}]`: Causes HTTP 400 — confirmed broken since Nov 2025. Use single object per request.
- `x-loom-request-source` header: Causes HTTP 400 — omit entirely.

---

## Open Questions

1. **Will Loom impose rate limits for 74 sequential requests at 2.5s intervals?**
   - What we know: Phase 1 batch test did 5 requests at 2s intervals — 0 failures. No official Loom rate limit documented.
   - What's unclear: Whether 74 requests triggers any anti-scraping detection (IP-based throttle, DDoS protection).
   - Recommendation: Start with 2.5s delay. If 429 responses appear, the exponential backoff will handle them. Log all HTTP status codes so rate limiting is immediately visible. If full run succeeds, reduce delay in Phase 3 if needed.

2. **Are any of the 74 loomId videos private or behind additional Loom auth?**
   - What we know: Phase 1 confirmed 5 videos across 5 different sections work without auth. The 5 tested IDs span sections 1, 4, 6, 8, 10.
   - What's unclear: Whether the 74 untested videos (sections 3, 5, 7, 9, 11, 13) have any different access control. All are embedded in the same Skool course.
   - Recommendation: Design the pipeline to log failed fetches to `missing-transcripts.log` with error detail. If any video returns null `captions_source_url`, it will be surfaced without aborting the run.

3. **Should null-loomId videos get stub markdown files or be skipped entirely?**
   - What we know: Success criterion 1 says "one markdown file per video" — implying stubs for null-loomId videos satisfy the folder hierarchy requirement. Success criterion 3 says only "transcript fetch returned empty or null" need be logged.
   - What's unclear: Whether stub files (with no transcript content) cause downstream issues in Phase 3's summarization step.
   - Recommendation: Write minimal stub files for null-loomId videos so the folder hierarchy is complete and consistent for Phase 3. Include a clear `*No transcript available*` marker that Phase 3 can detect and skip.

---

## Sources

### Primary (HIGH confidence)

- `output/loom-test-results.json` (Phase 1 live output) — 5/5 Loom GraphQL fetches succeeded, response times and word counts confirmed. Direct empirical evidence.
- `scripts/test-loom-batch.mjs` (Phase 1, verified working) — Contains exact Loom GraphQL query, VTT parsing, delay pattern. This code is the foundation for Phase 2 pipeline.
- `output/manifest.json` (Phase 1 live output) — 13 sections, 95 videos, 74 loomIds confirmed. Exact input shape for Phase 2 pipeline.
- `.planning/STATE.md` — Key decisions: `transcription_status` returns "success" not "completed"; GraphQL body must be plain object not array; VTT parser must strip `<v N>` voice tags.
- Node.js v22 docs — `fs.mkdirSync({ recursive: true })`, `fs.renameSync` atomicity on same filesystem, `fs.appendFileSync`.

### Secondary (MEDIUM confidence)

- Phase 1 VERIFICATION.md — Confirms enrich-manifest.js uses `video.mdId` as unique per-video identifier (32-char hex, always non-null). Validates using `mdId` as checkpoint key.

### Tertiary (LOW confidence)

- General knowledge: `fs.renameSync` is atomic on same-filesystem operations on Linux/macOS (POSIX `rename(2)` syscall). Behavior on cross-filesystem moves or Windows NTFS differs — not relevant here as checkpoint is in the same `output/` directory.

---

## Metadata

**Confidence breakdown:**
- Loom GraphQL + VTT parsing: HIGH — live validated in Phase 1, 5/5 success
- Checkpoint pattern (progress.json + renameSync): HIGH — standard Node.js I/O; no novel libraries
- Folder hierarchy generation (slugify + mkdirSync): HIGH — pure Node.js built-ins, well-documented
- Rate limiting behavior at 74 requests: MEDIUM — extrapolated from 5-request success; 74-request behavior unconfirmed
- Null-loomId stub handling: MEDIUM — design decision based on success criteria interpretation; no prior example

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (Loom GraphQL is stable; re-verify if HTTP 400 errors appear)
