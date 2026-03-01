# Phase 3: AI Summarization - Research

**Researched:** 2026-03-02
**Domain:** AI API (Messages endpoint), transcript preprocessing, hierarchical summarization, hallucination prevention for financial content
**Confidence:** HIGH — official AI vendor docs verified; project-specific data (word counts, token estimates, file types) measured directly from the output corpus

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MKDN-04 | Transcript cleaned of filler words before inclusion | Regex preprocessing pass removes "uh", "uhm", "umm", Loom VTT artifacts ("Thanks watching!", "We'll see you", ". . ."), and navigation boilerplate. Done before AI call to reduce token waste and improve summary quality. |
| SUMM-01 | Executive summary generated per section (13 total) | Hierarchical summarization: concatenate all transcripts for a section, send as single AI API call. All sections fit in 200K context window (largest is 07-fundamental-analysis at ~129K tokens). Output: one `SECTION_SUMMARY.md` per section folder. |
| SUMM-02 | Master executive summary generated for entire course | After all 13 section summaries generated, concatenate them (~39K tokens) and call AI API once more for the master synthesis. Output: `output/MASTER_SUMMARY.md`. |
| SUMM-03 | Summaries use trading playbook format (rules, signals, position sizing) | Extractive prompt engineering: system prompt frames AI as a trading analyst extracting only what is explicitly stated. Output format: structured markdown with ## Rules, ## Entry Signals, ## Position Sizing sections. Anti-hallucination guard: "Only include information explicitly stated in the transcripts. If a concept is not mentioned, omit the section entirely." |
</phase_requirements>

---

## Summary

Phase 3 has two distinct work streams: (1) transcript preprocessing to clean noise before summarization, and (2) hierarchical AI API calls to generate per-section and master summaries. The pipeline is a single Node.js script (`scripts/generate-summaries.mjs`) that reads the existing markdown files from `output/transcripts/`, preprocesses them, calls the AI API per section, and writes summary files alongside the source content.

The transcript corpus is 311K words / ~405K tokens across 95 files in 12 active section folders. Of these, 74 are real Loom transcripts with usable content; 19 are YouTube stubs (no text); and 2 are Skool navigation boilerplate. Section 02 (The Basics) has zero real Loom transcripts and requires special handling — a summary cannot be generated from stub files. The largest section (07-Fundamental Analysis) is ~129K tokens, which fits within AI's 200K context window with ~70K tokens of headroom for system prompt and output.

All sections except section 02 contain enough content to generate a meaningful trading playbook summary. The hallucination risk in financial content is the primary engineering concern: prompts must be strictly extractive ("only state what the transcript says"), use low temperature (0.0–0.2), and include an explicit "do not fabricate numbers, indicators, or thresholds" directive. The STATE.md already flags this: "Extractive prompt engineering for trading-domain content will need 2-3 iteration cycles — hallucination risk on financial content is 6-17%."

**Primary recommendation:** Use `ai-model-haiku` for per-section summaries (cost-optimized, sufficient quality for extractive tasks) and `ai-model-sonnet` for the master summary (higher synthesis quality). Total cost for one full run: under $2.00 (Haiku for sections + Sonnet for master).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai-sdk` | 0.78.0 (latest) | Official AI API client — ESM-compatible, handles auth, retries, streaming | Official SDK from AI vendor; replaces raw `node-fetch` for AI vendor calls |
| Node.js `fs` (built-in) | Node 25.6.1 (project runtime) | Read transcript markdown files, write summary files | No install; consistent with Phases 1-2 patterns |
| Node.js `path` (built-in) | Node 25.6.1 | Path construction for section folders and output files | No install; prevents path separator bugs |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node-fetch` | v3.x (already installed) | Not needed for AI vendor calls (SDK handles HTTP) | Phase 2 artifact — keep installed, don't use for AI vendor |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ai-sdk` | Raw `node-fetch` to `api.ai-vendor.com` | SDK handles retries, streaming, auth headers, type safety. No reason to use raw fetch for AI vendor calls now that SDK exists. |
| AI model (Haiku) (sections) | AI model (Sonnet) (sections) | Sonnet is 3x more expensive per token; Haiku quality is sufficient for structured extractive summarization from transcripts. Reserve Sonnet for master synthesis. |
| AI model (Sonnet) (master) | AI model (Haiku) (master) | Master summary requires cross-section synthesis — Sonnet's higher intelligence reduces risk of missed connections between sections. |
| Section-level chunking | Video-level summarization then roll up | Adds one extra API call layer (95 video calls + 12 section calls + 1 master). Section-level is simpler and each section's transcripts fit in context window without chunking. |

**Installation:**
```bash
npm install ai-sdk
```

---

## Architecture Patterns

### Recommended Project Structure

```
scripts/
└── generate-summaries.mjs    # Phase 3 pipeline script
output/
├── transcripts/              # Phase 2 artifact — inputs
│   ├── 01-introduction-to-the-course/
│   │   ├── 01-introduction.md
│   │   └── SECTION_SUMMARY.md    # NEW (Phase 3 output)
│   ├── 03-mindset/
│   │   ├── 01-lipstick-on-a-pig.md
│   │   ├── ...
│   │   └── SECTION_SUMMARY.md    # NEW
│   └── ... (12 sections total with real content)
└── MASTER_SUMMARY.md         # NEW — course-level synthesis
```

### Pattern 1: AI SDK Client Initialization (ESM)

**What:** Initialize the AI vendor client once per script, reading API key from environment.

**When to use:** Start of every script that calls the API.

```javascript
// Source: github.com/ai-vendors/ai-vendor-sdk-typescript (official)
import AI vendor from 'ai-sdk';

const client = new AI vendor({
  apiKey: process.env.AI_API_KEY, // Required — set in shell before running
});
```

**Note:** The SDK reads `AI_API_KEY` from environment by default. No `.env` file handling is needed for a one-shot script; user sets it in their terminal: `export AI_API_KEY=sk-ant-...`.

### Pattern 2: Per-Section Summarization Call

**What:** Read all transcript markdown files for a section, preprocess, send to AI, write summary.

**When to use:** Core loop in the pipeline — once per section.

```javascript
// Source: Official AI vendor docs (platform.ai.com/docs/en/api/messages)
async function generateSectionSummary(sectionName, transcriptTexts, client) {
  const combinedTranscripts = transcriptTexts
    .map((t, i) => `<transcript index="${i + 1}">\n${t}\n</transcript>`)
    .join('\n\n');

  const message = await client.messages.create({
    model: 'ai-model-haiku',
    max_tokens: 4096,
    system: `You are a trading analyst extracting structured knowledge from crypto course transcripts.
Your task is to produce a trading playbook summary from the provided transcripts.

CRITICAL RULES:
- Only include information EXPLICITLY STATED in the transcripts
- Do NOT fabricate numbers, percentages, indicators, or thresholds
- Do NOT infer or extrapolate — if it is not said, omit it
- If a section (Rules, Entry Signals, Position Sizing) has no explicit content in the transcripts, write "Not explicitly covered in this section's transcripts."
- Quote or paraphrase only what the instructor actually says`,
    messages: [
      {
        role: 'user',
        content: `Summarize the following transcripts from the "${sectionName}" section of a crypto trading course into a trading playbook.

<transcripts>
${combinedTranscripts}
</transcripts>

Write the summary in this exact format:

## ${sectionName} — Trading Playbook Summary

### Core Concepts
[3–7 bullet points of the main ideas explicitly taught in this section]

### Rules
[Explicit rules or principles stated by the instructor — use their exact phrasing where possible]

### Entry Signals
[Any entry criteria, conditions, or triggers explicitly mentioned — omit if not covered]

### Position Sizing / Risk Management
[Any explicit guidance on sizing, risk, or exit criteria — omit if not covered]

### Key Warnings / What Not To Do
[Any explicit "do not do this" guidance from the instructor]

Do not add information that is not in the transcripts. Do not preamble.`,
      },
    ],
  });

  return message.content[0].text;
}
```

### Pattern 3: Master Summary Call

**What:** Combine all 13 section summaries and generate a course-level synthesis.

**When to use:** After all section summaries are generated — called once.

```javascript
// Source: Official AI vendor docs; meta-summarization pattern from platform.ai.com/cookbook/capabilities-summarization-guide
async function generateMasterSummary(sectionSummaries, client) {
  const combinedSummaries = sectionSummaries
    .map(s => `<section name="${s.name}">\n${s.summary}\n</section>`)
    .join('\n\n');

  const message = await client.messages.create({
    model: 'ai-model-sonnet',
    max_tokens: 8192,
    system: `You are a trading analyst synthesizing a complete crypto trading course into a master reference playbook.
You are given summaries of 13 course sections. Your job is to synthesize them into a single coherent course-level trading playbook.

CRITICAL RULES:
- Only include information present in the provided section summaries
- Do not add external knowledge about crypto, trading strategies, or markets
- If sections conflict on a point, note the conflict — do not resolve it by inventing a consensus
- Preserve the instructor's original phrasing for rules and signals`,
    messages: [
      {
        role: 'user',
        content: `Synthesize the following section summaries from a complete crypto trading course into one master trading playbook.

<section_summaries>
${combinedSummaries}
</section_summaries>

Write the master summary in this format:

# MASTER SUMMARY: Bull Run Millions Crypto Course Trading Playbook

## Course Philosophy
[The core investment philosophy and mental model taught across all sections]

## The Strategy in Brief
[The single most important strategic framework — what the instructor says to do, in their terms]

## Master Rules (from all sections)
[All explicit rules, consolidated and deduplicated — with section attribution in brackets]

## Entry Signals & Conditions
[All explicit entry criteria across the course — with section attribution]

## Position Sizing & Risk Management
[All explicit sizing, risk, and exit guidance — with section attribution]

## What NOT To Do (Do-Not-Do List)
[All explicit warnings and prohibited behaviors]

## Section-by-Section Quick Reference
[One-line summary per section: what it covers and its single most actionable takeaway]

Do not preamble. Do not add information not in the provided summaries.`,
      },
    ],
  });

  return message.content[0].text;
}
```

### Pattern 4: Transcript Preprocessing (Filler Word Cleaning — MKDN-04)

**What:** Remove spoken word artifacts before sending to the AI. This reduces token count and prevents the model from summarizing noise.

**When to use:** On every transcript before it is included in the section batch.

**Evidence from corpus:** The transcripts contain: "uh" / "uhm" / "umm" (filler sounds), "Thanks watching!" / "Thanks for watching!" / "We'll see you" (Loom VTT end-of-video artifacts), ". . ." sequences (VTT pause indicators), "See you next" / "See you in the next one" (chapter-end artifacts), and Skool navigation boilerplate in stub files (long nav string starting with "Bullrun Millions Crypto Course...").

```javascript
// Source: Measured from actual transcript corpus; patterns confirmed manually
function cleanTranscript(rawText) {
  let text = rawText;

  // Remove Loom VTT end-of-video artifacts (appear as inline text from VTT cue processing)
  text = text.replace(/\bThanks\s+(?:for\s+)?watching[.!]?\s*/gi, '');
  text = text.replace(/\bWe'll\s+see\s+you(?:\s+next)?\b[.!]?\s*/gi, '');
  text = text.replace(/\bSee\s+you\s+(?:in\s+the\s+)?next(?:\s+one)?\b[.!]?\s*/gi, '');

  // Remove filler sounds
  text = text.replace(/\buh[hm]*\b\s*/gi, '');
  text = text.replace(/\bu[hm]{2,}\b\s*/gi, '');
  text = text.replace(/\bumm+\b\s*/gi, '');

  // Remove VTT pause dots
  text = text.replace(/\.\s+\.\s+\.\s*/g, ' ');

  // Remove Skool navigation boilerplate (appears in stub files)
  // Pattern: long string starting with "Bullrun Millions Crypto Course"
  text = text.replace(/Bullrun Millions Crypto Course.*?$/gms, '');

  // Collapse multiple spaces to single
  text = text.replace(/  +/g, ' ');

  // Trim
  return text.trim();
}
```

**Note on MKDN-04 scope:** MKDN-04 says "transcript cleaned of filler words before inclusion." The existing markdown files in `output/transcripts/` were written in Phase 2 without cleaning. Phase 3 can fulfill this requirement in two ways:
- **Option A (in-place):** Rewrite the existing `.md` files with cleaned transcripts. This makes the cleaning permanent and benefits Phase 4 too.
- **Option B (runtime):** Clean transcript text in memory before sending to AI, without touching the source files.

Option A is recommended because: (1) it permanently satisfies MKDN-04, (2) Phase 4 will need clean transcripts for key takeaways, and (3) the diff is auditable in git.

### Pattern 5: Section Detection and Skipping Logic

**What:** Identify which sections have real transcript content and skip sections with no content.

**When to use:** At the start of the pipeline loop.

```javascript
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

function getSectionTranscripts(sectionDir) {
  const files = readdirSync(sectionDir)
    .filter(f => f.endsWith('.md') && f !== 'SECTION_SUMMARY.md')
    .sort();

  const transcripts = [];
  for (const file of files) {
    const content = readFileSync(join(sectionDir, file), 'utf8');

    // Skip YouTube stubs (no usable text)
    if (content.includes('YouTube video embed')) continue;

    // Skip Skool navigation boilerplate (< 100 words of real content)
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount < 100) continue;

    // Extract transcript text (after ## Transcript or ## Content heading)
    const match = content.match(/## (?:Transcript|Content)\s*\n+([\s\S]+)/);
    if (match && match[1].trim().length > 50) {
      transcripts.push(cleanTranscript(match[1].trim()));
    }
  }

  return transcripts; // Empty array = skip this section
}
```

### Pattern 6: API Rate Limiting and Sequential Execution

**What:** Wait between API calls to avoid hitting AI vendor rate limits. Unlike Loom (undocumented limits), AI vendor publishes rate limits but enforces them strictly.

**When to use:** Between each section summary call.

```javascript
// Source: Standard Node.js pattern; AI SDK handles retries on 429 automatically
const INTER_SECTION_DELAY_MS = 1000; // 1s between sections; SDK handles 429 retries

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// In main loop:
for (const section of sections) {
  const summary = await generateSectionSummary(section.name, section.transcripts, client);
  // ... write summary file ...
  await delay(INTER_SECTION_DELAY_MS);
}
```

**Note:** The `ai-sdk` automatically retries on 429 (rate limit) and 5xx errors with exponential backoff. No custom retry logic needed for the AI vendor client — just sequential execution with a conservative delay.

### Pattern 7: Checkpoint / Resume for Summaries

**What:** Skip sections that already have a `SECTION_SUMMARY.md` so the pipeline can be re-run without re-spending API credits.

**When to use:** At the start of each section iteration.

```javascript
const summaryPath = join(sectionDir, 'SECTION_SUMMARY.md');
if (existsSync(summaryPath)) {
  console.log(`[SKIP] ${sectionName} — summary already exists`);
  continue;
}
```

### Anti-Patterns to Avoid

- **Low temperature for creative synthesis:** Use `temperature: 0` or very low temperature for per-section extractive summaries. This prevents the model from embellishing or paraphrasing aggressively. For the master summary, `temperature: 0.2` allows more coherent synthesis.
- **Sending YouTube stubs to the AI:** Files with "YouTube video embed" have no real content. Sending them wastes tokens and risks the model inventing content. Always filter these out before building the section transcript batch.
- **Concatenating all 95 transcripts in one call:** Section 07 alone is ~129K tokens. Concatenating all sections would exceed 200K context. Use per-section calls.
- **Writing summaries before validating they are non-empty:** The model occasionally returns preamble-only or refuses to generate on very short input. Validate `message.content[0].text.length > 200` before writing to disk.
- **Hardcoding model strings:** Use a constant at the top of the script (`const SECTION_MODEL = 'ai-model-haiku'`) so the model can be swapped without hunting through code.
- **Requesting the AI API key in the script:** Never embed the API key. Read from `process.env.AI_API_KEY` only. Script should fail early with a clear error if not set.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client for AI API | Custom `node-fetch` wrapper | `ai-sdk` (official) | SDK handles auth headers, retries on 429/5xx, response parsing, TypeScript types |
| Retry logic for API calls | Custom exponential backoff | Built into `ai-sdk` | AI SDK retries automatically; no manual retry needed |
| Token counting before API call | Manual word-count approximation | Visual check: `wc -w` in terminal + 1.3x multiplier is sufficient | Exact token count not needed — all sections are well under 200K context |
| Multi-step reasoning pipeline | Custom chain-of-thought scaffolding | Structured prompt with XML tags + clear output format | AI follows structured prompts reliably for extractive tasks without extra scaffolding |
| Post-processing hallucination detection | Custom QA pipeline | Human spot-check of 5 summaries against source (success criterion 4) | Scale is small (13 summaries); automated hallucination detection adds complexity without proportionate benefit |

**Key insight:** Phase 3 is prompt engineering + a sequential API loop. The complexity is in the prompt (extractive, anti-hallucination, format control), not in the infrastructure. The entire pipeline should be ~100-150 lines of Node.js.

---

## Common Pitfalls

### Pitfall 1: Hallucinated Trading Rules
**What goes wrong:** AI generates specific numbers ("buy when RSI drops below 30"), indicators ("use the 200 EMA"), or position sizes ("risk 2% per trade") that were never stated in the transcripts. The course instructor speaks in conceptual terms; AI may "helpfully" add concrete thresholds.

**Why it happens:** AI's training includes vast amounts of trading content. When the context is financial, it pattern-matches to common trading rules even if they were not stated.

**How to avoid:**
1. System prompt: "CRITICAL: Only include information EXPLICITLY STATED in the transcripts. Do NOT fabricate numbers, percentages, indicators, or thresholds."
2. Output format: "If Entry Signals are not explicitly described, write 'Not explicitly covered in this section.'"
3. Spot-check 5 summaries against source transcripts (success criterion 4).
4. Use temperature 0 for section summaries.

**Warning signs:** Summary contains specific numbers, tool names (RSI, MACD, EMA), or percentages that you cannot locate by searching the source transcripts.

### Pitfall 2: Section 02 (The Basics) Has No Loom Transcripts
**What goes wrong:** Script tries to generate a section summary for `02-the-basics/` but finds only YouTube stubs and a Skool navigation stub. The AI receives no real content, outputs a summary based on section name alone, or errors out.

**Why it happens:** All 4 videos in section 02 are either YouTube embeds or Skool boilerplate — none have Loom transcripts.

**How to avoid:** Before calling the API, check `transcripts.length === 0`. If so, write a stub summary: `"*No transcript content available for this section — videos are hosted on YouTube and transcripts were not fetched.*"` and continue.

**Warning signs:** `getSectionTranscripts()` returns an empty array for `02-the-basics`.

### Pitfall 3: Loom VTT Artifacts Summarized as Course Content
**What goes wrong:** Cleaning not applied. Summary bullets include: "The instructor teaches that you should thank the viewers for watching" or "Key rule: We'll see you in the next one."

**Why it happens:** Loom VTT end-of-video artifacts ("Thanks watching!", "We'll see you") appear as inline text because the VTT parser concatenates all cue lines into a wall of text. AI treats them as instructional content.

**How to avoid:** Apply `cleanTranscript()` to every file before including in the section batch. Verify cleanup with a quick `grep` before running the full pipeline.

**Warning signs:** Searching the generated summaries for "thanks watching" or "see you" returns hits.

### Pitfall 4: Largest Section Exceeds Context Window
**What goes wrong:** Section 07 (Fundamental Analysis) has ~99K words / ~129K tokens of real transcript content. Adding a system prompt (~500 tokens) + output allowance (~4K tokens) = ~133K tokens total, well within 200K. However, if pre-processing fails to exclude YouTube stubs or the word count measurement was wrong, a request could fail.

**Why it happens:** Measurement error or inclusion of unexpected large files.

**How to avoid:** Before the API call, calculate approximate token count (`words * 1.3`). If estimate exceeds 180K tokens (leaving 20K buffer), split the section into two batches: first half of files → summary A, second half → summary B, then combine A+B in a consolidation call.

**Warning signs:** API returns error code 400 or "prompt is too long."

### Pitfall 5: API Key Not Set — Silent Failure
**What goes wrong:** Script runs, no error visible, but all summaries are empty or the script crashes with an unhelpful message.

**Why it happens:** `AI_API_KEY` environment variable not exported before running the script.

**How to avoid:** At the top of `generate-summaries.mjs`, add an explicit guard:
```javascript
if (!process.env.AI_API_KEY) {
  console.error('ERROR: AI_API_KEY environment variable is not set.');
  console.error('Run: export AI_API_KEY=sk-ant-...');
  process.exit(1);
}
```

**Warning signs:** Script exits immediately with no API calls made.

### Pitfall 6: Prefilled Responses Deprecated for AI 4.6 Models
**What goes wrong:** Using the `assistant` prefill pattern (`{"role": "assistant", "content": "Here is the summary:"}`) causes unexpected behavior with ai-model-haiku and ai-model-sonnet.

**Why it happens:** Starting with AI 4.5+ models, prefilled responses on the last assistant turn are no longer supported (confirmed in AI vendor prompting best practices docs).

**How to avoid:** Do not use assistant-role prefill in the messages array. Instead, use "Do not preamble" directive in the system prompt and instruct AI to output directly within format markers.

**Warning signs:** API returns a deprecation warning or the output includes an unexpected preamble block.

---

## Code Examples

Verified patterns from official sources:

### Full Pipeline Skeleton

```javascript
// Source: Patterns from official ai-sdk + platform.ai.com/docs/en/api/messages
import AI vendor from 'ai-sdk';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TRANSCRIPTS_DIR = join(ROOT, 'output', 'transcripts');
const MASTER_SUMMARY_PATH = join(ROOT, 'output', 'MASTER_SUMMARY.md');

const SECTION_MODEL = 'ai-model-haiku';  // Cost-optimized for extractive tasks
const MASTER_MODEL = 'ai-model-sonnet';            // Higher quality for synthesis
const INTER_SECTION_DELAY_MS = 1000;

if (!process.env.AI_API_KEY) {
  console.error('ERROR: AI_API_KEY environment variable not set.');
  process.exit(1);
}

const client = new AI vendor({ apiKey: process.env.AI_API_KEY });

async function main() {
  const sectionDirs = readdirSync(TRANSCRIPTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(d => join(TRANSCRIPTS_DIR, d.name));

  const sectionSummaries = [];

  for (const sectionDir of sectionDirs) {
    const sectionName = dirname(sectionDir).split('/').pop() || sectionDir.split('/').pop();
    const summaryPath = join(sectionDir, 'SECTION_SUMMARY.md');

    // Resume: skip if already generated
    if (existsSync(summaryPath)) {
      console.log(`[SKIP] ${sectionName} — already summarized`);
      const existing = readFileSync(summaryPath, 'utf8');
      sectionSummaries.push({ name: sectionName, summary: existing });
      continue;
    }

    const transcripts = getSectionTranscripts(sectionDir);

    if (transcripts.length === 0) {
      console.log(`[SKIP] ${sectionName} — no transcript content`);
      const stub = `*No transcript content available — videos in this section are hosted on YouTube or have no Loom transcript.*`;
      writeFileSync(summaryPath, stub, 'utf8');
      continue;
    }

    console.log(`[SUMMARIZE] ${sectionName} (${transcripts.length} transcripts)`);
    const summary = await generateSectionSummary(sectionName, transcripts, client);

    if (summary.length < 200) {
      console.warn(`[WARN] ${sectionName} — summary suspiciously short (${summary.length} chars)`);
    }

    writeFileSync(summaryPath, summary, 'utf8');
    sectionSummaries.push({ name: sectionName, summary });
    console.log(`[OK] ${sectionName} — summary written`);

    await delay(INTER_SECTION_DELAY_MS);
  }

  // Generate master summary
  if (!existsSync(MASTER_SUMMARY_PATH)) {
    console.log('[MASTER] Generating course-level master summary...');
    const masterSummary = await generateMasterSummary(sectionSummaries, client);
    writeFileSync(MASTER_SUMMARY_PATH, masterSummary, 'utf8');
    console.log('[OK] MASTER_SUMMARY.md written');
  } else {
    console.log('[SKIP] MASTER_SUMMARY.md — already exists');
  }

  console.log('\nDone.');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error(err); process.exit(1); });
```

### Cost Estimate (Verified from Corpus Measurements)

```
Corpus measurements (directly from output/transcripts/):
  Total files: 95
  Real Loom transcripts: 74
  YouTube stubs (no content): 19
  Skool text stubs (minimal content): 2

  Total words (all files): 311,698
  Total tokens (approx, words × 1.3): ~405,200

  Largest section: 07-fundamental-analysis
    ~99,483 real transcript words / ~129,328 tokens
    Fits in 200K context window with ~70,672 tokens headroom

Per-section API calls (12 sections, excluding section 02 — no content):
  Input: ~400K tokens total × $1.00/MTok (Haiku) = $0.40
  Output: ~39K tokens (13 sections × ~3K tokens/summary) × $5.00/MTok = $0.20
  Section subtotal: ~$0.60

Master summary call (1 call, Sonnet 4.6):
  Input: ~39K tokens × $3.00/MTok = $0.12
  Output: ~5K tokens × $15.00/MTok = $0.08
  Master subtotal: ~$0.20

Grand total for one full run: ~$0.80
(Worst case with 2-3 iteration cycles for prompt refinement: <$3.00)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prefill assistant message to control output | Direct instructions in system prompt ("Do not preamble") | AI 4.5+ deprecation | Prefill no longer works on ai-haiku-4-5 and ai-model-sonnet |
| `node-fetch` for all HTTP | `ai-sdk` for AI vendor calls | SDK v0.78 (current) | SDK provides automatic retry on 429/5xx, no manual backoff needed |
| `ai-3-5-sonnet-20241022` (legacy) | `ai-model-haiku` + `ai-model-sonnet` | AI 4.5 series launch | Haiku 4.5 is cheaper and faster than legacy Sonnet 3.5; Sonnet 4.6 has superior synthesis |
| Chunked meta-summarization for long docs | Direct section-level call (each section fits in context) | N/A — context window is sufficient | No chunking needed; all 12 sections individually fit in 200K context |

**Deprecated/outdated:**
- `ai-3-haiku-20240307`: Deprecated April 19, 2026. Do not use — migrate to `ai-model-haiku`.
- Prefill pattern (`{"role": "assistant", ...}` as last message): Unsupported starting AI 4.5+.
- `x-loom-request-source` header (Phase 2 learning): Not relevant here but documented to avoid confusion.

---

## Open Questions

1. **Should MKDN-04 (transcript cleaning) modify the source `.md` files in-place or clean at runtime?**
   - What we know: MKDN-04 requires "Transcript cleaned of filler words before inclusion." Phase 4 will also need clean transcripts for per-video key takeaways.
   - What's unclear: Whether the planning intent was to permanently clean the files (in-place) or only clean at summarization time (runtime).
   - Recommendation: Clean in-place (Option A) — write a `clean-transcripts.mjs` script or include in-place cleaning as the first wave of Phase 3. This fulfills MKDN-04 permanently, benefits Phase 4, and makes the change auditable in git. This should be a separate wave/plan step before the AI summarization step.

2. **How many prompt iteration cycles are needed before section summaries are acceptable quality?**
   - What we know: STATE.md documents "hallucination risk on financial content is 6-17%" and anticipates "2-3 iteration cycles." The instructor's content is heavily conceptual (no numeric thresholds), which reduces hallucination risk.
   - What's unclear: Whether the extractive prompt + temperature-0 approach is sufficient on the first pass, or whether additional prompt refinement (adding examples, tightening constraints) will be needed.
   - Recommendation: Build in a manual review step after generating the first 2-3 section summaries. Spot-check against source transcripts before running all 12 sections. This is also required by success criterion 4.

3. **Section 02 (The Basics) has zero real Loom transcripts — should the section summary reference YouTube links?**
   - What we know: Section 02 has 4 files, all either YouTube stubs or Skool boilerplate. No summarizable content.
   - What's unclear: Whether the section summary should acknowledge the YouTube videos by title and URL, or simply note that no transcript content is available.
   - Recommendation: Write a minimal stub summary noting which videos are on YouTube and linking to them. This is informative for the master summary and doesn't fabricate content.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` — Validation Architecture section skipped per agent instructions.

---

## Sources

### Primary (HIGH confidence)

- `platform.ai.com/docs/en/about-ai/models/overview` — Current model names, context windows (200K / 1M beta), pricing ($1/$5 Haiku, $3/$15 Sonnet, $5/$25 Opus), max output tokens. Fetched 2026-03-02.
- `platform.ai.com/docs/en/api/messages` — Messages API structure, required parameters (model, max_tokens, messages), system prompt placement. Fetched 2026-03-02.
- `platform.ai.com/docs/en/build-with-ai/prompt-engineering/ai-prompting-best-practices` — XML tags, role prompting, anti-preamble instructions, prefill deprecation for AI 4.5+ models, long-context prompting (put document at top, query at end). Fetched 2026-03-02.
- `platform.ai.com/cookbook/capabilities-summarization-guide` — Meta-summarization (summary of summaries) pattern, guided domain-specific summarization, chunk+consolidate for long documents, temperature recommendations. Fetched 2026-03-02.
- `platform.ai.com/docs/en/about-ai/use-case-guides/legal-summarization` — High-accuracy summarization guidance, model selection (Opus for accuracy, Haiku for cost), anti-hallucination approach ("note as Not specified" instead of fabricating). Fetched 2026-03-02.
- `github.com/ai-vendors/ai-vendor-sdk-typescript` — SDK version 0.78.0, ESM import syntax, `client.messages.create()` pattern, automatic retry behavior. Fetched 2026-03-02.
- Direct corpus measurement: `output/transcripts/` — 95 files, 74 real transcripts, 19 YouTube stubs, 311,698 total words, section-level word counts, largest section confirmed at ~99K words / ~129K tokens. Measured 2026-03-02.
- `.planning/STATE.md` — Documents hallucination concern ("6-17% risk"), Phase 3 readiness confirmation, YouTube transcript decision ("Phase 3 handles YouTube-only entries differently").

### Secondary (MEDIUM confidence)

- WebSearch: AI vendor pricing (March 2026) — confirmed $1/$5 Haiku 4.5, $3/$15 Sonnet 4.6, $5/$25 Opus 4.6. Cross-verified with official docs. Fetched 2026-03-02.
- WebSearch: Hallucination in financial LLM summarization — "abstractive summarization more prone to hallucination than extractive," temperature 0 for deterministic output recommended. Cross-referenced with AI vendor cookbook (temperature guidance). Fetched 2026-03-02.

### Tertiary (LOW confidence)

- WebSearch: `ai-sdk` version 0.78.0 current on npm — confirmed via multiple sources; official npm registry returned 403 for direct fetch. Version number may lag by a minor release.

---

## Metadata

**Confidence breakdown:**
- AI SDK and API patterns: HIGH — official docs verified, code examples from AI vendor GitHub
- Model selection and pricing: HIGH — official pricing page verified 2026-03-02
- Corpus measurements (word counts, token estimates): HIGH — directly measured from `output/transcripts/`
- Hallucination prevention prompts: MEDIUM — anti-hallucination directives follow AI vendor's documented patterns; actual effectiveness requires iteration testing
- Filler word regex patterns: MEDIUM — patterns confirmed by manual grep of corpus; may miss some artifact variants

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable — AI SDK and models are stable; re-verify if model aliases change or if AI 4.7 releases)
