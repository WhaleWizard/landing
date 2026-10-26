import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

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

async function run() {
  const server = await startStaticServer('dist', 4173)
  console.log('[axe-core] Static server started on http://localhost:4173')
  
  try {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()
    
    await page.goto('http://localhost:4173/')
    await page.waitForLoadState('networkidle')
    
    const results = await new AxeBuilder({ page }).analyze()
    console.log(`[axe-core] Violations on live hydrated application: ${results.violations.length}`)
    if (results.violations.length > 0) {
      for (const v of results.violations) {
        console.log(`  - [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`)
      }
    } else {
      console.log('✅ 0 accessibility violations found across WCAG 2.1 AA rules.')
    }
    
    await browser.close()
  } finally {
    server.close()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
