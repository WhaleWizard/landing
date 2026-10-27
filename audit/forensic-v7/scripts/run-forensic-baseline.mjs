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
  '/blog/analitika-i-atributsiya-v-2026-kak-perestat-sporit-o-lidah-i-schitat-pribyl/',
  '/cases/prodvizhenie-premialnogo-konserzh-servisa-klienty-i-trafik-dlya-konserzh-servisa-cherez-targetirovannuyu-reklamu/',
  '/cases/trafik-dlya-premialnyh-nish-i-lyuks-segmenta-2-goda-raboty-i-260k-reklamnogo-byudzheta/',
];

const PRESETS = [
  { name: 'Mobile', flags: '' },
  { name: 'Desktop', flags: '--settings.preset=desktop' },
];

async function main() {
  console.log('[forensic-baseline] Starting Forensic Baseline Evaluation across all 17 routes...');
  const outDir = 'audit/forensic-v7/lighthouse';
  fs.mkdirSync(outDir, { recursive: true });

  const rows = [];

  for (const preset of PRESETS) {
    console.log(`\n==============================================`);
    console.log(`=== PRESET: ${preset.name.toUpperCase()} ===`);
    console.log(`==============================================`);

    for (const route of ROUTES) {
      console.log(`\n--> Measuring [${preset.name}] ${route}...`);

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
        execSync(cmd, { stdio: 'pipe', timeout: 120000 });

        const files = fs.readdirSync('.lighthouseci').filter((f) => f.endsWith('.json'));
        if (files.length === 0) {
          console.error(`[forensic-baseline] No report generated for ${route}`);
          continue;
        }

        const reportFile = files[0];
        const data = JSON.parse(fs.readFileSync(path.join('.lighthouseci', reportFile), 'utf8'));

        const score = Math.round((data.categories.performance?.score || 0) * 100);
        const fcp = Math.round(data.audits['first-contentful-paint']?.numericValue || 0);
        const lcp = Math.round(data.audits['largest-contentful-paint']?.numericValue || 0);
        const tbt = Math.round(data.audits['total-blocking-time']?.numericValue || 0);
        const cls = Number((data.audits['cumulative-layout-shift']?.numericValue || 0).toFixed(4));
        const si = Math.round(data.audits['speed-index']?.numericValue || 0);

        rows.push({
          route,
          preset: preset.name,
          score,
          fcp,
          lcp,
          tbt,
          cls,
          si,
        });

        const safeName = route.replace(/\//g, '_').replace(/^_/, '').replace(/_$/, '') || 'home';
        fs.copyFileSync(
          path.join('.lighthouseci', reportFile),
          path.join(outDir, `${safeName}_${preset.name.toLowerCase()}.json`)
        );

        console.log(`[RESULT] ${route} (${preset.name}) => Score: ${score} | FCP: ${fcp}ms | LCP: ${lcp}ms | TBT: ${tbt}ms | CLS: ${cls}`);
      } catch (err) {
        console.error(`[ERROR] Failed to measure ${route} (${preset.name}):`, err.message);
      }
    }
  }

  // Write audit/forensic-v7/07_BASELINE.csv
  const csvHeader = 'Route,Preset,PerformanceScore,FCP_ms,LCP_ms,TBT_ms,CLS,SpeedIndex_ms\n';
  const csvBody = rows.map((r) => `${r.route},${r.preset},${r.score},${r.fcp},${r.lcp},${r.tbt},${r.cls},${r.si}`).join('\n');
  fs.writeFileSync('audit/forensic-v7/07_BASELINE.csv', csvHeader + csvBody, 'utf8');

  console.log('\n[forensic-baseline] Baseline recorded in audit/forensic-v7/07_BASELINE.csv');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
