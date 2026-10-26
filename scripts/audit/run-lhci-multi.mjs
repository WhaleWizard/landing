import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

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
  console.log('[lhci] Static server running on port 4173')

  const routes = [
    '/',
    '/meta-ads/',
    '/meta-apps/',
    '/google-ads/',
    '/consult/',
    '/blog/',
    '/cases/',
    '/faq/'
  ]

  const urls = routes.map((r) => `http://localhost:4173${r}`)
  const urlFlags = urls.map((u) => `--url="${u}"`).join(' ')
  
  try {
    console.log('[lhci] Collecting Lighthouse CI metrics...')
    execSync(`lhci collect --no-lighthouserc ${urlFlags} --numberOfRuns=1`, { stdio: 'inherit' })

    const files = fs.readdirSync('.lighthouseci').filter((f) => f.endsWith('.json'))
    console.log(`\n=== LIGHTHOUSE CI AUDIT RESULTS (${files.length} reports) ===`)
    console.log('Route | Score | FCP | LCP | TBT | CLS')
    console.log('---|---|---|---|---|---')

    for (const f of files) {
      const data = JSON.parse(fs.readFileSync(path.join('.lighthouseci', f), 'utf8'))
      const url = new URL(data.finalUrl).pathname
      const score = Math.round((data.categories.performance?.score || 0) * 100)
      const fcp = data.audits['first-contentful-paint']?.displayValue || 'N/A'
      const lcp = data.audits['largest-contentful-paint']?.displayValue || 'N/A'
      const tbt = data.audits['total-blocking-time']?.displayValue || 'N/A'
      const cls = data.audits['cumulative-layout-shift']?.displayValue || 'N/A'
      console.log(`${url} | ${score} | ${fcp} | ${lcp} | ${tbt} | ${cls}`)
    }
  } finally {
    server.close()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
