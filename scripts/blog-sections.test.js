import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';

/**
 * Разделы блога (src/app/data/blogSections.ts).
 *
 * Из справочника берут значения фильтр блога, редактор статьи и импорт.
 * Проверяется то, что ломается молча: статья без раздела выпадает в
 * отдельную плитку, одна старая категория в двух разделах раздваивает
 * счётчики, длинная подпись обрезается на плитке троеточием.
 */
async function load() {
  const result = await build({
    entryPoints: ['src/app/data/blogSections.ts'],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const {
  ARTICLE_CATEGORY_VALUES,
  BLOG_SECTIONS,
  CASES_SECTION_LABEL,
  categoryDisplayLabel,
  normalizeTopicId,
  sectionForCategory,
  sectionOfArticle,
} = await load();

test('восемь разделов: семь в блоге и кейсы, без повторов', () => {
  assert.equal(BLOG_SECTIONS.length, 7);
  assert.equal(ARTICLE_CATEGORY_VALUES.length, 8);
  assert.equal(ARTICLE_CATEGORY_VALUES[ARTICLE_CATEGORY_VALUES.length - 1], CASES_SECTION_LABEL);
  assert.equal(new Set(BLOG_SECTIONS.map((section) => section.id)).size, 7, 'id повторяются');
  assert.equal(new Set(ARTICLE_CATEGORY_VALUES.map((value) => value.toLowerCase())).size, 8, 'названия повторяются');
});

test('старая категория относится ровно к одному разделу', () => {
  const owners = new Map();
  for (const section of BLOG_SECTIONS) {
    for (const legacy of section.legacyCategories) {
      const key = legacy.toLowerCase();
      assert.ok(!owners.has(key), `«${legacy}» и в «${owners.get(key)}», и в «${section.label}»`);
      assert.ok(!ARTICLE_CATEGORY_VALUES.some((value) => value.toLowerCase() === key), `«${legacy}» совпадает с названием раздела`);
      owners.set(key, section.label);
    }
  }
});

test('короткая подпись помещается на плитку фильтра', () => {
  for (const section of BLOG_SECTIONS) {
    assert.ok(section.short.length <= 20, `«${section.short}» длиннее 20 символов — на телефоне обрежется`);
    assert.ok(section.description.length <= 28, `описание «${section.label}» длиннее 28 символов — на телефоне обрежется`);
  }
});

test('каждая нынешняя статья блога попадает в раздел', () => {
  const source = ['data/articles.build.json', 'public/articles.seed.json', 'data/articles.local.json'].find((path) => existsSync(path));
  assert.ok(source, 'нет снимка статей');
  const payload = JSON.parse(readFileSync(source, 'utf8'));
  const articles = (payload.articles || payload).filter((article) => article && article.category !== CASES_SECTION_LABEL);
  assert.ok(articles.length > 0);
  const lost = articles.filter((article) => !sectionOfArticle(article)).map((article) => `${article.slug} (${article.category})`);
  assert.deepEqual(lost, [], 'эти статьи выпадут в отдельную плитку фильтра');
});

test('раздел определяется по названию, по старой категории и по словам', () => {
  assert.equal(sectionForCategory('Приложения').id, 'apps');
  assert.equal(sectionForCategory('  meta ads ').id, 'meta');
  assert.equal(sectionForCategory('GEO').id, 'niches');
  assert.equal(sectionForCategory('Неизвестно'), null);
  assert.equal(sectionOfArticle({ category: '', title: 'Реклама онлайн-школы в Instagram' }).id, 'meta', 'первый подходящий раздел по порядку');
  assert.equal(sectionOfArticle({ category: 'Разное', title: 'Как продвигать приложение' }).id, 'apps');
  assert.equal(sectionOfArticle({ category: CASES_SECTION_LABEL, title: 'Кейс приложения' }), null, 'кейсы живут на /cases');
  assert.equal(sectionOfArticle({ category: 'Разное', title: 'Без ключевых слов' }), null);
});

test('подпись на карточке: новый раздел коротко, старая категория как была', () => {
  assert.equal(categoryDisplayLabel('Реклама в Instagram и Facebook'), 'Instagram и Facebook');
  assert.equal(categoryDisplayLabel('Деньги и окупаемость'), 'Окупаемость');
  assert.equal(categoryDisplayLabel('E-commerce'), 'E-commerce');
  assert.equal(categoryDisplayLabel(''), '');
});

test('старые адреса фильтра ведут в новый раздел', () => {
  assert.equal(normalizeTopicId('growth'), 'money');
  assert.equal(normalizeTopicId('meta'), 'meta');
  assert.equal(normalizeTopicId(null), '');
});
