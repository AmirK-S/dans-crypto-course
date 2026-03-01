---
phase: 01-proof-of-concept
plan: "02"
subsystem: extraction
tags: [loom, graphql, vtt, skool, manifest, validation, node-fetch]

# Dependency graph
requires:
  - phase: 01-proof-of-concept-plan-01
    provides: output/manifest.json with 95 lessons and 1 loomId, validated Loom GraphQL approach

provides:
  - scripts/validate-manifest.mjs — structural validation of manifest.json with exit codes 0/1/2
  - scripts/test-loom-batch.mjs — batch Loom transcript API test with per-video results
  - output/loom-test-results.json — confirmed 2 transcripts fetched successfully

affects:
  - 02-pipeline-architecture
  - loom-enrichment-pass
  - section-extraction-enrichment

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "VTT-to-text parser: strip WEBVTT header, timestamps, cue IDs, voice tags (<v N>), inline tags"
    - "Loom GraphQL body as plain object (not array), no version headers — confirmed working"
    - "2-second delay between Loom API requests for rate limit safety in PoC phase"
    - "Exit code conventions: 0=PASS, 1=FAIL, 2=WARN/PARTIAL"

key-files:
  created:
    - scripts/validate-manifest.mjs
    - scripts/test-loom-batch.mjs
    - output/loom-test-results.json
  modified: []

key-decisions:
  - "Manifest validation exits FAIL (exit 1) due to 1 section vs expected ~13 — this is correct behavior, not a script bug; root Skool page doesn't render section headings"
  - "Loom batch test only tested 2 IDs (1 manifest loomId + 1 known fallback) because manifest only extracted 1 loomId; root page doesn't render Loom iframes"
  - "Both tested transcripts returned transcription_status=success and full VTT content — Loom API works without auth for these videos"
  - "Phase 2 must enrich manifest with per-lesson page visits to extract real section names and loomIds"

patterns-established:
  - "Validation scripts: structural checks first, then completeness thresholds (< 5 sections = FAIL, < 10 = WARN)"
  - "Batch API tests: use manifest IDs when available, fall back to CLI args, then to known fallback ID"

requirements-completed: [EXTR-01, EXTR-02, EXTR-03]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 1 Plan 2: Manifest Validation and Loom Batch Test Summary

**Manifest structure validated (FAIL on section count — known limitation) and Loom GraphQL API confirmed working: 2 real transcripts fetched (3,031 and 5,558 words) via VTT pipeline**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T12:57:25Z
- **Completed:** 2026-03-01T13:00:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `scripts/validate-manifest.mjs` — validates JSON structure, section/video ordering, mdId format, loomId format, completeness thresholds with PASS/WARN/FAIL result and exit codes
- Created `scripts/test-loom-batch.mjs` — batch Loom transcript API test that reads manifest loomIds, falls back to CLI args or known example ID, tests each via GraphQL + VTT fetch + parse, writes `output/loom-test-results.json`
- Successfully fetched 2 real Loom transcripts: Introduction (3,031 words from Dan's course) and known example video (5,558 words) — proves end-to-end pipeline is functional

## Task Commits

Each task was committed atomically:

1. **Task 1: Create manifest validation script and run it** - `3c9fffc` (feat)
2. **Task 2: Test Loom transcript API against real video IDs** - `db5405f` (feat)

**Plan metadata:** (docs commit — see final commit below)

## Files Created/Modified

- `scripts/validate-manifest.mjs` — Manifest structural validation script: checks extractedAt, courseUrl, totalVideos, sections array, per-section name/order/videos, per-video title/mdId/order/loomId/loomEmbedUrl, completeness thresholds, duplicate mdId detection
- `scripts/test-loom-batch.mjs` — Batch Loom transcript API test: reads manifest, selects up to 5 IDs across sections, falls back to CLI args or fallback ID, fetches via GraphQL, writes JSON results
- `output/loom-test-results.json` — Test results: 2/2 successful, transcription_status="success" for both

## Decisions Made

- **Manifest validation correctly exits FAIL (exit 1):** The manifest has 1 section ("Unknown Section") which falls below the < 5 threshold that triggers FAIL. This is the correct behavior — the root Skool page doesn't render section headings, so the script accurately diagnoses the extraction gap.
- **Loom batch test tested 2 IDs (not 5):** Manifest only contains 1 loomId (Introduction video). The fallback ID `13f9e28d4c434a878b8416bd8c364af3` from Plan 01-01 was used as the second test. Phase 2 must enrich the manifest by visiting individual lesson pages.
- **Loom API confirmed working without auth:** Both videos returned transcription_status="success" and full captions_source_url. The low-confidence auth concern from Plan 01-01 is partially allayed — at least these 2 videos work without a session cookie.

## Deviations from Plan

None - plan executed exactly as written. The known limitations (1 section, 1 loomId) are pre-existing facts from Plan 01-01, not issues introduced in this plan.

## Issues Encountered

**Expected limitation: Manifest has 1 section, not ~13.** The root Skool classroom page doesn't use h2/h3/h4 headings for section names and doesn't render Loom iframes. This was documented as a known limitation at the end of Plan 01-01. The validation script correctly identifies this as FAIL (< 5 sections threshold).

**Only 2 Loom IDs tested (not 5).** The manifest only has 1 real loomId extracted. The plan explicitly handles this case: "use whatever is available (minimum 1)". The 2nd ID was the known working fallback from Plan 01-01 research. Both returned full transcripts confirming the API pipeline works.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 2 must execute a **manifest enrichment pass** before pipeline development:
1. Browser console script that visits each `?md=<mdId>` lesson page, reads section name from DOM and `__NEXT_DATA__` for `metadata.videoLink` (loomId)
2. Updates manifest.json with real section grouping (~13 sections) and loomIds for all 95 videos
3. Re-run `validate-manifest.mjs` to confirm enriched manifest exits 0 (PASS)

The Loom transcript pipeline itself is proven end-to-end — Phase 2 can proceed to bulk transcript extraction once the manifest is enriched.

---
*Phase: 01-proof-of-concept*
*Completed: 2026-03-01*
