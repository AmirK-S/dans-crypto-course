// Same enrichment but downloads the file instead of clipboard
(async function () {
  'use strict';
  const ndEl = document.getElementById('__NEXT_DATA__');
  if (!ndEl) { console.error('No __NEXT_DATA__'); return; }
  let nd = JSON.parse(ndEl.textContent);
  let courseData = nd?.props?.pageProps?.course;
  if (!courseData || !courseData.children) {
    const mdLink = document.querySelector('a[href*="md="]');
    let fetchUrl = mdLink ? mdLink.href : null;
    if (!fetchUrl) { const sel = nd?.props?.pageProps?.selectedModule; if (sel) fetchUrl = location.href.replace(/[?#].*$/, '') + '?md=' + sel; }
    if (!fetchUrl) { console.error('No lesson link found'); return; }
    const resp = await fetch(fetchUrl, { credentials: 'include' });
    const html = await resp.text();
    const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (m) { const nd2 = JSON.parse(m[1]); courseData = nd2?.props?.pageProps?.course; }
    if (!courseData || !courseData.children) { console.error('No course tree'); return; }
  }
  const loomIdRe = /loom\.com\/(?:share|embed)\/([a-f0-9]{32})/i;
  const sections = []; let totalVideos = 0, videosWithLoom = 0;
  for (let si = 0; si < courseData.children.length; si++) {
    const sn = courseData.children[si], sc = sn.course || {}, title = sc.metadata?.title || `Section ${si+1}`;
    const videos = [];
    for (let li = 0; li < (sn.children||[]).length; li++) {
      const ln = sn.children[li], lc = ln.course||{}, meta = lc.metadata||{};
      let loomId = null, loomEmbedUrl = null;
      if (meta.videoLink) { const m = meta.videoLink.match(loomIdRe); if (m) { loomId = m[1]; loomEmbedUrl = `https://www.loom.com/embed/${loomId}`; } }
      if (loomId) videosWithLoom++;
      totalVideos++;
      videos.push({ title: meta.title||'(untitled)', loomId, loomEmbedUrl, order: li+1, mdId: lc.id||null });
    }
    sections.push({ name: title, order: si+1, videos });
  }
  const manifest = { extractedAt: new Date().toISOString(), enrichedAt: new Date().toISOString(), courseUrl: location.href.replace(/[?#].*$/,''), totalVideos, sections };
  const json = JSON.stringify(manifest, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'manifest.json'; a.click();
  console.log(`=== DONE === ${sections.length} sections, ${videosWithLoom}/${totalVideos} with loomId. File downloaded as manifest.json`);
})();
