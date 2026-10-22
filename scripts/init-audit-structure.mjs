import fs from 'node:fs';
import path from 'node:path';

const dirs = [
  'audit/requirements',
  'audit/source',
  'audit/architecture',
  'audit/routes',
  'audit/performance',
  'audit/hero',
  'audit/desktop',
  'audit/mobile',
  'audit/admin',
  'audit/backend',
  'audit/network',
  'audit/visual',
  'audit/visual/desktop',
  'audit/visual/mobile',
  'audit/visual/hero',
  'audit/visual/interactions',
  'audit/visual/after',
  'audit/security',
  'audit/analytics',
  'audit/testing',
  'audit/fixes',
  'audit/regressions',
  'audit/reports',
  'audit/checkpoints',
  'audit/baseline'
];

for (const dir of dirs) {
  const fullPath = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
}

console.log('Audit directory structure created/verified.');
