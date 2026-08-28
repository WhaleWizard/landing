import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Библиотека шрифтов живёт в четырёх местах: файлы в public/fonts, @font-face
 * в CSS, каталог для интерфейса и белый список для сервера. Все четыре
 * генерируются одной командой, но в репозиторий попадают как обычные файлы,
 * поэтому разъехаться они могут молча: шрифт был бы виден в админке и тихо
 * выброшен санитайзером при сохранении. Этот тест такое ловит.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogSource = readFileSync(join(ROOT, 'src/app/utils/contentFontCatalog.ts'), 'utf8');
const cssSource = readFileSync(join(ROOT, 'src/styles/content-font-library.css'), 'utf8');
const serverSource = readFileSync(join(ROOT, 'functions/_lib/content-font-ids.ts'), 'utf8');

/** Разбирает сгенерированный каталог без загрузки TypeScript. */
function parseCatalog() {
  return [...catalogSource.matchAll(/\{\s*\n\s*id: '([^']+)',\s*\n\s*label: ("(?:[^"\\]|\\.)*"),\s*\n\s*cssFamily: '([^']*)',\s*\n\s*category: '([^']+)',\s*\n\s*source: '([^']+)',\s*\n\s*bodySafe: (true|false),\s*\n\s*weights: \[([^\]]*)\],/g)]
    .map((match) => ({
      id: match[1],
      label: JSON.parse(match[2]),
      cssFamily: match[3],
      category: match[4],
      source: match[5],
      bodySafe: match[6] === 'true',
      weights: match[7].split(',').map((item) => Number(item.trim())).filter(Number.isFinite),
    }));
}

function parseIdList(name) {
  const block = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(serverSource);
  assert.ok(block, `в content-font-ids.ts нет списка ${name}`);
  return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

/** Разбирает @font-face: семейство → { вес → набор subset-файлов }. */
function parseFontFaces() {
  const faces = new Map();
  for (const match of cssSource.matchAll(/@font-face \{([^}]*)\}/g)) {
    const block = match[1];
    const family = /font-family: "([^"]+)"/.exec(block)?.[1];
    const weight = Number(/font-weight: (\d+)/.exec(block)?.[1]);
    const src = /src: url\("([^"]+)"\)/.exec(block)?.[1];
    const range = /unicode-range: ([^;]+);/.exec(block)?.[1];
    assert.ok(family && weight && src && range, `неполный @font-face: ${block.trim().slice(0, 80)}`);
    if (!faces.has(family)) faces.set(family, new Map());
    const byWeight = faces.get(family);
    if (!byWeight.has(weight)) byWeight.set(weight, []);
    byWeight.get(weight).push(src);
  }
  return faces;
}

const catalog = parseCatalog();
const faces = parseFontFaces();

test('каталог шрифтов разобран и не пуст', () => {
  assert.ok(catalog.length > 20, `в каталоге всего ${catalog.length} записей — похоже на сбой генерации`);
  assert.equal(catalog[0].id, 'auto');
  const ids = catalog.map((font) => font.id);
  assert.equal(new Set(ids).size, ids.length, 'в каталоге есть повторяющиеся id');
});

test('у каждого скачанного шрифта есть @font-face со всеми объявленными весами', () => {
  for (const font of catalog) {
    if (font.source === 'system') continue;
    const family = font.cssFamily.replace(/"/g, '');
    const byWeight = faces.get(family);
    assert.ok(byWeight, `нет ни одного @font-face для "${family}" (${font.id})`);
    for (const weight of font.weights) {
      assert.ok(byWeight.has(weight), `у "${family}" нет @font-face для веса ${weight}`);
    }
    const cssWeights = [...byWeight.keys()].sort((a, b) => a - b);
    assert.deepEqual(cssWeights, [...font.weights].sort((a, b) => a - b),
      `веса "${family}" в CSS и каталоге разные`);
  }
});

test('каждый @font-face ссылается на существующий файл с кириллицей', () => {
  for (const [family, byWeight] of faces) {
    for (const [weight, sources] of byWeight) {
      for (const src of sources) {
        assert.ok(existsSync(join(ROOT, 'public', src)), `файл шрифта отсутствует: ${src}`);
      }
      assert.ok(
        sources.some((src) => /-cyrillic\.woff2$/.test(src)),
        `у "${family}" ${weight} нет кириллического поднабора — на русской странице шрифт не применится`,
      );
    }
  }
});

test('серверный белый список совпадает с каталогом', () => {
  const titleIds = parseIdList('CONTENT_TITLE_FONT_IDS');
  const bodyIds = parseIdList('CONTENT_BODY_FONT_IDS');
  const catalogIds = catalog.map((font) => font.id);
  const catalogBodyIds = catalog.filter((font) => font.bodySafe).map((font) => font.id);

  assert.deepEqual([...titleIds].sort(), [...catalogIds].sort(),
    'список шрифтов заголовка на сервере разошёлся с каталогом админки');
  assert.deepEqual([...new Set(bodyIds)].sort(), [...new Set(catalogBodyIds)].sort(),
    'список шрифтов основного текста на сервере разошёлся с каталогом админки');
});

test('декоративные шрифты не предлагаются для основного текста', () => {
  const risky = catalog.filter((font) => font.bodySafe
    && (font.category === 'handwritten' || font.category === 'display'));
  assert.deepEqual(risky.map((font) => font.id), [],
    'рукописные и акцентные гарнитуры нечитаемы в длинном тексте');
});

test('список засечных акцидентных шрифтов не отстал от каталога', () => {
  // Пока грузится файл, подмена должна быть той же природы: сначала засечки —
  // потом засечки. Иначе строка на мгновение меняет ширину и «прыгает».
  //
  // В манифесте засечность внутри категории display не размечена — это
  // человеческое решение о внешнем виде, а не данные. Значит список ведётся
  // руками, и единственное, что можно проверить машиной: не ссылается ли он на
  // шрифт, который переименовали или убрали. Такая мёртвая запись молча
  // отключает подмену, и заметить это можно только глазом на медленной сети.
  const typographySource = readFileSync(join(ROOT, 'src/app/utils/contentTypography.ts'), 'utf8');
  const block = typographySource.match(/DISPLAY_SERIF_FONT_IDS = new Set<string>\(\[([\s\S]*?)\]\)/);
  assert.ok(block, 'не нашёл список DISPLAY_SERIF_FONT_IDS — проверьте, не переименовали ли его');

  const listed = [...block[1].matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
  assert.ok(listed.length > 0, 'список засечных акцидентных шрифтов пуст');

  const known = new Set(catalog.map((font) => font.id));
  const dead = listed.filter((id) => !known.has(id));
  assert.deepEqual(dead, [], `в списке остались шрифты, которых нет в каталоге: ${dead.join(', ')}`);
});
