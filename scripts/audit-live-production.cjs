const fs = require('fs');
const path = require('path');
const https = require('https');
const { chromium } = require('playwright');

const EVIDENCE_DIR = path.join(__dirname, '..', 'audit', 'evidence', 'production');
const RENDERING_DIR = path.join(__dirname, '..', 'audit', 'evidence', 'rendering');
const NETWORK_DIR = path.join(__dirname, '..', 'audit', 'evidence', 'network');

[EVIDENCE_DIR, RENDERING_DIR, NETWORK_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function analyzeLiveHtml() {
  console.log('[1] Fetching live HTML from https://www.whalewzrd.com/ ...');
  const home = await fetchUrl('https://www.whalewzrd.com/');
  const metaApps = await fetchUrl('https://www.whalewzrd.com/meta-apps/');
  const metaAds = await fetchUrl('https://www.whalewzrd.com/meta-ads/');

  const extractAssets = (html) => {
    const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*>/g)].map(m => m[1]);
    const styles = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map(m => m[1]);
    const preloads = [...html.matchAll(/<link[^>]*rel="preload"[^>]*href="([^"]+)"[^>]*>/g)].map(m => m[1]);
    const rootMatch = html.match(/<html[^>]*>/);
    const htmlTag = rootMatch ? rootMatch[0] : '';
    return { scripts, styles, preloads, htmlTag };
  };

  const liveInfo = {
    home: { status: home.status, ...extractAssets(home.body), headers: home.headers },
    metaApps: { status: metaApps.status, ...extractAssets(metaApps.body), headers: metaApps.headers },
    metaAds: { status: metaAds.status, ...extractAssets(metaAds.body), headers: metaAds.headers },
  };

  fs.writeFileSync(path.join(EVIDENCE_DIR, 'live-html-analysis.json'), JSON.stringify(liveInfo, null, 2));
  console.log('Live Home HTML Tag:', liveInfo.home.htmlTag);
  console.log('Live Home Scripts:', liveInfo.home.scripts);
  console.log('Live Home Styles:', liveInfo.home.styles);
  console.log('Live MetaApps HTML Tag:', liveInfo.metaApps.htmlTag);
  console.log('Live MetaApps Scripts:', liveInfo.metaApps.scripts);
  return liveInfo;
}

async function runBrowserAudit() {
  console.log('\n[2] Launching Playwright browser for live production audit...');
  const browser = await chromium.launch({ headless: true });
  
  // Test 1: Desktop Cold Load on Home
  console.log('\n--- Running Desktop Cold Load (Home) ---');
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  
  const networkLogs = [];
  const consoleLogs = [];
  const pageErrors = [];

  const page = await desktopContext.newPage();
  
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text(), location: msg.location() });
  });
  page.on('pageerror', err => {
    pageErrors.push({ message: err.message, stack: err.stack });
  });
  page.on('requestfailed', req => {
    networkLogs.push({
      event: 'requestfailed',
      url: req.url(),
      failure: req.failure(),
      method: req.method()
    });
  });
  page.on('response', res => {
    networkLogs.push({
      event: 'response',
      url: res.url(),
      status: res.status(),
      contentType: res.headers()['content-type'],
      cacheControl: res.headers()['cache-control'],
      contentLength: res.headers()['content-length'],
      timing: res.request().timing()
    });
  });

  const startTime = Date.now();
  console.log('Navigating to https://www.whalewzrd.com/ ...');
  
  // Filmstrip checkpoints
  const filmstripInterval = setInterval(async () => {
    const elapsed = Date.now() - startTime;
    if (elapsed <= 6000 && !page.isClosed()) {
      try {
        await page.screenshot({ path: path.join(RENDERING_DIR, `home-desktop-${elapsed}ms.png`) });
      } catch (e) {}
    }
  }, 500);

  const response = await page.goto('https://www.whalewzrd.com/', { waitUntil: 'load', timeout: 30000 });
  clearInterval(filmstripInterval);
  const loadElapsed = Date.now() - startTime;
  console.log(`Page load event fired in ${loadElapsed}ms (HTTP ${response.status()})`);

  // Wait for 3 seconds post-load to observe animations and hydration
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(RENDERING_DIR, 'home-desktop-settled.png'), fullPage: false });

  // Evaluate Hero title & animation state on Home
  const homeHeroEvaluation = await page.evaluate(() => {
    const heroSection = document.getElementById('hero');
    const h1 = document.querySelector('h1');
    const heroEffects = heroSection ? heroSection.getAttribute('data-hero-effects') : null;
    const titleLines = Array.from(document.querySelectorAll('.hero-title-effect, [data-hero-line], h1 span')).map(el => {
      const style = window.getComputedStyle(el);
      return {
        text: el.textContent?.trim(),
        opacity: style.opacity,
        visibility: style.visibility,
        transform: style.transform,
        animationName: style.animationName,
        animationPlayState: style.animationPlayState,
        display: style.display,
        clipPath: style.clipPath
      };
    });
    return {
      heroExists: !!heroSection,
      h1Exists: !!h1,
      h1Text: h1?.textContent?.trim(),
      heroEffectsAttr: heroEffects,
      titleLines
    };
  });
  console.log('Home Hero Evaluation:', JSON.stringify(homeHeroEvaluation, null, 2));

  // Save Home logs
  fs.writeFileSync(path.join(NETWORK_DIR, 'home-desktop-network.json'), JSON.stringify(networkLogs, null, 2));
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'home-desktop-console.json'), JSON.stringify({ consoleLogs, pageErrors }, null, 2));
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'home-hero-eval.json'), JSON.stringify(homeHeroEvaluation, null, 2));
  await desktopContext.close();

  // Test 2: Mobile Cold Load on /meta-apps/ (iPhone emulation)
  console.log('\n--- Running Mobile Cold Load (iPhone /meta-apps/) ---');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true
  });

  const mobileNetworkLogs = [];
  const mobileConsoleLogs = [];
  const mobilePageErrors = [];

  const mPage = await mobileContext.newPage();
  mPage.on('console', msg => mobileConsoleLogs.push({ type: msg.type(), text: msg.text() }));
  mPage.on('pageerror', err => mobilePageErrors.push({ message: err.message, stack: err.stack }));
  mPage.on('requestfailed', req => mobileNetworkLogs.push({ event: 'requestfailed', url: req.url(), failure: req.failure() }));
  mPage.on('response', res => {
    mobileNetworkLogs.push({
      event: 'response',
      url: res.url(),
      status: res.status(),
      contentType: res.headers()['content-type']
    });
  });

  const mStartTime = Date.now();
  console.log('Navigating directly to https://www.whalewzrd.com/meta-apps/ ...');
  
  const mFilmstrip = setInterval(async () => {
    const elapsed = Date.now() - mStartTime;
    if (elapsed <= 6000 && !mPage.isClosed()) {
      try {
        await mPage.screenshot({ path: path.join(RENDERING_DIR, `meta-apps-mobile-${elapsed}ms.png`) });
      } catch (e) {}
    }
  }, 500);

  const mResponse = await mPage.goto('https://www.whalewzrd.com/meta-apps/', { waitUntil: 'load', timeout: 30000 });
  clearInterval(mFilmstrip);
  console.log(`Mobile /meta-apps/ load event in ${Date.now() - mStartTime}ms (HTTP ${mResponse.status()})`);

  await mPage.waitForTimeout(3000);
  await mPage.screenshot({ path: path.join(RENDERING_DIR, 'meta-apps-mobile-settled.png'), fullPage: false });
  await mPage.screenshot({ path: path.join(RENDERING_DIR, 'meta-apps-mobile-full.png'), fullPage: true });

  const metaAppsHeroEval = await mPage.evaluate(() => {
    const heroSection = document.getElementById('hero');
    const h1 = document.querySelector('h1');
    const heroEffects = heroSection ? heroSection.getAttribute('data-hero-effects') : null;
    const titleLines = Array.from(document.querySelectorAll('.hero-title-effect, [data-hero-line], h1 span')).map(el => {
      const style = window.getComputedStyle(el);
      return {
        text: el.textContent?.trim(),
        opacity: style.opacity,
        visibility: style.visibility,
        transform: style.transform,
        animationName: style.animationName,
        animationPlayState: style.animationPlayState,
        display: style.display
      };
    });
    // Check receipt elements on mobile
    const receipts = Array.from(document.querySelectorAll('.meta-receipt-slot, .meta-receipt-angle')).map(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        className: el.className,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        filter: style.filter,
        clipPath: style.clipPath
      };
    });
    return {
      heroExists: !!heroSection,
      h1Exists: !!h1,
      h1Text: h1?.textContent?.trim(),
      heroEffectsAttr: heroEffects,
      titleLines,
      receipts
    };
  });
  console.log('Mobile MetaApps Hero Evaluation:', JSON.stringify(metaAppsHeroEval, null, 2));

  fs.writeFileSync(path.join(NETWORK_DIR, 'meta-apps-mobile-network.json'), JSON.stringify(mobileNetworkLogs, null, 2));
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'meta-apps-mobile-console.json'), JSON.stringify({ mobileConsoleLogs, mobilePageErrors }, null, 2));
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'meta-apps-mobile-eval.json'), JSON.stringify(metaAppsHeroEval, null, 2));
  await mobileContext.close();

  // Test 3: Slow 4G Network Emulation on /meta-apps/
  console.log('\n--- Running Slow 4G Network Emulation (Meta Apps) ---');
  const slowContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  const slowPage = await slowContext.newPage();
  
  // Emulate Slow 4G via CDP
  const client = await slowContext.newCDPSession(slowPage);
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.5 * 1024 * 1024) / 8, // 1.5 Mbps
    uploadThroughput: (750 * 1024) / 8,         // 750 Kbps
    latency: 150                                // 150ms
  });
  // CPU 4x slowdown
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const slowStart = Date.now();
  console.log('Navigating to https://www.whalewzrd.com/meta-apps/ on Slow 4G + CPU 4x ...');
  
  const slowFilmstrip = setInterval(async () => {
    const elapsed = Date.now() - slowStart;
    if (elapsed <= 12000 && !slowPage.isClosed()) {
      try {
        await slowPage.screenshot({ path: path.join(RENDERING_DIR, `slow4g-metaapps-${elapsed}ms.png`) });
      } catch (e) {}
    }
  }, 1000);

  const slowResp = await slowPage.goto('https://www.whalewzrd.com/meta-apps/', { waitUntil: 'load', timeout: 45000 });
  clearInterval(slowFilmstrip);
  console.log(`Slow 4G Meta Apps loaded in ${Date.now() - slowStart}ms (HTTP ${slowResp.status()})`);
  await slowPage.waitForTimeout(3000);
  await slowPage.screenshot({ path: path.join(RENDERING_DIR, 'slow4g-metaapps-settled.png') });
  await slowContext.close();

  await browser.close();
  console.log('\n✅ Live Production Browser Audit completed successfully.');
}

(async () => {
  try {
    await analyzeLiveHtml();
    await runBrowserAudit();
  } catch (err) {
    console.error('Audit run failed:', err);
    process.exit(1);
  }
})();
