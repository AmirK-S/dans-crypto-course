# Phase 4: Polish and Navigation - Research

**Researched:** 2026-03-02
**Domain:** AI API (Messages endpoint), markdown generation, file system traversal, index building, in-place file modification
**Confidence:** HIGH — project corpus measured directly, AI vendor docs verified, stack carries over from Phase 3 with no new dependencies

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MKDN-05 | AI-generated key takeaways (3-7 bullets) included per video | Per-video AI API call using Haiku 4.5 (cost-optimized). Each video markdown file is modified in-place to prepend a `## Key Takeaways` section before the existing `## Transcript` section. 74 real content files to process; 21 YouTube stubs and Skool boilerplate files are skipped. |
| SUMM-04 | Quick-reference cheat sheet generated per section | One AI API call per section reading the existing `SECTION_SUMMARY.md` as input and writing `CHEAT_SHEET.md` in the same folder. Distinct from the summary: ultra-condensed bullet format, no prose, suitable for live trading reference. 12 sections with real content; 1 stub section. |
| SUMM-05 | Section index files + master course index auto-generated | Pure filesystem traversal — no AI call needed. Script reads the folder structure and generates markdown index files: one `INDEX.md` per section folder, one `COURSE_INDEX.md` at `output/` root. Links to all video `.md` files, `SECTION_SUMMARY.md`, and `CHEAT_SHEET.md` per section. |
</phase_requirements>

---

## Summary

Phase 4 has three distinct deliverables: (1) per-video key takeaways inserted into existing markdown files (MKDN-05), (2) per-section cheat sheets as new files distinct from the existing section summaries (SUMM-04), and (3) index files linking the entire knowledge base together (SUMM-05).

The stack is identical to Phase 3: Node.js 25.6.1 ESM, `ai-sdk` 0.78.0 (already installed), and Node.js built-in `fs`. No new dependencies are needed. The `ai-sdk` handles rate limiting via automatic 429 retry. All models, environment conventions, and prompt patterns from Phase 3 carry forward directly.

The key engineering decision is whether to implement Phase 4 as one combined script or two separate scripts. Two scripts is recommended: one for AI-driven work (key takeaways + cheat sheets, which share the same AI vendor client setup and retry pattern) and one for pure index generation (no API, fast, idempotent). The AI script should be re-runnable: skip files that already have a `## Key Takeaways` section, skip sections that already have `CHEAT_SHEET.md`.

Cost estimate: 74 per-video takeaway calls + 12 per-section cheat sheet calls = 86 Haiku API calls. At typical transcript sizes (~3K-9K words each = ~4K-12K tokens input) and ~300 tokens output per call, total input is roughly 400K tokens and output is ~26K tokens. At Haiku pricing ($1/$5 per MTok), this is under $0.60 for the full run.

**Primary recommendation:** Two scripts — `scripts/generate-takeaways-and-cheatsheets.mjs` for AI work, `scripts/generate-indexes.mjs` for index files. Both read from `output/transcripts/`, both are checkpoint-safe (skip already-completed files), both follow patterns established in Phase 3.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai-sdk` | 0.78.0 (installed) | AI API calls for takeaways and cheat sheets | Already installed; official SDK with automatic retry on 429/5xx |
| Node.js `fs` (built-in) | Node 25.6.1 | Read transcripts, write modified files, write new files | No install; used in every Phase 2/3 script |
| Node.js `path` (built-in) | Node 25.6.1 | Path construction for nested folder traversal | No install; prevents separator bugs on cross-platform usage |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node-fetch` | v3.x (installed) | HTTP client | Not needed for Phase 4 — no Loom or Skool calls; kept installed for completeness |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ai-model-haiku` (takeaways) | `ai-model-sonnet` | Haiku is 3x cheaper per token; per-video key takeaways are a simple extractive task, not synthesis — Haiku quality is sufficient |
| `ai-model-haiku` (cheat sheets) | `ai-model-sonnet` | Cheat sheets condense existing section summaries — extractive, not creative; Haiku sufficient |
| Two separate scripts | One combined script | Two scripts: cleaner separation, easier to re-run index generation independently without triggering API calls. Recommended. |
| In-place file modification (MKDN-05) | Separate output directory | In-place modification is consistent with the Phase 3 cleaning approach (also in-place); keeps knowledge base as a single coherent file tree |

**Installation:** No new packages needed. `ai-sdk` is already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
scripts/
├── generate-takeaways-and-cheatsheets.mjs  # Phase 4 AI script (new)
└── generate-indexes.mjs                    # Phase 4 index script (new)
output/
├── COURSE_INDEX.md                         # NEW — master course index
└── transcripts/
    ├── 01-introduction-to-the-course/
    │   ├── 01-introduction.md              # MODIFIED: prepend ## Key Takeaways
    │   ├── SECTION_SUMMARY.md             # Existing (Phase 3)
    │   ├── CHEAT_SHEET.md                  # NEW (Phase 4)
    │   └── INDEX.md                        # NEW — section index
    ├── 07-fundamental-analysis/
    │   ├── 01-levels-to-fundamental-analysis.md  # MODIFIED
    │   ├── ...
    │   ├── SECTION_SUMMARY.md
    │   ├── CHEAT_SHEET.md                  # NEW
    │   └── INDEX.md                        # NEW
    └── ... (all 13 sections)
```

### Pattern 1: Per-Video Key Takeaways (MKDN-05)

**What:** Read the transcript section from an existing video `.md` file, call AI model (Haiku) to generate 3-7 key takeaway bullets, then insert a `## Key Takeaways` section into the file before the `## Transcript` section.

**When to use:** For every video `.md` file with real content (not YouTube stubs, not Skool boilerplate).

**In-place modification approach:** Read file → detect if `## Key Takeaways` already exists (skip if so) → extract transcript content → call API → rebuild file with Key Takeaways section inserted between the metadata block and `## Transcript`.

```javascript
// Source: ai-sdk official patterns (same as Phase 3 generate-summaries.mjs)
import AI vendor from 'ai-sdk';
import { readFileSync, writeFileSync } from 'fs';

const TAKEAWAY_MODEL = 'ai-model-haiku';

async function generateKeyTakeaways(videoTitle, transcriptText, client) {
  const message = await client.messages.create({
    model: TAKEAWAY_MODEL,
    max_tokens: 512,
    temperature: 0,
    system: `You are a trading analyst extracting key takeaways from a crypto course video transcript.
Extract only what the instructor EXPLICITLY STATES. Do NOT add external knowledge or trading theory.
Do NOT fabricate numbers, indicators, or rules not mentioned in the transcript.`,
    messages: [
      {
        role: 'user',
        content: `Extract 3-7 key takeaway bullets from this crypto course video: "${videoTitle}"

<transcript>
${transcriptText}
</transcript>

Write ONLY a bullet list (3-7 items). Each bullet must:
- Start with "- "
- Be a single concise sentence
- Capture only what the instructor explicitly teaches
- Use the instructor's own phrasing where possible

Do not preamble. Do not number the bullets. Output only the bullet list.`,
      },
    ],
  });

  return message.content[0].text.trim();
}

function injectKeyTakeaways(fileContent, takeawaysText) {
  // Insert ## Key Takeaways before ## Transcript (or ## Content for stubs)
  const insertPoint = fileContent.match(/^## (?:Transcript|Content)/m);
  if (!insertPoint) return fileContent; // Can't find insertion point — skip

  const idx = fileContent.indexOf(insertPoint[0]);
  return (
    fileContent.slice(0, idx) +
    `## Key Takeaways\n\n${takeawaysText}\n\n` +
    fileContent.slice(idx)
  );
}
```

**Checkpoint check (skip if already processed):**

```javascript
// Skip if file already has Key Takeaways section
if (fileContent.includes('## Key Takeaways')) {
  console.log(`[SKIP] ${fileName} — already has key takeaways`);
  continue;
}
```

### Pattern 2: Per-Section Cheat Sheet (SUMM-04)

**What:** Read the existing `SECTION_SUMMARY.md` for a section, call AI model (Haiku) to condense it into an ultra-compact cheat sheet, write as `CHEAT_SHEET.md` in the same folder.

**The distinction from SECTION_SUMMARY.md:** The section summary is a full trading playbook with prose and reasoning. The cheat sheet is a maximum-density reference card — rules only, signals only, warnings only — intended to be scanned in 30 seconds while live trading. No prose, no explanations, no context.

**When to use:** For each section that has a real `SECTION_SUMMARY.md` (not the stub from section 02).

```javascript
async function generateCheatSheet(sectionName, sectionSummaryText, client) {
  const message = await client.messages.create({
    model: TAKEAWAY_MODEL,
    max_tokens: 1024,
    temperature: 0,
    system: `You are condensing a detailed trading playbook summary into an ultra-compact cheat sheet.
The cheat sheet must be scannable in under 30 seconds during live trading.
Extract ONLY explicit rules, entry signals, and warnings. No prose. No explanations. Maximum density.
Only include information explicitly present in the summary. Do not add external knowledge.`,
    messages: [
      {
        role: 'user',
        content: `Create an ultra-compact cheat sheet from this section summary for "${sectionName}".

<section_summary>
${sectionSummaryText}
</section_summary>

Write the cheat sheet in this exact format:

# ${sectionName} — Quick Reference Cheat Sheet

## Rules
- [one-line rule]
- [one-line rule]

## Entry Signals
- [one-line signal]

## Warnings / Do Not Do
- [one-line warning]

Only include entries that are EXPLICITLY STATED in the summary.
Omit any section if no explicit content exists for it. Do not preamble.`,
      },
    ],
  });

  return message.content[0].text.trim();
}
```

### Pattern 3: Index File Generation (SUMM-05)

**What:** Pure filesystem traversal — no API call. Read the folder structure of `output/transcripts/` and generate:
1. `output/transcripts/{section}/INDEX.md` — per-section index
2. `output/COURSE_INDEX.md` — master course index

**When to use:** After (or independently of) the AI script; idempotent, always safe to re-run.

```javascript
// Source: Node.js built-in fs — standard directory traversal pattern
import { readdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

function buildSectionIndex(sectionDir, sectionName) {
  const files = readdirSync(sectionDir)
    .filter(f => f.endsWith('.md'))
    .sort();

  const videoFiles = files.filter(f =>
    f !== 'SECTION_SUMMARY.md' &&
    f !== 'CHEAT_SHEET.md' &&
    f !== 'INDEX.md'
  );

  const hasSummary = files.includes('SECTION_SUMMARY.md');
  const hasCheatSheet = files.includes('CHEAT_SHEET.md');

  let content = `# ${sectionName} — Index\n\n`;

  if (hasSummary) content += `- [Section Summary](SECTION_SUMMARY.md)\n`;
  if (hasCheatSheet) content += `- [Quick Reference Cheat Sheet](CHEAT_SHEET.md)\n`;

  if (videoFiles.length > 0) {
    content += `\n## Videos\n\n`;
    for (const file of videoFiles) {
      // Derive readable title from filename (strip numeric prefix, replace dashes)
      const title = file
        .replace(/^\d+-/, '')
        .replace(/\.md$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      content += `- [${title}](${file})\n`;
    }
  }

  return content;
}

function buildCourseIndex(transcriptsDir, sections) {
  let content = `# Bull Run Millions Crypto Course — Master Index\n\n`;
  content += `**Sections:** ${sections.length} | `;
  content += `**Total Videos:** {count} | `;
  content += `**Generated:** ${new Date().toISOString().split('T')[0]}\n\n`;
  content += `---\n\n`;

  for (const section of sections) {
    const { name, videoCount, hasSummary, hasCheatSheet } = section;
    content += `## [${name}](transcripts/${name}/INDEX.md)\n\n`;
    content += `${videoCount} video(s)`;
    if (hasSummary) content += ` · [Summary](transcripts/${name}/SECTION_SUMMARY.md)`;
    if (hasCheatSheet) content += ` · [Cheat Sheet](transcripts/${name}/CHEAT_SHEET.md)`;
    content += `\n\n`;
  }

  return content;
}
```

### Pattern 4: Transcript Extraction for Key Takeaways

**What:** Extract the transcript text from an existing video markdown file to send to the AI.

**Critical detail:** The video files have two possible section headings — `## Transcript` (for real Loom content) and `## Content` (for Skool text stubs). Key takeaways should only be generated for files with `## Transcript` and real content.

```javascript
function extractTranscriptText(fileContent) {
  // Match only ## Transcript (not ## Content — Content = Skool stub)
  const match = fileContent.match(/^## Transcript\s*\n+([\s\S]+)/m);
  if (!match) return null;
  return match[1].trim();
}

function extractVideoTitle(fileContent) {
  // First line is the # Title
  const match = fileContent.match(/^# (.+)/m);
  return match ? match[1].trim() : 'Untitled';
}

function isYouTubeStub(fileContent) {
  return fileContent.includes('YouTube video embed');
}

function isSkoolBoilerplate(fileContent) {
  const wordCount = fileContent.split(/\s+/).filter(w => w.length > 0).length;
  return wordCount < 100;
}
```

### Anti-Patterns to Avoid

- **Modifying files without a `## Key Takeaways` idempotency check:** Without checking for an existing `## Key Takeaways` section, re-running the script doubles the takeaways in every file.
- **Generating takeaways from YouTube stubs:** Stub files contain only a URL reference. The model will fabricate content from the video title alone. Always check `isYouTubeStub()` before calling the API.
- **Writing cheat sheets from stub section summaries:** Section 02 has `*No transcript content available...*` as its summary. Passing this to the AI produces a cheat sheet with fabricated content. Check summary length > 500 chars before generating.
- **Building the index before cheat sheets exist:** If `generate-indexes.mjs` runs before `CHEAT_SHEET.md` files are created, the index will omit cheat sheet links. Either run AI script first, or make the index generator check for existence dynamically (recommended).
- **Inserting Key Takeaways after `## Transcript` instead of before:** The requirement is that key takeaways appear "in addition to the full transcript" — they should appear as a scannable preview section BEFORE the transcript wall of text, not buried after it.
- **Using `string.replace()` for in-place markdown insertion without anchoring to a specific heading:** Use `indexOf()` on the matched heading string to find the precise insertion point; `replace()` risks replacing the wrong occurrence if the heading text appears in the transcript itself.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client for AI vendor | Custom `node-fetch` wrapper | `ai-sdk` (already installed) | SDK handles auth, retries on 429/5xx, type safety — identical to Phase 3 |
| Retry logic for rate limits | Custom exponential backoff | Built into `ai-sdk` | SDK retries automatically on 429 and 5xx |
| Markdown link rendering | Custom renderer / viewer | Raw markdown files — renders in Obsidian, VS Code, GitHub, any reader | Out of scope per REQUIREMENTS.md ("Web UI or viewer" is explicitly out of scope) |
| Semantic cross-referencing | Vector embeddings, search index | Simple relative markdown links in index files | Per REQUIREMENTS.md: "Grep/ripgrep on 80 markdown files is sufficient" |
| Parallel API call orchestration | Promise.all with concurrency limits | Sequential calls with 1s delay (same as Phase 3) | 86 calls at ~1s each = ~90 seconds total — acceptable; parallelism adds complexity without meaningful time savings at this scale |

**Key insight:** Phase 4 is content generation + file system organization. The complexity is in the prompt design (concise, no fabrication, trading-domain) and the file modification logic (safe in-place insertion). The infrastructure is Phase 3 copy-paste with adapted prompts.

---

## Common Pitfalls

### Pitfall 1: Duplicate Key Takeaways on Re-run

**What goes wrong:** Script is run twice. Every video file now has `## Key Takeaways` written twice.

**Why it happens:** No idempotency check before writing.

**How to avoid:** Before processing any file, check `fileContent.includes('## Key Takeaways')`. If true, log `[SKIP]` and continue. This is the checkpoint pattern from Phase 3 (`existsSync(summaryPath)` check).

**Warning signs:** Files contain `## Key Takeaways` appearing more than once.

### Pitfall 2: Fabricated Key Takeaways on Short/Stub Files

**What goes wrong:** A YouTube stub file (e.g., `01-start-here-how-to-learn-crypto-as-a-beginner.md`) is processed. The transcript text is empty or just a Skool navigation string. The model generates plausible-sounding takeaways based entirely on the video title.

**Why it happens:** No content validation before API call.

**How to avoid:** Apply the same filters from Phase 3's `getSectionTranscripts()`:
1. Check for `YouTube video embed` in content → skip
2. Check word count < 100 → skip
3. Check that `## Transcript` heading exists and has > 100 chars of content → skip if not

**Warning signs:** A video whose markdown file has no real transcript somehow has a populated `## Key Takeaways` section.

### Pitfall 3: Key Takeaways Inserted at Wrong Position

**What goes wrong:** The `## Key Takeaways` section is inserted after `## Transcript` instead of before it, making it invisible unless the user scrolls past the full transcript.

**Why it happens:** Using `fileContent + takeaways` (append) instead of a targeted insertion.

**How to avoid:** Use `indexOf('## Transcript')` to find the insertion point, then slice:
```javascript
const insertIdx = fileContent.indexOf('\n## Transcript');
const newContent =
  fileContent.slice(0, insertIdx) +
  `\n\n## Key Takeaways\n\n${takeawaysText}` +
  fileContent.slice(insertIdx);
```

**Warning signs:** Opening a video file and seeing the transcript first, key takeaways last.

### Pitfall 4: Cheat Sheet Indistinguishable from Section Summary

**What goes wrong:** The cheat sheet is generated with the same level of detail as the section summary. It reads as a shorter version of the same document, not as a distinct quick-reference format.

**Why it happens:** Prompt doesn't sufficiently constrain the format. "Summarize this summary" produces a second summary, not a cheat sheet.

**How to avoid:** Prompt must explicitly prohibit prose and explanations. Use "No prose. No explanations. One-line bullets only. Scannable in 30 seconds." Specify the exact output format with section headers (`## Rules`, `## Entry Signals`, `## Warnings`). Test the first cheat sheet output before running all 12.

**Warning signs:** Cheat sheet contains paragraphs or sentences longer than one line.

### Pitfall 5: Index Links Use Absolute Paths Instead of Relative

**What goes wrong:** Section `INDEX.md` links to `/Users/amir/danscryptocourse/output/transcripts/01-introduction-to-the-course/01-introduction.md` (absolute path). This link works on the author's machine but breaks everywhere else, including in Obsidian, VS Code preview, and GitHub.

**Why it happens:** Using `join(__dirname, ...)` to build link text instead of a relative path.

**How to avoid:** All markdown links must use relative paths from the file's location:
- In `{section}/INDEX.md`, link to `SECTION_SUMMARY.md` (same directory) and `01-introduction.md` (same directory)
- In `COURSE_INDEX.md` at `output/`, link to `transcripts/{section}/INDEX.md` (relative)

**Warning signs:** Links in any index file start with `/` or contain the user's home directory path.

### Pitfall 6: Section 12 Has No Video Files

**What goes wrong:** `output/transcripts/12-putting-everything-together/` contains zero `.md` video files (only a `SECTION_SUMMARY.md` placeholder). The index script crashes or generates a broken index entry.

**Why it happens:** Per STATE.md: "Section 12 (0 videos) creates no output folder" — actually the folder exists but has no video files. The script needs to handle sections with zero video files gracefully.

**How to avoid:** In the index generator, check `videoFiles.length === 0` and still generate a valid (though sparse) index entry: `"No video files — section placeholder."` Do not skip section 12 from the master index.

**Warning signs:** `COURSE_INDEX.md` is missing section 12 entirely.

---

## Code Examples

Verified patterns from official sources and project corpus:

### Main AI Script Skeleton (generate-takeaways-and-cheatsheets.mjs)

```javascript
// Source: ai-sdk + Node.js built-ins; patterns from Phase 3 generate-summaries.mjs
import AI vendor from 'ai-sdk';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TRANSCRIPTS_DIR = join(ROOT, 'output', 'transcripts');
const TAKEAWAY_MODEL = 'ai-model-haiku';
const INTER_CALL_DELAY_MS = 1000;

if (!process.env.AI_API_KEY) {
  console.error('ERROR: AI_API_KEY not set. Run: export AI_API_KEY=sk-ant-...');
  process.exit(1);
}

const client = new AI vendor({ apiKey: process.env.AI_API_KEY });

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const sectionDirs = readdirSync(TRANSCRIPTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(d => ({ name: d.name, path: join(TRANSCRIPTS_DIR, d.name) }));

  // === WAVE 1: Key Takeaways (MKDN-05) ===
  let takeawaysGenerated = 0, takeawaysSkipped = 0;

  for (const section of sectionDirs) {
    const videoFiles = readdirSync(section.path)
      .filter(f => f.endsWith('.md') &&
                   f !== 'SECTION_SUMMARY.md' &&
                   f !== 'CHEAT_SHEET.md' &&
                   f !== 'INDEX.md')
      .sort();

    for (const videoFile of videoFiles) {
      const filePath = join(section.path, videoFile);
      const content = readFileSync(filePath, 'utf8');

      // Idempotency: skip if already has takeaways
      if (content.includes('## Key Takeaways')) {
        takeawaysSkipped++;
        continue;
      }

      // Skip stubs
      if (content.includes('YouTube video embed')) continue;
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      if (wordCount < 100) continue;

      // Extract transcript
      const transcriptMatch = content.match(/^## Transcript\s*\n+([\s\S]+)/m);
      if (!transcriptMatch || transcriptMatch[1].trim().length < 100) continue;

      const title = (content.match(/^# (.+)/m) || [])[1] || videoFile;
      const transcriptText = transcriptMatch[1].trim();

      console.log(`[TAKEAWAYS] ${section.name}/${videoFile}`);

      try {
        const takeaways = await generateKeyTakeaways(title, transcriptText, client);
        const newContent = insertKeyTakeaways(content, takeaways);
        writeFileSync(filePath, newContent, 'utf8');
        takeawaysGenerated++;
        console.log(`[OK] ${videoFile} — ${takeaways.split('\n').length} bullets`);
      } catch (err) {
        console.error(`[ERROR] ${videoFile}: ${err.message}`);
      }

      await delay(INTER_CALL_DELAY_MS);
    }
  }

  console.log(`\nKey Takeaways: ${takeawaysGenerated} generated, ${takeawaysSkipped} skipped\n`);

  // === WAVE 2: Cheat Sheets (SUMM-04) ===
  let sheetsGenerated = 0, sheetsSkipped = 0;

  for (const section of sectionDirs) {
    const cheatSheetPath = join(section.path, 'CHEAT_SHEET.md');
    const summaryPath = join(section.path, 'SECTION_SUMMARY.md');

    if (existsSync(cheatSheetPath)) { sheetsSkipped++; continue; }
    if (!existsSync(summaryPath)) continue;

    const summaryContent = readFileSync(summaryPath, 'utf8');
    if (summaryContent.length < 500) {
      // Stub summary — skip to avoid fabrication
      console.log(`[SKIP] ${section.name} — summary is a stub`);
      continue;
    }

    console.log(`[CHEATSHEET] ${section.name}`);
    try {
      const cheatSheet = await generateCheatSheet(section.name, summaryContent, client);
      writeFileSync(cheatSheetPath, cheatSheet, 'utf8');
      sheetsGenerated++;
    } catch (err) {
      console.error(`[ERROR] ${section.name} cheat sheet: ${err.message}`);
    }

    await delay(INTER_CALL_DELAY_MS);
  }

  console.log(`Cheat Sheets: ${sheetsGenerated} generated, ${sheetsSkipped} skipped\n`);
  console.log('Done.');
}

function insertKeyTakeaways(fileContent, takeawaysText) {
  const transcriptHeading = '\n## Transcript';
  const idx = fileContent.indexOf(transcriptHeading);
  if (idx === -1) return fileContent; // No ## Transcript — skip
  return (
    fileContent.slice(0, idx) +
    `\n\n## Key Takeaways\n\n${takeawaysText}` +
    fileContent.slice(idx)
  );
}

main().catch(err => { console.error(err); process.exit(1); });
```

### Index Generator Skeleton (generate-indexes.mjs)

```javascript
// Source: Node.js built-in fs — pure filesystem traversal, no API calls
import { readdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TRANSCRIPTS_DIR = join(ROOT, 'output', 'transcripts');
const COURSE_INDEX_PATH = join(ROOT, 'output', 'COURSE_INDEX.md');

function humanizeFilename(filename) {
  return filename
    .replace(/^\d+-/, '')      // Remove numeric prefix
    .replace(/\.md$/, '')       // Remove extension
    .replace(/-/g, ' ')         // Dashes to spaces
    .replace(/\b\w/g, c => c.toUpperCase());  // Title case
}

function humanizeSectionName(dirName) {
  return dirName
    .replace(/^\d+-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function buildSectionIndex(sectionDir, sectionName) {
  const allFiles = readdirSync(sectionDir).filter(f => f.endsWith('.md')).sort();
  const videoFiles = allFiles.filter(f =>
    f !== 'SECTION_SUMMARY.md' && f !== 'CHEAT_SHEET.md' && f !== 'INDEX.md'
  );
  const hasSummary = allFiles.includes('SECTION_SUMMARY.md');
  const hasCheatSheet = allFiles.includes('CHEAT_SHEET.md');

  let lines = [`# ${sectionName} — Index\n`];

  if (hasSummary || hasCheatSheet) {
    lines.push('\n## Reference Files\n');
    if (hasSummary) lines.push(`- [Section Summary](SECTION_SUMMARY.md)`);
    if (hasCheatSheet) lines.push(`- [Quick Reference Cheat Sheet](CHEAT_SHEET.md)`);
  }

  if (videoFiles.length > 0) {
    lines.push('\n\n## Videos\n');
    for (const f of videoFiles) {
      lines.push(`- [${humanizeFilename(f)}](${f})`);
    }
  } else {
    lines.push('\n\n*No video files in this section.*');
  }

  return lines.join('\n') + '\n';
}

function buildCourseIndex(sectionMetas) {
  const totalVideos = sectionMetas.reduce((sum, s) => sum + s.videoCount, 0);
  let lines = [
    '# Bull Run Millions Crypto Course — Master Index\n',
    `**${sectionMetas.length} sections** · **${totalVideos} videos** · Generated: ${new Date().toISOString().split('T')[0]}\n`,
    '\n---\n',
  ];

  for (const section of sectionMetas) {
    lines.push(`\n## [${section.displayName}](transcripts/${section.dirName}/INDEX.md)\n`);
    const meta = [];
    if (section.videoCount > 0) meta.push(`${section.videoCount} video(s)`);
    if (section.hasSummary) meta.push(`[Summary](transcripts/${section.dirName}/SECTION_SUMMARY.md)`);
    if (section.hasCheatSheet) meta.push(`[Cheat Sheet](transcripts/${section.dirName}/CHEAT_SHEET.md)`);
    if (meta.length > 0) lines.push(meta.join(' · ') + '\n');

    if (section.videoFiles.length > 0) {
      for (const f of section.videoFiles) {
        lines.push(`- [${humanizeFilename(f)}](transcripts/${section.dirName}/${f})`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

function main() {
  const sectionDirs = readdirSync(TRANSCRIPTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const sectionMetas = [];

  for (const dir of sectionDirs) {
    const sectionPath = join(TRANSCRIPTS_DIR, dir.name);
    const allFiles = readdirSync(sectionPath).filter(f => f.endsWith('.md')).sort();
    const videoFiles = allFiles.filter(f =>
      f !== 'SECTION_SUMMARY.md' && f !== 'CHEAT_SHEET.md' && f !== 'INDEX.md'
    );
    const displayName = humanizeSectionName(dir.name);

    const meta = {
      dirName: dir.name,
      displayName,
      videoCount: videoFiles.length,
      videoFiles,
      hasSummary: allFiles.includes('SECTION_SUMMARY.md'),
      hasCheatSheet: allFiles.includes('CHEAT_SHEET.md'),
    };

    // Write section INDEX.md
    const indexContent = buildSectionIndex(sectionPath, displayName);
    writeFileSync(join(sectionPath, 'INDEX.md'), indexContent, 'utf8');
    console.log(`[OK] ${dir.name}/INDEX.md`);

    sectionMetas.push(meta);
  }

  // Write master COURSE_INDEX.md
  const courseIndexContent = buildCourseIndex(sectionMetas);
  writeFileSync(COURSE_INDEX_PATH, courseIndexContent, 'utf8');
  console.log(`[OK] output/COURSE_INDEX.md`);
  console.log('\nDone.');
}

main();
```

### Cost Estimate (Verified from Corpus Measurements)

```
Corpus measurements (from output/transcripts/ — 2026-03-02):
  Total video .md files: 95
  Real content files (for takeaways): 74
  YouTube stubs (skip): 19
  Sections with real SECTION_SUMMARY.md: 12
  Stub sections (section 02, section 12 placeholder): 2 (skip cheat sheet generation)

Per-video takeaway calls (74 calls, Haiku):
  Typical transcript: 3,000–9,000 words → ~4,000–12,000 tokens input
  Average: ~6,000 tokens input per call
  Total input: ~444K tokens × $1.00/MTok = ~$0.44
  Output: 74 calls × ~300 tokens = ~22K tokens × $5.00/MTok = ~$0.11
  Takeaway subtotal: ~$0.55

Per-section cheat sheet calls (12 calls, Haiku):
  Input: existing SECTION_SUMMARY.md — ~1,500–4,000 tokens per section
  Total input: ~30K tokens × $1.00/MTok = ~$0.03
  Output: 12 calls × ~500 tokens = ~6K tokens × $5.00/MTok = ~$0.03
  Cheat sheet subtotal: ~$0.06

Index generation: 0 API calls — pure filesystem traversal

Grand total for one full run: ~$0.61
(Worst case with 1-2 re-runs: < $2.00)

Runtime estimate:
  74 + 12 = 86 API calls × ~1s delay = ~86 seconds minimum
  Add API latency: ~2-3 seconds per call average
  Total runtime: approximately 3-5 minutes
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prefill assistant message to control output | Direct instructions in system prompt ("Do not preamble") | AI 4.5+ deprecation | Do not use assistant-role prefill — not supported on `ai-model-haiku` or `ai-model-sonnet` |
| `ai-3-haiku-20240307` | `ai-model-haiku` | Haiku 3 deprecated April 19, 2026 | Use `ai-model-haiku` — same API call structure, better quality |
| Chunking long documents | Direct section-level calls | N/A — context window is sufficient | Individual video transcripts max out at ~12K tokens; no chunking needed for takeaway generation |

**Deprecated/outdated:**
- `ai-3-haiku-20240307`: Deprecated April 19, 2026 — will be retired. Already migrated to `ai-model-haiku` in Phase 3.
- Prefill pattern (`{"role": "assistant", ...}` as last message): Not supported on AI 4.5+ models.

---

## Open Questions

1. **Should key takeaways be generated from the original transcript or from the existing SECTION_SUMMARY.md?**
   - What we know: MKDN-05 says "AI-generated key takeaways (3-7 bullets)" per video. Each video has a full transcript. The section summary aggregates all videos in a section, not individual videos.
   - What's unclear: Whether the existing SECTION_SUMMARY.md contains per-video attribution that could serve as a shortcut.
   - Recommendation: Use the per-video transcript directly. The section summary aggregates multiple videos; per-video takeaways should reflect only what that video covers. This produces more granular, accurate per-video takeaways and is consistent with MKDN-05's intent.

2. **Should CHEAT_SHEET.md be generated from SECTION_SUMMARY.md or directly from the section transcripts?**
   - What we know: SECTION_SUMMARY.md already exists for 12 of 13 sections and is an accurate distillation of the section's content. Generating the cheat sheet from the summary avoids re-processing all transcripts.
   - What's unclear: Whether the section summaries are sufficiently condensed to avoid repetition in the cheat sheet.
   - Recommendation: Generate from SECTION_SUMMARY.md (secondary source). It is already factual and de-duplicated. Sending it through one more extractive pass to produce cheat-sheet format is the correct approach. This also avoids re-aggregating section transcripts and is cheaper (shorter input).

3. **What do "index files" link to for YouTube stub videos (section 02)?**
   - What we know: Section 02 has 4 files, all YouTube stubs with no real transcript. They have titles and are still valid entries in the knowledge base.
   - What's unclear: Whether YouTube-only files should appear in the index with a "YouTube only — no transcript" note, or be omitted.
   - Recommendation: Include YouTube stub files in the section index with a `[YouTube]` label but no key takeaways. They exist in the knowledge base and belong in the index for completeness. The master index should accurately represent all 95 videos.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` — Validation Architecture section skipped per agent instructions.

---

## Sources

### Primary (HIGH confidence)

- `platform.ai.com/docs/en/about-ai/models/overview` — Current model names: `ai-model-haiku`, `ai-model-sonnet`, `ai-opus-4-6`. Context windows: 200K (all); max output: 64K (Haiku/Sonnet). Pricing: $1/$5 Haiku, $3/$15 Sonnet. Verified 2026-03-02.
- `output/transcripts/` (direct measurement) — 95 video files, 74 real content, 19 YouTube stubs, 13 sections, 12 with real SECTION_SUMMARY.md. Measured 2026-03-02.
- `scripts/generate-summaries.mjs` (project artifact) — Confirmed patterns: `ai-sdk` 0.78.0, ESM imports, `client.messages.create()`, checkpoint pattern (`existsSync`), `temperature: 0` for extractive tasks, `AI_API_KEY` guard. Read 2026-03-02.
- `.planning/REQUIREMENTS.md` — Confirmed MKDN-05 (3-7 bullets per video), SUMM-04 (ultra-condensed cheat sheet, suitable for live trading), SUMM-05 (master course index + per-section index files). Read 2026-03-02.
- `.planning/STATE.md` — Confirmed Phase 3 complete, 12 SECTION_SUMMARY.md files + MASTER_SUMMARY.md generated, transcripts cleaned in-place (MKDN-04 satisfied). Read 2026-03-02.

### Secondary (MEDIUM confidence)

- Phase 3 research (`.planning/phases/03-ai-summarization/03-RESEARCH.md`) — Confirmed hallucination prevention patterns (temperature 0, extractive-only prompts, anti-fabrication system prompt directives), cost model, and anti-patterns. Cross-referenced with official AI vendor docs. Read 2026-03-02.

### Tertiary (LOW confidence)

- None — all critical claims are backed by primary sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — identical to Phase 3; `ai-sdk` 0.78.0 already installed and proven working; Node.js built-ins for filesystem work
- Architecture patterns: HIGH — derived directly from working Phase 3 code (`generate-summaries.mjs`) adapted for new outputs
- Corpus measurements: HIGH — counted directly from `output/transcripts/` filesystem
- Cost estimates: HIGH — based on measured word counts and verified AI vendor pricing (March 2026)
- Pitfalls: HIGH — derived from concrete corpus analysis (stubs confirmed, section 12 empty confirmed, file structure verified)

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable — AI SDK and models are stable; re-verify if `ai-model-haiku` alias resolves to a different snapshot)
