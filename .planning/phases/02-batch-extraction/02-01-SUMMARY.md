---
phase: 02-batch-extraction
plan: "01"
subsystem: extraction
tags: [loom, graphql, vtt, markdown, batch-pipeline, node-fetch, checkpoint, rate-limiting]

requires:
  - phase: 01-proof-of-concept
    provides: output/manifest.json with 95 videos across 13 sections and proven Loom GraphQL pattern

provides:
  - "scripts/extract-transcripts.mjs: full batch extraction pipeline with checkpoint/resume"
  - "output/transcripts/: 12 numbered section folders with 95 markdown files"
  - "output/progress.json: checkpoint tracking all 95 completed mdIds"
  - "output/missing-transcripts.log: 21 null-loomId videos logged with timestamps"
affects: [03-summarization, 04-playbook]

tech-stack:
  added: []
  patterns:
    - "Atomic progress checkpoint: write to .tmp then renameSync to final path"
    - "ESM slugify: toLowerCase+replace(/[^a-z0-9]+/g,'-') truncated at 80 chars"
    - "Loom GraphQL: plain object body (not array), no x-loom-request-source header"
    - "VTT parsing: filter arrow lines, cue numbers, WEBVTT/NOTE, strip voice tags"
    - "mdId as checkpoint key (not loomId — loomId can be null for multiple videos)"
    - "2500ms inter-request delay + exponential backoff 5s->60s, 3 retries"

key-files:
  created:
    - "scripts/extract-transcripts.mjs"
    - "output/progress.json"
    - "output/missing-transcripts.log"
    - "output/transcripts/ (12 folders, 95 markdown files)"
  modified: []

key-decisions:
  - "Section 12 (Putting Everything Together, 0 videos) produces no folder — acceptable per plan"
  - "74 Loom fetches completed with 0 failures — 2500ms delay sufficient, no rate limiting triggered"
  - "Use mdId (not loomId) as checkpoint key since loomId can be null for multiple videos"

patterns-established:
  - "Markdown with transcript: title + section + loomId header, then ## Transcript section"
  - "Stub markdown: title + section header, ## Transcript with *No transcript available: no Loom video ID*"
  - "Missing log: tab-separated ISO timestamp, reason, section, title, loomId"
  - "Folder naming: NN-slug (2-digit pad), file naming: NN-slug.md"

requirements-completed: [EXTR-04, EXTR-05, EXTR-06, MKDN-01, MKDN-02, MKDN-03]

duration: 7min
completed: 2026-03-01
---

# Phase 2 Plan 01: Batch Extraction Summary

**Loom GraphQL batch extraction pipeline producing 95 markdown files across 12 numbered section folders, with atomic checkpoint/resume, 2500ms rate limiting, and stub generation for 21 null-loomId videos — zero fetch failures**

## Performance

- **Duration:** 7 min (script runtime ~4.5 min for 74 fetches, pipeline creation ~2.5 min)
- **Started:** 2026-03-01T14:49:46Z
- **Completed:** 2026-03-01T14:57:08Z
- **Tasks:** 2
- **Files modified:** 98 (1 script + 97 output files)

## Accomplishments

- Created `scripts/extract-transcripts.mjs` (220 lines) implementing all 6 requirements: EXTR-04/05/06, MKDN-01/02/03
- Ran pipeline to completion: 74 Loom transcripts fetched, 21 stub files written, 0 failures, 0 retries needed
- Verified checkpoint/resume: re-running pipeline skips all 95 videos instantly (checkpoint read from progress.json)
- 12 numbered section folders with sortable NN-slug naming convention throughout

## Task Commits

Each task was committed atomically:

1. **Task 1: Create extract-transcripts.mjs pipeline script** - `327d334` (feat)
2. **Task 2: Run the pipeline and verify output structure** - `1ff9e7c` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `scripts/extract-transcripts.mjs` — Batch extraction pipeline: reads manifest, fetches Loom GraphQL, writes markdown, checkpoints progress
- `output/progress.json` — Checkpoint file with 95 completed mdIds
- `output/missing-transcripts.log` — 21 lines, one per null-loomId video (tab-separated: timestamp, reason, section, title, loomId)
- `output/transcripts/01-introduction-to-the-course/` — 1 file (3,031 words transcript)
- `output/transcripts/02-the-basics/` — 4 stub files
- `output/transcripts/03-mindset/` — 22 files (15 with transcripts, 7 stubs)
- `output/transcripts/04-market-psychology/` — 5 files (4 transcripts, 1 stub)
- `output/transcripts/05-understanding-crypto-cycles-price-action/` — 13 files (9 transcripts, 4 stubs)
- `output/transcripts/06-do-not-do-list/` — 8 files (all transcripts)
- `output/transcripts/07-fundamental-analysis/` — 19 files (16 transcripts, 3 stubs)
- `output/transcripts/08-technical-analysis/` — 6 files (all transcripts)
- `output/transcripts/09-building-a-strategy-edge/` — 8 files (7 transcripts, 1 stub)
- `output/transcripts/10-scams-to-avoid/` — 3 files (2 transcripts, 1 stub)
- `output/transcripts/11-taxes-and-banking-infrastructure/` — 5 files (4 transcripts, 1 stub)
- `output/transcripts/13-best-online-income-sources-to-get-for-crypto/` — 1 file (16,179 words transcript)

## Decisions Made

- Section 12 "Putting Everything Together" (0 videos) creates no folder — this is correct behavior per plan ("12-13 folders, either acceptable")
- 2500ms inter-request delay proved sufficient — 0 HTTP 429 or 5xx errors across all 74 Loom fetches
- Used mdId as checkpoint key (not loomId) — critical because loomId is null for 21 videos, so multiple videos share the null value

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all 74 Loom fetches succeeded on first attempt. No rate limiting, no retries required.

## User Setup Required

None — no external service configuration required. Loom GraphQL works without authentication for embedded course videos.

## Next Phase Readiness

- All 95 markdown files ready for Phase 3 summarization
- Transcript content confirmed substantial (74 transcripts ranging from ~1k to 16k words)
- Checkpoint infrastructure means any failed re-runs in Phase 3 can resume cleanly
- Section 12 is a placeholder with no content — summarization can skip it

---
*Phase: 02-batch-extraction*
*Completed: 2026-03-01*
