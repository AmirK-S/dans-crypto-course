import fetch from 'node-fetch';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ============================================================
// LOOM BATCH TRANSCRIPT TEST SCRIPT
// ============================================================
// Usage: node scripts/test-loom-batch.mjs [id1 id2 id3 id4 id5]
//
// Tests the Loom GraphQL transcript API against real video IDs
// from output/manifest.json. If the manifest has fewer than 5
// Loom IDs, accepts IDs as command-line arguments.
//
// If 0 Loom IDs in manifest and no CLI args, falls back to
// the known example ID: 13f9e28d4c434a878b8416bd8c364af3
//
// Exit codes:
//   0 = all succeeded
//   1 = all failed
//   2 = partial success
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MANIFEST_PATH = join(__dirname, '..', 'output', 'manifest.json');
const RESULTS_PATH = join(__dirname, '..', 'output', 'loom-test-results.json');

const LOOM_GRAPHQL_URL = 'https://www.loom.com/graphql';
const FALLBACK_ID = '13f9e28d4c434a878b8416bd8c364af3';
const DELAY_MS = 2000;

// ---- Load manifest ----
let manifest;
try {
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  manifest = JSON.parse(raw);
} catch (err) {
  console.error(`Failed to read output/manifest.json: ${err.message}`);
  process.exit(1);
}

// ---- Extract all videos with Loom IDs from manifest ----
const videosWithLoomId = [];
for (const section of manifest.sections) {
  for (const video of section.videos) {
    if (video.loomId) {
      videosWithLoomId.push({
        videoId: video.loomId,
        title: video.title,
        section: section.name,
        sectionOrder: section.order,
      });
    }
  }
}

// ---- Select test IDs ----
// Priority: CLI args > manifest IDs (spread across sections) > fallback ID
const cliIds = process.argv.slice(2);

let testEntries = [];

if (cliIds.length >= 5) {
  // Use CLI-provided IDs
  testEntries = cliIds.slice(0, 5).map((id) => ({
    videoId: id,
    title: `CLI-provided`,
    section: `CLI`,
  }));
} else if (videosWithLoomId.length >= 5) {
  // Select 5 spread across sections — pick from first video of sections 1,3,5,7,9 if possible
  // Group by sectionOrder
  const bySection = {};
  for (const v of videosWithLoomId) {
    if (!bySection[v.sectionOrder]) bySection[v.sectionOrder] = [];
    bySection[v.sectionOrder].push(v);
  }
  const sectionOrders = Object.keys(bySection).map(Number).sort((a, b) => a - b);

  // Take first video from every other section to spread across 5 different sections
  const selected = [];
  const step = Math.max(1, Math.floor(sectionOrders.length / 5));
  for (let i = 0; i < sectionOrders.length && selected.length < 5; i += step) {
    selected.push(bySection[sectionOrders[i]][0]);
  }
  // Fill up to 5 if we didn't get enough
  for (const v of videosWithLoomId) {
    if (selected.length >= 5) break;
    if (!selected.find((s) => s.videoId === v.videoId)) {
      selected.push(v);
    }
  }
  testEntries = selected.slice(0, 5);
} else if (videosWithLoomId.length > 0) {
  // Use all available manifest IDs, then supplement with CLI args and/or fallback
  testEntries = [...videosWithLoomId];
  for (const id of cliIds) {
    if (testEntries.length >= 5) break;
    if (!testEntries.find((e) => e.videoId === id)) {
      testEntries.push({ videoId: id, title: 'CLI-provided', section: 'CLI' });
    }
  }
  // If still fewer than 5, note it (do NOT pad with random IDs)
} else if (cliIds.length > 0) {
  // 0 manifest IDs: use CLI args
  testEntries = cliIds.map((id) => ({
    videoId: id,
    title: 'CLI-provided',
    section: 'CLI',
  }));
} else {
  // 0 manifest IDs and 0 CLI args: use fallback known ID
  console.log(`No Loom IDs in manifest and no CLI arguments. Using fallback ID: ${FALLBACK_ID}`);
  testEntries = [
    {
      videoId: FALLBACK_ID,
      title: 'Known example video (test-loom-api.mjs default)',
      section: 'Fallback',
    },
  ];
}

console.log(`\nTest plan: ${testEntries.length} video(s) selected`);
for (const e of testEntries) {
  console.log(`  - [${e.section}] "${e.title}" — ${e.videoId}`);
}
console.log('');

// ---- Loom GraphQL query ----
function buildRequestBody(videoId) {
  return {
    operationName: 'FetchVideoTranscript',
    variables: { videoId, password: null },
    query:
      'query FetchVideoTranscript($videoId: ID!, $password: String) { fetchVideoTranscript(videoId: $videoId, password: $password) { ... on VideoTranscriptDetails { captions_source_url source_url transcription_status __typename } ... on GenericError { message __typename } __typename } }',
  };
}

// ---- VTT parser ----
function parseVttToText(vtt) {
  return vtt
    .split('\n')
    .filter(
      (line) =>
        !line.includes('-->') &&
        line.trim() !== '' &&
        !line.match(/^\d+$/) &&
        !line.startsWith('WEBVTT') &&
        !line.startsWith('NOTE')
    )
    .map((l) => {
      return l
        .replace(/<v[^>]*>/g, '')
        .replace(/<\/v>/g, '')
        .replace(/<\/?[a-z][^>]*>/g, '')
        .replace(/^\d+\s+/, '')
        .trim();
    })
    .filter((l) => l.length > 0)
    .join(' ')
    .trim();
}

// ---- Delay helper ----
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Fetch transcript for one video ----
async function fetchTranscript(entry) {
  const startMs = Date.now();
  const result = {
    videoId: entry.videoId,
    title: entry.title,
    section: entry.section,
    status: 'error',
    transcriptionStatus: null,
    transcriptLength: 0,
    transcriptWordCount: 0,
    transcriptPreview: '',
    error: null,
    responseTimeMs: 0,
  };

  try {
    // Step 1: POST to Loom GraphQL
    const res = await fetch(LOOM_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(buildRequestBody(entry.videoId)),
    });

    if (!res.ok) {
      const body = await res.text();
      result.error = `HTTP ${res.status} ${res.statusText}: ${body.substring(0, 200)}`;
      result.responseTimeMs = Date.now() - startMs;
      return result;
    }

    const json = await res.json();
    result.responseTimeMs = Date.now() - startMs;

    // Step 2: Parse GraphQL response
    const transcript = json?.data?.fetchVideoTranscript;

    if (!transcript) {
      result.error = `Unexpected response structure — data.fetchVideoTranscript missing. Full: ${JSON.stringify(json).substring(0, 300)}`;
      return result;
    }

    if (transcript.__typename === 'GenericError') {
      result.error = `Loom GenericError: ${transcript.message}`;
      return result;
    }

    result.transcriptionStatus = transcript.transcription_status;
    const captionsUrl = transcript.captions_source_url;

    if (!captionsUrl) {
      result.error = `captions_source_url is null (transcription_status: "${transcript.transcription_status}"). Video may require auth or transcript is not processed.`;
      return result;
    }

    // Step 3: Fetch VTT
    const vttRes = await fetch(captionsUrl);
    if (!vttRes.ok) {
      const body = await vttRes.text();
      result.error = `VTT fetch failed: HTTP ${vttRes.status}: ${body.substring(0, 200)}`;
      return result;
    }

    const vttText = await vttRes.text();

    // Step 4: Parse VTT
    const plainText = parseVttToText(vttText);

    if (!plainText || plainText.length === 0) {
      result.error = 'VTT parsed to empty string — transcript appears empty';
      return result;
    }

    const words = plainText.split(/\s+/).filter(Boolean).length;
    result.status = 'success';
    result.transcriptLength = plainText.length;
    result.transcriptWordCount = words;
    result.transcriptPreview = plainText.substring(0, 200);
    result.error = null;
  } catch (err) {
    result.responseTimeMs = Date.now() - startMs;
    result.error = `Network error: ${err.message}`;
  }

  return result;
}

// ---- Main ----
async function main() {
  console.log('=== Loom Transcript API Batch Test ===');
  console.log(`Testing ${testEntries.length} video(s) with ${DELAY_MS}ms delay between requests...\n`);

  const results = [];

  for (let i = 0; i < testEntries.length; i++) {
    const entry = testEntries[i];
    console.log(`[${i + 1}/${testEntries.length}] Fetching: "${entry.title}" (${entry.videoId})...`);

    const result = await fetchTranscript(entry);
    results.push(result);

    if (result.status === 'success') {
      console.log(
        `  [OK]  ${entry.section} / "${entry.title}" — ${result.transcriptWordCount.toLocaleString()} words (${(result.responseTimeMs / 1000).toFixed(1)}s)`
      );
    } else {
      console.log(`  [FAIL] ${entry.section} / "${entry.title}" — ${result.error}`);
    }

    // Delay between requests (skip after last)
    if (i < testEntries.length - 1) {
      console.log(`  (waiting ${DELAY_MS}ms before next request...)`);
      await delay(DELAY_MS);
    }
  }

  // ---- Tally results ----
  const successful = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'error').length;
  const totalTested = results.length;

  // ---- Check for ALL failing with null captions (auth issue signal) ----
  const allNullCaptions = results.every(
    (r) => r.error && r.error.includes('captions_source_url is null')
  );
  if (allNullCaptions && failed === totalTested) {
    console.log(
      '\nLIKELY AUTH ISSUE — All videos returned null captions_source_url. Loom may require a session cookie (connect.sid) for these embedded videos. See research Open Question #2.'
    );
  }

  // ---- Write results file ----
  const output = {
    testedAt: new Date().toISOString(),
    totalTested,
    successful,
    failed,
    results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nResults written to: output/loom-test-results.json`);

  // ---- Print summary ----
  console.log('\n=== Loom Transcript API Test Results ===');
  console.log(`Tested: ${totalTested} videos`);
  console.log(`Successful: ${successful}/${totalTested}`);
  console.log(`Failed: ${failed}/${totalTested}`);
  console.log('\nPer-video results:');
  for (const r of results) {
    if (r.status === 'success') {
      console.log(
        `  [OK]  ${r.section} / "${r.title}" — ${r.transcriptWordCount.toLocaleString()} words (${(r.responseTimeMs / 1000).toFixed(1)}s)`
      );
    } else {
      console.log(`  [FAIL] ${r.section} / "${r.title}" — ${r.error?.substring(0, 100)}`);
    }
  }
  console.log('');

  let resultLabel;
  if (successful === totalTested && totalTested > 0) {
    resultLabel = `PASS (all ${totalTested} succeeded)`;
  } else if (successful === 0) {
    resultLabel = `FAIL (all ${totalTested} failed)`;
  } else {
    resultLabel = `PARTIAL (${successful}/${totalTested} succeeded)`;
  }
  console.log(`Result: ${resultLabel}`);

  // ---- Exit code ----
  if (failed === 0) {
    process.exit(0); // all succeeded
  } else if (successful === 0) {
    process.exit(1); // all failed
  } else {
    process.exit(2); // partial
  }
}

main().catch((err) => {
  console.error(`Unhandled error: ${err.message}`);
  process.exit(1);
});
