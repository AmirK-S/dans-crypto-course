// ============================================================
// SKOOL CLASSROOM ENRICHMENT SCRIPT (v2)
// ============================================================
// Reads the full course tree from __NEXT_DATA__ on the current
// page. No per-lesson fetching needed — all data is available
// in pageProps.course.children.
//
// How to run:
//   1. Log into Skool and open any lesson page in the classroom:
//      https://www.skool.com/bullrun-millions-crypto-course-9312/classroom
//      (click into the course, then click any lesson)
//   2. Open DevTools (F12 / Cmd+Option+I) -> Console tab
//   3. Paste this ENTIRE script and press Enter
//   4. Instant results — enriched manifest copied to clipboard
//   5. Overwrite output/manifest.json with the clipboard contents
// ============================================================

(async function () {
  'use strict';

  // ---- Step 1: Extract __NEXT_DATA__ from the current page ----
  const ndEl = document.getElementById('__NEXT_DATA__');
  if (!ndEl) {
    console.error('[enrich] ERROR: No __NEXT_DATA__ element found on this page.');
    console.error('Make sure you are on a Skool classroom lesson page.');
    return;
  }

  let nd;
  try {
    nd = JSON.parse(ndEl.textContent);
  } catch (e) {
    console.error('[enrich] ERROR: Failed to parse __NEXT_DATA__:', e.message);
    return;
  }

  let courseData = nd?.props?.pageProps?.course;

  // If course.children isn't here, we may be on the listing page — fetch a lesson page
  if (!courseData || !courseData.children) {
    console.log('[enrich] Course tree not on this page. Fetching a lesson page...');

    // Try to find an mdId from sidebar links or allCourses
    const mdLink = document.querySelector('a[href*="md="]');
    let fetchUrl = null;
    if (mdLink) {
      fetchUrl = mdLink.href;
    } else {
      // Try allCourses or selectedModule
      const selMod = nd?.props?.pageProps?.selectedModule;
      if (selMod) {
        fetchUrl = window.location.href.replace(/[?#].*$/, '') + '?md=' + selMod;
      }
    }

    if (!fetchUrl) {
      console.error('[enrich] ERROR: Cannot find any lesson link. Click on a lesson in the sidebar first, then re-run.');
      return;
    }

    console.log('[enrich] Fetching:', fetchUrl);
    const resp = await fetch(fetchUrl, { credentials: 'include' });
    const html = await resp.text();
    const ndMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (ndMatch) {
      const nd2 = JSON.parse(ndMatch[1]);
      courseData = nd2?.props?.pageProps?.course;
    }

    if (!courseData || !courseData.children) {
      console.error('[enrich] ERROR: Still no course tree found. Try clicking on a lesson first, then re-run.');
      console.error('course keys:', Object.keys(courseData || {}));
      return;
    }
  }

  // ---- Step 2: Walk the course tree ----
  // Structure: courseData.children[] = sections (unitType: "set")
  //   each section.children[] = lessons (unitType: "module")
  //   lesson.course.metadata.videoLink = loom share URL
  //   lesson.course.id = mdId

  const loomIdRe = /loom\.com\/(?:share|embed)\/([a-f0-9]{32})/i;
  const sections = [];
  let totalVideos = 0;
  let videosWithLoom = 0;

  for (let si = 0; si < courseData.children.length; si++) {
    const sectionNode = courseData.children[si];
    const sectionCourse = sectionNode.course || {};
    const sectionTitle = sectionCourse.metadata?.title || `Section ${si + 1}`;
    const sectionChildren = sectionNode.children || [];

    const videos = [];
    for (let li = 0; li < sectionChildren.length; li++) {
      const lessonNode = sectionChildren[li];
      const lessonCourse = lessonNode.course || {};
      const meta = lessonCourse.metadata || {};

      const title = meta.title || '(untitled)';
      const mdId = lessonCourse.id || null;
      const videoLink = meta.videoLink || null;

      let loomId = null;
      let loomEmbedUrl = null;
      if (videoLink) {
        const m = videoLink.match(loomIdRe);
        if (m) {
          loomId = m[1];
          loomEmbedUrl = `https://www.loom.com/embed/${loomId}`;
        }
      }

      if (loomId) videosWithLoom++;
      totalVideos++;

      videos.push({
        title,
        loomId,
        loomEmbedUrl,
        order: li + 1,
        mdId,
      });
    }

    sections.push({
      name: sectionTitle,
      order: si + 1,
      videos,
    });
  }

  // ---- Step 3: Build enriched manifest ----
  const baseUrl = window.location.href.replace(/[?#].*$/, '');
  const enrichedManifest = {
    extractedAt: new Date().toISOString(),
    enrichedAt: new Date().toISOString(),
    courseUrl: baseUrl,
    totalVideos,
    sections,
  };

  // ---- Step 4: Copy to clipboard ----
  try {
    copy(JSON.stringify(enrichedManifest, null, 2));
    console.log('[enrich] Enriched manifest copied to clipboard.');
  } catch (e) {
    console.warn('[enrich] copy() failed — printing manifest to console instead.');
    console.log(JSON.stringify(enrichedManifest, null, 2));
  }

  // ---- Step 5: Summary ----
  const videosWithoutLoom = totalVideos - videosWithLoom;

  console.log('');
  console.log('=== ENRICHMENT COMPLETE ===');
  console.log(`Total lessons: ${totalVideos}`);
  console.log(`Sections found: ${sections.length} (expected ~13)`);
  console.log(`Videos with loomId: ${videosWithLoom}/${totalVideos}`);
  console.log(`Videos without loomId: ${videosWithoutLoom}/${totalVideos}`);
  console.log('');
  console.log('Section breakdown:');
  sections.forEach((s, idx) => {
    const withLoom = s.videos.filter(v => v.loomId).length;
    console.log(`  ${idx + 1}. ${s.name} — ${s.videos.length} videos, ${withLoom} with loomId`);
  });
  console.log('');
  console.log('Section extraction method: course.children tree (unitType: set → module)');
  console.log('Loom extraction method: metadata.videoLink (share URL)');
  console.log('');
  console.log('Manifest copied to clipboard.');
  console.log('Paste into output/manifest.json to save.');
})();
