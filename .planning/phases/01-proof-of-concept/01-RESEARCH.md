# Phase 1: Proof-of-Concept - Research

**Researched:** 2026-03-01
**Domain:** Browser-console data extraction (Skool Next.js `__NEXT_DATA__` + DOM) + Loom GraphQL transcript API
**Confidence:** MEDIUM-HIGH (Loom GraphQL fully verified via source; Skool __NEXT_DATA__ full-course structure requires live validation)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXTR-01 | Browser script extracts all Loom embed URLs from Skool classroom page via `__NEXT_DATA__` | Two complementary approaches documented: `__NEXT_DATA__` recursive search + DOM anchor scraping for `md=` parameters. DOM scraping is more reliable for full course extraction. |
| EXTR-02 | Browser script captures video title, section name, and ordering for each video | Title confirmed via `metadata.title` in `__NEXT_DATA__`. Section name and ordering requires live validation — may require DOM traversal of sidebar nav or per-lesson page visits. |
| EXTR-03 | Script outputs structured JSON manifest (section → videos with Loom IDs) | Standard `JSON.stringify()` + `copy()` in browser console. Loom video ID extracted from embed URL regex `/\/embed\/([a-f0-9]{32})/`. |
</phase_requirements>

---

## Summary

Phase 1 validates two independent data pipelines before any downstream code is written. First: a browser console script that extracts the full course manifest (all sections, all Loom embed URLs, all titles) from the authenticated Skool classroom page. Second: a standalone Node.js script that confirms the Loom GraphQL transcript endpoint works against real Dan's course video IDs.

The Loom GraphQL approach is fully validated by live source code from `bStyler/loom-transcript-mcp` (a working MCP server). The endpoint is `https://www.loom.com/graphql`, the operation is `FetchVideoTranscript`, and no session authentication is required for link-shared videos — only a browser-like `User-Agent` header and sending the request body as a plain JSON object (not an array). The transcript is returned as a `captions_source_url` pointing to a VTT file, which is then fetched and parsed to plain text.

The Skool `__NEXT_DATA__` extraction is partially validated. Confirmed: each lesson page's `__NEXT_DATA__` contains `metadata.videoLink`, `metadata.title`, and `metadata.videoLenMs` for the currently-viewed lesson. What requires live validation: whether the classroom ROOT page (no `?md=` param) contains the full course structure with all sections and their nested lessons in a single JSON payload, or whether the script must scrape DOM anchor tags (`a[href*="md="]`) to collect all lesson IDs, then make per-lesson page visits. The DOM anchor scraping approach is confirmed to work and is the safer bet.

**Primary recommendation:** For EXTR-01/02/03, use a DOM-based approach on the classroom root page that collects all `md=` anchor hrefs, enriches each with title/section from sidebar DOM structure, then outputs a JSON manifest. Cross-check with `__NEXT_DATA__` for video IDs. For Loom transcript validation (leading into Phase 2), use the confirmed GraphQL pattern with `FetchVideoTranscript`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Browser console JS | Native | Skool URL/DOM extraction | No install, runs in authenticated session |
| Node.js | 22 LTS (ESM) | Standalone Loom test script | Project decision; ESM-only packages required |
| `node-fetch` | v3.x (ESM) | HTTP requests in Node test script | ESM-only; project decision from STATE.md |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `axios` | ^1.6.x | Alternative HTTP client for Loom GraphQL | Used in verified bStyler/loom-transcript-mcp; simpler error handling than fetch for POST |
| None for VTT parsing | — | VTT → plain text is ~15 lines of string ops | Regex on `-->` lines and `WEBVTT` header is sufficient |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DOM anchor scraping for all lessons | Pure `__NEXT_DATA__` traversal | `__NEXT_DATA__` structure per full course unknown without live validation; DOM is visible and verifiable in browser |
| Browser console script | Puppeteer/Playwright headless | Headless auth is fragile (project decision to avoid); browser console requires zero setup |
| `node-fetch` v3 | `axios` | Both work; `axios` is what the verified Loom implementation uses — preference for test script is either |

**Installation (Node.js test script only):**
```bash
npm init -y
npm install node-fetch
# or: npm install axios
```

---

## Architecture Patterns

### Recommended Project Structure

```
/                          # project root
├── scripts/
│   ├── extract-skool.js   # Browser console paste script (IIFE, no imports)
│   └── test-loom-api.js   # Node.js standalone test (ESM, node-fetch/axios)
└── output/
    └── manifest.json      # Phase 1 artifact: section → videos JSON
```

### Pattern 1: Browser Console IIFE Extractor

**What:** Self-contained Immediately Invoked Function Expression pasted into the browser console on the authenticated Skool classroom page.

**When to use:** Any extraction that requires an active authenticated browser session.

**Two-approach strategy for collecting all lesson IDs:**

Approach A — DOM anchor scraping (recommended as primary):
```javascript
// Source: Verified from gist.github.com/devinschumacher/26be6111dddf12e6ce02d236e2bc1385
(function() {
  const baseUrl = window.location.href.split('?')[0];
  const mdPattern = /[?&]md=([a-f0-9]{32})/;

  // Collect all unique md= values from sidebar links
  const links = document.querySelectorAll('a[href*="md="]');
  const mdSet = new Set();
  links.forEach(a => {
    const match = a.href.match(mdPattern);
    if (match) mdSet.add(match[1]);
  });

  // For each anchor, also capture its text (potential title) and
  // nearest section heading (for section name)
  const results = [];
  links.forEach(a => {
    const match = a.href.match(mdPattern);
    if (!match) return;
    const title = a.textContent.trim();
    // Section = nearest ancestor with a section/module heading
    const sectionEl = a.closest('[class*="module"]') || a.closest('[class*="section"]') || a.closest('li')?.closest('ul')?.previousElementSibling;
    const sectionName = sectionEl ? sectionEl.textContent.trim() : 'Unknown';
    results.push({ mdId: match[1], title, sectionName, url: a.href });
  });

  copy(JSON.stringify(results, null, 2));
  console.log(`Copied ${results.length} lessons`);
})();
```

Approach B — `__NEXT_DATA__` per-lesson enrichment (use to get Loom embed URL):
```javascript
// Source: Verified from gist.github.com/devinschumacher/69615573b027b1cd5ead318739811613
// Run on a specific lesson page (URL has ?md=xxx) to get Loom embed URL
(function() {
  const nextData = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);

  function findLoomUrl(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.metadata && obj.metadata.videoLink) {
      return { url: obj.metadata.videoLink, title: obj.metadata.title };
    }
    for (const key of Object.keys(obj)) {
      const found = findLoomUrl(obj[key]);
      if (found) return found;
    }
    return null;
  }

  const result = findLoomUrl(nextData);
  console.log(result);
  // result.url is: "https://www.loom.com/embed/{VIDEO_ID}?..."
})();
```

**Combined strategy for Phase 1:**
The classroom root page (no `?md=` param) exposes all sidebar `a[href*="md="]` links. A single console script on this page can gather all lesson IDs + titles + section names from the DOM. The Loom embed URL for each is accessible by navigating to each lesson page and reading `__NEXT_DATA__`, BUT this may not be needed if the Loom video ID is also encoded in the DOM (inspect `iframe[src*="loom.com/embed"]` on the lesson page).

**Fastest single-page approach:** On the classroom root page, scan for iframes as well:
```javascript
// If Loom iframes are rendered on the index page (unlikely but possible):
document.querySelectorAll('iframe[src*="loom.com/embed"]').forEach(f => {
  const match = f.src.match(/\/embed\/([a-f0-9]{32})/);
  if (match) console.log(match[1]);
});
```

### Pattern 2: Loom ID Extraction from Embed URL

**What:** Regex extraction of the 32-character hex Loom video ID from any Loom URL format.

**Example:**
```javascript
// Works for both embed and share URLs
// Source: Verified from bStyler/loom-transcript-mcp source code
function extractLoomId(url) {
  const match = url.match(/\/(embed|share)\/([a-f0-9]{32})/);
  return match ? match[2] : null;
}

// Embed format: https://www.loom.com/embed/13f9e28d4c434a878b8416bd8c364af3?autoplay=0...
// Share format: https://www.loom.com/share/13f9e28d4c434a878b8416bd8c364af3
extractLoomId('https://www.loom.com/embed/13f9e28d4c434a878b8416bd8c364af3?autoplay=0');
// => "13f9e28d4c434a878b8416bd8c364af3"
```

### Pattern 3: Loom GraphQL Transcript Fetch (Node.js)

**What:** POST to `https://www.loom.com/graphql` with `FetchVideoTranscript` operation. Returns a `captions_source_url` (VTT file). Fetch the VTT, strip timestamps.

**Critical fixes (from bStyler/loom-transcript-mcp, confirmed working):**
1. Send body as plain object `{}` NOT array `[{}]` — Loom's API rejects arrays with HTTP 400
2. Include `Accept: application/json` and browser-like `User-Agent` header
3. Access `response.data.data.fetchVideoTranscript` NOT `response.data[0].data`

```javascript
// Source: /tmp/loom-transcript-mcp/src/index.ts (cloned from github.com/bStyler/loom-transcript-mcp)
// Node.js ESM, node-fetch v3 variant:
import fetch from 'node-fetch';

async function fetchLoomTranscript(videoId) {
  // Step 1: Get captions URL via GraphQL
  const gqlRes = await fetch('https://www.loom.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    body: JSON.stringify({
      operationName: 'FetchVideoTranscript',
      variables: { videoId, password: null },
      query: `query FetchVideoTranscript($videoId: ID!, $password: String) {
        fetchVideoTranscript(videoId: $videoId, password: $password) {
          ... on VideoTranscriptDetails {
            captions_source_url
            source_url
            transcription_status
            __typename
          }
          ... on GenericError {
            message
            __typename
          }
          __typename
        }
      }`
    })
  });

  const json = await gqlRes.json();
  const captionsUrl = json?.data?.fetchVideoTranscript?.captions_source_url;
  if (!captionsUrl) throw new Error(`No captions_source_url. Status: ${json?.data?.fetchVideoTranscript?.transcription_status}`);

  // Step 2: Fetch VTT and strip to plain text
  const vttRes = await fetch(captionsUrl);
  const vtt = await vttRes.text();
  return parseVttToText(vtt);
}

function parseVttToText(vtt) {
  return vtt.split('\n')
    .filter(line =>
      !line.includes('-->') &&
      line.trim() !== '' &&
      !line.match(/^\d+$/) &&
      !line.startsWith('WEBVTT')
    )
    .map(l => l.trim())
    .join(' ')
    .trim();
}

// Test with a real Loom ID from Dan's course:
const videoId = '13f9e28d4c434a878b8416bd8c364af3'; // example from PROJECT.md
fetchLoomTranscript(videoId).then(t => console.log(t.slice(0, 500)));
```

### JSON Manifest Structure (Phase 1 Artifact)

```json
{
  "extractedAt": "2026-03-01T00:00:00Z",
  "courseUrl": "https://www.skool.com/bullrun-millions-crypto-course-9312/classroom",
  "totalVideos": 80,
  "sections": [
    {
      "name": "Introduction to the Course",
      "order": 1,
      "videos": [
        {
          "title": "Welcome to the Course",
          "loomId": "13f9e28d4c434a878b8416bd8c364af3",
          "loomEmbedUrl": "https://www.loom.com/embed/13f9e28d4c434a878b8416bd8c364af3",
          "order": 1,
          "mdId": "abc123..."
        }
      ]
    }
  ]
}
```

### Anti-Patterns to Avoid

- **Sending GraphQL body as array:** `[{ operationName: ... }]` — Loom returns HTTP 400. Always send as plain object.
- **Relying on `x-loom-request-source` version header:** Stale version strings cause HTTP 400 (this is what broke yt-dlp in Nov 2025). Omit this header entirely.
- **Assuming `__NEXT_DATA__` on classroom root has all videos:** This is unconfirmed. The DOM anchor approach is the safe path.
- **Headless browser auth for Skool:** Project decision is to use browser console — headless auth is fragile against anti-bot measures.
- **Accessing `response.data[0].data` instead of `response.data.data`:** Old pattern from broken implementations.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VTT → plain text | Custom parser | ~15 lines of split/filter on `-->` and `WEBVTT` markers | VTT is line-delimited; no library needed for basic text extraction |
| Loom video ID extraction | URL parser library | Single regex `/(embed\|share)\/([a-f0-9]{32})/` | Loom IDs are always 32-char hex in predictable URL positions |
| GraphQL client | apollo-client, graphql-request | Native `fetch` or `axios` POST | GraphQL is just HTTP POST with JSON; full clients add 50KB+ for no benefit at this scale |
| JSON manifest schema validation | Zod, Joi | Manual structure check | Only ~80 records; simple `Array.isArray` + length check suffices for PoC |

**Key insight:** This phase is pure validation — minimum viable code to prove the APIs work. No abstractions, no libraries beyond HTTP. The goal is to CONFIRM data flows, not build maintainable production code.

---

## Common Pitfalls

### Pitfall 1: Loom GraphQL HTTP 400 Due to Array Body

**What goes wrong:** Script POSTs `[{ operationName, variables, query }]` (array) instead of `{ operationName, variables, query }` (object). Loom's GraphQL server rejects arrays with HTTP 400.

**Why it happens:** Older GraphQL clients and documentation used batched requests (array format). Loom changed their API to reject this.

**How to avoid:** Always wrap the request body in a plain object, never an array. Verified in source of `bStyler/loom-transcript-mcp`.

**Warning signs:** HTTP 400 response from `https://www.loom.com/graphql`.

### Pitfall 2: Stale `x-loom-request-source` Header

**What goes wrong:** Including `x-loom-request-source: loom_web_<hash>` or `apollographql-client-version: <hash>` with an outdated commit hash causes 400 errors (this is the exact failure that broke yt-dlp in November 2025).

**Why it happens:** Loom validates these version headers server-side. When the web app is updated, the hash changes.

**How to avoid:** Omit these headers entirely. Only send `Content-Type`, `Accept`, and `User-Agent`. Confirmed working without version headers in `bStyler/loom-transcript-mcp`.

**Warning signs:** 400 errors that started suddenly after previously working.

### Pitfall 3: Transcript Not Available (Null `captions_source_url`)

**What goes wrong:** `fetchVideoTranscript` returns `VideoTranscriptDetails` but `captions_source_url` is `null`, or returns `GenericError`.

**Why it happens:** Loom only generates transcripts for videos with speech; some videos may not have been processed yet. Also: the video must be publicly accessible (link-share enabled) — if Dan's course embeds are workspace-restricted, the GraphQL call may return nothing.

**How to avoid:** Check `transcription_status` field in the response. Design the test to gracefully handle nulls and log the status. If all 5 test videos return null, it's an auth issue, not a content issue.

**Warning signs:** `captions_source_url` consistently null across multiple videos.

### Pitfall 4: Skool Sidebar Links Not All Loaded on Page Load

**What goes wrong:** Skool's classroom sidebar may lazy-load or collapse sections. `querySelectorAll('a[href*="md="]')` on page load returns incomplete results.

**Why it happens:** Next.js hydration + potential virtual scrolling or accordion collapse means not all DOM elements are present immediately.

**How to avoid:** After the script runs, manually expand all sidebar sections first OR add a delay/scroll trigger. The Apify scraper notes that it "automatically expands collapsed course sections" — this is a known requirement.

**Warning signs:** `querySelectorAll('a[href*="md="]')` returns fewer than expected results (expect ~80).

### Pitfall 5: Section Name Extraction is Fragile

**What goes wrong:** CSS class names like `[class*="module"]` or `[class*="section"]` are generated/minified in Next.js builds. The DOM traversal for section names may return empty or wrong results.

**Why it happens:** Tailwind/CSS modules generate non-semantic class names that change on rebuild.

**How to avoid:** Inspect the live DOM first before writing the script. Look for semantic HTML like `<h2>`, `<h3>`, `<li>` ancestors, or `data-` attributes rather than relying on class names. Treat section name as a "best effort" field in Phase 1 — can be corrected manually if needed.

**Warning signs:** All `sectionName` values are "Unknown".

### Pitfall 6: `__NEXT_DATA__` Contains Only Current Lesson (Not Full Course)

**What goes wrong:** Script assumes the classroom root page's `__NEXT_DATA__` contains all 80 videos. It may only contain page-level metadata without nested course content.

**Why it happens:** Next.js server-side rendering may hydrate only the current view's data. Skool's classroom root page may contain a course outline structure OR may only list module IDs without lesson content.

**How to avoid:** On the classroom root page, run `JSON.stringify(JSON.parse(document.getElementById('__NEXT_DATA__').textContent))` in the console and inspect the structure before writing the extraction script. If full content isn't there, fall back to DOM anchor scraping.

**Warning signs:** `__NEXT_DATA__` JSON is small (< 50KB) and doesn't contain lesson-level metadata.

---

## Code Examples

Verified patterns from official sources:

### Complete Loom GraphQL Transcript Fetch (verified source)

```javascript
// Source: github.com/bStyler/loom-transcript-mcp /src/index.ts
// Endpoint: https://www.loom.com/graphql (POST)
// Headers required: Content-Type, Accept, User-Agent
// Body format: plain object (NOT array)
// Response path: response.data.data.fetchVideoTranscript.captions_source_url

const response = await axios.post(
  'https://www.loom.com/graphql',
  {
    operationName: "FetchVideoTranscript",
    variables: {
      videoId: videoId,   // 32-char hex string
      password: null      // null for public/link-shared videos
    },
    query: `query FetchVideoTranscript($videoId: ID!, $password: String) {
      fetchVideoTranscript(videoId: $videoId, password: $password) {
        ... on VideoTranscriptDetails {
          captions_source_url   // VTT file URL — fetch this separately
          source_url
          transcription_status  // "completed" | "processing" | null
          __typename
        }
        ... on GenericError {
          message
          __typename
        }
        __typename
      }
    }`
  },
  {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  }
);

const captionsUrl = response.data?.data?.fetchVideoTranscript?.captions_source_url;
```

### VTT to Plain Text Parser (verified source)

```javascript
// Source: github.com/bStyler/loom-transcript-mcp /src/index.ts
function parseVttToText(vttContent) {
  const lines = vttContent.split('\n');
  let transcript = '';
  for (const line of lines) {
    if (
      line.includes('-->') ||
      line.trim() === '' ||
      line.match(/^\d+$/) ||
      line.startsWith('WEBVTT')
    ) continue;
    transcript += line.trim() + ' ';
  }
  return transcript.trim();
}
```

### DOM Anchor Scraping for All Skool Lesson IDs (verified pattern)

```javascript
// Source: Verified from gist.github.com/devinschumacher/26be6111dddf12e6ce02d236e2bc1385
// Run on: authenticated Skool classroom ROOT page (no ?md= in URL)
const allMdLinks = [...document.querySelectorAll('a[href*="md="]')]
  .map(a => ({ href: a.href, text: a.textContent.trim() }))
  .filter((v, i, arr) => arr.findIndex(x => x.href === v.href) === i); // dedupe

console.log(`Found ${allMdLinks.length} lesson links`);
copy(JSON.stringify(allMdLinks, null, 2));
```

### Per-lesson Loom URL from `__NEXT_DATA__` (verified pattern)

```javascript
// Source: Verified from gist.github.com/devinschumacher/69615573b027b1cd5ead318739811613
// Run on: specific lesson page (URL has ?md=xxx)
const nextData = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
function findVideoLink(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.metadata?.videoLink) return { url: obj.metadata.videoLink, title: obj.metadata.title };
  for (const v of Object.values(obj)) {
    const found = findVideoLink(v);
    if (found) return found;
  }
  return null;
}
const result = findVideoLink(nextData);
console.log(result); // { url: "https://www.loom.com/embed/{id}?...", title: "..." }
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Loom GraphQL batched array `[{}]` | Single object `{}` per request | Nov 2025 (yt-dlp issue #15141) | Old code returns HTTP 400; must send plain object |
| yt-dlp with `x-loom-request-source` header | Extract from `window.__APOLLO_STATE__` OR omit version headers | Dec 2025 (yt-dlp commit 36b29bb) | Version headers cause 400; either omit or parse Apollo state |
| Per-lesson page scraping for course structure | DOM anchor `md=` scraping on classroom root | Community practice 2024 | Faster; gets all lessons in one pass without page navigation |

**Deprecated/outdated:**
- `x-loom-request-source: loom_web_<hash>` header: Causes HTTP 400, do not use
- `apollographql-client-version` header: Same issue, omit entirely
- Response path `response.data[0].data`: Wrong; use `response.data.data`

---

## Open Questions

1. **Does the Skool classroom root page `__NEXT_DATA__` contain the full course hierarchy?**
   - What we know: Per-lesson pages definitely contain current lesson's `metadata.videoLink`. Root page structure is unconfirmed.
   - What's unclear: Whether root page hydrates all 13 sections + ~80 lessons into `__NEXT_DATA__` or only loads a skeleton outline.
   - Recommendation: First action in planning — inspect `__NEXT_DATA__` on the root page before writing any script. If full structure exists, a single `__NEXT_DATA__` parse gets everything. If not, use DOM anchor scraping + per-lesson enrichment.

2. **Does the Loom `FetchVideoTranscript` GraphQL endpoint work without a Loom session cookie for link-shared embedded videos?**
   - What we know: `bStyler/loom-transcript-mcp` sends no cookie and works for publicly shared videos. Dan's videos are embedded in Skool (link-share format).
   - What's unclear: Whether the Skool embed context (which uses `?hide_owner=true&hide_share=true&hideEmbedTopBar=true`) affects transcript access permissions. The STATE.md flags this as LOW confidence.
   - Recommendation: Test immediately with 1-2 real Loom IDs from Dan's course. If 401 or null captions_source_url, try with the Skool session cookie extracted from browser devtools.

3. **Are all ~80 videos transcribed by Loom (transcription_status = "completed")?**
   - What we know: Loom auto-generates transcripts for most videos. Some older videos may not have been processed.
   - What's unclear: Course was set up by Dan — unclear if transcript generation was explicitly enabled per Loom's settings.
   - Recommendation: The 5-video PoC test will surface this. If some lack transcripts, flag for Phase 2 planning.

4. **Do Skool's sidebar section headings have extractable structure in the DOM?**
   - What we know: Skool uses drag-and-drop folders (modules) and pages (lessons). CSS class names are likely generated.
   - What's unclear: What DOM structure is used for the module/folder names that appear above lesson lists.
   - Recommendation: Inspect the live DOM manually before writing section-extraction code.

---

## Sources

### Primary (HIGH confidence)
- `github.com/bStyler/loom-transcript-mcp` `/src/index.ts` — Cloned and read directly. Contains exact working Loom GraphQL endpoint, query, headers, and response path. Published 2025.
- `github.com/yt-dlp/yt-dlp` issue #15141 + commit 36b29bb — Documents the exact failure mode (stale version headers) and the fix (`window.__APOLLO_STATE__` fallback). December 2025.

### Secondary (MEDIUM confidence)
- `gist.github.com/devinschumacher/69615573b027b1cd5ead318739811613` — Per-lesson `__NEXT_DATA__` extraction pattern. Verified via multiple corroborating sources.
- `gist.github.com/devinschumacher/26be6111dddf12e6ce02d236e2bc1385` — DOM anchor `md=` scraping approach for bulk lesson ID collection.
- `apps.serp.co/blog/how-to-download-skool-videos-and-entire-course` — Corroborates `__NEXT_DATA__` property paths (`metadata.videoLink`, `metadata.title`).

### Tertiary (LOW confidence)
- STATE.md project note: "Loom auth for link-shared embedded videos (connect.sid cookie requirement) is LOW confidence — single source, must validate in Phase 1." — Flagged for live validation.
- Apify scrapers (loom-transcript, skool-classroom): Confirm that tools exist and work, but don't expose implementation details. Corroborates feasibility.

---

## Metadata

**Confidence breakdown:**
- Loom GraphQL endpoint + query: HIGH — verified directly from working source code
- Skool per-lesson `__NEXT_DATA__` structure: MEDIUM — multiple corroborating sources, no conflicting info
- Skool full-course structure in root page `__NEXT_DATA__`: LOW — requires live validation, no source confirms it
- DOM anchor scraping approach: MEDIUM — confirmed working pattern from multiple tools
- Loom auth requirement for embedded videos: LOW — single source, must validate empirically

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (Loom GraphQL is actively maintained but changes; verify if 400 errors appear)
