import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROUTES = [
  '/',
  '/meta-ads/',
  '/meta-apps/',
  '/google-ads/',
  '/consult/',
  '/blog/',
  '/cases/',
  '/faq/',
  '/calculator/',
  '/roi-calculator/',
  '/marketing-glossary/',
  '/privacy-policy/',
  '/offer/',
  '/cookie-policy/',
];

const PRESETS = [
  { name: 'Desktop', flags: '--settings.preset=desktop' },
  { name: 'Mobile', flags: '' }, // default mobile simulation
];

async function run() {
  console.log('[extreme-lighthouse] Starting comprehensive Lighthouse audit across routes...');
  const outDir = 'audit/extreme-performance/lighthouse';
  fs.mkdirSync(outDir, { recursive: true });

  const summary = [];

  for (const preset of PRESETS) {
    console.log(`\n========================================`);
    console.log(`=== RUNNING PRESET: ${preset.name.toUpperCase()} ===`);
    console.log(`========================================`);

    for (const route of ROUTES) {
      console.log(`\n--> Measuring ${route} (${preset.name})...`);
      
      // Clean previous run reports in .lighthouseci to isolate
      if (fs.existsSync('.lighthouseci')) {
        for (const f of fs.readdirSync('.lighthouseci')) {
          if (f.endsWith('.json') || f.endsWith('.html')) {
            try { fs.unlinkSync(path.join('.lighthouseci', f)); } catch {}
          }
        }
      }

      const url = `http://localhost${route}`;
      const cmd = `npx lhci collect --no-lighthouserc --staticDistDir=dist --url="${url}" --numberOfRuns=1 ${preset.flags}`;

      try {
        execSync(cmd, { stdio: 'inherit', timeout: 120000 });

        const files = fs.readdirSync('.lighthouseci').filter(f => f.endsWith('.json'));
        if (files.length === 0) {
          console.error(`[extreme-lighthouse] No report generated for ${route}`);
          continue;
        }

        const reportFile = files[0];
        const data = JSON.parse(fs.readFileSync(path.join('.lighthouseci', reportFile), 'utf8'));

        const score = Math.round((data.categories.performance?.score || 0) * 100);
        const fcp = data.audits['first-contentful-paint']?.numericValue || 0;
        const lcp = data.audits['largest-contentful-paint']?.numericValue || 0;
        const tbt = data.audits['total-blocking-time']?.numericValue || 0;
        const cls = data.audits['cumulative-layout-shift']?.numericValue || 0;
        const si = data.audits['speed-index']?.numericValue || 0;

        const record = {
          route,
          preset: preset.name,
          score,
          fcp: Math.round(fcp),
          lcp: Math.round(lcp),
          tbt: Math.round(tbt),
          cls: Number(cls.toFixed(4)),
          speedIndex: Math.round(si),
        };

        summary.push(record);

        // Copy JSON report to outDir
        const safeName = route.replace(/\//g, '_').replace(/^_/, '').replace(/_$/, '') || 'home';
        fs.copyFileSync(
          path.join('.lighthouseci', reportFile),
          path.join(outDir, `${safeName}_${preset.name.toLowerCase()}.json`)
        );

        console.log(`Result: Score ${score} | FCP ${record.fcp}ms | LCP ${record.lcp}ms | TBT ${record.tbt}ms | CLS ${record.cls}`);
      } catch (err) {
        console.error(`[extreme-lighthouse] Error running ${route}:`, err.message);
      }
    }
  }

  // Write summary CSV and markdown
  let csv = 'Route,Preset,PerformanceScore,FCP_ms,LCP_ms,TBT_ms,CLS,SpeedIndex_ms\n';
  for (const s of summary) {
    csv += `${s.route},${s.preset},${s.score},${s.fcp},${s.lcp},${s.tbt},${s.cls},${s.speedIndex}\n`;
  }
  fs.writeFileSync('audit/extreme-performance/07_BASELINE.csv', csv, 'utf8');

  let md = '# Full-Route Lighthouse Baseline (v6.0 Forensics)\n\n';
  md += `*Generated at: ${new Date().toISOString()}*\n\n`;
  md += '| Route | Preset | Score | FCP (ms) | LCP (ms) | TBT (ms) | CLS | Speed Index (ms) |\n';
  md += '|---|---|---|---|---|---|---|---|\n';
  for (const s of summary) {
    md += `| \`${s.route}\` | ${s.preset} | **${s.score}** | ${s.fcp} | ${s.lcp} | ${s.tbt} | ${s.cls} | ${s.speedIndex} |\n`;
  }
  fs.writeFileSync('audit/extreme-performance/lighthouse/SUMMARY.md', md, 'utf8');

  console.log('\n[extreme-lighthouse] Baseline complete! Results written to audit/extreme-performance/07_BASELINE.csv');
}

run().catch(err => {
  console.error('[extreme-lighthouse] Fatal error:', err);
  process.exit(1);
});
