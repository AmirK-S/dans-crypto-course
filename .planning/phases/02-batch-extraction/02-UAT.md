---
status: complete
phase: 02-batch-extraction
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md
started: 2026-03-01T15:10:00Z
updated: 2026-03-01T15:25:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Transcript Folder Structure
expected: 12 numbered section folders exist in output/transcripts/ with NN-slug naming. Section 12 has no folder (0 videos — expected).
result: pass

### 2. Transcript File Count
expected: 95 total markdown files across all 12 folders.
result: pass

### 3. Transcript Content Format
expected: Transcript markdown file contains title, section header, loomId, and ## Transcript section with actual spoken text.
result: pass

### 4. Stub File for Null-LoomId Videos
expected: Stub file contains title and section header with ## Transcript saying *No transcript available: no Loom video ID*.
result: pass

### 5. Missing Transcripts Log
expected: output/missing-transcripts.log exists with 21 lines, tab-separated fields.
result: pass

### 6. Checkpoint Resume
expected: Re-running extraction script skips all 95 videos (0 fetches), completes instantly.
result: pass

### 7. Validation Script Passes
expected: Running validate-extraction.mjs shows all 4 SC passing with exit code 0.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "21 null-loomId pages contain text content and/or YouTube video embeds that should be captured"
  status: failed
  reason: "User reported: pages have real content (text or YouTube links) but pipeline writes empty stubs saying 'no transcript available'"
  severity: major
  test: user-reported
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
