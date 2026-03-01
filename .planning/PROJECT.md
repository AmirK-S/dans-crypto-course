# Dan's Crypto Course Knowledge Extractor

## What This Is

An automated pipeline that extracts, transcribes, and distills Dan's Bull Run Millions Crypto Course (hosted on Skool with Loom videos) into a structured markdown knowledge base with actionable executive summaries. The end product is a trading playbook and quick-reference system derived from ~80 course videos across 13 sections.

## Core Value

Transform a video course into an actionable, scannable trading playbook — every video transcribed, every section summarized, one master exec summary to rule them all.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Browser script extracts all Loom embed URLs + video titles + section hierarchy from Skool classroom page
- [ ] Script fetches Loom transcripts via API for each video (no video download)
- [ ] Markdown files created per video in correct folder hierarchy matching course structure
- [ ] Each markdown file contains: video title, section, transcript, key takeaways
- [ ] Executive summary generated per section (actionable, focused on execution)
- [ ] Master executive summary generated for entire course
- [ ] Summaries formatted as trading playbook + quick-reference cheat sheets
- [ ] Pipeline is automated end-to-end (paste structure in, get knowledge base out)

### Out of Scope

- Downloading video files — transcripts only, saves storage
- Real-time sync with course updates — one-time extraction
- Building a web UI — markdown files are the deliverable
- Mobile app — files consumed as-is or in any markdown reader

## Context

**Source:** Dan's Bull Run Millions Crypto Course on Skool (https://www.skool.com/bullrun-millions-crypto-course-9312/classroom)
**Video hosting:** Loom (embed format: `loom.com/embed/{id}`)
**Authentication:** User is logged into Skool with active membership
**Transcript source:** Loom's built-in auto-generated transcripts (fallback: Whisper if needed)

**Course Structure (~80 videos, 13 sections):**
1. Introduction to the Course (1 video)
2. The Basics (3-4 videos)
3. Mindset (18 videos)
4. Market Psychology (5 videos)
5. Understanding Crypto Cycles + Price Action (13 videos)
6. Do-NOT-Do-List (8 videos)
7. Fundamental Analysis (18 videos)
8. Technical Analysis (6 videos)
9. Building a Strategy/Edge (8 videos)
10. Scams to Avoid (3 videos)
11. Taxes and Banking Infrastructure (5 videos)
12. Putting Everything Together (coming soon)
13. Best Online Income Sources (2 videos)

**Loom embed example:** `https://www.loom.com/embed/13f9e28d4c434a878b8416bd8c364af3?autoplay=0&hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true`

## Constraints

- **Platform access:** Skool requires active login — browser script runs in authenticated session
- **Loom API:** Transcript availability depends on Loom having processed transcripts for each video
- **Rate limiting:** Loom may rate-limit transcript fetches — script needs to handle gracefully
- **Summaries:** Using AI API for exec summaries — requires API key or local processing

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Skip video downloads | Only transcripts needed, saves significant storage | — Pending |
| Loom transcripts over Whisper | Faster, no download needed, good enough quality | — Pending |
| Browser script for URL extraction | Skool is behind auth, browser console is simplest access method | — Pending |
| Markdown as output format | Universal, portable, works everywhere, easy to grep/search | — Pending |
| Exec summaries = playbook + cheat sheets | User wants both quick reference and actionable system | — Pending |

---
*Last updated: 2026-03-01 after initialization*
