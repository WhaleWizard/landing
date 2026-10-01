import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { ssrBuildOptions } from './ssr-bundle.js';

/**
 * Петли визуала Meta Apps живут в CSS, а не в motion. Тест стережёт две вещи:
 * в компоненте не осталось бесконечных JS-анимаций, а кадры CSS совпадают с
 * траекториями FLOAT_PATHS — источником чисел, который остался в коде.
 */
const source = await readFile('src/app/components/MetaAppsHeroVisual.tsx', 'utf8');
const css = await readFile('src/app/components/meta-apps-hero.css', 'utf8');

test('Meta Apps visual has no infinite motion loops on the main thread', () => {
  assert.doesNotMatch(source, /repeat:\s*(?:loop\s*\?\s*)?Infinity/, 'бесконечная motion-анимация вернулась в компонент');
  for (const className of ['meta-phone-float', 'meta-phone-reflection', 'meta-phone-events__pulse', 'meta-receipt--float-${index + 1}']) {
    assert.ok(source.includes(className), `${className} должен быть в разметке`);
  }
  // Пауза вне экрана и в скрытой вкладке — тем же классом, что у остальных секций.
  assert.ok((source.match(/ww-ambient-motion/g) || []).length >= 4);
});

test('CSS receipt keyframes mirror FLOAT_PATHS', async () => {
  const compiled = await build(ssrBuildOptions({ entryPoints: ['src/app/components/MetaAppsHeroVisual.tsx'], format: 'cjs', write: false }));
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const paths = module.exports.FLOAT_PATHS;
  assert.equal(paths.length, 3);
  paths.forEach((path, index) => {
    const name = `meta-apps-receipt-float-${index + 1}`;
    const block = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1];
    assert.ok(block, `нет @keyframes ${name}`);
    const frames = [...block.matchAll(/(\d+)% \{ transform: translateY\((-?[\d.]+)px\) rotate\((-?[\d.]+)deg\); \}/g)];
    assert.deepEqual(frames.map((f) => Number(f[1])), [0, 25, 50, 75, 100]);
    assert.deepEqual(frames.map((f) => Number(f[2])), [...path.y]);
    assert.deepEqual(frames.map((f) => Number(f[3])), [...path.rotate]);
    const rule = css.match(new RegExp(`\\.meta-receipt--float-${index + 1} \\{ animation: ${name} ([\\d.]+)s ease-in-out(?: ([\\d.]+)s)? infinite; \\}`));
    assert.ok(rule, `нет правила для .meta-receipt--float-${index + 1}`);
    assert.equal(Number(rule[1]), path.duration);
    assert.equal(Number(rule[2] || 0), Math.round(index * 0.37 * 100) / 100);
  });
});

test('reflection and pulse keep their motion timings', () => {
  assert.match(css, /\.meta-phone-float \{\s*animation: meta-apps-phone-float 5\.8s ease-in-out infinite;/);
  assert.match(css, /animation: meta-apps-reflection 8\.3s ease-in-out infinite/);
  assert.match(css, /33\.735% \{ transform: translateX\(270%\); \}/);
  assert.match(css, /animation: meta-apps-pulse 4\.4s ease-in-out infinite/);
  assert.match(css, /59\.091% \{ transform: translateY\(310%\); opacity: 0; \}/);
});
