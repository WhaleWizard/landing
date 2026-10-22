import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  
  const filePath = path.resolve('dist/index.html')
  await page.goto(pathToFileURL(filePath).href)
  
  const results = await new AxeBuilder({ page }).analyze()
  console.log(`[axe-core] Violations found: ${results.violations.length}`)
  if (results.violations.length > 0) {
    for (const v of results.violations.slice(0, 3)) {
      console.log(`  - [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`)
    }
  }
  await browser.close()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
