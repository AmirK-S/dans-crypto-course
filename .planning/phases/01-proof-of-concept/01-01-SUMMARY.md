---
phase: 01-proof-of-concept
plan: "01"
subsystem: extraction
tags: [node-fetch, loom, skool, graphql, vtt, browser-console, esm]

# Dependency graph
requires: []
provides:
  - Browser console IIFE script (extract-skool.js) that scrapes all lesson links from Skool DOM into a structured JSON manifest
  - Node.js ESM script (test-loom-api.mjs) that validates Loom GraphQL transcript API and parses VTT to clean plain text
  - output/manifest.json with 95 lesson mdIds and titles — ready for Plan 01-02 enrichment
  - ESM project scaffolding with node-fetch v3
affects:
  - 01-02 (uses manifest.json + loom API pattern for per-lesson enrichment)
  - all downstream pipeline phases

# Tech tracking
tech-stack:
  added:
    - node-fetch v3.3.0 (ESM-only fetch for Node.js)
  patterns:
    - Loom FetchVideoTranscript GraphQL query pattern (POST to https://www.loom.com/graphql, access data.fetchVideoTranscript)
    - VTT parsing: strip timestamps, voice tags (<v N>), inline cue numbers, empty lines -> join to plain text
    - Browser IIFE pattern: self-contained no-import script for console pasting

key-files:
  created:
    - scripts/extract-skool.js
    - scripts/test-loom-api.mjs
    - package.json
    - output/manifest.json
  modified: []

key-decisions:
  - "Loom GraphQL body must be plain object NOT array (Pitfall 1 from research confirmed)"
  - "Access data.fetchVideoTranscript not data[0].data (research anti-pattern successfully avoided)"
  - "VTT parser must strip Loom voice tags (<v N>) AND leading cue numbers — not documented in research"
  - "Loom transcription_status is 'success' not 'completed' for processed transcripts"
  - "Skool DOM heading detection failed — section grouping deferred to Plan 01-02 (per-lesson page navigation)"
  - "Loom embeds only present on individual lesson pages — loomId extraction deferred to Plan 01-02 enrichment step"

patterns-established:
  - "Loom GraphQL: POST single object body, no x-loom-request-source header, access data.fetchVideoTranscript"
  - "VTT clean parse: filter timestamps/empty/numbers, strip XML voice tags, strip leading cue numbers, join with space"

requirements-completed:
  - EXTR-01
  - EXTR-02
  - EXTR-03

# Metrics
duration: 6min
completed: 2026-03-01
---

# Phase 01 Plan 01: Skool Extraction + Loom API Validation Summary

**Browser IIFE extracts 95 course lessons with mdIds from Skool, Loom GraphQL transcript fetch validated (5,558 words from example video) — both data pipelines proven**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-01T12:13:46Z
- **Completed:** 2026-03-01T12:52:00Z
- **Tasks:** 3/3 complete
- **Files modified:** 5

## Accomplishments
- ESM project scaffolded with node-fetch v3
- Browser IIFE extraction script scrapes all lesson links via `querySelectorAll('a[href*="md="]')`, deduplicates by mdId, outputs clipboard-ready JSON manifest
- Node.js Loom GraphQL test script validated against real course video — fetches and parses full transcript (5,558 clean words from video 13f9e28d4c434a878b8416bd8c364af3)
- User ran browser script on live authenticated Skool page — `output/manifest.json` produced with 95 lesson titles and mdIds
- Two known limitations documented: section grouping collapsed to 1 section (Skool heading DOM not matched), loomIds null for 94/95 videos (embeds only on individual lesson pages — expected, deferred to 01-02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create project setup and browser console extraction script** - `f1b0b1a` (feat)
2. **Task 2: Create Node.js Loom GraphQL transcript test script** - `caa96c8` (feat)
3. **Task 3: User runs browser extraction script — manifest saved** - `db234d4` (feat)

**Plan metadata:** `9505b96` + updated final commit (docs)

## Files Created/Modified
- `package.json` — ESM project config, node-fetch v3 dependency
- `package-lock.json` — Lock file from npm install
- `scripts/extract-skool.js` — Browser IIFE console script for Skool DOM extraction
- `scripts/test-loom-api.mjs` — Node.js ESM Loom GraphQL transcript test
- `output/manifest.json` — 95 lessons with mdIds, 1 section (Unknown Section), 1 loomId

## Decisions Made
- Loom GraphQL request body is a plain object not an array — research Pitfall 1 confirmed in production
- Correct response path is `data.fetchVideoTranscript` not `data[0].data` — anti-pattern successfully avoided
- Loom's `transcription_status` returns `"success"` for fully processed transcripts (not `"completed"` as initially expected from research)
- Section grouping strategy (DOM heading walk) failed against Skool's actual rendered structure — Plan 01-02 will extract section names by navigating individual lesson pages via mdId and reading the breadcrumb or `__NEXT_DATA__` on that page
- LoomId enrichment deferred to Plan 01-02: each lesson page at `?md=<mdId>` contains the Loom embed iframe; script will visit each and extract the loomId from iframe src

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed VTT parser to strip Loom-specific voice tags and leading cue numbers**
- **Found during:** Task 2 verification (test-loom-api.mjs live run)
- **Issue:** Research specified a VTT parser using `.filter(!line.match(/^\d+$/))` but Loom's VTT format uses `<v N>text</v>` voice spans and prepends cue sequence numbers inline with caption text (e.g. `1 Alright guys...`). Raw output had cue numbers embedded throughout.
- **Fix:** Added `.replace(/<v[^>]*>/g, '').replace(/<\/v>/g, '')` for voice tags, `.replace(/<\/?[a-z][^>]*>/g, '')` for other VTT inline tags, `.replace(/^\d+\s+/, '')` to strip leading cue numbers per line
- **Files modified:** `scripts/test-loom-api.mjs`
- **Verification:** Re-ran test script — output is clean natural language (29,523 chars, 5,558 words, reads as continuous prose)
- **Committed in:** `caa96c8` (Task 2 commit)

### Known Limitations (Deferred to Plan 01-02)

**2. Section grouping collapsed to 1 section ("Unknown Section")**
- **Found during:** Task 3 (user ran browser script on live Skool page)
- **Issue:** The DOM heading walk (`findSectionHeading`) did not match Skool's actual heading structure. All 95 lessons ended up grouped as "Unknown Section". Skool likely renders section containers with dynamically generated class names or non-heading tags that don't expose `h2/h3/h4` above lesson anchors.
- **Impact:** manifest.json has 1 section instead of ~13. Section names and per-section ordering are unknown.
- **Deferred to:** Plan 01-02 will navigate to each `?md=<mdId>` lesson page and extract the section label from the breadcrumb or `__NEXT_DATA__` on that page — more reliable than root-page DOM scraping.

**3. loomIds null for 94/95 videos**
- **Found during:** Task 3 (user ran browser script on live Skool page)
- **Issue:** Loom embeds (`<iframe src*="loom.com/embed">`) are only rendered on individual lesson pages, not the classroom root. The script's own comments anticipated this and documented it as expected behavior.
- **Impact:** Only 1 loomId captured (first video happened to be pre-loaded when user was on that lesson). 94/95 need enrichment.
- **Deferred to:** Plan 01-02 enrichment step visits each lesson page via `?md=<mdId>` and extracts the loomId from the iframe src.

---

**Total deviations:** 1 auto-fixed (Rule 1 — VTT parser bug), 2 known limitations deferred to Plan 01-02
**Impact on plan:** Auto-fix essential for clean transcript output. Limitations are expected Phase 1 constraints — Plan 01-02 is designed to resolve both (per-lesson page enrichment for section names and loomIds). Core manifest data (95 mdIds + titles) is valid and sufficient to proceed.

## Issues Encountered
- Loom CDN VTT URLs use signed CloudFront policies that expire within seconds — expected behavior, pipeline fetches VTT immediately after receiving captions_source_url. Script does this correctly.
- Skool's classroom URL at extraction time included a `?md=` parameter (user was viewing a lesson page). Script still found all 95 lesson anchors because the sidebar remained visible. `courseUrl` in manifest reflects this.

## User Setup Required

None additional — Task 3 human action is complete. `output/manifest.json` saved with 95 lessons.

## Next Phase Readiness
- `output/manifest.json` has all 95 mdIds with lesson titles — ready as input for Plan 01-02
- Loom GraphQL API pattern validated and working — ready for batch use in Plan 01-02
- Plan 01-02 must: (1) visit each `?md=<mdId>` lesson page to extract loomId + section name, (2) validate transcript fetches for 5+ real video IDs from Dan's course
- Plan 01-02 will require another browser console script or headless approach for per-lesson page visits (authenticated session needed)

---
*Phase: 01-proof-of-concept*
*Completed: 2026-03-01*

## Self-Check: PASSED

- FOUND: package.json
- FOUND: scripts/extract-skool.js
- FOUND: scripts/test-loom-api.mjs
- FOUND: output/manifest.json (95 videos, 1 section, 1 loomId)
- FOUND: .planning/phases/01-proof-of-concept/01-01-SUMMARY.md
- Commit f1b0b1a: Task 1 — verified in git log
- Commit caa96c8: Task 2 — verified in git log
- Commit db234d4: Task 3 — verified in git log
