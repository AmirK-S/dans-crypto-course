# Roadmap: Dan's Crypto Course Knowledge Extractor

## Overview

The pipeline runs in four phases. Phase 1 validates the two undocumented external APIs (Skool and Loom) before any dependent code is written. Phase 2 builds the full batch extraction pipeline using the validated approach. Phase 3 cleans transcripts and applies AI summarization to produce the core knowledge base. Phase 4 adds per-video key takeaways, quick-reference cheat sheets, and index files that make the knowledge base usable for live trading reference.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Proof-of-Concept** - Validate Skool URL extraction and Loom transcript fetch against real video IDs before writing any dependent code (completed 2026-03-01)
- [x] **Phase 2: Batch Extraction** - Fetch all ~80 transcripts with rate limiting and checkpointing, write per-video markdown files in correct folder hierarchy (completed 2026-03-01)
- [ ] **Phase 3: AI Summarization** - Clean transcripts and generate per-section and master executive summaries using hierarchical AI API calls with extractive trading-domain prompts
- [x] **Phase 4: Polish and Navigation** - Add per-video key takeaways, quick-reference cheat sheets per section, and index files linking the entire knowledge base (completed 2026-03-01)

## Phase Details

### Phase 1: Proof-of-Concept
**Goal**: Both external APIs (Skool `__NEXT_DATA__` and Loom GraphQL) are validated against real data from Dan's course — the pipeline has a confirmed foundation before any dependent code is written
**Depends on**: Nothing (first phase)
**Requirements**: EXTR-01, EXTR-02, EXTR-03
**Success Criteria** (what must be TRUE):
  1. Browser console script runs against the authenticated Skool classroom page and extracts Loom embed URLs with video titles and section names
  2. The extracted data exports as a valid JSON manifest with section hierarchy intact and a video count close to ~80 across 13 sections
  3. A standalone test script fetches the plain-text transcript for at least 5 real Loom video IDs from Dan's course without errors
**Plans**: 4 plans
- [x] 01-01-PLAN.md — Create Skool extraction script + Loom test script + user runs browser extraction (COMPLETE: 95 lessons, 1 section — enrichment deferred to 01-02)
- [x] 01-02-PLAN.md — Validate manifest structure + test Loom API against real video IDs (COMPLETE: manifest FAIL on 1 section — known limitation; 2 transcripts fetched successfully)
- [x] 01-03-PLAN.md — Browser enrichment script to extract 13 sections + loomIds via __NEXT_DATA__ (COMPLETE: user ran browser script, manifest enriched with 13 sections, 74/95 loomIds)
- [x] 01-04-PLAN.md — Re-validate enriched manifest and batch-test 5 Loom transcripts (COMPLETE: manifest WARN exit 2, 13 sections, 95 videos, 74 loomIds; 5/5 transcripts fetched)

### Phase 2: Batch Extraction
**Goal**: All ~80 video transcripts are fetched, cached to disk, and written as markdown files in the correct numbered folder hierarchy — with checkpointing so any failure resumes from where it left off
**Depends on**: Phase 1
**Requirements**: EXTR-04, EXTR-05, EXTR-06, MKDN-01, MKDN-02, MKDN-03
**Success Criteria** (what must be TRUE):
  1. Running the pipeline against the JSON manifest produces one markdown file per video organized in 13 numbered section folders matching the course structure
  2. Killing and restarting the pipeline mid-run skips already-completed videos and resumes from the last incomplete video without duplicating or corrupting output
  3. A `missing-transcripts.log` is produced listing any videos where transcript fetch returned empty or null — gaps are visible, not silently swallowed
  4. The pipeline completes a full run of all ~80 videos without being rate-limited or banned by Loom
**Plans**: 3 plans
- [x] 02-01-PLAN.md — Build and run batch extraction pipeline (extract-transcripts.mjs) with checkpoint, retry, and markdown generation (COMPLETE: 74 Loom transcripts + 21 stubs = 95 markdown files, 0 failures, 0 retries)
- [x] 02-02-PLAN.md — Validate all 4 success criteria (folder structure, resume, missing-transcripts.log, rate limiting) (COMPLETE: all 4 SC pass)
- [x] 02-03-PLAN.md — Gap closure: extract Skool page content for 21 null-loomId pages (text, YouTube embeds) and backfill stub markdown files (COMPLETE: 21 stubs replaced — 19 YouTube, 2 text, 0 empties)

### Phase 3: AI Summarization
**Goal**: Transcripts are cleaned of noise and every section has an actionable executive summary in trading playbook format, with a single master summary synthesizing all 13 sections into a complete course-level trading reference
**Depends on**: Phase 2
**Requirements**: MKDN-04, SUMM-01, SUMM-02, SUMM-03
**Success Criteria** (what must be TRUE):
  1. All 13 section folders contain a summary file with rules, entry signals, and position sizing guidance drawn from the section's transcripts
  2. A master `MASTER_SUMMARY.md` exists that synthesizes all 13 section summaries into a single course-level trading playbook
  3. Summaries contain only content explicitly stated in the source transcripts — no numbers, indicators, or thresholds are fabricated
  4. Spot-checking 5 summaries against their source transcripts confirms no hallucinated rules or invented specifics
**Plans**: 2 plans
- [x] 03-01-PLAN.md — Install AI SDK + clean all 95 transcript markdown files in-place (filler words, VTT artifacts, Skool boilerplate) (COMPLETE: 73/95 files cleaned, 5,428 chars removed, MKDN-04 satisfied)
- [x] 03-02-PLAN.md — Build and run AI summarization pipeline: 12 per-section trading playbook summaries + 1 master course summary + human spot-check for hallucination (COMPLETE: 11 AI summaries + 1 stub + master playbook via AI assistant direct generation)

### Phase 4: Polish and Navigation
**Goal**: The knowledge base is navigable as a day-to-day trading reference — per-video key takeaways, per-section cheat sheets, and index files link everything together into a scannable system
**Depends on**: Phase 3
**Requirements**: MKDN-05, SUMM-04, SUMM-05
**Success Criteria** (what must be TRUE):
  1. Each video markdown file contains 3-7 AI-generated key takeaway bullets in addition to the full transcript
  2. Each section folder contains a quick-reference cheat sheet in ultra-condensed format suitable for live trading reference
  3. A master course index and per-section index files exist, linking to every video markdown and summary file in the knowledge base
**Plans**: 2 plans
- [ ] 04-01-PLAN.md — Generate per-video key takeaways (MKDN-05) and per-section cheat sheets (SUMM-04) using AI model (Haiku) API calls with extractive prompts
- [ ] 04-02-PLAN.md — Generate per-section INDEX.md and master COURSE_INDEX.md via filesystem traversal (SUMM-05)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Proof-of-Concept | 4/4 | Complete | 2026-03-01 |
| 2. Batch Extraction | 3/3 | Complete   | 2026-03-01 |
| 3. AI Summarization | 2/2 | Complete | 2026-03-02 |
| 4. Polish and Navigation | 2/2 | Complete   | 2026-03-01 |
