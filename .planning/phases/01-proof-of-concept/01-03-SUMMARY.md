---
phase: 01-proof-of-concept
plan: "03"
subsystem: extraction
tags: [skool, enrichment, sections, loom, browser-console, next-data]

# Dependency graph
requires:
  - phase: 01-proof-of-concept-plan-01
    provides: output/manifest.json with 95 lessons
  - phase: 01-proof-of-concept-plan-02
    provides: validation and batch test scripts

provides:
  - scripts/enrich-manifest.js — browser console script that reads course tree from __NEXT_DATA__
  - scripts/enrich-download.js — variant that downloads manifest as file
  - output/manifest.json — enriched with 13 real sections and 74/95 loomIds

affects:
  - 01-04 re-validation
  - 02-pipeline-architecture

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Skool __NEXT_DATA__ course tree: pageProps.course.children[] (unitType:set = section, unitType:module = lesson)"
    - "Loom IDs in metadata.videoLink as /share/ URLs, not /embed/"
    - "Course tree available on any lesson page, not on classroom listing page"
    - "Download via Blob + URL.createObjectURL more reliable than clipboard copy()"

key-files:
  created:
    - scripts/enrich-manifest.js
    - scripts/enrich-download.js
  modified:
    - output/manifest.json

key-decisions:
  - "Rewrote enrichment approach: read full course tree from single page __NEXT_DATA__ instead of fetching 95 individual lesson pages"
  - "Loom share URLs use /share/<id> format, not /embed/<id> — regex updated to match both"
  - "21/95 videos have no loomId — these legitimately lack Loom embeds (text-only, coming soon, or different player)"
  - "Added file download fallback (enrich-download.js) after clipboard copy proved unreliable"

patterns-established:
  - "Skool course structure: root -> sets (sections) -> modules (lessons), all in __NEXT_DATA__"
  - "For browser console scripts, file download is more reliable than copy() to clipboard"

requirements-completed: [EXTR-01, EXTR-02, EXTR-03]

# Metrics
duration: 15min
completed: 2026-03-01
---

# Phase 01 Plan 03: Browser Enrichment Script Summary

**Enriched manifest with 13 real sections and 74/95 loom IDs by reading Skool's course tree from __NEXT_DATA__ — closes all section and loomId gaps from verification**

## Performance

- **Duration:** 15 min (including debugging DOM structure)
- **Started:** 2026-03-01T13:46:00Z
- **Completed:** 2026-03-01T14:00:00Z
- **Tasks:** 2/2 complete (1 auto + 1 human-action checkpoint)
- **Files modified:** 3

## Accomplishments

- Created `scripts/enrich-manifest.js` (v2) — reads full course tree from `__NEXT_DATA__.props.pageProps.course.children` on any Skool lesson page, instant results
- Extracted 13 real section names: "Introduction to the Course", "The Basics", "Mindset", "Market Psychology", "Understanding Crypto Cycles + Price Action", "Do-NOT-Do-List", "Fundamental Analysis", "Technical Analysis", "Building a Strategy/Edge", "Scams to Avoid", "Taxes and Banking Infrastructure", "Putting Everything Together (Coming Soon)", "Best Online Income Sources To Get $ For Crypto"
- Extracted 74/95 loom video IDs from `metadata.videoLink` share URLs
- User ran script on authenticated Skool page and saved enriched manifest

## Task Commits

1. **Task 1: Create browser console enrichment script** - `5604761` (v1) + `7e26e56` (v2 rewrite with sections and loom fix)
2. **Task 2: User runs enrichment script** - Checkpoint completed, manifest saved and verified

## Files Created/Modified

- `scripts/enrich-manifest.js` — v2 enrichment script: reads course tree from __NEXT_DATA__, extracts sections (unitType:set) and lessons (unitType:module), matches loom IDs from /share/ URLs
- `scripts/enrich-download.js` — download variant for clipboard reliability issues
- `output/manifest.json` — 13 sections, 95 videos, 74 with loomIds

## Decisions Made

- **Rewrote extraction approach after diagnostic:** Original plan called for fetching 95 individual lesson pages. Diagnostic revealed the full course tree is available in `__NEXT_DATA__` on any single lesson page — instant extraction, no rate limiting needed.
- **Loom URL format:** Videos use `/share/<id>` not `/embed/<id>`. Updated regex to match both patterns.
- **21 videos without loomId are legitimate:** These are text-only lessons, "coming soon" placeholders, or use a different video player.

## Deviations from Plan

- **Major approach change:** Plan specified per-lesson fetch with 500ms delays (~48s). Actual implementation reads entire course tree from single page — instant results. Strictly better.
- **Added download variant:** Clipboard `copy()` proved unreliable. Created `enrich-download.js` that triggers browser file download.

## Issues Encountered

- **v1 script failed:** `querySelectorAll('a[href*="md="]')` found 0 links — Skool classroom listing page doesn't show lesson links until you click into the course
- **v1 fetched pages had wrong structure:** `pageProps.course.children` not on listing page, only on lesson pages. Added auto-fetch fallback.
- **Clipboard overwrite:** User's clipboard was replaced before pasting. Solved by creating download variant.

## Self-Check: PASSED

- [x] 13 sections extracted (target: ~13) ✓
- [x] 74/95 loomIds populated (target: majority) ✓
- [x] Manifest saved to output/manifest.json ✓
- [x] Verified: `Sections: 13 Videos: 95 WithLoom: 74` ✓

---
*Phase: 01-proof-of-concept*
*Completed: 2026-03-01*
