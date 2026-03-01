# Architecture Research

**Domain:** Video course extraction and knowledge base generation pipeline
**Researched:** 2026-03-01
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     INPUT LAYER                                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Skool Classroom Page (authenticated browser session)    │   │
│  │  Browser Console Script — runs in user's logged-in tab   │   │
│  └──────────────────────────┬───────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────┘
                              │ JSON manifest (copy-paste or file)
┌─────────────────────────────▼───────────────────────────────────┐
│                     EXTRACTION LAYER                             │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐                    │
│  │  Manifest        │    │  State Store      │                   │
│  │  Parser          │───▶│  (progress.json)  │                   │
│  └────────┬────────┘    └──────────────────┘                    │
│           │                                                      │
│  ┌────────▼────────┐    ┌──────────────────┐                    │
│  │  Loom Transcript │    │  Rate Limiter +   │                   │
│  │  Fetcher         │───▶│  Retry Engine     │                   │
│  └────────┬────────┘    └──────────────────┘                    │
└───────────┼─────────────────────────────────────────────────────┘
            │ raw transcript text per video
┌───────────▼─────────────────────────────────────────────────────┐
│                     PROCESSING LAYER                             │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐                    │
│  │  Markdown File   │    │  File System      │                   │
│  │  Generator       │───▶│  Writer           │                   │
│  └─────────────────┘    └──────────────────┘                    │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐                    │
│  │  AI API      │    │  Token Budget     │                   │
│  │  Summarizer      │───▶│  Tracker          │                   │
│  └─────────────────┘    └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
            │ per-video .md files + per-section summaries
┌───────────▼─────────────────────────────────────────────────────┐
│                     OUTPUT LAYER                                 │
│                                                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────────┐   │
│  │  /videos/    │  │  /sections/   │  │  MASTER_SUMMARY.md │   │
│  │  per-video   │  │  per-section  │  │  full course exec  │   │
│  │  .md files   │  │  exec summary │  │  summary           │   │
│  └──────────────┘  └───────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Browser Console Script | Extract Loom embed URLs + video titles + section hierarchy from authenticated Skool page | Vanilla JS, runs in DevTools console, outputs JSON |
| Manifest Parser | Validate and normalize the JSON manifest from browser script into typed, ordered data structures | Node.js module, TypeScript interface |
| State Store | Track which videos are done, pending, or failed — enables resume without reprocessing | Local `progress.json` file, keyed by Loom video ID |
| Loom Transcript Fetcher | Fetch transcripts for each Loom video ID via Loom's internal API or page scraping | Node.js fetch calls with retry logic |
| Rate Limiter + Retry Engine | Enforce delays between requests, detect 429s, retry with exponential backoff | Configurable delay queue, max 3 retries |
| Markdown File Generator | Combine title + section + transcript + key takeaways into a formatted `.md` template | Template string rendering, no external library needed |
| File System Writer | Write files to correct folder hierarchy mirroring course structure | Node.js `fs.promises`, create dirs recursively |
| AI API Summarizer | Generate per-section and master executive summaries from aggregated transcripts | AI SDK, structured prompt |
| Token Budget Tracker | Track AI API usage per call, log cost estimates | Simple accumulator, warn if approaching limits |

## Recommended Project Structure

```
danscryptocourse/
├── scripts/
│   ├── browser-extract.js       # Paste into Skool browser console — outputs JSON
│   └── run-pipeline.ts          # Main pipeline entrypoint (Node.js)
├── src/
│   ├── manifest/
│   │   ├── parser.ts            # Parse + validate browser script JSON output
│   │   └── types.ts             # CourseManifest, Section, Video interfaces
│   ├── extraction/
│   │   ├── loom-fetcher.ts      # Fetch transcript by Loom video ID
│   │   ├── rate-limiter.ts      # Delay + retry with exponential backoff
│   │   └── transcript-cache.ts  # Write raw transcripts to .cache/ to avoid re-fetch
│   ├── generation/
│   │   ├── markdown-writer.ts   # Write per-video .md files
│   │   ├── summarizer.ts        # AI API calls for section + master summaries
│   │   └── templates.ts         # Markdown file templates (video, section, master)
│   ├── state/
│   │   └── progress.ts          # Read/write progress.json checkpoint file
│   └── pipeline.ts              # Orchestrates all stages in sequence
├── output/
│   ├── videos/
│   │   ├── 01-introduction/
│   │   │   └── 01-course-intro.md
│   │   ├── 02-the-basics/
│   │   │   ├── 01-video-title.md
│   │   │   └── 02-video-title.md
│   │   └── ... (one folder per section, numbered)
│   ├── sections/
│   │   ├── 01-introduction-summary.md
│   │   ├── 02-the-basics-summary.md
│   │   └── ...
│   └── MASTER_SUMMARY.md
├── .cache/
│   ├── transcripts/             # Raw transcript text per video ID (avoid re-fetch)
│   └── progress.json            # Checkpoint: which videos are done/failed
└── .env                         # AI_API_KEY
```

### Structure Rationale

- **scripts/browser-extract.js:** Isolated from the Node.js pipeline — it runs in a completely different environment (browser). Keeping it separate avoids confusion.
- **src/extraction/:** Transcript fetching is its own bounded concern. Rate limiting and caching live here so the pipeline orchestrator stays clean.
- **src/state/:** Progress tracking is a first-class concern for this pipeline. Isolating it means any stage can checkpoint without coupling to other stages.
- **.cache/transcripts/:** Raw transcripts are expensive to re-fetch (rate limits, latency). Cache them by video ID. This is not output — it's working storage.
- **output/videos/ numbered folders:** Mirror the course's section numbering. Zero-padding ensures alphabetical = logical order in any file browser.

## Architectural Patterns

### Pattern 1: Two-Stage Authentication Split

**What:** The pipeline has two execution environments — browser (for Skool auth) and Node.js (for everything else). The browser script outputs a JSON manifest that becomes the Node.js pipeline's input.

**When to use:** Any time the data source requires human-in-the-loop authentication that cannot be automated headlessly (cookies expiring, SSO, etc.)

**Trade-offs:** Adds a manual handoff step. Eliminates complexity of programmatic browser automation (Puppeteer, Playwright) and avoids credential management in code.

**Example:**
```javascript
// browser-extract.js — paste into DevTools console on Skool classroom page
const sections = [];
document.querySelectorAll('.section-container').forEach((section, sIdx) => {
  const sectionTitle = section.querySelector('.section-title')?.innerText?.trim();
  const videos = [];
  section.querySelectorAll('iframe[src*="loom.com/embed"]').forEach((iframe, vIdx) => {
    const src = iframe.getAttribute('src');
    const videoId = src.match(/loom\.com\/embed\/([a-f0-9]+)/)?.[1];
    const title = iframe.closest('.lesson-row')
                    ?.querySelector('.lesson-title')?.innerText?.trim();
    if (videoId) videos.push({ index: vIdx + 1, id: videoId, title });
  });
  sections.push({ index: sIdx + 1, title: sectionTitle, videos });
});
console.log(JSON.stringify({ sections }, null, 2));
// Copy the output, paste into course-manifest.json
```

### Pattern 2: Checkpoint-First Incremental Processing

**What:** Before processing any video, read `progress.json`. Skip any video already marked `done`. Write `done` immediately after successful transcript save. Write `failed` with error on failure. This makes every run idempotent.

**When to use:** Any pipeline processing 10+ items that takes more than a few minutes. This pipeline has ~80 videos — a failure midway without checkpointing means starting over.

**Trade-offs:** Requires a state file. Adds ~5 lines of code per stage. Entirely worth it.

**Example:**
```typescript
// src/state/progress.ts
interface VideoProgress {
  status: 'pending' | 'done' | 'failed';
  error?: string;
  completedAt?: string;
}

async function loadProgress(): Promise<Record<string, VideoProgress>> {
  try {
    return JSON.parse(await fs.readFile('.cache/progress.json', 'utf-8'));
  } catch {
    return {};  // First run: no progress file yet
  }
}

async function markDone(videoId: string, progress: Record<string, VideoProgress>) {
  progress[videoId] = { status: 'done', completedAt: new Date().toISOString() };
  await fs.writeFile('.cache/progress.json', JSON.stringify(progress, null, 2));
}
```

### Pattern 3: Exponential Backoff Retry with Error Classification

**What:** Distinguish retryable errors (429 rate limit, 5xx network) from non-retryable errors (404 transcript not found, auth failure). Only retry the former. Use exponential backoff: wait 1s, then 2s, then 4s before failing permanently.

**When to use:** Any HTTP calls to external services where you don't control rate limits. Loom does not publish transcript API rate limits, so assume they exist.

**Trade-offs:** Adds latency on failures. Prevents hammering an API into banning the session.

**Example:**
```typescript
async function fetchWithRetry(url: string, maxRetries = 3): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.text();
    if (res.status === 404) throw new Error(`Not found: ${url}`);  // non-retryable
    if (res.status === 429 || res.status >= 500) {
      if (attempt === maxRetries) throw new Error(`Max retries exceeded: ${res.status}`);
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    throw new Error(`Unexpected status: ${res.status}`);
  }
  throw new Error('Unreachable');
}
```

### Pattern 4: Hierarchical Summarization (Bottom-Up)

**What:** Generate summaries at each level of the hierarchy before aggregating to the next level. Video transcripts → per-section summary → master summary. Never summarize a summary-of-a-summary across too many hops.

**When to use:** Any LLM summarization task where input exceeds context window limits. 80 videos of transcripts cannot fit in one AI prompt. Summarize 5-18 videos per section first, then summarize 13 sections.

**Trade-offs:** Two AI API passes per section + one master pass. Cost is predictable and bounded.

**Example:**
```typescript
// Section summary prompt pattern
const sectionPrompt = `
You are creating a trading playbook section from a crypto course.

Section: ${section.title}
Videos in this section:
${videos.map(v => `### ${v.title}\n${v.transcript}`).join('\n\n')}

Create:
1. Executive Summary (3-5 sentences, what this section teaches)
2. Key Concepts (bulleted, each one actionable)
3. Trading Rules from this section (if any)
4. Common Mistakes to avoid (from the content)
5. Quick Reference Cheat Sheet (table format)
`;
```

## Data Flow

### Pipeline Flow

```
[Browser Console Script]
        │
        │ JSON manifest (sections + video IDs + titles)
        ▼
[Manifest Parser] ──validates──▶ [Error: halt + report]
        │
        │ typed CourseManifest object
        ▼
[State Store] ──loads──▶ progress.json (which videos already done)
        │
        │ list of pending videos
        ▼
[Loom Transcript Fetcher] ──per video──▶ [Rate Limiter]
        │                                       │
        │ raw transcript text                   │ 429/5xx → exponential backoff retry
        ▼                                       │ 404 → mark failed, continue
[Transcript Cache] ─────────────────────────────┘
        │
        │ cached transcript text
        ▼
[Markdown Writer] ──writes──▶ output/videos/{section}/{video}.md
        │
        │ marks video as 'done' in progress.json
        ▼
[Stage Gate: all videos done?]
        │ yes
        ▼
[Summarizer: per section]
        │ reads all video .md files in section
        │ calls AI API
        ▼
output/sections/{section}-summary.md
        │
        ▼
[Summarizer: master]
        │ reads all section summaries
        │ calls AI API
        ▼
output/MASTER_SUMMARY.md
```

### Key Data Flows

1. **URL Discovery flow:** Browser DOM → regex/querySelector → Loom video IDs → JSON manifest → file
2. **Transcript fetch flow:** Loom video ID → HTTP GET → raw text/VTT → strip timestamps → plain transcript text
3. **Markdown generation flow:** title + section + transcript + (optional AI takeaways) → template → .md file
4. **Summarization flow:** N video .md files → aggregate text → AI API → section .md → 13 sections → AI API → MASTER_SUMMARY.md

## Loom Transcript Access: What Is Known

**MEDIUM confidence** — No official Loom transcript REST API is documented publicly. The Loom Embed SDK (dev.loom.com) does not expose transcript methods.

**Observed patterns from community tools (LOW-MEDIUM confidence):**
- Loom videos have transcript data accessible at their `/share/` URL in embedded page JSON (window.__INITIAL_STATE__ or similar)
- Some scrapers use Puppeteer/Playwright to load the Loom share page and extract transcript from DOM
- The Apify actors (multiple) use Loom's internal auth session and GraphQL to fetch transcripts
- Transcripts must be enabled by video creator (Settings → Audience → Transcript ON) — since this is a self-operated course under one Loom account, all videos should have transcripts available

**Recommended approach:** Start with fetching `https://www.loom.com/share/{videoId}` and inspecting the page for embedded JSON transcript data. If that fails, fall back to Puppeteer for DOM extraction. Do not rely on an official transcript API endpoint that does not exist.

**Fallback:** If Loom transcripts are unavailable for any video, Whisper (OpenAI's speech-to-text) can transcribe from the Loom video's CDN URL. This requires the video to be accessible (the embed URL works without auth for Loom public/unlisted videos typically embedded in Skool).

## Scaling Considerations

This is a one-time extraction pipeline for ~80 videos. Scaling is not a concern. The relevant operational constraints are:

| Constraint | Expected Range | Approach |
|------------|---------------|----------|
| Loom rate limits | Unknown — likely 10-30 req/min | 2-3s delay between requests, exponential backoff on 429 |
| AI API token limits | 200K context window per call | Keep per-section summarization; don't combine all 80 videos |
| AI API cost | ~$0.50-2.00 for full run | Budget 100K tokens input per section × 13 sections |
| Runtime | 30-90 minutes total | Checkpoint enables pause/resume |
| File size | ~80 .md files + 14 summaries | Negligible at markdown scale |

### Scaling Priorities (if ever re-run or extended)

1. **First bottleneck:** Loom rate limiting — already handled by rate limiter + retry
2. **Second bottleneck:** AI API cost on re-summarization — cache section summary output to avoid redundant API calls

## Anti-Patterns

### Anti-Pattern 1: Monolithic Script Without Checkpointing

**What people do:** Write one bash or Node.js script that loops through all 80 videos from start to finish without saving state.

**Why it's wrong:** Any failure at video 60 means restarting from video 1 and paying for all those transcript fetches and API calls again. Loom may also rate-limit the re-run.

**Do this instead:** Write `done` to `progress.json` after each successful video. Skip already-done videos on every run.

### Anti-Pattern 2: Fetching Transcripts and Summarizing in the Same Pass

**What people do:** Fetch transcript → immediately call AI API → write file, all in one tight loop.

**Why it's wrong:** If AI API fails halfway through (rate limit, timeout, token limit), you lose the transcript fetch results. AI API calls are slower and more expensive than transcript fetches.

**Do this instead:** Stage the pipeline. Stage 1: fetch and cache all transcripts. Stage 2: generate all .md files. Stage 3: generate all summaries. Each stage checkpoints independently.

### Anti-Pattern 3: Summarizing Raw Transcripts Directly With No Cleaning

**What people do:** Dump raw VTT/SRT transcript (with timestamps, speaker tags, filler words) directly into AI.

**Why it's wrong:** Timestamps and formatting noise inflate token count by 30-50%. AI's output quality degrades with noisy input. Wastes money.

**Do this instead:** Strip timestamps and speaker labels from VTT/SRT before passing to AI. Keep only the spoken text, preserving paragraph breaks where natural pauses occur.

### Anti-Pattern 4: Hardcoding the Skool DOM Selectors in the Main Pipeline

**What people do:** Have the Node.js pipeline attempt to log into Skool and scrape the page automatically using hardcoded CSS selectors.

**Why it's wrong:** Skool uses auth (session cookies, SPAs, potential bot detection). Automating browser login is brittle, breaks on UI changes, and adds unnecessary complexity for a one-time extraction.

**Do this instead:** Use a browser console script for the URL extraction step. The user is already authenticated. The script runs once, copies JSON output. This is the right tool for this job.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Skool | Browser console script (manual auth, DOM scraping) | One-time extraction; user is already authenticated |
| Loom | HTTP GET to share or embed page, parse embedded JSON for transcript | No official transcript API; use page-level transcript data |
| AI (AI API) | REST API via `ai-sdk` npm package | Requires `AI_API_KEY` in `.env` |
| Local filesystem | Node.js `fs.promises` | Output files and progress.json state |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Browser script → Node.js pipeline | JSON file or copy-paste text (manual handoff) | Intentional break — browser and Node.js are separate environments |
| Extraction → Generation | `.cache/transcripts/` filesystem directory | Decoupled stages; generation reads from cache |
| Generation → Summarization | `output/videos/` filesystem directory | Summarizer reads generated .md files, not raw transcripts |
| State → All stages | `progress.json` | Each stage reads and writes; file is the shared state bus |

## Suggested Build Order

Build in this order — each phase unblocks the next:

1. **Browser console script** — Until you can extract Loom URLs from Skool, nothing else runs. Validate manually that you get the right video IDs.
2. **Manifest types + parser** — Define the data contract between browser script output and pipeline input. Validate your manifest has all 80 videos.
3. **Loom transcript fetcher + retry** — This is the most uncertain component (no official API). Prove it works for 3-5 videos before building the full pipeline.
4. **State store + progress tracking** — Add checkpointing before running the full 80-video fetch to avoid losing work.
5. **Markdown file generator + file writer** — Once transcripts are confirmed fetchable, generate all 80 .md files.
6. **Per-section summarizer** — With all video .md files written, generate section summaries (13 AI API calls).
7. **Master summarizer** — With all section summaries written, generate the master exec summary (1 AI API call).

## Sources

- Loom Embed SDK API documentation: [dev.loom.com/docs/embed-sdk/api](https://dev.loom.com/docs/embed-sdk/api) — confirms no official transcript API (HIGH confidence)
- Skool classroom DOM extraction patterns: [GitHub gist by devinschumacher](https://gist.github.com/devinschumacher/69615573b027b1cd5ead318739811613) — md= parameter pattern for lesson URLs (MEDIUM confidence)
- Skool Loom downloader reference: [fx64b.dev/projects/skool-loom-dl](https://fx64b.dev/projects/skool-loom-dl) — JSON parsing + regex fallback for video extraction (MEDIUM confidence)
- Loom transcript scraper (community): [Apify: loom-transcript-scraper](https://apify.com/neatrat/loom-transcript-scraper) — updated June 2025 for API compatibility (LOW confidence — internal impl details unknown)
- Loom transcript creator settings: [Atlassian Support](https://support.atlassian.com/loom/docs/loom-video-transcription-and-closed-captions/) — transcript must be enabled per video (MEDIUM confidence)
- Incremental extraction patterns: [oneuptime.com/blog/incremental-extraction](https://oneuptime.com/blog/post/2026-01-30-data-pipeline-incremental-extraction/view) — checkpoint/resume pattern (MEDIUM confidence)
- Hierarchical LLM summarization: NEXUSSUM paper, ACL 2025 — bottom-up summarization for long-form content (MEDIUM confidence)

---
*Architecture research for: Video course extraction + knowledge base generation pipeline*
*Researched: 2026-03-01*
