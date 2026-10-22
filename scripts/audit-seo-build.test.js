import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

async function compile(relativePath, resolve = () => ({})) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const compiled = await transform(source, { loader: 'ts', format: 'cjs', target: 'node20' });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compiled.code)(module, module.exports, resolve);
  return module.exports;
}

const botUtils = await compile('src/app/utils/isBotUserAgent.ts');
const seoLib = await compile('functions/_lib/seo.ts', (id) => {
  if (id.includes('sanitize')) {
    return { sanitizeArticleHtml: (html) => html };
  }
  return {};
});
const pageLocksLib = await compile('functions/_lib/page-locks.ts');

test('F-076: isBotUserAgent matches major search bots and AI crawlers', () => {
  const { isBotUserAgent } = botUtils;
  assert.ok(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'));
  assert.ok(isBotUserAgent('Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)'));
  assert.ok(isBotUserAgent('Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)'));
  assert.ok(isBotUserAgent('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'));
  assert.ok(isBotUserAgent('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)'));
  assert.ok(!isBotUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'));
  assert.ok(!isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'));
});

test('F-118 & F-119: generate-pages.js has correct hero shell title separation and page meta', () => {
  const genPages = readFileSync('scripts/generate-pages.js', 'utf8');

  // Supporting line must not be inside <h1>
  assert.ok(genPages.includes("const titleLines = allLines.filter((line) => line?.tone !== 'supporting');"));
  assert.ok(genPages.includes("const supportingLines = allLines.filter((line) => line?.tone === 'supporting');"));
  assert.ok(genPages.includes('data-ww-shell-supporting="true"'));

  // Service static page lead does not prepend heroSupportingText
  assert.ok(genPages.includes('lead: config.hero.paragraphs.map((paragraph) => String(paragraph)).filter(Boolean).join(\' \'),'));

  // /cases h1 is aligned with React
  assert.ok(genPages.includes("h1: 'Найдите кейс, похожий на ваш проект',"));

  // /privacy-policy and /cookie-policy titles & h1 aligned
  assert.ok(genPages.includes("title: 'Политика конфиденциальности и обработки персональных данных | Whale Wizard',"));
  assert.ok(genPages.includes("h1: 'Политика конфиденциальности и обработки персональных данных',"));
  assert.ok(genPages.includes("title: 'Политика использования файлов cookie | Whale Wizard',"));
  assert.ok(genPages.includes("h1: 'Политика использования файлов cookie',"));
});

test('F-120: internal links and static route references include trailing slashes', () => {
  const footer = readFileSync('src/app/components/Footer.tsx', 'utf8');
  const staticRoutes = [
    '/meta-ads/',
    '/meta-apps/',
    '/google-ads/',
    '/consult/',
    '/blog/',
    '/cases/',
    '/faq/',
    '/marketing-glossary/',
    '/calculator/',
    '/privacy-policy/',
    '/offer/',
    '/cookie-policy/',
  ];
  for (const route of staticRoutes) {
    assert.ok(footer.includes(`to="${route}"`), `Footer must link to canonical trailing slash route: ${route}`);
  }

  const navbar = readFileSync('src/app/components/Navbar.tsx', 'utf8');
  assert.ok(navbar.includes("href: '/blog/'"));
  assert.ok(navbar.includes("href: '/faq/'"));
  assert.ok(navbar.includes('/cases/?from='));

  const casesPage = readFileSync('src/app/pages/CasesPage.tsx', 'utf8');
  assert.ok(casesPage.includes('to="/blog/"'));

  const blogPage = readFileSync('src/app/pages/BlogPage.tsx', 'utf8');
  assert.ok(blogPage.includes('to="/cases/?from=blog"'));
});

test('F-098 & F-122: public/llms.txt content accuracy and canonical trailing slashes', () => {
  const llms = readFileSync('public/llms.txt', 'utf8');

  // No fake 20+ count
  assert.ok(!llms.includes('20+ articles'));
  // No fake specialized themes list
  assert.ok(!llms.includes('creative testing framework; CRM and nurture;'));
  // Accurate case study description
  assert.ok(llms.includes('Full case write-ups are published at /cases/ (currently for the premium concierge project)'));
  assert.ok(llms.includes('shown on the home page'));

  // Section 12 canonical URLs must have trailing slashes for static pages
  const expectedCanonicals = [
    'https://www.whalewzrd.com/meta-ads/',
    'https://www.whalewzrd.com/meta-apps/',
    'https://www.whalewzrd.com/google-ads/',
    'https://www.whalewzrd.com/consult/',
    'https://www.whalewzrd.com/blog/',
    'https://www.whalewzrd.com/cases/',
    'https://www.whalewzrd.com/faq/',
    'https://www.whalewzrd.com/marketing-glossary/',
    'https://www.whalewzrd.com/calculator/',
    'https://www.whalewzrd.com/roi-calculator/',
    'https://www.whalewzrd.com/privacy-policy/',
  ];
  for (const url of expectedCanonicals) {
    assert.ok(llms.includes(url), `public/llms.txt must have trailing slash in canonical URL: ${url}`);
  }
});

test('F-123: htmlToPlainText and renderLlmsFullArticle structure preservation', () => {
  const { htmlToPlainText, renderLlmsFullArticle } = seoLib;
  const html = `
    <h2>Раздел первый</h2>
    <p>Текст первого абзаца с <a href="#">ссылкой</a> и <strong>акцентом</strong>.</p>
    <ul>
      <li>Первый пункт</li>
      <li>Второй пункт</li>
    </ul>
    <h3>Подраздел</h3>
    <p>Второй абзац.</p>
  `;
  const text = htmlToPlainText(html);

  assert.ok(text.includes('### Раздел первый'), 'H2 must convert to markdown ###');
  assert.ok(text.includes('#### Подраздел'), 'H3 must convert to markdown ####');
  assert.ok(text.includes('- Первый пункт\n- Второй пункт'), 'li must convert to markdown - list items');
  assert.ok(!text.includes('<'), 'All HTML tags must be stripped');

  const mockArticle = {
    slug: 'test-article',
    title: 'Тестовая статья',
    category: 'Таргет',
    publishedAt: '2026-05-01T10:00:00Z',
    summary: 'Краткий ответ на главный вопрос.',
    keyTakeaways: ['Тезис 1', 'Тезис 2'],
    content: '<h2>Заголовок</h2><p>Содержимое статьи</p>',
    faq: [{ question: 'Вопрос?', answer: 'Ответ!' }],
  };

  const fullText = renderLlmsFullArticle(mockArticle, 'https://www.whalewzrd.com');
  assert.ok(fullText.includes('Short answer: Краткий ответ на главный вопрос.'));
  assert.ok(fullText.includes('Key takeaways:\n- Тезис 1\n- Тезис 2'));
  assert.ok(fullText.includes('### Заголовок\n\nСодержимое статьи'));
  assert.ok(fullText.includes('FAQ:\nQ: Вопрос?\nA: Ответ!'));
});

test('F-097: llms.txt and llms-full.txt endpoints and never-locked list', () => {
  assert.ok(existsSync('functions/llms.txt.ts'), 'functions/llms.txt.ts must exist');
  assert.ok(existsSync('functions/llms-full.txt.ts'), 'functions/llms-full.txt.ts must exist');

  const { isLockablePath, findPageLock } = pageLocksLib;
  assert.equal(isLockablePath('/llms.txt'), false, '/llms.txt must not be lockable');
  assert.equal(isLockablePath('/llms-full.txt'), false, '/llms-full.txt must not be lockable');
  assert.equal(findPageLock([], '/llms.txt'), null);
  assert.equal(findPageLock([], '/llms-full.txt'), null);

  const pageLocksSource = readFileSync('functions/_lib/page-locks.ts', 'utf8');
  assert.ok(pageLocksSource.includes("'/llms-full.txt'"), 'functions/_lib/page-locks.ts must list /llms-full.txt in NEVER_LOCKED_EXACT');
});
