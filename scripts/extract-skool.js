// ============================================================
// SKOOL CLASSROOM EXTRACTION SCRIPT
// ============================================================
// IMPORTANT: Before running this script, you MUST:
//   1. Navigate to the Skool classroom ROOT page (no ?md= parameter):
//      https://www.skool.com/bullrun-millions-crypto-course-9312/classroom
//   2. EXPAND ALL SIDEBAR SECTIONS by clicking each collapsed section heading
//   3. Then paste this script into the browser DevTools console and press Enter
// ============================================================

(function () {
  'use strict';

  // ---- Collect all lesson anchor tags with md= IDs ----
  const mdPattern = /[?&]md=([a-f0-9]{32})/i;
  const loomEmbedPattern = /\/embed\/([a-f0-9]{32})/i;

  const allAnchors = Array.from(document.querySelectorAll('a[href*="md="]'));

  // Deduplicate by md ID, preserving DOM order
  const seen = new Set();
  const lessonAnchors = [];
  for (const anchor of allAnchors) {
    const match = anchor.href.match(mdPattern);
    if (match) {
      const mdId = match[1];
      if (!seen.has(mdId)) {
        seen.add(mdId);
        lessonAnchors.push({ anchor, mdId });
      }
    }
  }

  const totalFound = lessonAnchors.length;

  if (totalFound === 0) {
    console.error('[extract-skool] ERROR: No lesson links found.');
    console.error('Make sure you are on the classroom root page (not a specific lesson) and the sidebar is visible.');
    return;
  }

  if (totalFound < 30) {
    console.warn(
      `[extract-skool] WARNING: Only found ${totalFound} lessons. ` +
      'Make sure all sidebar sections are expanded before running. ' +
      'Click on each collapsed section heading and re-run this script.'
    );
  }

  // ---- Helper: find section heading for a lesson anchor ----
  function findSectionHeading(anchor) {
    // Walk up the DOM looking for a heading (h2, h3, h4) in ancestors or preceding siblings
    let node = anchor.parentElement;
    while (node && node !== document.body) {
      // Check if this node contains a heading as a direct child
      const heading = node.querySelector('h2, h3, h4');
      if (heading) {
        return heading.textContent.trim();
      }

      // Check preceding siblings for headings
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (['H2', 'H3', 'H4'].includes(sibling.tagName)) {
          return sibling.textContent.trim();
        }
        const innerHeading = sibling.querySelector('h2, h3, h4');
        if (innerHeading) {
          return innerHeading.textContent.trim();
        }
        sibling = sibling.previousElementSibling;
      }

      node = node.parentElement;
    }
    return null;
  }

  // ---- Collect Loom embed iframes on this page (usually none on root page) ----
  const loomIframes = Array.from(document.querySelectorAll('iframe[src*="loom.com/embed"]'));
  if (loomIframes.length === 0) {
    console.log(
      '[extract-skool] Loom URLs not found on root page. ' +
      'Run enrichment on individual lesson pages or inspect __NEXT_DATA__ per lesson. ' +
      'loomId will be null for all entries in the manifest.'
    );
  }

  // Build a map from loom embed iframes if any exist
  const loomByPage = {};
  for (const iframe of loomIframes) {
    const match = iframe.src.match(loomEmbedPattern);
    if (match) {
      loomByPage[match[1]] = iframe.src;
    }
  }
  const loomIds = Object.keys(loomByPage);

  // ---- Build sections map ----
  const sectionMap = new Map(); // sectionName -> { order, videos: [] }
  let sectionCounter = 0;

  for (const { anchor, mdId } of lessonAnchors) {
    const title = anchor.textContent.trim() || '(untitled)';
    const sectionName = findSectionHeading(anchor) || 'Unknown Section';

    if (!sectionMap.has(sectionName)) {
      sectionCounter++;
      sectionMap.set(sectionName, { order: sectionCounter, videos: [] });
    }

    const section = sectionMap.get(sectionName);
    const videoOrder = section.videos.length + 1;

    // Try to match a loom ID — on the root page this will always be null
    const loomId = loomIds.length > 0 ? (loomIds[videoOrder - 1] || null) : null;
    const loomEmbedUrl = loomId ? loomByPage[loomId] : null;

    section.videos.push({
      title,
      loomId,
      loomEmbedUrl,
      order: videoOrder,
      mdId,
    });
  }

  // ---- Build manifest ----
  const sections = Array.from(sectionMap.entries()).map(([name, data]) => ({
    name,
    order: data.order,
    videos: data.videos,
  }));

  const manifest = {
    extractedAt: new Date().toISOString(),
    courseUrl: window.location.href,
    totalVideos: totalFound,
    sections,
  };

  // ---- Copy to clipboard ----
  try {
    copy(JSON.stringify(manifest, null, 2));
    console.log('[extract-skool] Manifest copied to clipboard.');
  } catch (e) {
    console.warn('[extract-skool] copy() failed — printing manifest to console instead.');
    console.log(JSON.stringify(manifest, null, 2));
  }

  // ---- Summary log ----
  const videosWithLoom = sections.reduce((sum, s) => sum + s.videos.filter(v => v.loomId !== null).length, 0);
  const videosWithoutLoom = totalFound - videosWithLoom;

  console.log('=== EXTRACTION SUMMARY ===');
  console.log(`Total lessons found: ${totalFound}`);
  console.log(`Total sections found: ${sections.length}`);
  console.log(`Videos with Loom ID: ${videosWithLoom}`);
  console.log(`Videos without Loom ID (null): ${videosWithoutLoom}`);
  console.log('');
  console.log('Next step: Paste the clipboard contents into output/manifest.json');
  console.log('Command: Create/open output/manifest.json and paste.');

  return manifest;
})();
