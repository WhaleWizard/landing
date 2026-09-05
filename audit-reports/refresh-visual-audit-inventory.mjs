// Audit artifact generator only; never imported by the site or production build.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'audit-reports/VISUAL-AUDIT-COVERAGE-2026-09-05.json');
const previous = existsSync(destination) ? JSON.parse(readFileSync(destination, 'utf8')) : { files: [] };
const previousByPath = new Map(previous.files.map((item) => [item.path, item]));
const paths = [...new Set(execFileSync('git', [
  'ls-files', '-co', '--exclude-standard', '--',
  'src', 'functions', 'scripts', 'migrations', 'index.html', 'vite.config.ts',
  'package.json', 'tsconfig.app.json', 'tsconfig.functions.json', 'public/_headers', 'public/_redirects', 'public/_routes.json',
], { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean))]
  .filter((path) => /\.(?:tsx?|m?js|css|html|sql|json)$/.test(path) || /public\/_/.test(path))
  .sort();

const files = paths.map((path) => {
  const content = readFileSync(resolve(root, path), 'utf8');
  const sha256 = createHash('sha256').update(content).digest('hex');
  const last = previousByPath.get(path);
  const unchanged = last?.sha256 === sha256;
  return {
    path,
    lines: content ? content.replace(/\r\n/g, '\n').split('\n').length - (content.endsWith('\n') ? 1 : 0) : 0,
    sha256,
    group: path.startsWith('src/app/components/admin/') || /src\/app\/pages\/Admin/.test(path)
      ? 'admin' : path.startsWith('src/') ? 'frontend'
        : path.startsWith('functions/') ? 'edge' : path.startsWith('migrations/') ? 'schema' : 'build-tests-config',
    status: unchanged ? last.status : 'not_reviewed',
    reviewedRanges: unchanged ? last.reviewedRanges : [],
    evidence: unchanged ? last.evidence : [],
    ...(last && !unchanged ? { previousEvidence: last.evidence, reviewInvalidatedByChange: true } : {}),
  };
});

const result = {
  generatedAt: new Date().toISOString(),
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  rules: [
    'This is an inventory, not proof of review. not_reviewed is intentional even for partly inspected files.',
    'Read complete source and follow dependencies before marking code_reviewed; record exact line ranges and evidence.',
    'Use verified only after route/state/mobile/desktop checks; identify automated and real-device checks separately.',
    'Changing a file hash invalidates its previous review. Do not label generated/vendor code hand-reviewed; audit its source/generator and emitted behavior.',
    'Binary assets are not line-audited; audit their request timing, dimensions, srcset, decoding, quality and visible use in the route matrix.',
  ],
  counts: { files: files.length, lines: files.reduce((total, item) => total + item.lines, 0) },
  files,
};
writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ destination, ...result.counts }));
