# Requirements: Dan's Crypto Course Knowledge Extractor

**Defined:** 2026-03-01
**Core Value:** Transform a video course into an actionable, scannable trading playbook — every video transcribed, every section summarized, one master exec summary to rule them all.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Extraction

- [x] **EXTR-01**: Browser script extracts all Loom embed URLs from Skool classroom page via DOM scraping
- [x] **EXTR-02**: Browser script captures video title, section name, and ordering for each video
- [x] **EXTR-03**: Script outputs structured JSON manifest (section → videos with Loom IDs)
- [x] **EXTR-04**: Loom transcript fetched per video via GraphQL endpoint (no video download)
- [x] **EXTR-05**: Progress state file tracks completed video IDs (resume on failure)
- [x] **EXTR-06**: Rate limiting with exponential backoff between Loom API calls

### Markdown Generation

- [x] **MKDN-01**: Per-video markdown file created with title, section, and full transcript
- [x] **MKDN-02**: Files organized in folder hierarchy matching course structure (13 sections)
- [x] **MKDN-03**: Filenames are sortable with numeric prefixes (01-, 02-)
- [x] **MKDN-04**: Transcript cleaned of filler words before inclusion
- [x] **MKDN-05**: AI-generated key takeaways (3-7 bullets) included per video

### Summarization

- [x] **SUMM-01**: Executive summary generated per section (13 total)
- [x] **SUMM-02**: Master executive summary generated for entire course
- [x] **SUMM-03**: Summaries use trading playbook format (rules, signals, position sizing)
- [x] **SUMM-04**: Quick-reference cheat sheet generated per section
- [x] **SUMM-05**: Section index files + master course index auto-generated

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Processing

- **ENHC-01**: Whisper fallback for videos missing Loom transcripts
- **ENHC-02**: Re-run automation for course updates (detect new videos)
- **ENHC-03**: Iterative prompt refinement based on summary quality feedback

## Out of Scope

| Feature | Reason |
|---------|--------|
| Video file downloading | Transcripts only — knowledge is in the words, not the video |
| Real-time sync with Skool | One-time extraction; course is effectively static |
| Semantic search / vector DB | Grep/ripgrep on 80 markdown files is sufficient |
| Web UI or viewer | Markdown renders in Obsidian, VS Code, any reader |
| Speaker diarization | Single-speaker videos — no value |
| Multi-language translation | Course is English for English audience |
| Automated Skool login | Anti-bot measures make headless auth fragile; browser console is simpler |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXTR-01 | Phase 1 | Complete (01-01) |
| EXTR-02 | Phase 1 | Complete (01-01) |
| EXTR-03 | Phase 1 | Complete (01-01) |
| EXTR-04 | Phase 2 | Complete (02-01) |
| EXTR-05 | Phase 2 | Complete (02-01) |
| EXTR-06 | Phase 2 | Complete (02-01) |
| MKDN-01 | Phase 2 | Complete (02-01) |
| MKDN-02 | Phase 2 | Complete (02-01) |
| MKDN-03 | Phase 2 | Complete (02-01) |
| MKDN-04 | Phase 3 | Complete |
| MKDN-05 | Phase 4 | Complete |
| SUMM-01 | Phase 3 | Complete (03-02) |
| SUMM-02 | Phase 3 | Complete (03-02) |
| SUMM-03 | Phase 3 | Complete (03-02) |
| SUMM-04 | Phase 4 | Complete |
| SUMM-05 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after 02-01 execution (EXTR-04, EXTR-05, EXTR-06, MKDN-01, MKDN-02, MKDN-03 complete)*
