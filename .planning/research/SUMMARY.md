# Project Research Summary

**Project:** Dan's Crypto Course Knowledge Extractor
**Domain:** Video course extraction and AI knowledge base generation pipeline (Skool + Loom + AI API)
**Researched:** 2026-03-01
**Confidence:** MEDIUM

## Executive Summary

Dan's Crypto Course Knowledge Extractor is a one-time data pipeline that converts approximately 80 Loom video transcripts embedded in a Skool classroom into a structured, AI-synthesized markdown knowledge base. The recommended approach has two execution environments: a browser console script that runs inside the user's authenticated Skool session to extract Loom video IDs and course structure, and a Node.js pipeline that fetches transcripts via Loom's internal GraphQL endpoint, writes per-video markdown files, and invokes AI to generate per-section and master executive summaries. This two-environment design is intentional — it avoids fragile programmatic browser automation and leverages the user's existing login session. The entire pipeline runs on Node.js 22 LTS with four essential dependencies: `ai-sdk`, `node-fetch`, `fs-extra`, and `bottleneck`.

The recommended implementation follows a staged, checkpointed pipeline with clear separation between extraction, processing, and summarization. Transcripts are cached to disk after each fetch to enable resume on failure. Summaries are generated hierarchically: video transcripts feed section summaries, section summaries feed the master summary. This keeps AI context windows manageable across a 80-video corpus and bounds API cost to roughly $0.50-$2.00 for a full run. No existing tool covers the full pipeline — available open-source tools handle either Skool scraping or Loom transcript extraction in isolation, never both, and none produce AI-synthesized knowledge bases with trading-domain formatting.

The primary risk is Loom's GraphQL transcript endpoint: it is undocumented, has already broken once, and must be validated against real video IDs before any other pipeline code is written. The secondary risk is AI hallucination on trading-specific financial content, where LLMs have documented error rates of 6-17% — requiring extractive-style prompting and mandatory manual spot-checking before the knowledge base is trusted for trading decisions. Both risks are manageable if addressed in the right phases.

---

## Key Findings

### Recommended Stack

The project requires only a small, focused set of dependencies. Node.js 22 LTS is the runtime. Loom transcripts are retrieved via HTTP POST to `https://www.loom.com/graphql` using the `FetchVideoTranscript` operation — this is Loom's internal, undocumented API used by their own embed player. The response includes a `captions_source_url` pointing to a VTT file on Loom's CDN; the VTT is then fetched and stripped of timestamps to produce plain transcript text. Skool URL extraction uses a browser console script targeting the Next.js `__NEXT_DATA__` JSON blob embedded in the authenticated classroom page — no headless browser tooling required.

**Core technologies:**
- Node.js 22 LTS — pipeline runtime; LTS support through April 2027
- `ai-sdk` 0.78.0 — AI API for section and master summarization; official SDK with retry and error wrapping built in
- `node-fetch` 3.3.2 — HTTP client for Loom GraphQL calls; ESM-native, lightweight (requires `"type": "module"` in package.json)
- `fs-extra` 11.3.3 — recursive directory creation and file writes without boilerplate
- `slugify` 1.6.6 — filesystem-safe filenames from section and video titles; 7M+ weekly downloads
- `bottleneck` 2.19.5 — rate limiting for Loom GraphQL calls; controls both concurrency (max 3) and spacing (500ms minimum)
- `dotenv` 17.3.1 — loads `AI_API_KEY` from `.env`; keeps credentials out of source code

**ESM note:** Configure the project as ESM from the start (`"type": "module"` in package.json). Both `node-fetch` v3 and `chalk` v5 are ESM-only; mixing with CommonJS causes `ERR_REQUIRE_ESM` errors.

**Loom auth note (LOW confidence, needs validation):** Private or link-shared Loom videos embedded in Skool may require the `connect.sid` session cookie passed as a request header. Validate early — this is a single-source finding.

See `/Users/amir/danscryptocourse/.planning/research/STACK.md` for full package versions and alternatives considered.

### Expected Features

The pipeline has a clear MVP boundary. Nine features are required for the pipeline to produce any usable output. Eight more features add significant value at manageable cost and belong in a first iteration after MVP validation. Nothing else should be built.

**Must have (table stakes — P1):**
- Skool classroom URL/section scraping — browser console script extracting Loom video IDs, section hierarchy, and titles from `__NEXT_DATA__`
- Loom transcript fetch per video — Node.js GraphQL call returning plain text transcript per video ID
- Per-video markdown file creation — one `.md` file per video with title, section metadata, and full transcript
- Folder hierarchy matching course structure — 13 section folders with numeric prefixes for sort order
- Per-section executive summary — AI API generates actionable summary from all transcripts in a section
- Master executive summary — AI API synthesizes from all 13 section summaries (not raw transcripts)
- Progress state file with resume logic — `progress.json` checkpoint; idempotent reruns skip completed videos
- Rate limit handling with backoff — prevents Loom API bans on bulk extraction

**Should have (differentiators — P2, add after MVP validation):**
- Transcript cleanup/normalization — strip filler words and VTT artifacts before AI ingestion; improves summary quality
- Key takeaways per video (3-7 bullets) — AI-generated per video; high value, but adds 80 AI API calls; validate cost first
- Quick-reference cheat sheets per section — ultra-condensed format for live trading reference
- Section index files + master course index — navigation files for the knowledge base
- Trading-specific prompt refinement — extractive prompts tuned for entry signals, position sizing, and risk management rules

**Defer (P3 — explicitly out of scope):**
- Video file downloading — ToS concerns, 40GB+ storage overhead
- Real-time sync / incremental updates — Skool auth complexity; course is effectively static
- Semantic search index — vector DB is a second system; grep covers 80 markdown files adequately
- Web UI — scope explosion; Obsidian/VS Code renders markdown well

See `/Users/amir/danscryptocourse/.planning/research/FEATURES.md` for full feature dependency graph and prioritization matrix.

### Architecture Approach

The pipeline separates into four distinct layers with filesystem boundaries between them. The browser console script (Layer 1) outputs a JSON manifest that is the only input to the Node.js pipeline (Layer 2, 3, 4). Within the Node.js pipeline, the extraction layer writes raw transcripts to `.cache/transcripts/`, the processing layer reads from cache and writes to `output/videos/`, and the summarization layer reads from `output/videos/` and writes to `output/sections/` and `output/MASTER_SUMMARY.md`. The `progress.json` state file is the shared bus — every layer reads and writes it. This staged design means any layer can be re-run independently without touching other layers.

**Major components:**
1. Browser Console Script — extracts Loom embed URLs + section hierarchy from authenticated Skool page; outputs JSON manifest; runs once in user's browser
2. Manifest Parser — validates and types the JSON manifest into `CourseManifest` / `Section` / `Video` interfaces; halts with clear error on invalid input
3. Loom Transcript Fetcher + Rate Limiter — POSTs to `https://www.loom.com/graphql`, fetches VTT from CDN, strips timestamps; enforces 500ms delay and exponential backoff on 429
4. State Store (`progress.json`) — tracks `pending` / `done` / `failed` per video ID; enables idempotent reruns
5. Markdown File Generator — combines title + section + transcript into `.md` template; writes to numbered folder hierarchy
6. Transcript Cache (`.cache/transcripts/`) — stores raw transcripts by video ID; avoids re-fetching on rerun
7. AI API Summarizer — per-section calls (13 total) then one master call; hierarchical bottom-up summarization; tracks token budget
8. File System Writer (`fs-extra`) — creates recursive directory structure; writes all output files

**Key patterns:**
- Two-stage authentication split: browser for Skool auth, Node.js for everything else. Manual JSON handoff is intentional.
- Checkpoint-first incremental processing: mark `done` after every successful video write, not at batch end.
- Staged pipeline: fetch all transcripts first, generate all markdown second, summarize third. Never interleave transcript fetch with AI API calls.
- Hierarchical summarization: video transcripts → section summaries → master summary. Never concatenate all 80 transcripts into one AI call.

See `/Users/amir/danscryptocourse/.planning/research/ARCHITECTURE.md` for full data flow diagram and anti-patterns.

### Critical Pitfalls

1. **Loom GraphQL endpoint is undocumented and has already broken once** — Isolate all transcript fetching behind a single `fetchLoomTranscript(videoId)` function. Validate against 5 real video IDs before writing any other pipeline code. The break is documented (array vs. object request body format) and fixable, but the endpoint can change again without notice.

2. **Skool DOM extractor returns empty or partial results silently** — Target `__NEXT_DATA__` JSON (not CSS selectors). Log the count of videos and sections found at extraction time. Verify ~80 videos across 13 sections before proceeding. A count mismatch is the earliest possible failure signal.

3. **Missing Loom transcripts create silent knowledge base gaps** — Treat empty or null transcript as a pipeline error. Write `[TRANSCRIPT MISSING]` to the markdown file AND to a separate `missing-transcripts.log`. Do not run AI summarization on transcripts under 200 words. Report fetch ratio at pipeline completion.

4. **Loom GraphQL requires browser-like headers or returns 400** — Always set `User-Agent`, `Accept: application/json`, `Content-Type: application/json`, `Origin: https://www.loom.com`, `Referer: https://www.loom.com/`. Send request body as plain object `{query: "..."}` not array `[{query: "..."}]` — the array format is the documented cause of the prior breaking bug.

5. **AI hallucination on trading-specific financial content (6-17% error rate)** — Use extractive-first prompts: "Summarize ONLY what is stated explicitly in this transcript." Require the model to quote rather than synthesize for numbers, indicators, and thresholds. Manually spot-check at least 5 summaries against source transcripts before trusting the knowledge base for trading decisions.

---

## Implications for Roadmap

Based on the combined research, the pipeline has four natural phases. Phases 1 and 2 are the highest-risk phases; Phases 3 and 4 are lower-risk with well-documented patterns.

### Phase 1: Foundation and Proof-of-Concept

**Rationale:** Both the Skool URL extractor and the Loom GraphQL transcript fetcher are the riskiest components — they depend on undocumented, unofficial endpoints that can break. Validate both against real data before building anything downstream. This phase exists entirely to derisk the pipeline's two external dependencies.

**Delivers:** A validated JSON manifest of all ~80 video IDs + titles + sections, and confirmed transcript text for at least 5 real videos. If either fails, the project strategy must change before any other work is done.

**Addresses:** Skool classroom scraping, Loom transcript proof-of-concept

**Avoids:**
- Pitfall 1 (Loom API instability) — validate endpoint before writing dependent code
- Pitfall 2 (Skool DOM extractor fragility) — verify video count against expected ~80
- Pitfall 4 (Loom GraphQL header requirements) — confirm correct headers and request body format

**Research flag:** Needs validation against real Loom video IDs in Dan's course. The GraphQL endpoint, required headers, and authentication requirements for link-shared embedded videos are MEDIUM-LOW confidence. This phase IS the research validation.

---

### Phase 2: Batch Extraction Pipeline

**Rationale:** With the Loom endpoint proven, build the full transcript extraction pipeline for all 80 videos with proper rate limiting, checkpointing, and missing-transcript detection. This is a higher-volume execution of Phase 1's validated approach.

**Delivers:** `.cache/transcripts/` directory with plain-text transcript files for all 80 videos. `progress.json` checkpoint state. `missing-transcripts.log` identifying any gaps. All 80 per-video markdown files in the correct numbered folder hierarchy.

**Addresses:** Loom transcript fetch for all videos, per-video markdown file creation, folder hierarchy matching course structure, progress state file with resume logic, rate limit handling with backoff, missing transcript detection

**Uses:** `node-fetch`, `bottleneck`, `fs-extra`, `slugify`, `dotenv`

**Implements:** Loom Transcript Fetcher, Rate Limiter + Retry Engine, State Store, Transcript Cache, Markdown File Generator, File System Writer

**Avoids:**
- Pitfall 3 (silent missing transcripts) — `missing-transcripts.log` is built here as a first-class feature
- Anti-pattern: monolithic script without checkpointing — `progress.json` enables idempotent reruns
- Anti-pattern: summarizing in the same pass as fetching — extraction completes fully before summarization begins

**Research flag:** No additional research needed. Rate limiting, retry logic, and checkpoint patterns are well-documented. `bottleneck` is production-proven.

---

### Phase 3: AI Summarization

**Rationale:** Summarization depends entirely on Phase 2 completing. All 80 transcript files must exist before section summaries can be generated. Section summaries must exist before the master summary can be generated. This is the AI API phase.

**Delivers:** 13 per-section summary files in `output/sections/`. One `output/MASTER_SUMMARY.md`. Estimated cost: $0.50-$2.00 total for a full run.

**Addresses:** Per-section executive summary, master executive summary, trading-specific summary format (extractive prompting for entry signals, position sizing rules, risk management rules)

**Uses:** `ai-sdk` 0.78.0

**Implements:** AI API Summarizer, Token Budget Tracker, hierarchical bottom-up summarization pattern

**Avoids:**
- Pitfall 5 (AI hallucination on financial content) — extractive-first prompts, no number synthesis, manual spot-check of 5+ summaries
- Anti-pattern: concatenating all 80 transcripts into one AI call — hierarchical summarization keeps context windows manageable
- Anti-pattern: no retry on AI transient failures — exponential backoff on 429/500 from AI API

**Research flag:** Prompt engineering for extractive financial summarization is the open question. The specific prompt structure for trading-domain content (entry signals, position sizing, risk management rules) will need iteration during this phase. Plan for 2-3 prompt revision cycles before the output format is finalized.

---

### Phase 4: Polish and Navigation

**Rationale:** Once the core knowledge base is generated and validated, add navigation aids and quality improvements that make the output more usable for day-to-day trading reference.

**Delivers:** Per-video key takeaways (3-7 bullets), per-section quick-reference cheat sheets, section index files, master course index, cleaned-up transcript normalization (filler word removal).

**Addresses:** Key takeaways per video, quick-reference cheat sheets per section, section index files, master course index, transcript cleanup/normalization

**Avoids:**
- Cost overrun on key takeaways: validate per-video AI API cost (80 additional calls) is acceptable before enabling
- Transcript cleanup scope creep: apply regex-only cleanup (strip filler words, normalize capitalization); do not introduce NLP libraries

**Research flag:** No additional research needed. These are format refinements with well-understood implementation patterns. The only decision point is whether per-video key takeaways are cost-justified after seeing Phase 3 API costs.

---

### Phase Ordering Rationale

- **Phase 1 must be first:** Both external APIs (Skool `__NEXT_DATA__` and Loom GraphQL) are undocumented and fragile. Validating them before writing dependent code prevents building on a broken foundation.
- **Phase 2 before Phase 3:** Summarization requires complete transcript files. There is no way to parallelize extraction and summarization without complex partial-state management that adds risk.
- **Phase 4 last:** Navigation and polish features add value only when the core knowledge base is proven to work. Key takeaways (80 extra AI calls) should only be enabled after confirming Phase 3 cost is acceptable.
- **Checkpointing in Phase 2:** Resume logic must be built before the 80-video batch run, not after. A failure at video 60 without checkpointing restarts from video 1 and reprices all API calls.

### Research Flags

Phases likely needing deeper research or validation during planning:
- **Phase 1:** The core research task. Loom GraphQL endpoint behavior for link-shared videos embedded in Skool is MEDIUM confidence. Authentication requirements (`connect.sid` cookie for embedded videos) are LOW confidence (single source). Must be validated with real video IDs from Dan's course before any other code is written.
- **Phase 3:** Extractive prompt engineering for trading-domain financial content is an open question. Budget time for iteration. The hallucination risk (6-17% on financial content) is well-documented but the optimal prompt structure for this specific course is not.

Phases with standard patterns (skip research-phase):
- **Phase 2:** Checkpoint/resume pattern, rate limiting with `bottleneck`, and VTT parsing are well-documented with proven implementations. Confidence HIGH.
- **Phase 4:** Transcript cleanup (regex-based filler word removal), markdown index generation, and cheat sheet formatting are straightforward string processing tasks. Confidence HIGH.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified via npm registry. Node.js LTS status verified via official Node.js release schedule. Loom GraphQL endpoint verified via source code of `bStyler/loom-transcript-mcp`. ESM constraint for `node-fetch` v3 and `chalk` v5 is well-documented. |
| Features | MEDIUM | Core Loom/Skool capabilities confirmed via official docs and third-party tools. AI summarization patterns verified via multiple sources. Feature boundaries (what to include vs. defer) are opinionated but defensible. |
| Architecture | MEDIUM | Staged pipeline and checkpoint patterns are well-documented. Loom transcript access method (GraphQL + VTT) is MEDIUM confidence — verified via community tools but no official docs. The two-environment design (browser + Node.js) is the right call for auth-gated sources. |
| Pitfalls | MEDIUM-HIGH | Loom GraphQL 400 error (array vs. object body) is HIGH confidence — documented real bug with root cause. Skool `__NEXT_DATA__` fragility is MEDIUM confidence — community-confirmed. AI hallucination rate on financial content (6-17%) is MEDIUM confidence — cited research. Authentication requirements for embedded Loom videos are LOW confidence — single source. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Loom authentication for link-shared embedded videos:** Whether `connect.sid` or any session cookie is required for Loom videos embedded in Skool is a LOW-confidence finding from a single source. Must be validated in Phase 1 against real video IDs. If cookies are required, the extraction approach must be updated to pass them from the browser session.

- **Skool `__NEXT_DATA__` schema for Dan's specific course:** The `__NEXT_DATA__` structure is confirmed to exist and contain video URLs, but the exact JSON path to Loom video IDs varies across Skool course configurations. The browser console script will need to be adapted once inspected against the real classroom DOM. Reserve 30-60 minutes for this validation.

- **Loom transcript availability for all 80 videos:** Older videos or videos migrated from another platform may lack transcripts. The proportion of missing transcripts in Dan's course is unknown until Phase 2 runs. If more than 10% of videos are missing transcripts, a Whisper fallback path becomes a Phase 2 requirement rather than a future consideration.

- **Per-video AI API cost for key takeaways (Phase 4):** 80 additional AI API calls for per-video key takeaways adds cost that has not been estimated precisely. Validate Phase 3 cost ($0.50-$2.00 estimate) before committing to Phase 4 key takeaways.

---

## Sources

### Primary (HIGH confidence)
- `https://raw.githubusercontent.com/bStyler/loom-transcript-mcp/main/src/index.ts` — Loom GraphQL endpoint, `FetchVideoTranscript` operation, VTT approach, browser-like header requirements, array-vs-object body bug
- `https://support.atlassian.com/loom/docs/loom-video-transcription-and-closed-captions/` — Loom transcripts available on all plans, creator-controlled visibility
- `https://support.atlassian.com/loom/docs/does-loom-have-an-open-api/` — Confirms no official open Loom API exists
- npm registry (`npm view` commands) — All package versions verified: `ai-sdk@0.78.0`, `node-fetch@3.3.2`, `fs-extra@11.3.3`, `slugify@1.6.6`, `bottleneck@2.19.5`, `dotenv@17.3.1`, `chalk@5.6.2`, `ora@9.3.0`, `commander@14.0.3`
- `https://nodejs.org/en/about/previous-releases` — Node.js 22 LTS active through April 2027

### Secondary (MEDIUM confidence)
- `https://gist.github.com/devinschumacher/69615573b027b1cd5ead318739811613` — Skool `__NEXT_DATA__` extraction approach and browser console script pattern
- `https://fx64b.dev/projects/skool-loom-dl` — Skool DOM scraping and auth cookie approach
- `https://community.atlassian.com/forums/Loom-questions/Is-it-normal-that-transcript-generation-takes-over-an-hour-for-a/qaq-p/3121744` — Loom transcript generation delays and failures
- NEXUSSUM paper (ACL 2025) — Hierarchical LLM summarization for long-form content
- `https://biztechmagazine.com/article/2025/08/llm-hallucinations-what-are-implications-financial-institutions` — 6-17% hallucination rate on domain-specific financial content

### Tertiary (LOW confidence — needs validation)
- Single source on `connect.sid` cookie requirement for private/embedded Loom videos — validate in Phase 1
- `https://apify.com/neatrat/loom-transcript-scraper` — Confirms GraphQL feasibility via third-party implementation; internal details unknown

---
*Research completed: 2026-03-01*
*Ready for roadmap: yes*
