#!/usr/bin/env node
/**
 * Собирает библиотеку шрифтов редактора страниц из `font-library.manifest.js`.
 *
 *   node scripts/build-font-library.js            # докачать недостающее и пересобрать
 *   node scripts/build-font-library.js --offline  # только пересобрать из локальных файлов
 *
 * Скрипт запускается вручную при изменении манифеста, а не на каждой сборке:
 * production-сборке сеть не нужна, все WOFF2 лежат в репозитории.
 *
 * Что пишется:
 *   public/fonts/library/<id>-<вес>-normal-<subset>.woff2
 *   src/styles/content-font-library.css
 *   src/app/utils/contentFontCatalog.ts
 *   functions/_lib/content-font-ids.ts
 *
 * Семейства без кириллического subset отбрасываются: библиотека существует
 * ради русских страниц, латинский шрифт в ней бесполезен.
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONT_LIBRARY, FONT_SUBSETS, cssFamilyName } from './font-library.manifest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY_DIR = join(ROOT, 'public', 'fonts', 'library');
const HERO_DIR = join(ROOT, 'public', 'fonts', 'hero');
const CSS_PATH = join(ROOT, 'src', 'styles', 'content-font-library.css');
const CATALOG_PATH = join(ROOT, 'src', 'app', 'utils', 'contentFontCatalog.ts');
const SERVER_IDS_PATH = join(ROOT, 'functions', '_lib', 'content-font-ids.ts');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const offline = process.argv.includes('--offline');

const CATEGORY_ORDER = ['sans', 'serif', 'mono', 'display', 'handwritten'];

function fileName(id, weight, subset) {
  return `${id}-${weight}-normal-${subset}.woff2`;
}

function fontDir(entry) {
  return entry.dir === 'hero' ? HERO_DIR : LIBRARY_DIR;
}

function publicPath(entry, weight, subset) {
  const folder = entry.dir === 'hero' ? 'hero' : 'library';
  return `/fonts/${folder}/${fileName(entry.id, weight, subset)}`;
}

async function fetchGoogleCss(family, weight) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  const response = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
  if (!response.ok) return null;
  return response.text();
}

/** Разбирает ответ Google на блоки `{ subset, url, unicodeRange }`. */
function parseFaces(css) {
  const faces = [];
  const blocks = css.split('/*').slice(1);
  for (const block of blocks) {
    const subset = block.slice(0, block.indexOf('*/')).trim();
    const url = /src:\s*url\(([^)]+)\)/.exec(block)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/.exec(block)?.[1]?.trim();
    if (subset && url && unicodeRange) faces.push({ subset, url, unicodeRange });
  }
  return faces;
}

async function downloadTo(url, target) {
  const response = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
  if (!response.ok) throw new Error(`HTTP ${response.status} для ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 200) throw new Error(`Подозрительно маленький файл: ${url}`);
  writeFileSync(target, buffer);
  return buffer.length;
}

/**
 * Диапазоны у одного subset одинаковы почти для всех семейств, но не совсем.
 * Для уже скачанных файлов сеть недоступна в offline-режиме, поэтому держим
 * запасные значения — те же, что Google отдаёт для кириллических шрифтов.
 */
const FALLBACK_RANGES = {
  'cyrillic-ext': 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F',
  cyrillic: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
};

async function resolveEntry(entry) {
  const faces = [];
  const skippedWeights = [];
  let sawCyrillic = false;

  for (const weight of entry.weights) {
    const localFiles = FONT_SUBSETS
      .map((subset) => ({ subset, target: join(fontDir(entry), fileName(entry.id, weight, subset)) }))
      .filter((item) => existsSync(item.target));

    const needsNetwork = !offline && localFiles.length < FONT_SUBSETS.length;
    let remote = null;
    if (needsNetwork) {
      const css = await fetchGoogleCss(entry.family, weight);
      if (!css) {
        skippedWeights.push(weight);
        continue;
      }
      remote = parseFaces(css);
      if (!remote.some((face) => face.subset === 'cyrillic')) {
        return { ok: false, reason: 'нет кириллицы в Google Fonts' };
      }
    }

    for (const subset of FONT_SUBSETS) {
      const target = join(fontDir(entry), fileName(entry.id, weight, subset));
      const remoteFace = remote?.find((face) => face.subset === subset);
      if (!existsSync(target)) {
        if (!remoteFace) continue;
        mkdirSync(fontDir(entry), { recursive: true });
        await downloadTo(remoteFace.url, target);
        process.stdout.write(`  + ${fileName(entry.id, weight, subset)}\n`);
      }
      if (subset === 'cyrillic') sawCyrillic = true;
      faces.push({
        weight,
        subset,
        src: publicPath(entry, weight, subset),
        unicodeRange: remoteFace?.unicodeRange || FALLBACK_RANGES[subset],
      });
    }
  }

  if (!sawCyrillic) return { ok: false, reason: 'кириллические файлы не найдены' };
  const weights = [...new Set(faces.map((face) => face.weight))].sort((a, b) => a - b);
  if (!weights.length) return { ok: false, reason: 'ни одного веса не удалось получить' };
  if (skippedWeights.length) {
    process.stdout.write(`  · ${entry.id}: пропущены веса ${skippedWeights.join(', ')} — нет в Google Fonts\n`);
  }
  return { ok: true, faces, weights };
}

function renderCss(resolved) {
  const header = `/*
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не править руками.
 * Источник: scripts/font-library.manifest.js
 * Пересборка: node scripts/build-font-library.js
 *
 * Локальные OFL-шрифты для управляемой типографики публичных страниц.
 * Начертания разбиты по unicode-range, поэтому посетитель скачивает только
 * выбранное семейство, вес и нужный языковой поднабор. У всех есть кириллица.
 */\n`;

  const blocks = resolved.map(({ entry, faces }) => {
    const family = cssFamilyName(entry.family);
    const faceCss = faces.map((face) => `@font-face {
  font-family: "${family}";
  font-style: normal;
  font-weight: ${face.weight};
  font-display: swap;
  src: url("${face.src}") format("woff2");
  unicode-range: ${face.unicodeRange};
}`).join('\n\n');
    return `/* ${entry.family} */\n${faceCss}`;
  });

  return `${header}\n${blocks.join('\n\n')}\n`;
}

function renderCatalog(resolved) {
  const rows = resolved.map(({ entry, weights }) => `  {
    id: '${entry.id}',
    label: ${JSON.stringify(entry.family)},
    cssFamily: '"${cssFamilyName(entry.family)}"',
    category: '${entry.category}',
    source: '${entry.dir === 'hero' ? 'hero' : 'library'}',
    bodySafe: ${entry.bodySafe},
    weights: [${weights.join(', ')}],
    description: ${JSON.stringify(entry.description)},
  },`).join('\n');

  return `/*
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не править руками.
 * Источник: scripts/font-library.manifest.js
 * Пересборка: node scripts/build-font-library.js
 */

export type ContentFontCategory = 'sans' | 'serif' | 'handwritten' | 'display' | 'mono';
export type ContentFontSource = 'system' | 'hero' | 'library';
export type ContentFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export type ContentFontDefinition = {
  id: string;
  label: string;
  cssFamily: string;
  category: ContentFontCategory;
  source: ContentFontSource;
  bodySafe: boolean;
  weights: readonly ContentFontWeight[];
  description: string;
};

/**
 * Первые две записи не скачиваются: \`auto\` отдаёт типографику самой страницы,
 * Inter приходит переменным шрифтом из пакета @fontsource-variable/inter.
 */
export const CONTENT_FONT_CATALOG = [
  {
    id: 'auto',
    label: "Авто · стиль сайта",
    cssFamily: '',
    category: 'sans',
    source: 'system',
    bodySafe: true,
    weights: [300, 400, 500, 600, 700, 800],
    description: 'Текущий шрифт и настройки выбранной страницы.',
  },
  {
    id: 'inter',
    label: "Inter",
    cssFamily: '"Inter Variable"',
    category: 'sans',
    source: 'system',
    bodySafe: true,
    weights: [300, 400, 500, 600, 700, 800],
    description: 'Чистый универсальный гротеск для интерфейсов и длинного текста.',
  },
${rows}
] as const satisfies readonly ContentFontDefinition[];
`;
}

function renderServerIds(resolved) {
  const all = ['auto', 'inter', ...resolved.map(({ entry }) => entry.id)];
  const body = resolved.filter(({ entry }) => entry.bodySafe).map(({ entry }) => entry.id);
  const format = (ids) => ids.map((id) => `  '${id}',`).join('\n');

  return `/*
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не править руками.
 * Источник: scripts/font-library.manifest.js
 * Пересборка: node scripts/build-font-library.js
 *
 * Белый список шрифтов для санитайзера контента. Отдельный файл нужен потому,
 * что functions/ не может импортировать каталог из src/: там React-хуки.
 */

export const CONTENT_TITLE_FONT_IDS = [
${format(all)}
] as const;

export const CONTENT_BODY_FONT_IDS = [
  'auto',
  'inter',
${format(body)}
] as const;

export const CONTENT_TITLE_FONTS = new Set<string>(CONTENT_TITLE_FONT_IDS);
export const CONTENT_BODY_FONTS = new Set<string>(CONTENT_BODY_FONT_IDS);
`;
}

async function main() {
  mkdirSync(LIBRARY_DIR, { recursive: true });
  const resolved = [];
  const rejected = [];

  for (const entry of FONT_LIBRARY) {
    process.stdout.write(`${entry.family}…\n`);
    try {
      const result = await resolveEntry(entry);
      if (!result.ok) {
        rejected.push(`${entry.family} — ${result.reason}`);
        continue;
      }
      resolved.push({ entry, faces: result.faces, weights: result.weights });
    } catch (error) {
      rejected.push(`${entry.family} — ${error.message}`);
    }
  }

  resolved.sort((left, right) => {
    const byCategory = CATEGORY_ORDER.indexOf(left.entry.category) - CATEGORY_ORDER.indexOf(right.entry.category);
    return byCategory || left.entry.family.localeCompare(right.entry.family, 'en');
  });

  writeFileSync(CSS_PATH, renderCss(resolved), 'utf8');
  writeFileSync(CATALOG_PATH, renderCatalog(resolved), 'utf8');
  writeFileSync(SERVER_IDS_PATH, renderServerIds(resolved), 'utf8');

  const totalBytes = resolved
    .flatMap(({ entry, faces }) => faces.map((face) => join(ROOT, 'public', face.src)))
    .filter((path) => existsSync(path))
    .reduce((sum, path) => sum + statSync(path).size, 0);

  process.stdout.write(`\n✅ Семейств в библиотеке: ${resolved.length + 2}`);
  process.stdout.write(` · файлов ${(totalBytes / 1024 / 1024).toFixed(1)} МБ\n`);
  if (rejected.length) {
    process.stdout.write(`\nНе попали в библиотеку:\n${rejected.map((item) => `  - ${item}`).join('\n')}\n`);
  }
}

/** Экспорт для теста синхронизации: пересобрать тексты без обращения к сети. */
export function renderGeneratedFiles(resolvedEntries) {
  return {
    css: renderCss(resolvedEntries),
    catalog: renderCatalog(resolvedEntries),
    serverIds: renderServerIds(resolvedEntries),
  };
}

export const GENERATED_PATHS = { CSS_PATH, CATALOG_PATH, SERVER_IDS_PATH };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}
