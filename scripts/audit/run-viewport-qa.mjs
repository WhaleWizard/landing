import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { STATIC_ROUTES } from '../config.js'

// DA-24: сервер стенда отвечает как Cloudflare Pages — каталог с index.html
// или 404.html с кодом 404. Раньше любой несуществующий адрес получал главную
// с кодом 200, и проверка засчитывала её за «/privacy/» или «/glossary/».
function resolveStaticFile(distDir, reqPath) {
  const clean = decodeURIComponent(reqPath).replace(/\/+$/, '') || '/'
  const candidates = clean === '/'
    ? [path.join(distDir, 'index.html')]
    : [path.join(distDir, clean), path.join(distDir, clean, 'index.html'), path.join(distDir, `${clean}.html`)]
  const root = path.resolve(distDir)
  for (const file of candidates) {
    if (!path.resolve(file).startsWith(root)) continue
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return { file, status: 200 }
  }
  return { file: path.join(distDir, '404.html'), status: 404 }
}

function startStaticServer(distDir, port = 4177) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const reqPath = req.url.split('?')[0]
      const { file: filePath, status } = resolveStaticFile(distDir, reqPath)
      res.statusCode = status

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
      res.end(fs.existsSync(filePath) ? fs.readFileSync(filePath) : 'Not found')
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

// Канонический список страниц — тот же, по которому генератор пишет HTML.
const ROUTES = STATIC_ROUTES
const MISSING_ROUTE = '/__viewport-qa-missing__'

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

    // Заведомо несуществующий адрес обязан остаться 404, а не главной.
    const missing = await page.goto(`http://localhost:${port}${MISSING_ROUTE}`, { waitUntil: 'domcontentloaded' })
    totalChecks++
    if (missing?.status() !== 404) {
      failures.push({ route: MISSING_ROUTE, viewport: '—', type: 'identity', width: 0, overflowPx: 0, note: `ожидался 404, пришёл ${missing?.status()}` })
      console.error(`[FAIL] ${MISSING_ROUTE}: ожидался 404, пришёл ${missing?.status()}`)
    }

    for (const route of ROUTES) {
      const url = `http://localhost:${port}${route}`
      const response = await page.goto(url, { waitUntil: 'networkidle' })
      await page.waitForTimeout(300)

      // Та ли это страница: код 200, адрес не уехал, canonical указывает на неё.
      totalChecks++
      const identity = await page.evaluate(() => ({
        path: location.pathname.replace(/\/+$/, '') || '/',
        canonical: (() => {
          try { return new URL(document.querySelector('link[rel="canonical"]')?.href || '').pathname.replace(/\/+$/, '') || '/' } catch { return '' }
        })(),
        title: document.title,
      }))
      if (response?.status() !== 200 || identity.path !== route || identity.canonical !== route) {
        failures.push({ route, viewport: '—', type: 'identity', width: 0, overflowPx: 0, note: `HTTP ${response?.status()}, путь ${identity.path}, canonical ${identity.canonical}` })
        console.error(`[FAIL] ${route}: не та страница — HTTP ${response?.status()}, путь ${identity.path}, canonical ${identity.canonical}`)
        continue
      }

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
          // Документ не прокручивается, но элемент уходит за край и обрезан
          // контейнером с overflow: hidden — это тоже поломка (DA-24).
          // Только то, что человек должен увидеть или нажать: свой текст или
          // элемент управления. Декор (блики, фоны, aria-hidden) уезжает за край
          // намеренно и обрезается специально.
          const clipped = [...document.querySelectorAll('body *')].find((element) => {
            if (element.closest('[aria-hidden="true"]')) return false
            const meaningful = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|IMG)$/.test(element.tagName)
              || [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim())
            if (!meaningful) return false
            // Лента с горизонтальной прокруткой — до элемента можно докрутить.
            for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
              const overflowX = getComputedStyle(parent).overflowX
              if ((overflowX === 'auto' || overflowX === 'scroll') && parent.scrollWidth > parent.clientWidth) return false
            }
            const rect = element.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0 && rect.right > iw + 1 && getComputedStyle(element).visibility !== 'hidden'
          })
          if (clipped) {
            const rect = clipped.getBoundingClientRect()
            return { diff: Math.round(rect.right - iw), sw, iw, clipped: `${clipped.tagName.toLowerCase()}.${String(clipped.className).split(' ')[0]}` }
          }
          return null
        })

        if (check) {
          failures.push({
            route,
            viewport: vp.name,
            type: check.clipped ? 'clipped' : 'desktop',
            width: vp.width,
            overflowPx: check.diff,
            note: check.clipped || ''
          })
          console.error(`[FAIL] ${route} @ ${vp.name}: ${check.clipped ? `${check.clipped} обрезан на ${check.diff}px` : `overflow ${check.diff}px (scrollWidth ${check.sw} > innerWidth ${check.iw})`}`)
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
          // Документ не прокручивается, но элемент уходит за край и обрезан
          // контейнером с overflow: hidden — это тоже поломка (DA-24).
          // Только то, что человек должен увидеть или нажать: свой текст или
          // элемент управления. Декор (блики, фоны, aria-hidden) уезжает за край
          // намеренно и обрезается специально.
          const clipped = [...document.querySelectorAll('body *')].find((element) => {
            if (element.closest('[aria-hidden="true"]')) return false
            const meaningful = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|IMG)$/.test(element.tagName)
              || [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim())
            if (!meaningful) return false
            // Лента с горизонтальной прокруткой — до элемента можно докрутить.
            for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
              const overflowX = getComputedStyle(parent).overflowX
              if ((overflowX === 'auto' || overflowX === 'scroll') && parent.scrollWidth > parent.clientWidth) return false
            }
            const rect = element.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0 && rect.right > iw + 1 && getComputedStyle(element).visibility !== 'hidden'
          })
          if (clipped) {
            const rect = clipped.getBoundingClientRect()
            return { diff: Math.round(rect.right - iw), sw, iw, clipped: `${clipped.tagName.toLowerCase()}.${String(clipped.className).split(' ')[0]}` }
          }
          return null
        })

        if (check) {
          failures.push({
            route,
            viewport: vp.name,
            type: check.clipped ? 'clipped' : 'mobile',
            width: vp.width,
            overflowPx: check.diff,
            note: check.clipped || ''
          })
          console.error(`[FAIL] ${route} @ ${vp.name}: ${check.clipped ? `${check.clipped} обрезан на ${check.diff}px` : `overflow ${check.diff}px (scrollWidth ${check.sw} > innerWidth ${check.iw})`}`)
        }
      }

      // Масштаб браузера 125/150/200 % для вёрстки равен окну 1440 × 900, делённому
      // на масштаб: проверяется именно эта ширина, и в отчёте она так и названа.
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
            viewport: `Ширина ${Math.round(1440 / zoom)} px (как масштаб ${zoom * 100} % на 1440 × 900)`,
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
    md += `- **Zoom-equivalent widths**: 1152, 960, 720 px (1440 × 900 / 125, 150, 200 %)\n`
    md += `- **Total Verification Runs**: ${totalChecks} automated checks\n`
    md += `- **Overflow Rule**: Zero Tolerance (\`scrollWidth <= innerWidth\`)\n\n`

    md += '## Results Summary\n\n'
    if (failures.length === 0) {
      md += `###  PERFECT SCORE: 0 OVERFLOW FAILURES\n\n`
      md += `All **${totalChecks}** checks passed across all routes and viewports without a single pixel of horizontal overflow.\n\n`
    } else {
      md += `### ⚠️ DETECTED ${failures.length} OVERFLOW FAILURES\n\n`
      md += '| Route | Viewport | Type | Width (px) | Overflow (px) | Note |\n'
      md += '|---|---|---|---|---|---|\n'
      for (const f of failures) {
        md += `| \`${f.route}\` | ${f.viewport} | ${f.type} | ${f.width} | **+${f.overflowPx}px** | ${f.note || ''} |\n`
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
