import fetch from 'node-fetch';

// ============================================================
// LOOM GRAPHQL TRANSCRIPT TEST SCRIPT
// ============================================================
// Usage: node scripts/test-loom-api.mjs [videoId]
// Default videoId: 13f9e28d4c434a878b8416bd8c364af3
//
// Tests the Loom GraphQL transcript API against a known video ID.
// Validates: GraphQL POST -> captions_source_url -> VTT fetch -> text parse
// ============================================================

const DEFAULT_VIDEO_ID = '13f9e28d4c434a878b8416bd8c364af3';
const videoId = process.argv[2] || DEFAULT_VIDEO_ID;

const LOOM_GRAPHQL_URL = 'https://www.loom.com/graphql';

// Anti-pattern: Do NOT send as array [{}] (Pitfall 1)
// Anti-pattern: Do NOT include x-loom-request-source or apollographql-client-version (Pitfall 2)
const requestBody = {
  operationName: 'FetchVideoTranscript',
  variables: { videoId, password: null },
  query: 'query FetchVideoTranscript($videoId: ID!, $password: String) { fetchVideoTranscript(videoId: $videoId, password: $password) { ... on VideoTranscriptDetails { captions_source_url source_url transcription_status __typename } ... on GenericError { message __typename } __typename } }',
};

/**
 * Parse VTT subtitle file to plain text.
 * Removes WEBVTT header, timestamps (-->), cue identifiers, and voice span tags.
 * Handles Loom's specific VTT format which may include <v N>text</v> voice tags.
 */
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
      // Strip WebVTT voice span tags: <v N>text</v> -> text
      return l
        .replace(/<v[^>]*>/g, '')
        .replace(/<\/v>/g, '')
        // Strip other VTT inline tags like <c>, <b>, <i>, <u>
        .replace(/<\/?[a-z][^>]*>/g, '')
        // Strip leading cue sequence numbers (Loom includes e.g. "1 Alright guys...")
        .replace(/^\d+\s+/, '')
        .trim();
    })
    // Remove lines that became empty after stripping tags
    .filter((l) => l.length > 0)
    .join(' ')
    .trim();
}

async function main() {
  console.log(`[test-loom-api] Video ID: ${videoId}`);
  console.log(`[test-loom-api] Querying Loom GraphQL at ${LOOM_GRAPHQL_URL} ...`);

  // ---- Step 1: POST to Loom GraphQL ----
  let graphqlResponse;
  try {
    const res = await fetch(LOOM_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[test-loom-api] HTTP error from Loom GraphQL: ${res.status} ${res.statusText}`);
      console.error(`[test-loom-api] Response body: ${body}`);
      process.exit(1);
    }

    graphqlResponse = await res.json();
  } catch (err) {
    console.error(`[test-loom-api] Network error reaching Loom GraphQL: ${err.message}`);
    process.exit(1);
  }

  // ---- Step 2: Parse GraphQL response ----
  // Anti-pattern: Do NOT use graphqlResponse.data[0].data (Pitfall from research)
  const transcript = graphqlResponse?.data?.fetchVideoTranscript;

  if (!transcript) {
    console.error('[test-loom-api] Unexpected response structure — data.fetchVideoTranscript missing.');
    console.error('[test-loom-api] Full response:', JSON.stringify(graphqlResponse, null, 2));
    process.exit(1);
  }

  // Handle GenericError __typename
  if (transcript.__typename === 'GenericError') {
    console.error(`[test-loom-api] Loom returned a GenericError: ${transcript.message}`);
    process.exit(1);
  }

  const transcriptionStatus = transcript.transcription_status;
  const captionsUrl = transcript.captions_source_url;

  console.log(`[test-loom-api] Transcription status: ${transcriptionStatus}`);

  if (transcriptionStatus !== 'completed') {
    console.warn(
      `[test-loom-api] WARNING: Transcription status is "${transcriptionStatus}" (not "completed"). ` +
        'Captions may be unavailable or incomplete.'
    );
  }

  if (!captionsUrl) {
    console.error(
      `[test-loom-api] captions_source_url is null. transcription_status="${transcriptionStatus}". ` +
        'This video may not have a processed transcript yet, or may require authentication.'
    );
    process.exit(1);
  }

  console.log(`[test-loom-api] Captions URL: ${captionsUrl}`);

  // ---- Step 3: Fetch the VTT file ----
  let vttText;
  try {
    const vttRes = await fetch(captionsUrl);
    if (!vttRes.ok) {
      const body = await vttRes.text();
      console.error(`[test-loom-api] HTTP error fetching VTT: ${vttRes.status} ${vttRes.statusText}`);
      console.error(`[test-loom-api] Response body: ${body}`);
      process.exit(1);
    }
    vttText = await vttRes.text();
  } catch (err) {
    console.error(`[test-loom-api] Network error fetching VTT file: ${err.message}`);
    process.exit(1);
  }

  // ---- Step 4: Parse VTT to plain text ----
  const plainText = parseVttToText(vttText);

  if (!plainText || plainText.length === 0) {
    console.error('[test-loom-api] VTT parsed to empty string — transcript appears to be empty.');
    process.exit(1);
  }

  // ---- Step 5: Output results ----
  const words = plainText.split(/\s+/).filter(Boolean).length;
  console.log(`[test-loom-api] Transcript length: ${plainText.length} characters, ${words} words`);
  console.log('[test-loom-api] First 500 characters:');
  console.log(plainText.substring(0, 500));

  process.exit(0);
}

main().catch((err) => {
  console.error(`[test-loom-api] Unhandled error: ${err.message}`);
  process.exit(1);
});
