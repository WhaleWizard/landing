import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

function startStaticServer(distDir, port = 4177) {
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

const DESKTOP_VIEWPORTS = [
  { name: '768x1024 (iPad portrait)', width: 768, height: 1024 },
  { name: '1024x768 (iPad landscape)', width: 1024, height: 768 },
  { name: '1280x720 (HD Laptop)', width: 1280, height: 720 },
  { name: '1366x768 (Standard Laptop)', width: 1366, height: 768 },
  { name: '1440x900 (MacBook Pro)', width: 1440, height: 900 },
  { name: '1536x864 (Scaled 1080p)', width: 1536, height: 864 },
  { name: '1920x1080 (FHD Desktop)', width: 1920, height: 1080 },
  { name: '2560x1440 (QHD Monitor)', width: 2560, height: 1440 }
]

const MOBILE_VIEWPORTS = [
  { name: '320px (iPhone SE 1st)', width: 320, height: 640 },
  { name: '360px (Galaxy S8/S9)', width: 360, height: 740 },
  { name: '375px (iPhone SE 2/3)', width: 375, height: 667 },
  { name: '390px (iPhone 12/13/14)', width: 390, height: 844 },
  { name: '393px (Pixel 7/8 / iPhone 15)', width: 393, height: 852 },
  { name: '412px (Galaxy S20/S24)', width: 412, height: 915 },
  { name: '414px (iPhone Plus/Max)', width: 414, height: 896 },
  { name: '428px (iPhone 13/14 Pro Max)', width: 428, height: 926 },
  { name: '430px (iPhone 15 Pro Max)', width: 430, height: 932 },
  { name: '480px (Large mobile)', width: 480, height: 800 },
  { name: '639px (sm breakpoint - 1)', width: 639, height: 800 },
  { name: '640px (sm breakpoint)', width: 640, height: 800 },
  { name: '767px (md breakpoint - 1)', width: 767, height: 1024 },
  { name: '768px (md breakpoint)', width: 768, height: 1024 },
  { name: '1023px (lg breakpoint - 1)', width: 1023, height: 768 }
]

const ROUTES = [
  '/',
  '/meta-ads/',
  '/meta-apps/',
  '/google-ads/',
  '/consult/',
  '/blog/',
  '/cases/',
  '/faq/',
  '/privacy/',
  '/terms/',
  '/cookies/',
  '/calculator/',
  '/budget-calculator/',
  '/glossary/'
]

async function run() {
  const port = 4177
  const server = await startStaticServer('dist', port)
  console.log(`[viewport-qa] Static server running on port ${port}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  })

  const failures = []
  let totalChecks = 0

  try {
    const page = await browser.newPage()

    for (const route of ROUTES) {
      const url = `http://localhost:${port}${route}`
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.waitForTimeout(300)

      // Test all desktop viewports
      for (const vp of DESKTOP_VIEWPORTS) {
        totalChecks++
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await page.waitForTimeout(50)

        const check = await page.evaluate(() => {
          const sw = document.documentElement.scrollWidth
          const iw = window.innerWidth
          if (sw > iw) {
            return { diff: sw - iw, sw, iw }
          }
          return null
        })

        if (check) {
          failures.push({
            route,
            viewport: vp.name,
            type: 'desktop',
            width: vp.width,
            overflowPx: check.diff
          })
          console.error(`[FAIL] ${route} @ ${vp.name}: overflow ${check.diff}px (scrollWidth ${check.sw} > innerWidth ${check.iw})`)
        }
      }

      // Test all mobile viewports
      for (const vp of MOBILE_VIEWPORTS) {
        totalChecks++
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await page.waitForTimeout(50)

        const check = await page.evaluate(() => {
          const sw = document.documentElement.scrollWidth
          const iw = window.innerWidth
          if (sw > iw) {
            return { diff: sw - iw, sw, iw }
          }
          return null
        })

        if (check) {
          failures.push({
            route,
            viewport: vp.name,
            type: 'mobile',
            width: vp.width,
            overflowPx: check.diff
          })
          console.error(`[FAIL] ${route} @ ${vp.name}: overflow ${check.diff}px (scrollWidth ${check.sw} > innerWidth ${check.iw})`)
        }
      }

      // Zoom stress test (125%, 150%, 200% simulated via zoom CSS / scale factor)
      for (const zoom of [1.25, 1.5, 2.0]) {
        totalChecks++
        await page.setViewportSize({ width: Math.round(1440 / zoom), height: Math.round(900 / zoom) })
        await page.waitForTimeout(50)
        const check = await page.evaluate(() => {
          const sw = document.documentElement.scrollWidth
          const iw = window.innerWidth
          return sw > iw ? sw - iw : 0
        })
        if (check > 0) {
          failures.push({
            route,
            viewport: `Desktop Zoom ${(zoom * 100)}%`,
            type: 'zoom',
            width: Math.round(1440 / zoom),
            overflowPx: check
          })
          console.error(`[FAIL] ${route} @ Zoom ${zoom * 100}%: overflow ${check}px`)
        }
      }
    }

    await page.close()

    fs.mkdirSync('audit/qa', { recursive: true })

    // Generate Markdown report
    let md = '# WHALEWZRD Cross-Viewport & Responsive QA Audit\n\n'
    md += `*Generated at: ${new Date().toISOString()}*\n\n`
    md += '## Inspection Parameters\n\n'
    md += `- **Routes Audited**: ${ROUTES.length} static routes\n`
    md += `- **Desktop Viewports**: 8 configurations (768px to 2560px)\n`
    md += `- **Mobile Viewports**: 15 breakpoints (320px to 1023px)\n`
    md += `- **Zoom Stress Levels**: 125%, 150%, 200%\n`
    md += `- **Total Verification Runs**: ${totalChecks} automated checks\n`
    md += `- **Overflow Rule**: Zero Tolerance (\`scrollWidth <= innerWidth\`)\n\n`

    md += '## Results Summary\n\n'
    if (failures.length === 0) {
      md += `###  PERFECT SCORE: 0 OVERFLOW FAILURES\n\n`
      md += `All **${totalChecks}** checks passed across all routes and viewports without a single pixel of horizontal overflow.\n\n`
    } else {
      md += `### ⚠️ DETECTED ${failures.length} OVERFLOW FAILURES\n\n`
      md += '| Route | Viewport | Type | Width (px) | Overflow (px) |\n'
      md += '|---|---|---|---|---|\n'
      for (const f of failures) {
        md += `| \`${f.route}\` | ${f.viewport} | ${f.type} | ${f.width} | **+${f.overflowPx}px** |\n`
      }
      md += '\n'
    }

    fs.writeFileSync('audit/qa/VIEWPORT_QA_REPORT.md', md, 'utf8')
    fs.writeFileSync('audit/qa/viewport-qa-results.json', JSON.stringify({ totalChecks, failures }, null, 2), 'utf8')

    console.log(`\n=== QA AUDIT COMPLETE ===`)
    console.log(`Total checks: ${totalChecks}`)
    console.log(`Failures: ${failures.length}`)
    console.log(`Report written to audit/qa/VIEWPORT_QA_REPORT.md\n`)

    if (failures.length > 0) {
      process.exitCode = 1
    }
  } finally {
    await browser.close()
    server.close()
  }
}

run().catch((err) => {
  console.error('[viewport-qa] Error:', err)
  process.exit(1)
})
