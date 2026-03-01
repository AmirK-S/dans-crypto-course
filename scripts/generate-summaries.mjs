/**
 * generate-summaries.mjs
 * Phase 3 Plan 02: AI Summarization Pipeline
 *
 * Generates per-section trading playbook summaries using Claude Haiku 4.5,
 * then synthesizes a master course summary using Claude Sonnet 4.6.
 *
 * Usage: node scripts/generate-summaries.mjs
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

const SECTION_MODEL = 'claude-haiku-4-5-20251001';  // Cost-optimized for extractive tasks
const MASTER_MODEL = 'claude-sonnet-4-6';            // Higher quality for synthesis
const INTER_SECTION_DELAY_MS = 1000;

const TRANSCRIPTS_DIR = join(ROOT, 'output', 'transcripts');
const MASTER_SUMMARY_PATH = join(ROOT, 'output', 'MASTER_SUMMARY.md');

// ---------------------------------------------------------------------------
// API key guard (fail-fast)
// ---------------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set. Run: export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Transcript cleaning (safety net — applied before AI call)
// ---------------------------------------------------------------------------

/**
 * cleanTranscript(rawText)
 * Removes spoken word artifacts and Loom VTT end-of-video noise from raw
 * transcript text. This is a safety net for any content not fully cleaned
 * during the in-place cleaning step (Plan 03-01).
 */
function cleanTranscript(rawText) {
  let text = rawText;

  // Remove Loom VTT end-of-video artifacts
  text = text.replace(/\bThanks\s+(?:for\s+)?watching[.!]?\s*/gi, '');
  text = text.replace(/\bWe'll\s+see\s+you(?:\s+next)?\b[.!]?\s*/gi, '');
  text = text.replace(/\bSee\s+you\s+(?:in\s+the\s+)?next(?:\s+\w+)?\b[.!]?\s*/gi, '');

  // Remove filler sounds
  text = text.replace(/\buh[hm]*\b\s*/gi, '');
  text = text.replace(/\bu[hm]{2,}\b\s*/gi, '');
  text = text.replace(/\bumm+\b\s*/gi, '');

  // Remove VTT pause dots
  text = text.replace(/\.\s+\.\s+\.\s*/g, ' ');

  // Remove Skool navigation boilerplate
  text = text.replace(/Bullrun Millions Crypto Course.*?$/gms, '');

  // Collapse multiple spaces to single
  text = text.replace(/  +/g, ' ');

  return text.trim();
}

// ---------------------------------------------------------------------------
// getSectionTranscripts(sectionDir)
// ---------------------------------------------------------------------------

/**
 * Reads all transcript .md files in a section directory, filters out stubs
 * and boilerplate, extracts content after ## Transcript or ## Content heading,
 * and returns an array of cleaned transcript strings.
 */
function getSectionTranscripts(sectionDir) {
  const files = readdirSync(sectionDir)
    .filter(f => f.endsWith('.md') && f !== 'SECTION_SUMMARY.md')
    .sort();

  const transcripts = [];

  for (const file of files) {
    const content = readFileSync(join(sectionDir, file), 'utf8');

    // Skip YouTube stubs (no usable text)
    if (content.includes('YouTube video embed')) continue;

    // Skip Skool navigation boilerplate (< 100 words of real content)
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount < 100) continue;

    // Extract transcript text after ## Transcript or ## Content heading
    const match = content.match(/## (?:Transcript|Content)\s*\n+([\s\S]+)/);
    if (match && match[1].trim().length > 50) {
      transcripts.push(cleanTranscript(match[1].trim()));
    }
  }

  return transcripts; // Empty array = skip this section
}

// ---------------------------------------------------------------------------
// generateSectionSummary(sectionName, transcriptTexts, client)
// ---------------------------------------------------------------------------

/**
 * Calls Claude Haiku to generate a trading playbook summary for one section.
 * Temperature 0 for deterministic, extractive output.
 * Anti-hallucination: only include explicitly stated information.
 */
async function generateSectionSummary(sectionName, transcriptTexts, client) {
  const combinedTranscripts = transcriptTexts
    .map((t, i) => `<transcript index="${i + 1}">\n${t}\n</transcript>`)
    .join('\n\n');

  const message = await client.messages.create({
    model: SECTION_MODEL,
    max_tokens: 4096,
    temperature: 0,
    system: `You are a trading analyst extracting structured knowledge from crypto course transcripts.
Your task is to produce a trading playbook summary from the provided transcripts.

CRITICAL RULES:
- Only include information EXPLICITLY STATED in the transcripts
- Do NOT fabricate numbers, percentages, indicators, or thresholds
- Do NOT infer or extrapolate — if it is not said, omit it
- If a section (Rules, Entry Signals, Position Sizing) has no explicit content in the transcripts, write "Not explicitly covered in this section's transcripts."
- Quote or paraphrase only what the instructor actually says`,
    messages: [
      {
        role: 'user',
        content: `Summarize the following transcripts from the "${sectionName}" section of a crypto trading course into a trading playbook.

<transcripts>
${combinedTranscripts}
</transcripts>

Write the summary in this exact format:

## ${sectionName} — Trading Playbook Summary

### Core Concepts
[3–7 bullet points of the main ideas explicitly taught in this section]

### Rules
[Explicit rules or principles stated by the instructor — use their exact phrasing where possible]

### Entry Signals
[Any entry criteria, conditions, or triggers explicitly mentioned — omit if not covered]

### Position Sizing / Risk Management
[Any explicit guidance on sizing, risk, or exit criteria — omit if not covered]

### Key Warnings / What Not To Do
[Any explicit "do not do this" guidance from the instructor]

Do not add information that is not in the transcripts. Do not preamble.`,
      },
    ],
  });

  if (!message.content || !Array.isArray(message.content) || message.content.length === 0) {
    throw new Error('API returned empty content array');
  }

  return message.content[0].text;
}

// ---------------------------------------------------------------------------
// generateMasterSummary(sectionSummaries, client)
// ---------------------------------------------------------------------------

/**
 * Calls Claude Sonnet to synthesize all section summaries into one master
 * course-level trading playbook.
 */
async function generateMasterSummary(sectionSummaries, client) {
  const combinedSummaries = sectionSummaries
    .map(s => `<section name="${s.name}">\n${s.summary}\n</section>`)
    .join('\n\n');

  const message = await client.messages.create({
    model: MASTER_MODEL,
    max_tokens: 8192,
    system: `You are a trading analyst synthesizing a complete crypto trading course into a master reference playbook.
You are given summaries of course sections. Your job is to synthesize them into a single coherent course-level trading playbook.

CRITICAL RULES:
- Only include information present in the provided section summaries
- Do not add external knowledge about crypto, trading strategies, or markets
- If sections conflict on a point, note the conflict — do not resolve it by inventing a consensus
- Preserve the instructor's original phrasing for rules and signals`,
    messages: [
      {
        role: 'user',
        content: `Synthesize the following section summaries from a complete crypto trading course into one master trading playbook.

<section_summaries>
${combinedSummaries}
</section_summaries>

Write the master summary in this format:

# MASTER SUMMARY: Bull Run Millions Crypto Course Trading Playbook

## Course Philosophy
[The core investment philosophy and mental model taught across all sections]

## The Strategy in Brief
[The single most important strategic framework — what the instructor says to do, in their terms]

## Master Rules (from all sections)
[All explicit rules, consolidated and deduplicated — with section attribution in brackets]

## Entry Signals & Conditions
[All explicit entry criteria across the course — with section attribution]

## Position Sizing & Risk Management
[All explicit sizing, risk, and exit guidance — with section attribution]

## What NOT To Do (Do-Not-Do List)
[All explicit warnings and prohibited behaviors]

## Section-by-Section Quick Reference
[One-line summary per section: what it covers and its single most actionable takeaway]

Do not preamble. Do not add information not in the provided summaries.`,
      },
    ],
  });

  if (!message.content || !Array.isArray(message.content) || message.content.length === 0) {
    throw new Error('API returned empty content array');
  }

  return message.content[0].text;
}

// ---------------------------------------------------------------------------
// delay helper
// ---------------------------------------------------------------------------

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main() {
  console.log('Phase 3 Plan 02: AI Summarization Pipeline');
  console.log(`Section model: ${SECTION_MODEL}`);
  console.log(`Master model:  ${MASTER_MODEL}`);
  console.log('');

  // Read section directories, sorted alphabetically
  const sectionDirs = readdirSync(TRANSCRIPTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(d => ({ name: d.name, path: join(TRANSCRIPTS_DIR, d.name) }));

  console.log(`Found ${sectionDirs.length} section directories`);
  console.log('');

  const sectionSummaries = [];
  let generatedCount = 0;
  let skippedCount = 0;
  let stubCount = 0;

  for (const section of sectionDirs) {
    const { name: sectionName, path: sectionDir } = section;
    const summaryPath = join(sectionDir, 'SECTION_SUMMARY.md');

    // Checkpoint/resume: skip sections where SECTION_SUMMARY.md already exists
    if (existsSync(summaryPath)) {
      console.log(`[SKIP] ${sectionName} — summary already exists`);
      const existing = readFileSync(summaryPath, 'utf8');
      sectionSummaries.push({ name: sectionName, summary: existing });
      skippedCount++;
      continue;
    }

    // Get usable transcript content for this section
    const transcripts = getSectionTranscripts(sectionDir);

    // No content → write stub summary (e.g. section 02 — YouTube-only)
    if (transcripts.length === 0) {
      console.log(`[STUB] ${sectionName} — no transcript content (YouTube-only or empty)`);
      const stub = `*No transcript content available — videos in this section are hosted on YouTube or have no Loom transcript.*`;
      writeFileSync(summaryPath, stub, 'utf8');
      sectionSummaries.push({ name: sectionName, summary: stub });
      stubCount++;
      continue;
    }

    // Generate section summary via Claude API
    console.log(`[SUMMARIZE] ${sectionName} (${transcripts.length} transcripts)`);

    try {
      const summary = await generateSectionSummary(sectionName, transcripts, client);

      if (summary.length < 200) {
        console.warn(`[WARN] ${sectionName} — summary suspiciously short (${summary.length} chars)`);
      }

      writeFileSync(summaryPath, summary, 'utf8');
      sectionSummaries.push({ name: sectionName, summary });
      console.log(`[OK] ${sectionName} — summary written (${summary.length} chars)`);
      generatedCount++;
    } catch (err) {
      console.error(`[ERROR] ${sectionName}: ${err.message}`);
      // Continue to next section — do not abort entire pipeline for one failure
      continue;
    }

    // Courtesy delay between API calls
    await delay(INTER_SECTION_DELAY_MS);
  }

  console.log('');
  console.log(`Section summaries: ${generatedCount} generated, ${skippedCount} skipped, ${stubCount} stubs`);
  console.log('');

  // Generate master summary
  if (existsSync(MASTER_SUMMARY_PATH)) {
    console.log('[SKIP] MASTER_SUMMARY.md — already exists');
  } else {
    console.log('[MASTER] Generating course-level master summary...');
    try {
      const masterSummary = await generateMasterSummary(sectionSummaries, client);

      if (masterSummary.length < 200) {
        console.warn(`[WARN] MASTER_SUMMARY — suspiciously short (${masterSummary.length} chars)`);
      }

      writeFileSync(MASTER_SUMMARY_PATH, masterSummary, 'utf8');
      console.log(`[OK] MASTER_SUMMARY.md written (${masterSummary.length} chars)`);
    } catch (err) {
      console.error(`[ERROR] Master summary: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('');
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
