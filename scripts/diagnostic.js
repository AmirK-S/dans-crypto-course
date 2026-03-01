(async () => {
  const baseUrl = location.href.replace(/[?#].*$/, '');
  const resp = await fetch(baseUrl + '?md=4196a2bddcc04e2fba55486e9828dd60', {credentials:'include'});
  const html = await resp.text();
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (m) {
    const nd = JSON.parse(m[1]);
    console.log('pageProps keys:', Object.keys(nd?.props?.pageProps || {}));
    console.log('Full pageProps:', JSON.stringify(nd?.props?.pageProps, null, 2).slice(0, 5000));
  } else {
    console.log('No __NEXT_DATA__ found');
    console.log('HTML snippet:', html.slice(0, 2000));
  }
})();
