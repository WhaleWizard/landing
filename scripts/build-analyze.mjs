process.env.ANALYZE = 'true'
import { build } from 'vite'

async function run() {
  console.log('[build:analyze] Starting Vite build with Visualizer...')
  await build()
  console.log('[build:analyze] Treemap report generated at dist/stats.html')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
