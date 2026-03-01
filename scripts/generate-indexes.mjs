#!/usr/bin/env node
/**
 * generate-indexes.mjs
 *
 * Pure filesystem traversal script — NO API calls, NO external dependencies.
 * Generates section-level INDEX.md files and a master COURSE_INDEX.md.
 *
 * Usage: node scripts/generate-indexes.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to project root
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TRANSCRIPTS_DIR = path.join(PROJECT_ROOT, 'output', 'transcripts');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');

/**
 * Converts a filename (with or without extension) to a human-readable title.
 * e.g., "01-introduction.md" -> "Introduction"
 */
function humanizeFilename(filename) {
  return filename
    .replace(/^\d+-/, '')       // Remove numeric prefix (e.g., "01-")
    .replace(/\.md$/, '')        // Remove .md extension
    .replace(/-/g, ' ')          // Replace dashes with spaces
    .replace(/\b\w/g, c => c.toUpperCase()); // Title case each word
}

/**
 * Converts a section directory name to a human-readable section name.
 * e.g., "01-introduction-to-the-course" -> "Introduction To The Course"
 */
function humanizeSectionName(dirName) {
  return dirName
    .replace(/^\d+-/, '')        // Remove numeric prefix (e.g., "01-")
    .replace(/-/g, ' ')          // Replace dashes with spaces
    .replace(/\b\w/g, c => c.toUpperCase()); // Title case each word
}

/**
 * Get today's date as YYYY-MM-DD
 */
function getToday() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate INDEX.md content for a single section directory.
 * @param {string} sectionDir - Absolute path to the section directory
 * @param {string} dirName - Directory name (e.g., "01-introduction-to-the-course")
 * @returns {string} The INDEX.md content
 */
function generateSectionIndex(sectionDir, dirName) {
  const sectionName = humanizeSectionName(dirName);

  // List all files in the section directory
  const allFiles = fs.readdirSync(sectionDir).sort();

  // Separate special files from video files
  const hasSectionSummary = allFiles.includes('SECTION_SUMMARY.md');
  const hasCheatSheet = allFiles.includes('CHEAT_SHEET.md');

  // Video files: .md files that are NOT the special files and NOT INDEX.md
  const videoFiles = allFiles.filter(f => {
    return f.endsWith('.md')
      && f !== 'SECTION_SUMMARY.md'
      && f !== 'CHEAT_SHEET.md'
      && f !== 'INDEX.md';
  });

  const lines = [];

  lines.push(`# ${sectionName} — Index`);
  lines.push('');

  // Reference Files subsection (only if any exist)
  if (hasSectionSummary || hasCheatSheet) {
    lines.push('## Reference Files');
    lines.push('');
    if (hasSectionSummary) {
      lines.push('- [Section Summary](SECTION_SUMMARY.md)');
    }
    if (hasCheatSheet) {
      lines.push('- [Cheat Sheet](CHEAT_SHEET.md)');
    }
    lines.push('');
  }

  // Videos subsection
  lines.push('## Videos');
  lines.push('');

  if (videoFiles.length === 0) {
    lines.push('*No video files in this section.*');
  } else {
    for (const videoFile of videoFiles) {
      const title = humanizeFilename(videoFile);
      lines.push(`- [${title}](${videoFile})`);
    }
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Generate the master COURSE_INDEX.md content.
 * @param {Array} sections - Array of { dirName, sectionName, videoFiles, hasSummary, hasCheatSheet }
 * @returns {string} The COURSE_INDEX.md content
 */
function generateCourseIndex(sections) {
  const today = getToday();
  const totalVideos = sections.reduce((sum, s) => sum + s.videoFiles.length, 0);
  const totalSections = sections.length;

  const lines = [];

  lines.push('# Bull Run Millions Crypto Course — Master Index');
  lines.push('');
  lines.push(`**${totalSections} sections** · **${totalVideos} videos** · Generated: ${today}`);
  lines.push('');
  lines.push('- [Master Summary](MASTER_SUMMARY.md)');
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const section of sections) {
    const { dirName, sectionName, videoFiles, hasSummary, hasCheatSheet } = section;

    // Section heading as link to section INDEX.md
    lines.push(`## [${sectionName}](transcripts/${dirName}/INDEX.md)`);
    lines.push('');

    // Metadata line
    const metaParts = [`${videoFiles.length} video${videoFiles.length !== 1 ? 's' : ''}`];
    if (hasSummary) {
      metaParts.push(`[Summary](transcripts/${dirName}/SECTION_SUMMARY.md)`);
    }
    if (hasCheatSheet) {
      metaParts.push(`[Cheat Sheet](transcripts/${dirName}/CHEAT_SHEET.md)`);
    }
    lines.push(metaParts.join(' · '));
    lines.push('');

    // Video file links
    if (videoFiles.length === 0) {
      lines.push('*No video files in this section.*');
    } else {
      for (const videoFile of videoFiles) {
        const title = humanizeFilename(videoFile);
        lines.push(`- [${title}](transcripts/${dirName}/${videoFile})`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Main entry point — scan directories, generate all index files.
 */
function main() {
  console.log('Generating index files...\n');

  // Get sorted list of section directories
  const sectionDirs = fs.readdirSync(TRANSCRIPTS_DIR)
    .filter(name => {
      const fullPath = path.join(TRANSCRIPTS_DIR, name);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort(); // Alphabetical sort preserves numeric prefix ordering

  console.log(`Found ${sectionDirs.length} section directories.\n`);

  const sectionsData = [];

  // Generate per-section INDEX.md files
  for (const dirName of sectionDirs) {
    const sectionDir = path.join(TRANSCRIPTS_DIR, dirName);
    const indexPath = path.join(sectionDir, 'INDEX.md');

    // Collect section metadata
    const allFiles = fs.readdirSync(sectionDir).sort();
    const hasSummary = allFiles.includes('SECTION_SUMMARY.md');
    const hasCheatSheet = allFiles.includes('CHEAT_SHEET.md');
    const videoFiles = allFiles.filter(f => {
      return f.endsWith('.md')
        && f !== 'SECTION_SUMMARY.md'
        && f !== 'CHEAT_SHEET.md'
        && f !== 'INDEX.md';
    });

    sectionsData.push({
      dirName,
      sectionName: humanizeSectionName(dirName),
      videoFiles,
      hasSummary,
      hasCheatSheet,
    });

    // Generate and write section INDEX.md
    const content = generateSectionIndex(sectionDir, dirName);
    fs.writeFileSync(indexPath, content, 'utf8');
    console.log(`  Written: transcripts/${dirName}/INDEX.md (${videoFiles.length} videos)`);
  }

  // Generate master COURSE_INDEX.md
  const courseIndexContent = generateCourseIndex(sectionsData);
  const courseIndexPath = path.join(OUTPUT_DIR, 'COURSE_INDEX.md');
  fs.writeFileSync(courseIndexPath, courseIndexContent, 'utf8');
  console.log(`\n  Written: COURSE_INDEX.md`);

  // Summary
  const totalVideos = sectionsData.reduce((sum, s) => sum + s.videoFiles.length, 0);
  console.log(`\nDone.`);
  console.log(`  ${sectionDirs.length} section INDEX.md files generated`);
  console.log(`  1 COURSE_INDEX.md generated`);
  console.log(`  ${totalVideos} total videos indexed`);
}

main();
