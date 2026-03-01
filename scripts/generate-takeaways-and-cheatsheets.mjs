/**
 * generate-takeaways-and-cheatsheets.mjs
 * Phase 4 Plan 01: Key Takeaways and Cheat Sheet Generation
 *
 * WAVE 1: Generates per-video key takeaways (3-7 bullets) and inserts them
 *         before the ## Transcript heading in each video .md file.
 *
 * WAVE 2: Generates per-section cheat sheets from SECTION_SUMMARY.md files,
 *         written as CHEAT_SHEET.md in each section directory.
 *
 * Usage: node scripts/generate-takeaways-and-cheatsheets.mjs
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import Anthropic from '@anthropic-ai/sdk';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MODEL = 'claude-haiku-4-5-20251001';
const INTER_CALL_DELAY_MS = 1000;
const MAX_TOKENS_TAKEAWAYS = 512;
const MAX_TOKENS_CHEATSHEET = 1024;

const TRANSCRIPTS_DIR = join(ROOT, 'output', 'transcripts');

// ---------------------------------------------------------------------------
// API key guard (fail-fast)
// ---------------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set.');
  console.error('Run: export ANTHROPIC_API_KEY=sk-ant-...');
  console.error('Get your key at: console.anthropic.com -> API Keys -> Create Key');
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * insertKeyTakeaways(fileContent, takeawaysText)
 * Inserts ## Key Takeaways section before ## Transcript heading.
 * Uses indexOf (NOT string.replace) to avoid regex pitfalls.
 */
function insertKeyTakeaways(fileContent, takeawaysText) {
  const marker = '\n## Transcript';
  const idx = fileContent.indexOf(marker);
  if (idx === -1) return fileContent;
  return (
    fileContent.slice(0, idx) +
    '\n\n## Key Takeaways\n\n' + takeawaysText +
    fileContent.slice(idx)
  );
}

/**
 * deriveSectionName(dirName)
 * Converts "07-fundamental-analysis" -> "Fundamental Analysis"
 */
function deriveSectionName(dirName) {
  return dirName
    .replace(/^\d+-/, '')               // strip numeric prefix
    .split('-')                          // split on dashes
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))  // title case
    .join(' ');
}

// ---------------------------------------------------------------------------
// WAVE 1: Key Takeaways
// ---------------------------------------------------------------------------

async function generateKeyTakeaways(title, transcriptText) {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS_TAKEAWAYS,
    temperature: 0,
    system: `You are a trading analyst extracting key takeaways from a crypto course video transcript.
Extract only what the instructor EXPLICITLY STATES. Do NOT add external knowledge or trading theory.
Do NOT fabricate numbers, indicators, or rules not mentioned in the transcript.`,
    messages: [
      {
        role: 'user',
        content: `Extract 3-7 key takeaway bullets from this crypto course video: "${title}"

<transcript>
${transcriptText}
</transcript>

Write ONLY a bullet list (3-7 items). Each bullet must:
- Start with "- "
- Be a single concise sentence
- Capture only what the instructor explicitly teaches
- Use the instructor's own phrasing where possible

Do not preamble. Do not number the bullets. Output only the bullet list.`,
      },
    ],
  });

  if (!message.content || !Array.isArray(message.content) || message.content.length === 0) {
    throw new Error('API returned empty content array');
  }

  return message.content[0].text.trim();
}

// ---------------------------------------------------------------------------
// WAVE 2: Cheat Sheets
// ---------------------------------------------------------------------------

async function generateCheatSheet(sectionName, sectionSummaryText) {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS_CHEATSHEET,
    temperature: 0,
    system: `You are condensing a detailed trading playbook summary into an ultra-compact cheat sheet.
The cheat sheet must be scannable in under 30 seconds during live trading.
Extract ONLY explicit rules, entry signals, and warnings. No prose. No explanations. Maximum density.
Only include information explicitly present in the summary. Do not add external knowledge.`,
    messages: [
      {
        role: 'user',
        content: `Create an ultra-compact cheat sheet from this section summary for "${sectionName}".

<section_summary>
${sectionSummaryText}
</section_summary>

Write the cheat sheet in this exact format:

# ${sectionName} — Quick Reference Cheat Sheet

## Rules
- [one-line rule]

## Entry Signals
- [one-line signal]

## Warnings / Do Not Do
- [one-line warning]

Only include entries that are EXPLICITLY STATED in the summary.
Omit any section heading if no explicit content exists for it. Do not preamble.`,
      },
    ],
  });

  if (!message.content || !Array.isArray(message.content) || message.content.length === 0) {
    throw new Error('API returned empty content array');
  }

  return message.content[0].text.trim();
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main() {
  console.log('Phase 4 Plan 01: Key Takeaways and Cheat Sheet Generation');
  console.log(`Model: ${MODEL}`);
  console.log('');

  // Read section directories, sorted alphabetically
  const sectionDirs = readdirSync(TRANSCRIPTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(d => ({ name: d.name, path: join(TRANSCRIPTS_DIR, d.name) }));

  console.log(`Found ${sectionDirs.length} section directories`);
  console.log('');

  // ===========================================================================
  // WAVE 1: Key Takeaways
  // ===========================================================================

  console.log('=== WAVE 1: Key Takeaways ===');
  console.log('');

  let takeawaysGenerated = 0;
  let takeawaysSkipped = 0;

  for (const section of sectionDirs) {
    const { name: sectionDirName, path: sectionDir } = section;

    const videoFiles = readdirSync(sectionDir)
      .filter(f =>
        f.endsWith('.md') &&
        f !== 'SECTION_SUMMARY.md' &&
        f !== 'CHEAT_SHEET.md' &&
        f !== 'INDEX.md'
      )
      .sort();

    for (const file of videoFiles) {
      const filePath = join(sectionDir, file);
      const content = readFileSync(filePath, 'utf8');

      // Idempotency: skip if already has Key Takeaways
      if (content.includes('## Key Takeaways')) {
        console.log(`[SKIP] ${sectionDirName}/${file} — already has Key Takeaways`);
        takeawaysSkipped++;
        continue;
      }

      // Skip YouTube stubs
      if (content.includes('YouTube video embed')) {
        console.log(`[SKIP] ${sectionDirName}/${file} — YouTube stub`);
        takeawaysSkipped++;
        continue;
      }

      // Skip if word count < 100
      const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
      if (wordCount < 100) {
        console.log(`[SKIP] ${sectionDirName}/${file} — too short (${wordCount} words)`);
        takeawaysSkipped++;
        continue;
      }

      // Skip if no ## Transcript heading
      if (!content.includes('\n## Transcript')) {
        console.log(`[SKIP] ${sectionDirName}/${file} — no ## Transcript heading`);
        takeawaysSkipped++;
        continue;
      }

      // Extract transcript text after ## Transcript heading
      const transcriptMatch = content.match(/## Transcript\s*\n+([\s\S]+)/);
      if (!transcriptMatch || transcriptMatch[1].trim().length < 100) {
        console.log(`[SKIP] ${sectionDirName}/${file} — transcript content < 100 chars`);
        takeawaysSkipped++;
        continue;
      }

      const transcriptText = transcriptMatch[1].trim();

      // Extract video title from first # line
      const titleMatch = content.match(/^# (.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : file.replace('.md', '');

      // Call Claude Haiku API
      try {
        console.log(`[GENERATE] ${sectionDirName}/${file}`);
        const takeawaysText = await generateKeyTakeaways(title, transcriptText);

        // Count bullets
        const bulletCount = takeawaysText.split('\n').filter(l => l.startsWith('- ')).length;

        // Insert before ## Transcript
        const modifiedContent = insertKeyTakeaways(content, takeawaysText);
        writeFileSync(filePath, modifiedContent, 'utf8');

        console.log(`[OK] ${sectionDirName}/${file} — ${bulletCount} bullets`);
        takeawaysGenerated++;
      } catch (err) {
        console.error(`[ERROR] ${sectionDirName}/${file}: ${err.message}`);
        // Continue to next file — do not abort pipeline
      }

      // Courtesy delay between API calls
      await delay(INTER_CALL_DELAY_MS);
    }
  }

  console.log('');
  console.log(`Key Takeaways: ${takeawaysGenerated} generated, ${takeawaysSkipped} skipped`);
  console.log('');

  // ===========================================================================
  // WAVE 2: Cheat Sheets
  // ===========================================================================

  console.log('=== WAVE 2: Cheat Sheets ===');
  console.log('');

  let cheatsheetsGenerated = 0;
  let cheatsheetsSkipped = 0;

  for (const section of sectionDirs) {
    const { name: sectionDirName, path: sectionDir } = section;
    const cheatSheetPath = join(sectionDir, 'CHEAT_SHEET.md');
    const summaryPath = join(sectionDir, 'SECTION_SUMMARY.md');

    // Idempotency: skip if CHEAT_SHEET.md already exists
    if (existsSync(cheatSheetPath)) {
      console.log(`[SKIP] ${sectionDirName} — CHEAT_SHEET.md already exists`);
      cheatsheetsSkipped++;
      continue;
    }

    // Skip if no SECTION_SUMMARY.md
    if (!existsSync(summaryPath)) {
      console.log(`[SKIP] ${sectionDirName} — no SECTION_SUMMARY.md`);
      cheatsheetsSkipped++;
      continue;
    }

    // Skip stub summaries (< 500 chars)
    const summaryContent = readFileSync(summaryPath, 'utf8');
    if (summaryContent.length < 500) {
      console.log(`[SKIP] ${sectionDirName} — stub summary (${summaryContent.length} chars)`);
      cheatsheetsSkipped++;
      continue;
    }

    const sectionName = deriveSectionName(sectionDirName);

    // Call Claude Haiku API
    try {
      console.log(`[GENERATE] ${sectionDirName} — ${sectionName}`);
      const cheatSheetText = await generateCheatSheet(sectionName, summaryContent);

      writeFileSync(cheatSheetPath, cheatSheetText, 'utf8');
      console.log(`[OK] ${sectionDirName}`);
      cheatsheetsGenerated++;
    } catch (err) {
      console.error(`[ERROR] ${sectionDirName}: ${err.message}`);
      // Continue to next section
    }

    // Courtesy delay between API calls
    await delay(INTER_CALL_DELAY_MS);
  }

  console.log('');
  console.log(`Cheat Sheets: ${cheatsheetsGenerated} generated, ${cheatsheetsSkipped} skipped`);
  console.log('');
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
