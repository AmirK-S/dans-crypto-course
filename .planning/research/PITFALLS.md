# Pitfalls Research

**Domain:** Video course extraction and transcript pipeline (Skool + Loom + AI summarization)
**Researched:** 2026-03-01
**Confidence:** MEDIUM — Loom's undocumented API behavior is the highest-uncertainty area. All other pitfalls are MEDIUM-HIGH confidence based on multiple sources.

---

## Critical Pitfalls

### Pitfall 1: Loom Transcript API Does Not Officially Exist

**What goes wrong:**
The pipeline assumes a stable, documented Loom transcript API. There is no such thing. Loom does not offer an open API — only a Record SDK for embedding recording flows. Any transcript fetching relies on reverse-engineered GraphQL endpoints that Loom can change or break without notice, without versioning, and without warning.

**Why it happens:**
Developers see `loom.com/embed/{id}` and assume there's a corresponding API. The Loom developer docs only cover the Record SDK. The transcript endpoint is an internal API incidentally exposed via the embed player, not designed for third-party consumption.

**How to avoid:**
- Treat the transcript endpoint as ephemeral infrastructure, not a stable dependency.
- Abstract all Loom transcript fetching behind a single `fetchLoomTranscript(videoId)` function so the implementation can be swapped without touching the rest of the pipeline.
- Have a Whisper fallback path ready from day one. Do not defer this to "if needed later" — it will be needed.
- Validate the endpoint works against 3-5 real video IDs before building the full pipeline on top of it.

**Warning signs:**
- 400 GraphQL errors on requests that previously worked
- Response format changes (data at `response.data.data` vs `response.data[0].data` — this exact break has already happened once, documented in `bStyler/loom-transcript-mcp`)
- Empty transcript array returned instead of an error (silent failure)

**Phase to address:**
Phase 1 (Loom transcript fetching proof-of-concept). Validate the endpoint against real videos before writing any other pipeline code.

---

### Pitfall 2: Skool DOM Structure Breaks the URL Extractor

**What goes wrong:**
The browser console script that extracts Loom embed URLs from the Skool classroom page is tied to the current DOM structure. Skool is a React/Next.js SPA. Any Skool deployment that changes component names, class names, or data attributes silently breaks the extractor — it returns an empty list rather than throwing an error.

**Why it happens:**
SPAs built on Next.js store page data in `__NEXT_DATA__` (a JSON blob embedded in the initial HTML). This is the most reliable extraction point, but the schema of that JSON can change between Skool versions. CSS class-based selectors are even more fragile because they often use generated hashes.

**How to avoid:**
- Target `__NEXT_DATA__` as the primary extraction method, not CSS selectors. This data object is more stable than rendered DOM.
- Write the extractor to log what it found (count of videos, section names) so a human can immediately spot if it returned zero or partial results.
- Run the extractor against the full 13-section classroom and verify the count matches the expected ~80 videos before proceeding. A count mismatch is the earliest possible failure signal.
- Store the raw extracted JSON alongside the processed output so you can re-parse it without re-running the browser script.

**Warning signs:**
- Script returns empty array or fewer than expected videos
- Section names are generic ("undefined", numbered only) rather than the real course section names
- Some sections have videos but others are empty

**Phase to address:**
Phase 1 (Skool URL extraction). Treat this as the riskiest single step — validate completely before any downstream work.

---

### Pitfall 3: Transcript Missing for Some Videos (Silent Gap in Knowledge Base)

**What goes wrong:**
Some Loom videos in the course may not have transcripts available — particularly older videos recorded before Loom's transcript feature launched, or videos where transcript generation failed or is still pending. The pipeline fetches a null or empty transcript, creates a markdown file with no content, and the knowledge base has silent gaps with no indication anything is missing.

**Why it happens:**
Loom transcripts are generated asynchronously post-upload and can fail. Community reports confirm transcript generation can take over an hour for short videos and sometimes fails entirely, requiring manual regeneration. Videos migrated from other platforms (e.g., Rewatch to Loom migrations) may also lack transcripts.

**How to avoid:**
- Treat an empty or null transcript as a pipeline error, not a success. Log `[TRANSCRIPT MISSING]` prominently in the output file and in a separate `missing-transcripts.log`.
- Count transcripts fetched vs videos found and report the ratio at pipeline completion.
- For missing transcripts, include the video embed URL in the markdown file so they can be manually transcribed via Whisper as a fallback.
- Do not run AI summarization on empty or very short transcripts (under 200 words) — flag them for human review instead.

**Warning signs:**
- Markdown files exist but body content is blank or a few words
- Pipeline completes "successfully" but section summaries are thin or off-topic
- `transcript` field in API response is `null`, `""`, or `[]`

**Phase to address:**
Phase 2 (transcript fetching). Build missing-transcript detection and logging as a first-class feature, not an afterthought.

---

### Pitfall 4: Loom GraphQL Endpoint CORS and Header Requirements

**What goes wrong:**
Fetching Loom's transcript GraphQL endpoint from a Node.js script (outside a browser) fails because Loom's API validates browser-like headers. Missing `User-Agent`, `Accept`, and `Origin` headers causes the request to be rejected with a 400 or 403. This is already a documented failure mode in open-source Loom tools.

**Why it happens:**
Loom's internal API is designed to serve their web app, not third-party scripts. They validate that requests look like they come from a browser. A Node.js `fetch()` with no headers fails this check.

**How to avoid:**
- Always set browser-like headers: `User-Agent`, `Accept: application/json`, `Content-Type: application/json`, `Origin: https://www.loom.com`, `Referer: https://www.loom.com/`.
- Send the GraphQL request as a plain object `{query: "..."}`, NOT as an array `[{query: "..."}]` — the array format was a documented breaking bug.
- Test header requirements against a known-good video ID before batch processing.
- Consider running extraction from within the browser console (where cookies and headers are handled automatically) for the transcript step if Node.js script fails.

**Warning signs:**
- HTTP 400 on all GraphQL requests
- HTTP 403 on transcript endpoint
- Response body says "invalid request" or similar

**Phase to address:**
Phase 1 (Loom API proof-of-concept). This must be solved before any pipeline code is written.

---

### Pitfall 5: AI Summarization Invents Trading-Specific Facts

**What goes wrong:**
The AI API generates executive summaries that include specific numbers, indicators, thresholds, or strategies that were NOT in the source transcript. In financial/trading content, hallucinated specifics (e.g., "Dan says buy when RSI drops below 28" when the transcript said nothing of the sort) are dangerous because the user may act on them as if they were Dan's actual teaching.

**Why it happens:**
LLMs trained on financial content have strong priors about trading strategies. When summarizing a transcript that references a concept but lacks specifics, the model fills in plausible-sounding details from training data rather than the transcript. Research confirms hallucination rates spike from ~1% on general content to 6-17% on domain-specific financial content.

**How to avoid:**
- Use an extractive-first prompt: "Summarize ONLY what is stated explicitly in this transcript. Do not add context, background knowledge, or inferences. If a concept is mentioned without detail, note it was mentioned but provide no additional context."
- Include the instruction: "If you cannot find direct evidence for a claim in the transcript, do not include it."
- For numbers, indicators, percentages — require the model to quote or closely paraphrase rather than synthesize.
- After generation, spot-check 5-10 summaries manually against their source transcripts before trusting the batch.
- Consider grounding: include the raw transcript in the same context window as the summary so the model can reference it rather than invent.

**Warning signs:**
- Summaries contain specific numbers (RSI levels, percentage thresholds, timeframes) that don't appear in transcripts
- Summaries are longer and more detailed than the source transcript would support
- Two videos with similar topics produce summaries with slightly different invented specifics

**Phase to address:**
Phase 3 (AI summarization). Prompt engineering for extractive vs. abstractive summarization is a first-class concern, not a post-hoc fix.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode CSS selectors for Skool DOM | Faster to build | Breaks on next Skool deploy | Never — use `__NEXT_DATA__` instead |
| Skip missing-transcript logging | Pipeline looks cleaner | Silent knowledge base gaps never get fixed | Never |
| Concatenate all transcripts into one giant AI call | Simpler code | Context window overflow, cost overrun, diluted summaries | Never for 80+ videos |
| Use one API call per section summary without chunking | Works for short sections | Fails for 18-video sections (Mindset, Fundamental Analysis) | Never without length check first |
| Regenerate everything on re-run | Simple logic | 80x API calls every run, high cost | Never — build resume/idempotency from day one |
| Trust AI summary without human spot-check | Faster pipeline | Trading-wrong information in the knowledge base | Never for financial content |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Loom GraphQL API | Sending request body as array `[{query}]` instead of object `{query}` | Send as plain object; this exact bug has caused 400 errors in the wild |
| Loom GraphQL API | Missing browser-like headers | Set `User-Agent`, `Accept`, `Origin`, `Referer` explicitly |
| Loom Transcript | Assuming transcript exists if video loads | Check transcript field explicitly; empty transcript ≠ no transcript |
| Skool classroom | Scraping CSS classes (contain hashed names) | Target `__NEXT_DATA__` JSON blob for stable data extraction |
| Skool auth session | Cookies expire mid-run on large extractions | Store session cookies at start; detect 401/redirect and halt with clear error |
| AI API | Sending full 80-video transcript corpus in one call | Chunk per video for individual summaries; chunk per section for section summaries |
| AI API | No retry logic on transient failures | Build exponential backoff; a single 429 or 500 should not abort the whole batch |
| File system | Writing files with video titles as filenames | Sanitize filenames: strip special characters, truncate to 80 chars, use slugs |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sequential transcript fetching with no delay | Works for 5 videos, hits rate limit at 20+ | Add 1-2 second delay between Loom API calls; implement exponential backoff on 429 | ~20 requests |
| Sending full long transcript to AI without checking length | Works for 10-minute videos, fails for 45-minute videos | Count tokens before API call; chunk transcripts over ~15,000 tokens | Transcripts over AI's practical input limit |
| Re-running pipeline from scratch on partial failure | Fast for 5 videos, 40 minutes wasted for 80 | Check if output markdown file already exists and skip; build idempotent pipeline | First partial failure on 80-video run |
| One AI API call per video for summaries | Fine for 10 videos | 80 synchronous API calls = slow pipeline; consider parallel batches | Time-sensitive runs |
| No cost estimation before running | Safe for dev/test | Unbudgeted API cost for 80 videos + section summaries + master summary | First real run |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Hardcoding Skool session cookies in script | Credentials in version control | Load from environment variable or `.env` file; never commit cookies |
| Hardcoding AI API key in script | API key exposure | Use `AI_API_KEY` environment variable; add `.env` to `.gitignore` |
| Storing Skool auth cookies in output files | Course access credentials leaked | Keep auth state separate from output data; never write cookies to markdown files |
| Committing raw transcripts to public repo | Course content copyright violation | Keep all extracted content in private repo or local-only directory |

---

## "Looks Done But Isn't" Checklist

- [ ] **URL Extractor:** Returns ~80 videos across 13 sections — verify count, not just "script ran"
- [ ] **Transcript Fetcher:** Check that transcripts are non-empty for each video; a 200 response with empty body is a silent failure
- [ ] **Markdown Files:** Verify files contain actual transcript text, not just a header and metadata
- [ ] **Section Summaries:** Each of the 13 sections has a summary file; the Mindset and Fundamental Analysis sections (18 videos each) are not accidentally truncated
- [ ] **Master Summary:** References content from all 13 sections, not just the first few
- [ ] **AI Summaries:** Spot-check 5+ summaries against source transcripts for invented specifics
- [ ] **Missing Transcripts:** The `missing-transcripts.log` file exists and has been reviewed (even if empty)
- [ ] **File Naming:** All filenames are valid across macOS and Linux (no colons, slashes, or emoji)
- [ ] **Resume Logic:** Running the pipeline a second time does not duplicate or overwrite good data

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Loom transcript endpoint breaks | MEDIUM | Switch to `captions_source_url` alternative endpoint or implement Whisper fallback for missing videos |
| Skool DOM extractor stops finding videos | LOW | Inspect `__NEXT_DATA__` manually in browser, update JSON path in extractor script |
| AI summaries contain hallucinations | MEDIUM | Identify affected summaries via spot-check, re-run with stricter extractive prompt, manually edit egregious cases |
| Session cookie expired mid-run | LOW | Re-authenticate, export fresh cookies, re-run pipeline with resume logic (skips already-completed files) |
| Partial run with some transcripts missing | LOW | Pipeline idempotency means re-run only processes missing files; missing-transcript log identifies gaps |
| Cost overrun from unbounded API calls | LOW (if caught early) | Add dry-run mode that estimates token count and cost before committing to full run |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Loom API is undocumented and breaks | Phase 1: Transcript Proof-of-Concept | Test against 5 real video IDs; confirm non-empty transcript returned |
| Skool DOM extractor fragility | Phase 1: URL Extraction | Verify video count matches expected ~80; inspect section names |
| GraphQL header requirements | Phase 1: Transcript Proof-of-Concept | Confirm 200 response with valid transcript body before scaling |
| Missing transcripts (silent gaps) | Phase 2: Batch Transcript Fetching | Check missing-transcripts.log; confirm markdown files are non-empty |
| AI hallucination on financial content | Phase 3: AI Summarization | Manual spot-check of 5+ summaries against source transcripts |
| AI API cost overrun | Phase 3: AI Summarization | Dry-run token estimation before full batch; use Batch API for 50% discount |
| Session cookie expiry | Phase 1 and 2 | Detect 401/redirect responses explicitly; halt with clear error message |
| File naming across OS | Phase 2: Markdown Generation | Test filename sanitization against edge cases (video titles with colons, slashes, special chars) |
| No resume logic on partial failure | Phase 2: Batch Transcript Fetching | Confirm idempotency: running twice produces identical output, not duplicates |
| Multi-document hallucination in master summary | Phase 3: Master Summary | Verify master summary cites section-level content, not invented meta-narrative |

---

## Sources

- [Loom Official: No Open API Exists](https://support.atlassian.com/loom/docs/does-loom-have-an-open-api/) — HIGH confidence
- [Loom Transcript Availability and Requirements](https://support.atlassian.com/loom/docs/loom-video-transcription-and-closed-captions/) — HIGH confidence
- [bStyler/loom-transcript-mcp: GraphQL 400 errors fixed](https://github.com/bStyler/loom-transcript-mcp) — HIGH confidence (documented real bug with specific root cause)
- [Atlassian Community: Transcript generation taking over an hour, failing](https://community.atlassian.com/forums/Loom-questions/Is-it-normal-that-transcript-generation-takes-over-an-hour-for-a/qaq-p/3121744) — MEDIUM confidence
- [Skool video download technique using `__NEXT_DATA__`](https://gist.github.com/devinschumacher/69615573b027b1cd5ead318739811613) — MEDIUM confidence
- [LLM hallucination in financial summarization: 6-17% error rate on domain-specific content](https://biztechmagazine.com/article/2025/08/llm-hallucinations-what-are-implications-financial-institutions) — MEDIUM confidence
- [Apify: Get Loom Transcript API (Deprecated)](https://apify.com/webtotheflow/get-loom-transcript/api) — LOW-MEDIUM confidence (third-party, deprecated)
- [Web Scraping SPA challenges: async loading, querySelectorAll returns empty](https://www.scrapingbee.com/blog/scraping-single-page-applications/) — MEDIUM confidence

---
*Pitfalls research for: Video course extraction pipeline (Skool + Loom + AI API)*
*Researched: 2026-03-01*
