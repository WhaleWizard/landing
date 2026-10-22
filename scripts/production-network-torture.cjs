const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const NETWORK_DIR = path.join(__dirname, '..', 'audit', 'evidence', 'network');
const RENDERING_DIR = path.join(__dirname, '..', 'audit', 'evidence', 'rendering');

if (!fs.existsSync(NETWORK_DIR)) fs.mkdirSync(NETWORK_DIR, { recursive: true });
if (!fs.existsSync(RENDERING_DIR)) fs.mkdirSync(RENDERING_DIR, { recursive: true });

const PROFILES = [
  { name: 'Fast connection', download: 0, upload: 0, latency: 0 },
  { name: 'Typical 4G', download: (4 * 1024 * 1024) / 8, upload: (2 * 1024 * 1024) / 8, latency: 100 },
  { name: 'Slow 4G', download: (1.5 * 1024 * 1024) / 8, upload: (750 * 1024) / 8, latency: 150 },
  { name: 'Slow 3G', download: (400 * 1024) / 8, upload: (200 * 1024) / 8, latency: 400 },
  { name: 'Severe connection', download: (200 * 1024) / 8, upload: (100 * 1024) / 8, latency: 800 }
];

const ROUTES = [
  { name: 'Home', url: 'https://www.whalewzrd.com/' },
  { name: 'Meta Apps', url: 'https://www.whalewzrd.com/meta-apps/' },
  { name: 'Meta Ads', url: 'https://www.whalewzrd.com/meta-ads/' },
  { name: 'Blog List', url: 'https://www.whalewzrd.com/blog/' },
  { name: 'Cases List', url: 'https://www.whalewzrd.com/cases/' }
];

async function runNetworkProfiles() {
  console.log('=== RUNNING SECTION 4: NETWORK TORTURE TESTS ===');
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const profile of PROFILES) {
    console.log(`\nTesting Profile: ${profile.name}`);
    for (const route of ROUTES) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 }, // Mobile Viewport
        isMobile: true,
        hasTouch: true
      });
      const page = await context.newPage();

      if (profile.download > 0) {
        const client = await context.newCDPSession(page);
        await client.send('Network.emulateNetworkConditions', {
          offline: false,
          downloadThroughput: profile.download,
          uploadThroughput: profile.upload,
          latency: profile.latency
        });
      }

      const errors = [];
      const failedReqs = [];
      page.on('pageerror', err => errors.push(err.message));
      page.on('requestfailed', req => failedReqs.push(req.url()));

      const start = Date.now();
      let status = 0;
      let loadTime = 0;
      let heroVisible = false;
      let h1Text = '';

      try {
        const resp = await page.goto(route.url, { waitUntil: 'load', timeout: 35000 });
        status = resp ? resp.status() : 0;
        loadTime = Date.now() - start;

        // Check hero visibility
        const evalData = await page.evaluate(() => {
          const h1 = document.querySelector('h1');
          const hero = document.getElementById('hero');
          return {
            h1Text: h1 ? h1.textContent?.trim() : '',
            heroVisible: !!hero && window.getComputedStyle(hero).display !== 'none'
          };
        });
        h1Text = evalData.h1Text;
        heroVisible = evalData.heroVisible;

        // Take settled screenshot for extreme profiles
        if (profile.name === 'Slow 3G' || profile.name === 'Severe connection') {
          const fileSafe = `${profile.name.replace(/\s+/g, '_')}-${route.name.replace(/\s+/g, '_')}.png`;
          await page.screenshot({ path: path.join(RENDERING_DIR, fileSafe) });
        }
      } catch (err) {
        status = 'TIMEOUT / ERROR: ' + err.message;
        loadTime = Date.now() - start;
      }

      const row = {
        profile: profile.name,
        route: route.name,
        url: route.url,
        status,
        loadTimeMs: loadTime,
        heroVisible,
        h1Text: h1Text ? h1Text.slice(0, 40) : 'NONE',
        errorsCount: errors.length,
        failedRequestsCount: failedReqs.length
      };

      console.log(`[${profile.name}] ${route.name}: ${loadTime}ms (HTTP ${status}) | Hero: ${heroVisible ? 'OK' : 'FAIL'} | Errors: ${errors.length}`);
      results.push(row);
      await context.close();
    }
  }

  await browser.close();

  // Write CSV
  const csvHeader = 'Profile,Route,URL,Status,LoadTimeMs,HeroVisible,H1Snippet,ErrorsCount,FailedRequestsCount\n';
  const csvRows = results.map(r => `"${r.profile}","${r.route}","${r.url}","${r.status}",${r.loadTimeMs},${r.heroVisible},"${r.h1Text.replace(/"/g, '""')}",${r.errorsCount},${r.failedRequestsCount}`).join('\n');
  fs.writeFileSync(path.join(__dirname, '..', 'audit', '16_NETWORK_TEST_MATRIX.csv'), csvHeader + csvRows, 'utf8');
  console.log('Saved audit/16_NETWORK_TEST_MATRIX.csv');
  return results;
}

async function runChaosScenarios() {
  console.log('\n=== RUNNING SECTION 5: NETWORK CHAOS TESTS ===');
  const browser = await chromium.launch({ headless: true });
  const chaosResults = [];

  // SCENARIO E: Third-party blocking (GTM, GA4, Meta Pixel blocked)
  console.log('\n[Scenario E] Blocking third-party scripts (GA4, GTM, Meta Pixel)...');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const blockedUrls = [];
    await page.route(/(googletagmanager|google-analytics|connect\.facebook\.net|challenges\.cloudflare\.com)/, route => {
      blockedUrls.push(route.request().url());
      route.abort();
    });

    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const start = Date.now();
    await page.goto('https://www.whalewzrd.com/meta-apps/', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(1500);

    const isFunctional = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const buttons = document.querySelectorAll('button');
      return !!h1 && buttons.length > 0;
    });

    chaosResults.push({
      scenario: 'E — Third-Party Blocking',
      description: 'Blocked GA4, GTM, Meta Pixel',
      passed: isFunctional && pageErrors.length === 0,
      blockedRequestsCount: blockedUrls.length,
      pageErrorsCount: pageErrors.length,
      notes: isFunctional ? 'Interface functional without 3rd party scripts' : 'Interface broke'
    });
    console.log('Scenario E Result:', chaosResults[chaosResults.length - 1]);
    await context.close();
  }

  // SCENARIO C: Failed dynamic JS Chunk
  console.log('\n[Scenario C] Simulated failed JS chunk...');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    let abortedChunk = '';
    await page.route(/assets\/.*(Services|Cases|Testimonials).*\.js/, route => {
      abortedChunk = route.request().url();
      route.abort('failed');
    });

    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto('https://www.whalewzrd.com/meta-apps/', { waitUntil: 'load', timeout: 15000 });
    // Scroll down to attempt loading the aborted chunk
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(2000);

    const isHeroAlive = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return !!h1 && h1.textContent.length > 0;
    });

    chaosResults.push({
      scenario: 'C — Failed JS Chunk',
      description: `Aborted lower section chunk (${abortedChunk || 'none'})`,
      passed: isHeroAlive,
      pageErrorsCount: pageErrors.length,
      notes: isHeroAlive ? 'Hero remained intact despite deferred chunk failure' : 'App crashed into blank screen'
    });
    console.log('Scenario C Result:', chaosResults[chaosResults.length - 1]);
    await context.close();
  }

  // SCENARIO F: Network Disconnect & Recovery
  console.log('\n[Scenario F] Network Disconnect and Reconnect...');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);

    await page.goto('https://www.whalewzrd.com/meta-apps/', { waitUntil: 'load' });
    
    // Disconnect network
    console.log('Simulating offline state...');
    await client.send('Network.emulateNetworkConditions', {
      offline: true,
      downloadThroughput: 0,
      uploadThroughput: 0,
      latency: 0
    });

    // Try an action (scroll, interaction)
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1000);

    // Restore network
    console.log('Restoring network...');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 0,
      uploadThroughput: 0,
      latency: 0
    });
    await page.waitForTimeout(1000);

    const recovered = await page.evaluate(() => {
      return document.getElementById('hero') !== null;
    });

    chaosResults.push({
      scenario: 'F — Network Disconnect / Recovery',
      description: 'Go offline then restore network during page session',
      passed: recovered,
      notes: recovered ? 'Session survived network disconnect and restored' : 'Session crashed'
    });
    console.log('Scenario F Result:', chaosResults[chaosResults.length - 1]);
    await context.close();
  }

  await browser.close();

  fs.writeFileSync(path.join(NETWORK_DIR, 'chaos-results.json'), JSON.stringify(chaosResults, null, 2));
  console.log('Chaos testing complete.');
}

(async () => {
  try {
    await runNetworkProfiles();
    await runChaosScenarios();
  } catch (err) {
    console.error('Network torture failed:', err);
    process.exit(1);
  }
})();
