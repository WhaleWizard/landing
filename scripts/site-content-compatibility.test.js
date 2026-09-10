import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { build } from 'esbuild';

async function bundleTypeScript(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'neutral',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const siteContentModule = bundleTypeScript('functions/_lib/site-content.ts');

function legacyMetaAdsCases() {
  return {
    badge: 'С чем чаще всего приходят',
    titlePrefix: 'Где теряется результат',
    titleAccent: 'в Meta Ads',
    description: 'Лиды могут быть дорогими, не доходить до продаж, расходиться с аналитикой или перестать расти в объёме. Для каждой причины нужна своя проверка — универсальной «оптимизации кабинета» здесь нет.',
    items: [
      {
        title: 'Лиды есть, продаж мало',
        category: 'Услуги и B2B',
        description: 'Возвращаем из CRM статусы квалификации и продажи, чтобы видеть не только CPL, но и стоимость клиента.',
        stats: [
          { label: 'Заявка', value: 'CPL' },
          { label: 'Качество', value: 'CRM' },
          { label: 'Клиент', value: 'CAC' },
        ],
      },
      {
        title: 'Лиды слишком дорогие',
        category: 'Лидогенерация',
        description: 'Проверяем оффер, креатив, форму и посадочную по цепочке, чтобы понять, где именно теряется конверсия.',
        stats: [
          { label: 'Объявление', value: 'CTR' },
          { label: 'Страница', value: 'CR' },
          { label: 'Заявка', value: 'CPL' },
        ],
      },
      {
        title: 'Продажи есть, экономика не сходится',
        category: 'E-commerce',
        description: 'Проверяем Purchase, сумму покупки, CAPI, каталог и маржу. Оптимизируем кампании по продажам или выручке, когда данных уже достаточно.',
        stats: [
          { label: 'Покупка', value: 'CPA' },
          { label: 'Выручка', value: 'ROAS' },
          { label: 'Экономика', value: 'Маржа' },
        ],
      },
      {
        title: 'Кампании упёрлись в объём',
        category: 'Масштабирование',
        description: 'Добавляем новые креативные направления и увеличиваем бюджет поэтапно — с контролем цены и качества результата.',
        stats: [
          { label: 'Расход', value: 'Бюджет' },
          { label: 'Результат', value: 'CPA' },
          { label: 'Показы', value: 'Частота' },
        ],
      },
    ],
  };
}

test('stored reader replaces only the exact superseded Meta Ads cases block', async () => {
  const { safeSiteJsonObject, sanitizeSiteContent } = await siteContentModule;
  const content = {
    hero: { badge: 'Черновик хиро остаётся' },
    cases: legacyMetaAdsCases(),
  };

  const stored = safeSiteJsonObject('service:meta-ads', JSON.stringify(content));
  assert.deepEqual(stored, { hero: { badge: 'Черновик хиро остаётся' } });

  // POST uses sanitizeSiteContent directly: compatibility is deliberately a
  // stored-read concern and cannot silently alter a newly submitted payload.
  const submitted = sanitizeSiteContent('service:meta-ads', content);
  assert.ok(submitted.cases);
});

test('stored reader recognizes the editor-normalized form of the old block', async () => {
  const { safeSiteJsonObject } = await siteContentModule;
  const cases = legacyMetaAdsCases();
  cases.typography = {
    titleDesktop: 'standard',
    titleMobile: 'standard',
    body: 'standard',
    titleFont: 'auto',
    bodyFont: 'auto',
    titleMaxLinesDesktop: 0,
    titleMaxLinesMobile: 0,
    titleWeight: 'auto',
    titleLineHeight: 'auto',
    titleLetterSpacing: 'auto',
  };
  cases.items = cases.items.map((item, visualSlot) => ({ ...item, visualSlot }));

  const stored = safeSiteJsonObject('service:meta-ads', JSON.stringify({ cases }));
  assert.deepEqual(stored, {});
});

test('same headings never erase edited case content or typography', async () => {
  const { safeSiteJsonObject } = await siteContentModule;

  const editedCard = legacyMetaAdsCases();
  editedCard.items[0].description = 'Владелец отредактировал этот кейс.';
  const cardResult = safeSiteJsonObject('service:meta-ads', JSON.stringify({ cases: editedCard }));
  assert.equal(cardResult.cases.items[0].description, editedCard.items[0].description);

  const editedTypography = legacyMetaAdsCases();
  editedTypography.typography = { titleFont: 'pangolin' };
  const typographyResult = safeSiteJsonObject('service:meta-ads', JSON.stringify({ cases: editedTypography }));
  assert.equal(typographyResult.cases.typography.titleFont, 'pangolin');

  const otherPageResult = safeSiteJsonObject('service:google-ads', JSON.stringify({ cases: legacyMetaAdsCases() }));
  assert.ok(otherPageResult.cases);
});

test('stored reader drops superseded SEO fields so the source text can win', async () => {
  const { safeSiteJsonObject, sanitizeSiteContent } = await siteContentModule;

  const stored = {
    seo: {
      title: 'Настройка Meta Ads для заявок и продаж',
      description: 'Запуск и ведение рекламы в Facebook и Instagram: оффер, креативы, Meta Pixel, Conversions API и передача статусов лидов из CRM.',
    },
    hero: { badge: 'Meta Ads для заявок и продаж', titleAccent: 'клиенты, а не просто лиды' },
  };

  const result = safeSiteJsonObject('service:meta-ads', JSON.stringify(stored));
  assert.equal(result.seo, undefined, 'устаревший seo-блок должен исчезнуть целиком');
  assert.equal(result.hero.badge, undefined, 'устаревший бейдж должен исчезнуть');
  assert.equal(result.hero.titleAccent, 'клиенты, а не просто лиды', 'правка владельца обязана остаться');

  // Правка владельца в том же поле снимает совпадение целиком.
  const edited = structuredClone(stored);
  edited.seo.title = 'Свой заголовок владельца';
  const editedResult = safeSiteJsonObject('service:meta-ads', JSON.stringify(edited));
  assert.equal(editedResult.seo.title, 'Свой заголовок владельца');
  assert.equal(editedResult.seo.description, undefined);

  // Как и с кейсами, отправка формы через POST ничего не теряет.
  const submitted = sanitizeSiteContent('service:meta-ads', stored);
  assert.equal(submitted.seo.title, stored.seo.title);

  // Чужая страница с тем же текстом не трогается.
  const otherPage = safeSiteJsonObject('service:google-ads', JSON.stringify(stored));
  assert.equal(otherPage.seo.title, stored.seo.title);
});

test('case sanitizer keeps the public four-card layout contract', async () => {
  const { sanitizeSiteContent } = await siteContentModule;
  const items = Array.from({ length: 6 }, (_, index) => ({
    title: `Кейс ${index + 1}`,
    category: 'Категория',
    description: 'Описание результата',
    visualSlot: index,
    stats: [],
  }));

  const sanitized = sanitizeSiteContent('service:google-ads', { cases: { items } });
  assert.equal(sanitized.cases.items.length, 4);
  assert.deepEqual(sanitized.cases.items.map((item) => item.title), [
    'Кейс 1',
    'Кейс 2',
    'Кейс 3',
    'Кейс 4',
  ]);
});
