// ============================================================
// SKOOL CONTENT EXTRACTION SCRIPT
// ============================================================
// Fetches per-lesson page content for all null-loomId videos.
// These pages may contain YouTube embeds, text content, or be
// genuine empty placeholders.
//
// How to run:
//   1. Log into Skool and navigate to the course classroom page:
//      https://www.skool.com/bullrun-millions-crypto-course-9312/classroom
//   2. Click into any lesson so you are on an individual lesson page.
//   3. Open DevTools (F12 / Cmd+Option+I) -> Console tab.
//   4. Copy and paste this ENTIRE script into the console.
//   5. Press Enter. The script will fetch each of the 21 lesson pages.
//   6. Results are copied to clipboard and printed to console.
//   7. Save the clipboard/console output to output/skool-content.json
// ============================================================

(async function () {
  'use strict';

  console.log('=== SKOOL CONTENT EXTRACTION ===');

  // ---- Step 1: Extract __NEXT_DATA__ from current page ----
  const ndEl = document.getElementById('__NEXT_DATA__');
  if (!ndEl) {
    console.error('[extract] ERROR: No __NEXT_DATA__ element found. Are you on a Skool classroom page?');
    return;
  }

  let nd;
  try {
    nd = JSON.parse(ndEl.textContent);
  } catch (e) {
    console.error('[extract] ERROR: Failed to parse __NEXT_DATA__:', e.message);
    return;
  }

  // Get the course tree (may need to fetch a lesson page if not present)
  let courseData = nd?.props?.pageProps?.course;
  if (!courseData || !courseData.children) {
    console.log('[extract] Course tree not on this page — fetching a lesson page...');
    const mdLink = document.querySelector('a[href*="md="]');
    if (!mdLink) {
      console.error('[extract] ERROR: No lesson links found. Click a lesson in the sidebar first, then re-run.');
      return;
    }
    const resp = await fetch(mdLink.href, { credentials: 'include' });
    const html = await resp.text();
    const ndMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (ndMatch) {
      const nd2 = JSON.parse(ndMatch[1]);
      courseData = nd2?.props?.pageProps?.course;
    }
    if (!courseData || !courseData.children) {
      console.error('[extract] ERROR: Still no course tree found.');
      return;
    }
  }

  // ---- Step 2: Walk the course tree, collect null-loomId videos ----
  const loomIdRe = /loom\.com\/(?:share|embed)\/([a-f0-9]{32})/i;
  const youtubeRe = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const baseUrl = window.location.href.replace(/[?#].*$/, '');

  const nullLoomVideos = [];

  for (let si = 0; si < courseData.children.length; si++) {
    const sectionNode = courseData.children[si];
    const sectionCourse = sectionNode.course || {};
    const sectionTitle = sectionCourse.metadata?.title || `Section ${si + 1}`;
    const sectionChildren = sectionNode.children || [];

    for (let li = 0; li < sectionChildren.length; li++) {
      const lessonNode = sectionChildren[li];
      const lessonCourse = lessonNode.course || {};
      const meta = lessonCourse.metadata || {};
      const videoLink = meta.videoLink || null;
      const mdId = lessonCourse.id || null;

      // Check if it's a Loom video
      let isLoom = false;
      if (videoLink) {
        isLoom = loomIdRe.test(videoLink);
      }

      if (!isLoom && mdId) {
        nullLoomVideos.push({
          mdId,
          title: meta.title || '(untitled)',
          section: sectionTitle,
          sectionOrder: si + 1,
          videoOrder: li + 1,
          rawVideoLink: videoLink,
        });
      }
    }
  }

  console.log(`Found ${nullLoomVideos.length} null-loomId lesson pages to fetch...`);

  // ---- Step 3: Fetch each lesson page and extract content ----
  const results = [];
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < nullLoomVideos.length; i++) {
    const video = nullLoomVideos[i];
    const label = `[${i + 1}/${nullLoomVideos.length}] ${video.title}`;

    try {
      const fetchUrl = baseUrl + '?md=' + video.mdId;
      const resp = await fetch(fetchUrl, { credentials: 'include' });
      if (!resp.ok) {
        console.warn(`${label} — HTTP ${resp.status} (skipping)`);
        results.push({
          mdId: video.mdId,
          title: video.title,
          section: video.section,
          contentType: 'empty',
          youtubeUrl: null,
          youtubeId: null,
          textContent: null,
          rawVideoLink: video.rawVideoLink || null,
        });
        continue;
      }

      const html = await resp.text();

      // Parse __NEXT_DATA__ from fetched HTML
      const ndMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
      let body = null;
      let videoLink = video.rawVideoLink || null;

      if (ndMatch) {
        try {
          const pageNd = JSON.parse(ndMatch[1]);
          const pageProps = pageNd?.props?.pageProps;

          // Strategy 1: selectedModule.course.metadata
          const selMod = pageProps?.selectedModule?.course?.metadata;
          if (selMod) {
            if (selMod.body) body = selMod.body;
            if (selMod.videoLink) videoLink = selMod.videoLink;
          }

          // Strategy 2: walk course.children tree to find matching mdId
          if ((!body && !videoLink) && pageProps?.course?.children) {
            for (const sect of pageProps.course.children) {
              for (const lesson of (sect.children || [])) {
                if (lesson.course?.id === video.mdId) {
                  const m = lesson.course?.metadata || {};
                  if (m.body) body = m.body;
                  if (m.videoLink) videoLink = m.videoLink;
                  break;
                }
              }
            }
          }
        } catch (e) {
          console.warn(`${label} — JSON parse error: ${e.message}`);
        }
      }

      // Strategy 3: DOM text content fallback from fetched HTML
      let domText = null;
      try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        // Remove script, style, nav, header, footer elements
        tempDiv.querySelectorAll('script, style, nav, header, footer, [aria-hidden]').forEach(el => el.remove());
        const rawText = tempDiv.textContent || '';
        // Clean up whitespace
        const cleaned = rawText.replace(/\s+/g, ' ').trim();
        if (cleaned.length > 50) {
          domText = cleaned.substring(0, 5000); // Cap at 5000 chars to avoid noise
        }
      } catch (e) {
        // Ignore DOM parsing errors
      }

      // ---- Classify content type ----
      let contentType = 'empty';
      let youtubeUrl = null;
      let youtubeId = null;
      let textContent = null;

      // Check for YouTube in videoLink
      if (videoLink) {
        const ytMatch = videoLink.match(youtubeRe);
        if (ytMatch) {
          contentType = 'youtube';
          youtubeId = ytMatch[1];
          youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
        }
      }

      // Check body text (HTML -> plain text)
      if (body && contentType !== 'youtube') {
        let plainBody = '';
        try {
          const tempDiv2 = document.createElement('div');
          tempDiv2.innerHTML = body;
          plainBody = tempDiv2.textContent.replace(/\s+/g, ' ').trim();
        } catch (e) {
          plainBody = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        if (plainBody.length > 20) {
          contentType = 'text';
          textContent = plainBody;
        }
      }

      // If still empty but domText has something useful, use it
      if (contentType === 'empty' && domText && domText.length > 100) {
        // Only use DOM text if body wasn't available — it's noisier
        contentType = 'text';
        textContent = domText;
      }

      const result = {
        mdId: video.mdId,
        title: video.title,
        section: video.section,
        contentType,
        youtubeUrl,
        youtubeId,
        textContent,
        rawVideoLink: videoLink || video.rawVideoLink || null,
      };

      results.push(result);
      console.log(`${label} — ${contentType}`);
    } catch (e) {
      console.error(`${label} — Error: ${e.message}`);
      results.push({
        mdId: video.mdId,
        title: video.title,
        section: video.section,
        contentType: 'empty',
        youtubeUrl: null,
        youtubeId: null,
        textContent: null,
        rawVideoLink: video.rawVideoLink || null,
      });
    }

    // 500ms delay between fetches to avoid rate limiting
    if (i < nullLoomVideos.length - 1) {
      await delay(500);
    }
  }

  // ---- Step 4: Summary ----
  const youtube = results.filter((r) => r.contentType === 'youtube').length;
  const text = results.filter((r) => r.contentType === 'text').length;
  const empty = results.filter((r) => r.contentType === 'empty').length;

  console.log('');
  console.log('=== DONE ===');
  console.log(`YouTube: ${youtube} pages, Text: ${text} pages, Empty: ${empty} pages, Total: ${results.length}`);
  console.log('Results copied to clipboard. Save to output/skool-content.json');
  console.log('');

  // ---- Step 5: Output ----
  const jsonOutput = JSON.stringify(results, null, 2);

  // Try clipboard first
  try {
    copy(jsonOutput);
    console.log('[extract] Copied to clipboard successfully.');
  } catch (e) {
    console.warn('[extract] copy() not available — printing to console instead.');
    console.log(jsonOutput);
  }

  // Always print as fallback
  console.log('=== JSON OUTPUT (copy below if clipboard failed) ===');
  console.log(jsonOutput);

})();
