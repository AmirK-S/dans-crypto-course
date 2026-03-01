/**
 * clean-transcripts.mjs
 *
 * In-place transcript cleaning script.
 * Removes filler words, Loom VTT end-of-video artifacts, and Skool navigation boilerplate
 * from all 95 transcript markdown files in output/transcripts/.
 *
 * Usage: node scripts/clean-transcripts.mjs
 *
 * Idempotent — safe to run multiple times.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const TRANSCRIPTS_DIR = join(PROJECT_ROOT, 'output', 'transcripts');

// Recursively collect all .md files under a directory
function collectMarkdownFiles(dir) {
  const results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
    } else if (entry.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Clean the body text (content after ## Transcript or ## Content heading).
 * Returns the cleaned body text.
 */
function cleanBody(bodyText) {
  let text = bodyText;

  // 1. Remove Loom VTT end-of-video artifacts
  text = text.replace(/\bThanks\s+(?:for\s+)?watching[.!]?\s*/gi, '');
  text = text.replace(/\bWe'll\s+see\s+you(?:\s+next)?\b[.!]?\s*/gi, '');
  // "See you next one", "See you next time", "See you in the next video", etc.
  text = text.replace(/\bSee\s+you\s+(?:in\s+the\s+)?next(?:\s+\w+)?\b[.!]?\s*/gi, '');

  // 2. Remove filler sounds
  //    - "uh", "uhh", "uhhh", etc.
  text = text.replace(/\buh[h]*\b\s*/gi, '');
  //    - "uhm", "uhmm", etc. (u followed by h then m+)
  text = text.replace(/\buh[hm]*m+\b\s*/gi, '');
  //    - "umm", "ummm", etc.
  text = text.replace(/\bumm+\b\s*/gi, '');

  // 3. Remove VTT pause dots (". . ." patterns)
  text = text.replace(/\.\s+\.\s+\.\s*/g, ' ');

  // 4. Remove Skool navigation boilerplate
  //    Matches "Bullrun Millions Crypto Course" and everything after it to end of line/file
  text = text.replace(/Bullrun Millions Crypto Course.*$/gms, '');

  // 5. Collapse multiple spaces to single space
  text = text.replace(/  +/g, ' ');

  // 6. Trim the result
  text = text.trim();

  return text;
}

/**
 * Process a single markdown file.
 * Extracts the body text after ## Transcript or ## Content heading,
 * cleans it, reconstructs the file, and writes back in-place.
 *
 * Returns: { modified: boolean, charsRemoved: number }
 */
function processFile(filePath) {
  const original = readFileSync(filePath, 'utf8');

  // Find the ## Transcript or ## Content heading
  // The heading must be on its own line (start of line)
  const headingMatch = original.match(/^(## (?:Transcript|Content))\s*$/m);

  if (!headingMatch) {
    // No recognized heading found — skip processing but don't error
    return { modified: false, charsRemoved: 0, reason: 'no-heading' };
  }

  const headingIndex = original.indexOf(headingMatch[0]);
  const headingEnd = headingIndex + headingMatch[0].length;

  // Everything up to and including the heading line
  const header = original.slice(0, headingEnd);

  // Everything after the heading line (the body text)
  const bodyWithLeadingNewline = original.slice(headingEnd);

  // Preserve the leading newline(s) between heading and body
  const leadingNewlinesMatch = bodyWithLeadingNewline.match(/^(\n+)/);
  const leadingNewlines = leadingNewlinesMatch ? leadingNewlinesMatch[1] : '\n';
  const body = bodyWithLeadingNewline.slice(leadingNewlines.length);

  // Clean the body text
  const cleanedBody = cleanBody(body);

  // Reconstruct the full file
  const reconstructed = header + leadingNewlines + cleanedBody + '\n';

  if (reconstructed === original) {
    return { modified: false, charsRemoved: 0 };
  }

  const charsRemoved = original.length - reconstructed.length;
  writeFileSync(filePath, reconstructed, 'utf8');
  return { modified: true, charsRemoved };
}

// Main execution
function main() {
  console.log('Transcript Cleaning Script');
  console.log('==========================');
  console.log(`Scanning: ${TRANSCRIPTS_DIR}\n`);

  const files = collectMarkdownFiles(TRANSCRIPTS_DIR);
  console.log(`Found ${files.length} markdown files\n`);

  let totalModified = 0;
  let totalSkipped = 0;
  let totalCharsRemoved = 0;

  for (const filePath of files) {
    const relPath = relative(TRANSCRIPTS_DIR, filePath);
    try {
      const result = processFile(filePath);
      if (result.modified) {
        totalModified++;
        totalCharsRemoved += result.charsRemoved;
        console.log(`[CLEAN] ${relPath} (removed ${result.charsRemoved} chars)`);
      } else {
        totalSkipped++;
        console.log(`[SKIP]  ${relPath} (no changes)`);
      }
    } catch (err) {
      console.error(`[ERROR] ${relPath}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\n==========================');
  console.log('Summary');
  console.log('==========================');
  console.log(`Total files processed : ${files.length}`);
  console.log(`Files modified        : ${totalModified}`);
  console.log(`Files skipped         : ${totalSkipped}`);
  console.log(`Total chars removed   : ${totalCharsRemoved}`);
}

main();
