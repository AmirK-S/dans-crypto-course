---
phase: 03-ai-summarization
plan: 01
subsystem: data-preparation
tags: [ai-vendor-sdk, transcript-cleaning, node-esm, regex, filler-words, loom-vtt]

requires:
  - phase: 02-batch-extraction
    provides: 95 transcript markdown files in output/transcripts/ with real content

provides:
  - "ai-sdk installed in package.json for Phase 3 summarization API calls"
  - "scripts/clean-transcripts.mjs — idempotent in-place transcript cleaning script"
  - "All 95 transcript files cleaned: no filler words, no Loom VTT artifacts, no Skool boilerplate"

affects:
  - 03-ai-summarization (Plan 02 uses ai-sdk and clean transcripts)
  - 04-key-takeaways (benefits from pre-cleaned transcripts, fewer tokens wasted)

tech-stack:
  added:
    - "ai-sdk@0.78.0"
  patterns:
    - "ESM script reads all .md recursively, extracts body after heading, cleans, writes back in-place"
    - "Regex cleaning order: VTT artifacts first, then fillers, then pause dots, then boilerplate, then space collapse"
    - "Idempotent design: second run always reports 0 modified files"

key-files:
  created:
    - scripts/clean-transcripts.mjs
  modified:
    - package.json (added ai-sdk dependency)
    - package-lock.json
    - output/transcripts/**/*.md (73 of 95 files cleaned in-place)

key-decisions:
  - "In-place cleaning chosen over runtime-only: permanently satisfies MKDN-04 and reduces API token waste"
  - "See you next regex extended to next(?:\\s+\\w+)? to handle See you next time! variant"
  - "Only body text after ## Transcript or ## Content heading is cleaned — metadata headers preserved"

patterns-established:
  - "Transcript cleaning: extract heading → clean body → reconstruct → write back in-place"
  - "Filler regex: word-boundary-scoped to prevent matching substrings of legitimate words"

requirements-completed: [MKDN-04]

duration: 6min
completed: 2026-03-02
---

# Phase 3 Plan 01: SDK Install + Transcript Cleaning Summary

**ai-sdk installed and all 95 transcript files cleaned in-place: filler words (uh/uhm/umm), Loom VTT artifacts (Thanks watching, See you next time, We'll see you), and Skool navigation boilerplate removed using word-boundary-safe regex patterns**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-01T17:43:58Z
- **Completed:** 2026-03-01T17:50:03Z
- **Tasks:** 2
- **Files modified:** 76 (73 transcript .md files + package.json + package-lock.json + scripts/clean-transcripts.mjs)

## Accomplishments

- Installed `ai-sdk@0.78.0` in package.json — ready for Plan 03-02 summarization calls
- Created `scripts/clean-transcripts.mjs` — idempotent Node.js ESM script cleaning all 95 transcript files
- Cleaned 73 of 95 files (22 skipped as already clean): 5,428 total characters removed
- All 6 artifact grep checks return 0 matches: uhm, umm, Thanks watching, We'll see you, See you next, Bullrun Millions Crypto Course
- Metadata headers (title, section, Loom ID/source) preserved in all files
- Word count: 310,845 total (exceeds 300,000 minimum — no significant content loss)
- Script verified idempotent: second run always reports 0 files modified

## Task Commits

Each task was committed atomically:

1. **Task 1: Install AI SDK and create transcript cleaning script** - `7fbbf40` (feat)
2. **Task 2: Fix See you next time! regex — re-clean 3 affected files** - `0e3d036` (fix)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `scripts/clean-transcripts.mjs` - In-place transcript cleaning script with regex patterns for all artifact types
- `package.json` - Added ai-sdk@^0.78.0 dependency
- `package-lock.json` - Updated with new SDK package tree
- `output/transcripts/**/*.md` - 73 files cleaned in-place (22 skipped, no changes needed)

## Decisions Made

- **In-place cleaning over runtime-only:** Permanently satisfies MKDN-04, reduces token waste for summarization, benefits Phase 4 key takeaways
- **Extended See you next regex:** Added `(?:\s+\w+)?` after "next" to consume variants like "See you next time!" — fixes stranded word artifact
- **Metadata preservation:** Only body text after `## Transcript` or `## Content` heading is cleaned; full metadata header preserved exactly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed See you next time! leaving stranded time! artifact**
- **Found during:** Task 2 verification (checking cleaning quality)
- **Issue:** Original regex `\bSee\s+you\s+(?:in\s+the\s+)?next(?:\s+one)?\b` only handled "next one" variant, not "next time". Three files had "See you next time!" VTT injections mid-sentence, leaving " time!" stranded
- **Fix:** Extended regex to `\bSee\s+you\s+(?:in\s+the\s+)?next(?:\s+\w+)?\b` — consumes any single trailing word after "next"
- **Files modified:** scripts/clean-transcripts.mjs; 3 transcript files restored from git and re-cleaned
- **Verification:** `grep -r ' time!' output/transcripts/` returns 0 results after fix
- **Committed in:** 0e3d036 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in regex pattern)
**Impact on plan:** Essential correctness fix — prevented partial artifact removal from leaving orphaned words. No scope creep.

## Issues Encountered

- "See you next time!" was a VTT artifact variant not listed in the plan's 5 specified patterns. Discovered during Task 2 verification grep. Fixed via Rule 1 auto-fix without user input. Three files affected.

## User Setup Required

None - no external service configuration required. Script runs fully locally with Node.js built-ins.

## Next Phase Readiness

- `ai-sdk@0.78.0` installed and ready for Plan 03-02 summarization API calls
- All 95 transcript files cleaned — no token waste on filler words in API calls
- MKDN-04 permanently satisfied — transcripts cleaned in-place
- `scripts/clean-transcripts.mjs` can be re-run anytime without risk (idempotent)

## Self-Check: PASSED

- FOUND: scripts/clean-transcripts.mjs
- FOUND: .planning/phases/03-ai-summarization/03-01-SUMMARY.md
- FOUND: ai-sdk in package.json
- FOUND: commit 7fbbf40 (Task 1)
- FOUND: commit 0e3d036 (Task 2 fix)
- FOUND: commit b516ed2 (metadata)

---
*Phase: 03-ai-summarization*
*Completed: 2026-03-02*
