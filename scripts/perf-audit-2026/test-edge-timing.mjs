const urls = [
  'https://www.whalewzrd.com/',
  'https://www.whalewzrd.com/meta-ads',
  'https://www.whalewzrd.com/meta-apps',
  'https://www.whalewzrd.com/google-ads',
  'https://www.whalewzrd.com/consult',
  'https://www.whalewzrd.com/cases/',
  'https://www.whalewzrd.com/blog/',
  'https://www.whalewzrd.com/faq',
  'https://www.whalewzrd.com/calculator',
  'https://www.whalewzrd.com/cookie-policy',
];

async function measure() {
  console.log('Testing direct HTTP fetch timing and cache headers...');
  for (const url of urls) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      const ttfb = Math.round(performance.now() - t0);
      const text = await res.text();
      const totalTime = Math.round(performance.now() - t0);
      const edgeCache = res.headers.get('x-ww-static-cache') || 'none';
      const cfCache = res.headers.get('cf-cache-status') || 'none';
      const cfRay = res.headers.get('cf-ray') || 'none';
      const contentEncoding = res.headers.get('content-encoding') || 'identity';
      console.log(`${url.padEnd(42)} -> Status: ${res.status} | TTFB: ${ttfb}ms | Total: ${totalTime}ms | Size: ${(text.length / 1024).toFixed(1)}KB | EdgeCache: ${edgeCache} | CF-Cache: ${cfCache} | Enc: ${contentEncoding} | Ray: ${cfRay}`);
    } catch (e) {
      console.log(`${url.padEnd(42)} -> FAILED: ${e.message}`);
    }
  }
}

measure();
