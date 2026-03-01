import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ============================================================
// MANIFEST VALIDATION SCRIPT
// ============================================================
// Usage: node scripts/validate-manifest.mjs
//
// Validates the structure, completeness, and data quality
// of output/manifest.json produced by the Skool extraction step.
//
// Exit codes:
//   0 = PASS (all checks pass)
//   1 = FAIL (structural errors)
//   2 = WARN (counts off but structure valid)
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MANIFEST_PATH = join(__dirname, '..', 'output', 'manifest.json');

const errors = [];
const warnings = [];

// ---- Step 1: Read and parse manifest.json ----
let manifest;
try {
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  manifest = JSON.parse(raw);
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error('FAIL: output/manifest.json does not exist.');
    process.exit(1);
  }
  console.error(`FAIL: output/manifest.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

// ---- Step 2: Validate top-level structure ----
if (typeof manifest.extractedAt !== 'string' || !manifest.extractedAt) {
  errors.push('Missing or invalid extractedAt (expected ISO date string)');
} else {
  const d = new Date(manifest.extractedAt);
  if (isNaN(d.getTime())) {
    errors.push(`extractedAt "${manifest.extractedAt}" is not a valid ISO date`);
  }
}

if (typeof manifest.courseUrl !== 'string' || !manifest.courseUrl) {
  errors.push('Missing or invalid courseUrl (expected string)');
} else if (!manifest.courseUrl.includes('skool.com')) {
  errors.push(`courseUrl "${manifest.courseUrl}" does not contain "skool.com"`);
}

if (typeof manifest.totalVideos !== 'number' || manifest.totalVideos <= 0) {
  errors.push(`Missing or invalid totalVideos (got ${manifest.totalVideos}, expected number > 0)`);
}

if (!Array.isArray(manifest.sections) || manifest.sections.length === 0) {
  errors.push('Missing or empty sections array');
  // Can't proceed with section validation
  printReport(manifest, 0, 0, 0, 0);
  process.exit(1);
}

// ---- Step 3: Validate section structure ----
const sectionOrders = [];
let totalVideosFromSections = 0;
let videosWithTitle = 0;
let videosWithLoomId = 0;
const allMdIds = new Map(); // mdId -> { section, title }

for (const [sIdx, section] of manifest.sections.entries()) {
  const sectionLabel = `Section[${sIdx}]`;

  if (typeof section.name !== 'string' || !section.name.trim()) {
    errors.push(`${sectionLabel}: missing or empty name`);
  }

  if (typeof section.order !== 'number' || section.order < 1) {
    errors.push(`${sectionLabel} "${section.name}": order must be a number >= 1, got ${section.order}`);
  } else {
    sectionOrders.push(section.order);
  }

  if (!Array.isArray(section.videos)) {
    errors.push(`${sectionLabel} "${section.name}": missing or invalid videos array`);
    continue;
  }
  if (section.videos.length === 0) {
    // Empty sections can be legitimate placeholders (e.g. "Coming Soon")
    warnings.push(`${sectionLabel} "${section.name}": has 0 videos (placeholder/coming-soon section)`);
    continue;
  }

  // ---- Step 4: Validate video structure ----
  const videoOrders = [];
  for (const [vIdx, video] of section.videos.entries()) {
    const videoLabel = `${sectionLabel}.video[${vIdx}]`;

    // Title check
    if (typeof video.title !== 'string' || !video.title.trim()) {
      errors.push(`${videoLabel}: missing or empty title`);
    } else {
      videosWithTitle++;
    }

    // mdId check — must be 32-char hex
    if (typeof video.mdId !== 'string' || !video.mdId.match(/^[a-f0-9]{32}$/)) {
      errors.push(`${videoLabel} "${video.title}": mdId "${video.mdId}" does not match /^[a-f0-9]{32}$/`);
    } else {
      // Check for duplicate mdIds
      const key = video.mdId;
      if (allMdIds.has(key)) {
        warnings.push(
          `Duplicate mdId "${key}" found in "${video.title}" (also in "${allMdIds.get(key).title}")`
        );
      } else {
        allMdIds.set(key, { section: section.name, title: video.title });
      }
    }

    // order check
    if (typeof video.order !== 'number' || video.order < 1) {
      errors.push(`${videoLabel} "${video.title}": order must be number >= 1, got ${video.order}`);
    } else {
      videoOrders.push(video.order);
    }

    // loomId check (optional but if present, must be valid)
    if (video.loomId !== null && video.loomId !== undefined) {
      if (!video.loomId.match(/^[a-f0-9]{32}$/)) {
        errors.push(`${videoLabel} "${video.title}": loomId "${video.loomId}" does not match /^[a-f0-9]{32}$/`);
      } else {
        videosWithLoomId++;
      }
    }

    // loomEmbedUrl check (optional but if present, must contain loom.com/embed/)
    if (video.loomEmbedUrl !== null && video.loomEmbedUrl !== undefined) {
      if (!video.loomEmbedUrl.includes('loom.com/embed/')) {
        errors.push(
          `${videoLabel} "${video.title}": loomEmbedUrl "${video.loomEmbedUrl}" does not contain "loom.com/embed/"`
        );
      }
    }

    totalVideosFromSections++;
  }

  // Check video orders are sequential starting from 1
  const sortedVideoOrders = [...videoOrders].sort((a, b) => a - b);
  for (let i = 0; i < sortedVideoOrders.length; i++) {
    if (sortedVideoOrders[i] !== i + 1) {
      warnings.push(
        `${sectionLabel} "${section.name}": video orders are not sequential (expected ${i + 1}, got ${sortedVideoOrders[i]})`
      );
      break;
    }
  }
}

// Check section orders are sequential starting from 1 with no gaps
const sortedSectionOrders = [...sectionOrders].sort((a, b) => a - b);
for (let i = 0; i < sortedSectionOrders.length; i++) {
  if (sortedSectionOrders[i] !== i + 1) {
    warnings.push(
      `Section orders are not sequential (expected ${i + 1}, got ${sortedSectionOrders[i]})`
    );
    break;
  }
}

// ---- Step 5: Completeness checks ----
// Total video count vs totalVideos field
if (typeof manifest.totalVideos === 'number' && totalVideosFromSections !== manifest.totalVideos) {
  warnings.push(
    `totalVideos field says ${manifest.totalVideos} but actual video count across sections is ${totalVideosFromSections}`
  );
}

// Section count checks
const sectionCount = manifest.sections.length;
if (sectionCount < 5) {
  errors.push(`Section count ${sectionCount} is too low (< 5). Expected ~13. Likely extraction failure.`);
} else if (sectionCount < 10) {
  warnings.push(`Section count ${sectionCount} is below expected range (~13). May need enrichment.`);
} else if (sectionCount > 20) {
  warnings.push(`Section count ${sectionCount} is above expected range (~13). Check for false positives.`);
}

// Total video count checks
if (totalVideosFromSections < 20) {
  errors.push(`Total video count ${totalVideosFromSections} is too low (< 20). Expected ~80. Likely extraction failure.`);
} else if (totalVideosFromSections < 50) {
  warnings.push(`Total video count ${totalVideosFromSections} is below expected range (~80). May be incomplete.`);
} else if (totalVideosFromSections > 120) {
  warnings.push(`Total video count ${totalVideosFromSections} is above expected range (~80). Check for duplicates.`);
}

// ---- Step 6: Loom ID availability ----
const loomPercent = totalVideosFromSections > 0
  ? ((videosWithLoomId / totalVideosFromSections) * 100).toFixed(1)
  : '0.0';

if (videosWithLoomId === 0) {
  console.log(
    'NOTE: 0 videos have a loomId. Loom enrichment is needed — Loom iframes only appear on individual lesson pages, not the classroom root. Run an enrichment pass visiting each ?md=<mdId> page.'
  );
} else {
  console.log(`NOTE: ${videosWithLoomId}/${totalVideosFromSections} (${loomPercent}%) videos have a loomId.`);
}

// ---- Step 7: Output summary report ----
printReport(manifest, sectionCount, totalVideosFromSections, videosWithLoomId, videosWithTitle);

function printReport(manifest, sectionCount, totalVideos, loomCount, titleCount) {
  const loomPct = totalVideos > 0 ? ((loomCount / totalVideos) * 100).toFixed(1) : '0.0';

  console.log('');
  console.log('=== Manifest Validation Report ===');
  console.log(`File: output/manifest.json`);
  console.log(`Extracted at: ${manifest?.extractedAt || 'N/A'}`);
  console.log(`Course URL: ${manifest?.courseUrl || 'N/A'}`);
  console.log('');
  console.log(`Sections: ${sectionCount} (expected ~13)`);
  console.log(`Total videos: ${totalVideos} (expected ~80)`);
  console.log(`Videos with Loom ID: ${loomCount}/${totalVideos} (${loomPct}%)`);
  console.log(`Videos with title: ${titleCount}/${totalVideos}`);
  console.log('');
  console.log('Section breakdown:');
  if (manifest?.sections) {
    for (const s of manifest.sections) {
      const vCount = Array.isArray(s.videos) ? s.videos.length : 0;
      console.log(`  ${s.order}. ${s.name} — ${vCount} videos`);
    }
  }
  console.log('');
  console.log(`Warnings: ${warnings.length === 0 ? 'None' : ''}`);
  for (const w of warnings) {
    console.log(`  - ${w}`);
  }
  console.log(`Errors: ${errors.length === 0 ? 'None' : ''}`);
  for (const e of errors) {
    console.log(`  - ${e}`);
  }
  console.log('');

  if (errors.length > 0) {
    console.log('Result: FAIL');
  } else if (warnings.length > 0) {
    console.log('Result: WARN');
  } else {
    console.log('Result: PASS');
  }
}

// ---- Exit with appropriate code ----
if (errors.length > 0) {
  process.exit(1);
} else if (warnings.length > 0) {
  process.exit(2);
} else {
  process.exit(0);
}
