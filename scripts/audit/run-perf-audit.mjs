import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

function startStaticServer(distDir, port = 4173) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let reqPath = req.url.split('?')[0]
      let filePath = path.join(distDir, reqPath)
      if (reqPath === '/' || reqPath.endsWith('/')) filePath = path.join(filePath, 'index.html')
      if (!fs.existsSync(filePath)) filePath = path.join(distDir, 'index.html')

      const ext = path.extname(filePath)
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.woff2': 'font/woff2',
        '.webp': 'image/webp',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
      }
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
      res.end(fs.readFileSync(filePath))
    })

    server.listen(port, () => resolve(server))
  })
}

const ROUTES = [
  '/',
  '/meta-ads/',
  '/meta-apps/',
  '/google-ads/',
  '/consult/',
  '/blog/',
  '/cases/',
  '/faq/'
]

const PROFILES = [
  {
    name: 'Desktop',
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    deviceScaleFactor: 1,
    cpuThrottle: 1
  },
  {
    name: 'Mobile-MotoG4-Sim',
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    cpuThrottle: 4
  }
]

async function measureRoute(browser, route, profile, port) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch || false,
    deviceScaleFactor: profile.deviceScaleFactor
  })

  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)

  if (profile.cpuThrottle > 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottle })
  }
  await cdp.send('Performance.enable')

  const consoleLogs = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warn') {
      consoleLogs.push({ type: msg.type(), text: msg.text() })
    }
  })

  const networkStats = {
    totalBytes: 0,
    jsBytes: 0,
    cssBytes: 0,
    fontBytes: 0,
    imgBytes: 0,
    requestCount: 0
  }

  page.on('response', async (res) => {
    networkStats.requestCount++
    try {
      const headers = res.headers()
      const len = parseInt(headers['content-length'] || '0', 10)
      networkStats.totalBytes += len
      const url = res.url()
      if (url.endsWith('.js')) networkStats.jsBytes += len
      else if (url.endsWith('.css')) networkStats.cssBytes += len
      else if (url.endsWith('.woff2')) networkStats.fontBytes += len
      else if (url.endsWith('.webp') || url.endsWith('.png') || url.endsWith('.svg')) networkStats.imgBytes += len
    } catch {}
  })

  // Inject Web Vitals observers before page script execution
  await page.addInitScript(() => {
    window.__perfMetrics = {
      fcp: null,
      lcp: null,
      lcpElement: null,
      cls: 0,
      clsEntries: [],
      longTasks: []
    }

    // FCP
    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntriesByName('first-contentful-paint')) {
          window.__perfMetrics.fcp = entry.startTime
        }
      }).observe({ type: 'paint', buffered: true })
    } catch {}

    // LCP
    try {
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries()
        const lastEntry = entries[entries.length - 1]
        if (lastEntry) {
          window.__perfMetrics.lcp = lastEntry.startTime
          window.__perfMetrics.lcpElement = lastEntry.element?.tagName || null
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {}

    // CLS
    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__perfMetrics.cls += entry.value
          }
        }
      }).observe({ type: 'layout-shift', buffered: true })
    } catch {}

    // Long Tasks
    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          window.__perfMetrics.longTasks.push({
            startTime: entry.startTime,
            duration: entry.duration
          })
        }
      }).observe({ type: 'longtask', buffered: true })
    } catch {}
  })

  const url = `http://localhost:${port}${route}`
  const startTime = Date.now()
  await page.goto(url, { waitUntil: 'networkidle' })

  // Wait 1500ms for animations and hydration to settle
  await page.waitForTimeout(1500)

  const navTimings = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    return {
      ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
      domInteractive: nav ? Math.round(nav.domInteractive) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null
    }
  })

  const inPageMetrics = await page.evaluate(() => {
    const m = window.__perfMetrics || {}
    const fcp = m.fcp || 0
    const tbt = (m.longTasks || [])
      .filter((t) => t.startTime >= fcp)
      .reduce((acc, t) => acc + Math.max(0, t.duration - 50), 0)

    return {
      fcp: m.fcp ? Math.round(m.fcp) : null,
      lcp: m.lcp ? Math.round(m.lcp) : null,
      lcpElement: m.lcpElement || null,
      cls: Number((m.cls || 0).toFixed(4)),
      tbt: Math.round(tbt),
      longTaskCount: (m.longTasks || []).length
    }
  })

  const cdpMetricsRes = await cdp.send('Performance.getMetrics')
  const cdpMetrics = {}
  for (const m of cdpMetricsRes.metrics) {
    cdpMetrics[m.name] = m.value
  }

  const hydrationMismatches = consoleLogs.filter((l) =>
    l.text.includes('hydration fell back to client render') ||
    l.text.includes('Hydration failed') ||
    l.text.includes('did not match')
  )

  await context.close()

  return {
    route,
    profile: profile.name,
    fcp: inPageMetrics.fcp,
    lcp: inPageMetrics.lcp,
    cls: inPageMetrics.cls,
    tbt: inPageMetrics.tbt,
    ttfb: navTimings.ttfb,
    domNodes: cdpMetrics['Nodes'] || 0,
    jsHeapMB: ((cdpMetrics['JSHeapUsedSize'] || 0) / 1024 / 1024).toFixed(2),
    network: networkStats,
    hydrationErrors: hydrationMismatches.length,
    consoleErrors: consoleLogs.filter((l) => l.type === 'error').length,
    consoleWarnings: consoleLogs.filter((l) => l.type === 'warn').length
  }
}

async function run() {
  const port = 4175
  const server = await startStaticServer('dist', port)
  console.log(`[perf-audit] Static test server running on port ${port}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  })

  const results = []

  try {
    for (const profile of PROFILES) {
      console.log(`\n=== Running profile: ${profile.name} ===`)
      for (const route of ROUTES) {
        process.stdout.write(`Auditing ${route.padEnd(16)}... `)
        const metric = await measureRoute(browser, route, profile, port)
        results.push(metric)
        console.log(`FCP: ${metric.fcp}ms | LCP: ${metric.lcp}ms | CLS: ${metric.cls} | TBT: ${metric.tbt}ms | Nodes: ${metric.domNodes}`)
      }
    }

    fs.mkdirSync('audit/performance', { recursive: true })

    // Generate Markdown report
    let md = '# WHALEWZRD Core Web Vitals & Performance Audit\n\n'
    md += `*Generated at: ${new Date().toISOString()}*\n\n`
    md += '## 1. Executive Summary Table\n\n'
    md += '| Route | Profile | FCP (ms) | LCP (ms) | CLS | TBT (ms) | TTFB (ms) | DOM Nodes | JS Heap (MB) | Hydration OK |\n'
    md += '|---|---|---|---|---|---|---|---|---|---|\n'

    for (const r of results) {
      const hydrOk = r.hydrationErrors === 0 ? 'PASS' : `FAIL (${r.hydrationErrors})`
      md += `| \`${r.route}\` | ${r.profile} | ${r.fcp ?? 'N/A'} | ${r.lcp ?? 'N/A'} | ${r.cls} | ${r.tbt} | ${r.ttfb} | ${r.domNodes} | ${r.jsHeapMB} | ${hydrOk} |\n`
    }

    // Threshold Analysis
    md += '\n## 2. Threshold Evaluation (Google CWV Standards)\n\n'
    md += '- **LCP (Largest Contentful Paint)**: Good <= 2500ms, Needs Improvement <= 4000ms, Poor > 4000ms\n'
    md += '- **CLS (Cumulative Layout Shift)**: Good <= 0.1, Needs Improvement <= 0.25, Poor > 0.25\n'
    md += '- **TBT (Total Blocking Time)**: Good <= 200ms, Needs Improvement <= 600ms, Poor > 600ms\n'
    md += '- **FCP (First Contentful Paint)**: Good <= 1800ms, Needs Improvement <= 3000ms, Poor > 3000ms\n\n'

    md += '### Routes Requiring Optimization:\n'
    let issuesFound = 0
    for (const r of results) {
      const issues = []
      if (r.lcp > 2500) issues.push(`LCP ${r.lcp}ms > 2500ms`)
      if (r.cls > 0.1) issues.push(`CLS ${r.cls} > 0.1`)
      if (r.tbt > 200) issues.push(`TBT ${r.tbt}ms > 200ms`)
      if (r.hydrationErrors > 0) issues.push(`Hydration fallback triggered (${r.hydrationErrors})`)
      if (r.consoleErrors > 0) issues.push(`Console errors present (${r.consoleErrors})`)

      if (issues.length > 0) {
        issuesFound++
        md += `- **\`${r.route}\` (${r.profile})**: ${issues.join(', ')}\n`
      }
    }
    if (issuesFound === 0) {
      md += '- **ALL ROUTES PASSED 100% OF GOOGLE CORE WEB VITALS THRESHOLDS.**\n'
    }

    fs.writeFileSync('audit/performance/PERFORMANCE_REPORT.md', md, 'utf8')
    fs.writeFileSync('audit/performance/metrics.json', JSON.stringify(results, null, 2), 'utf8')
    console.log('\n[perf-audit] Performance report saved to audit/performance/PERFORMANCE_REPORT.md')

  } finally {
    await browser.close()
    server.close()
  }
}

run().catch((err) => {
  console.error('[perf-audit] Error:', err)
  process.exit(1)
})
