# Stack Research

**Domain:** Video transcript extraction + markdown knowledge base pipeline
**Researched:** 2026-03-01
**Confidence:** MEDIUM-HIGH (GraphQL endpoint verified via source code; package versions verified via npm registry; Skool __NEXT_DATA__ approach verified via gist; AI SDK version verified via npm)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22.x LTS | Runtime for the pipeline scripts | LTS through April 2027, widest ecosystem compatibility, battle-tested; Node 24 exists but Node 22 is the safer production choice for tooling scripts as of March 2026 |
| ai-sdk | 0.78.0 | AI API for generating exec summaries | Official AI SDK; version 0.78.0 is current as of March 2026; ~3,500 npm dependents, actively maintained |

### Loom Transcript Extraction

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| node-fetch | 3.3.2 | HTTP client for Loom GraphQL calls | ESM-native, lightweight; Loom's transcript API uses GraphQL POST to `https://www.loom.com/graphql` — no heavyweight HTTP client needed |
| (built-in) | Node 22 | VTT file fetching | After GraphQL returns `captions_source_url`, the VTT file is fetched via simple GET; Node 22's built-in `fetch` handles this without dependencies |

**Critical detail (MEDIUM confidence — verified via source code of bStyler/loom-transcript-mcp):**

Loom transcripts are accessed via a GraphQL endpoint, NOT a REST API. The flow is:

1. POST to `https://www.loom.com/graphql` with operation `FetchVideoTranscript`
2. Variables: `{ videoId: "<loom_video_id>" }`
3. Response includes `captions_source_url` (a VTT file URL hosted on Loom's CDN)
4. GET the VTT URL to retrieve the WebVTT file
5. Parse VTT to strip timestamps, extract plain text

**Authentication for private/embedded Loom videos (LOW confidence — single source):**
Private or link-shared Loom videos embedded in Skool may require the Loom `connect.sid` session cookie passed in request headers. This needs validation during implementation.

**Required headers for GraphQL request:**
```
Content-Type: application/json
Accept: application/json
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
```

Note: Omitting browser-like headers causes 400 errors from Loom's GraphQL endpoint (verified via bStyler/loom-transcript-mcp fix history).

### Skool URL Extraction

| Approach | Tool | Purpose | Why |
|----------|------|---------|-----|
| Browser Console Script | Vanilla JS (no library) | Extract Loom embed URLs + section hierarchy from Skool classroom | Skool is a React/Next.js app behind auth; running JS in browser console while logged in is the simplest access method — no auth token management, no headless browser overhead |

**Critical detail (MEDIUM confidence — verified via Skool gist + skool-loom-dl analysis):**

Skool uses Next.js. The classroom page embeds all course data (video URLs, titles, section structure) in a `<script id="__NEXT_DATA__" type="application/json">` tag in the DOM.

Browser console approach:
```javascript
const data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
// Navigate the data structure to find videoLink fields (Loom embed URLs)
// Extract: title, section name, Loom video ID
// Copy JSON to clipboard or console.log for use in the Node.js pipeline
```

This approach avoids Playwright/Puppeteer entirely for the URL extraction phase and leverages the user's existing authenticated browser session.

### Markdown Generation + File System

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| fs-extra | 11.3.3 | File and directory creation | Drop-in replacement for Node's `fs` module with `mkdirs`, `outputFile`, and `copy` methods; eliminates boilerplate for recursive directory creation |
| slugify | 1.6.6 | Generate filesystem-safe folder/file names from section and video titles | 7M+ weekly downloads; handles Unicode, spaces, special chars; `slugify(title, { lower: true, strict: true })` produces safe names |

**Markdown is generated as plain string templates in Node.js — no markdown library required.** The output format is straightforward enough that string template literals handle it cleanly.

### Rate Limiting

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| bottleneck | 2.19.5 | Rate-limit concurrent Loom GraphQL calls | Loom will rate-limit aggressive requests; Bottleneck's `minTime` and `maxConcurrent` options handle this cleanly; zero-dependency, production-proven |

**Recommended config for Loom:**
```javascript
const limiter = new Bottleneck({ minTime: 500, maxConcurrent: 3 });
// 500ms between requests, max 3 concurrent = safe headroom under typical rate limits
```

### Configuration + Environment

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| dotenv | 17.3.1 | Load `AI_API_KEY` and config from `.env` | Standard; keeps API key out of source code; current version as of March 2026 |

### Developer Experience (Optional but Recommended)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| chalk | 5.6.2 | Colored terminal output for progress feedback | Pure ESM in v5; use v4 if using CommonJS (`require()`) |
| ora | 9.3.0 | Spinner for long-running operations (AI API calls) | Shows progress during AI summarization which takes 10-30s per section |
| commander | 14.0.3 | CLI argument parsing if pipeline needs flags | Only needed if exposing `--section`, `--dry-run` flags; optional for MVP |

---

## Installation

```bash
# Core pipeline
npm install ai-sdk node-fetch fs-extra slugify bottleneck dotenv

# Developer experience (optional)
npm install chalk ora commander

# Dev dependencies
npm install -D typescript @types/node
```

**Note:** If using TypeScript (recommended for IDE support on a multi-file pipeline), add `tsx` for running `.ts` files directly:
```bash
npm install -D tsx
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Loom GraphQL (`https://www.loom.com/graphql`) | Apify Loom Transcript Scraper API | Only if the Loom GraphQL approach breaks (API changes) or videos require complex auth flows not solvable via cookies; Apify costs money and adds external dependency |
| Browser Console script for Skool | Playwright/Puppeteer headless browser | Only if Skool adds bot detection, dynamic rendering that breaks `__NEXT_DATA__`, or if full automation without human interaction is required |
| node-fetch | axios | Both work; node-fetch is more minimal for this use case; axios adds value when interceptors or request retry logic is needed across many endpoints |
| bottleneck | p-limit | p-limit controls concurrency only (no `minTime` spacing); bottleneck controls both concurrency AND rate; for API rate-limiting, bottleneck is the better fit |
| ai-sdk | Direct AI API via fetch | SDK handles retries, streaming, type safety, and error wrapping; no reason to use raw fetch |
| Node.js 22 LTS | Node.js 24 | Node.js 24 LTS entered support Oct 2025 and is appropriate for new projects; either works; Node 22 is more conservative and universally supported by tooling |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Puppeteer / Playwright for Skool scraping | Heavy, requires Chromium install, overkill when the user is already logged in — browser console + `__NEXT_DATA__` is simpler and more reliable | Browser console JavaScript, output JSON, feed to Node.js pipeline |
| Apify Loom scrapers (paid) | External paid API dependency; adds cost, rate limits, and a third-party failure point for what can be done via direct Loom GraphQL | Direct Loom GraphQL endpoint |
| Whisper / OpenAI Transcription | Requires downloading video files (rejected by project constraints — storage overhead) | Loom's built-in transcripts via GraphQL + VTT |
| yt-dlp | Downloads video files; project explicitly out-of-scopes video downloads | Loom GraphQL transcript access (transcript-only, no video) |
| chalk v5 with CommonJS | chalk v5 is pure ESM and will throw `ERR_REQUIRE_ESM` if the project uses `require()` | Use chalk v4 (`npm install chalk@4`) for CommonJS projects, or configure project as ESM (`"type": "module"` in package.json) |

---

## Stack Patterns by Variant

**If the Loom videos are public/link-shared (no Loom account required to view):**
- Standard GraphQL call with browser-like headers, no session cookie needed
- This is the likely case for a Skool course where Loom is used for course hosting

**If the Loom videos require Loom account authentication:**
- Extract the `connect.sid` cookie from browser DevTools after logging into loom.com
- Pass as `Cookie: connect.sid=<value>` header in GraphQL requests
- LOW confidence this is needed — validate early in implementation

**If Skool's `__NEXT_DATA__` structure doesn't contain all video URLs in one page load:**
- The classroom may paginate or lazy-load section content
- Workaround: navigate to each section individually and run the console script per-section
- Merge JSON outputs before passing to the Node.js pipeline

**If Loom transcripts are not enabled for some videos:**
- GraphQL returns null for `captions_source_url`
- Pipeline should log the video title as SKIPPED and continue (don't crash)
- Fallback option: Whisper transcription from video download (accepted as a future enhancement)

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `ai-sdk@0.78.0` | Node.js 18+ | Requires modern Node; Node 22 LTS fully supported |
| `node-fetch@3.x` | Node.js 12.20+ | v3 is ESM-only; set `"type": "module"` in package.json OR use `import()` dynamic import, OR downgrade to `node-fetch@2.x` for CommonJS |
| `chalk@5.x` | Node.js 12.17+ | ESM-only — same ESM constraint as node-fetch v3 |
| `fs-extra@11.x` | Node.js 14.14+ | Node 22 fully supported |
| `bottleneck@2.x` | Node.js 6+ | No constraints; works everywhere |

**Recommendation: Configure project as ESM from the start** (`"type": "module"` in package.json). This avoids CJS/ESM interop pain with node-fetch v3 and chalk v5.

---

## Sources

- `https://raw.githubusercontent.com/bStyler/loom-transcript-mcp/main/src/index.ts` — Verified Loom GraphQL endpoint (`https://www.loom.com/graphql`), `FetchVideoTranscript` operation, VTT approach, required headers. Confidence: HIGH (source code)
- `https://support.atlassian.com/loom/docs/loom-video-transcription-and-closed-captions/` — Transcripts available on all Loom plans, creator-controlled visibility. Confidence: HIGH (official Atlassian/Loom docs)
- `https://gist.github.com/devinschumacher/69615573b027b1cd5ead318739811613` — Confirmed Skool uses Next.js `__NEXT_DATA__` for video data, browser console approach for URL extraction. Confidence: MEDIUM (community gist, not official)
- `npm view ai-sdk version` → `0.78.0` — Confirmed current SDK version. Confidence: HIGH (npm registry)
- `npm view bottleneck version` → `2.19.5`, `npm view fs-extra version` → `11.3.3`, `npm view slugify version` → `1.6.6`, `npm view dotenv version` → `17.3.1` — All package versions verified via npm CLI. Confidence: HIGH
- `npm view chalk version` → `5.6.2`, `npm view ora version` → `9.3.0`, `npm view commander version` → `14.0.3` — Verified via npm CLI. Confidence: HIGH
- `https://nodejs.org/en/about/previous-releases` — Node.js 22 LTS active through April 2027. Confidence: HIGH (official Node.js)
- WebSearch: Loom private video authentication via `connect.sid` cookie — MEDIUM confidence (single source, needs validation during implementation)

---

## Key Risk: Loom GraphQL Stability

**MEDIUM confidence concern:** Loom's GraphQL endpoint is undocumented/unofficial. It has already broken once (requiring the fork in `bStyler/loom-transcript-mcp` to fix 400 errors). This approach works as of mid-2025 based on that repo's activity, but may require maintenance if Loom updates their API.

**Mitigation:** Keep transcript extraction logic isolated in a single module (`src/loom-client.ts`). If the GraphQL approach breaks, the module is the only place to update.

---
*Stack research for: Dan's Crypto Course Knowledge Extractor — video transcript extraction + markdown knowledge base pipeline*
*Researched: 2026-03-01*
