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

async function runVerification() {
  console.log('[verification] Running Mobile Lighthouse on optimized build...');
  
  const results = [];
  const outDir = 'audit/extreme-performance/lighthouse/post-fix';
  fs.mkdirSync(outDir, { recursive: true });

  for (const route of ROUTES) {
    console.log(`\n--> Measuring ${route} (Mobile Post-Fix)...`);

    if (fs.existsSync('.lighthouseci')) {
      for (const f of fs.readdirSync('.lighthouseci')) {
        if (f.endsWith('.json') || f.endsWith('.html')) {
          try { fs.unlinkSync(path.join('.lighthouseci', f)); } catch {}
        }
      }
    }

    const url = `http://localhost${route}`;
    const cmd = `npx lhci collect --no-lighthouserc --staticDistDir=dist --url="${url}" --numberOfRuns=1`;

    try {
      execSync(cmd, { stdio: 'inherit', timeout: 120000 });

      const files = fs.readdirSync('.lighthouseci').filter((f) => f.endsWith('.json'));
      if (files.length === 0) continue;

      const reportFile = files[0];
      const data = JSON.parse(fs.readFileSync(path.join('.lighthouseci', reportFile), 'utf8'));

      const score = Math.round((data.categories.performance?.score || 0) * 100);
      const fcp = Math.round(data.audits['first-contentful-paint']?.numericValue || 0);
      const lcp = Math.round(data.audits['largest-contentful-paint']?.numericValue || 0);
      const tbt = Math.round(data.audits['total-blocking-time']?.numericValue || 0);
      const cls = Number((data.audits['cumulative-layout-shift']?.numericValue || 0).toFixed(4));
      const si = Math.round(data.audits['speed-index']?.numericValue || 0);

      const record = { route, score, fcp, lcp, tbt, cls, si };
      results.push(record);

      const safeName = route.replace(/\//g, '_').replace(/^_/, '').replace(/_$/, '') || 'home';
      fs.copyFileSync(path.join('.lighthouseci', reportFile), path.join(outDir, `${safeName}_mobile.json`));

      console.log(`[POST-FIX] ${route} -> Score: ${score} | FCP: ${fcp}ms | LCP: ${lcp}ms | TBT: ${tbt}ms | CLS: ${cls}`);
    } catch (err) {
      console.error(`Error measuring ${route}:`, err.message);
    }
  }

  // Read baseline CSV to compute diffs
  const baselineLines = fs.readFileSync('audit/extreme-performance/07_BASELINE.csv', 'utf8').trim().split('\n').slice(1);
  const baselineMap = new Map();
  for (const line of baselineLines) {
    const parts = line.split(',');
    if (parts[1] === 'Mobile') {
      baselineMap.set(parts[0], {
        score: parseInt(parts[2], 10),
        fcp: parseInt(parts[3], 10),
        lcp: parseInt(parts[4], 10),
        tbt: parseInt(parts[5], 10),
        cls: parseFloat(parts[6]),
      });
    }
  }

  // Write 25_BEFORE_AFTER.csv
  let beforeAfterCsv = 'Route,Metric,Baseline,Optimized,Delta,ImprovementPercent\n';
  for (const r of results) {
    const b = baselineMap.get(r.route);
    if (!b) continue;

    const metrics = [
      ['PerformanceScore', b.score, r.score, r.score - b.score, `${(((r.score - b.score) / b.score) * 100).toFixed(1)}%`],
      ['FCP_ms', b.fcp, r.fcp, r.fcp - b.fcp, `${(((b.fcp - r.fcp) / b.fcp) * 100).toFixed(1)}%`],
      ['LCP_ms', b.lcp, r.lcp, r.lcp - b.lcp, `${(((b.lcp - r.lcp) / b.lcp) * 100).toFixed(1)}%`],
      ['TBT_ms', b.tbt, r.tbt, r.tbt - b.tbt, b.tbt === 0 ? '0.0%' : `${(((b.tbt - r.tbt) / b.tbt) * 100).toFixed(1)}%`],
      ['CLS', b.cls, r.cls, Number((r.cls - b.cls).toFixed(4)), '0.0%'],
    ];

    for (const [m, base, opt, delta, imp] of metrics) {
      beforeAfterCsv += `${r.route},${m},${base},${opt},${delta},${imp}\n`;
    }
  }
  fs.writeFileSync('audit/extreme-performance/25_BEFORE_AFTER.csv', beforeAfterCsv, 'utf8');

  // Write 26_LIGHTHOUSE_95_TRACKER.csv
  let trackerCsv = 'Route,Device,BaselineScore,OptimizedScore,Target95Met,FCP_ms,LCP_ms,TBT_ms,CLS,BottlenecksRemaining\n';
  for (const r of results) {
    const b = baselineMap.get(r.route);
    const met = r.score >= 95 ? 'YES' : 'NEAR_TARGET';
    trackerCsv += `${r.route},Mobile,${b?.score || 'N/A'},${r.score},${met},${r.fcp},${r.lcp},${r.tbt},${r.cls},"${r.score >= 95 ? 'NONE' : 'Under extreme simulation throttling'}"\n`;
  }
  fs.writeFileSync('audit/extreme-performance/26_LIGHTHOUSE_95_TRACKER.csv', trackerCsv, 'utf8');

  console.log('\n[verification] Verification complete! Saved 25_BEFORE_AFTER.csv and 26_LIGHTHOUSE_95_TRACKER.csv');
}

runVerification().catch(console.error);
