import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const SITE_URL = String(process.env.SITE_URL || 'https://www.whalewzrd.com').replace(/\/$/, '');
const NO_INDEX_ROUTES = new Set(['/admin', '/admin/content-preview', '/thank-you']);

const STATIC_SECURITY_HEADERS = new Map([
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'SAMEORIGIN'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
  ['permissions-policy', 'camera=(), microphone=(), geolocation=()'],
  ['cross-origin-opener-policy', 'same-origin-allow-popups'],
  ['content-security-policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self' https://www.facebook.com https://connect.facebook.net https://www.googletagmanager.com; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://mc.yandex.ru https://mc.yandex.com https://mc.webvisor.org https://mc.webvisor.com https://connect.facebook.net https://analytics.tiktok.com; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://stats.g.doubleclick.net https://www.googletagmanager.com https://www.google.com https://mc.yandex.ru https://mc.yandex.com wss://mc.yandex.ru wss://mc.yandex.com https://mc.webvisor.org https://mc.webvisor.com https://connect.facebook.net https://www.facebook.com https://graph.facebook.com https://analytics.tiktok.com https://api.jsonbin.io https://script.google.com https://ipwho.is; frame-src 'self' https://www.googletagmanager.com https://www.facebook.com https://connect.facebook.net https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; manifest-src 'self'; upgrade-insecure-requests"],
  ['strict-transport-security', 'max-age=31536000; includeSubDomains; preload'],
]);

function parseHeadersFile(source) {
  const rules = new Map();
  let currentPattern = null;

  for (const rawLine of source.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(rawLine)) {
      currentPattern = rawLine.trim();
      rules.set(currentPattern, new Map());
      continue;
    }

    assert.ok(currentPattern, `_headers contains a header without a route: ${rawLine.trim()}`);
    const separator = rawLine.indexOf(':');
    assert.ok(separator > 0, `_headers contains an invalid header: ${rawLine.trim()}`);
    const name = rawLine.slice(0, separator).trim().toLowerCase();
    const value = rawLine.slice(separator + 1).trim();
    rules.get(currentPattern).set(name, value);
  }

  return rules;
}

function routePatternMatches(pattern, pathname) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`).test(pathname);
}

function invokesFunction(config, pathname) {
  return config.include.some((pattern) => routePatternMatches(pattern, pathname))
    && !config.exclude.some((pattern) => routePatternMatches(pattern, pathname));
}

function walkIndexFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const pathname = join(directory, entry);
    if (statSync(pathname).isDirectory()) files.push(...walkIndexFiles(pathname));
    else if (entry === 'index.html') files.push(pathname);
  }
  return files;
}

function routeFromFile(pathname) {
  const rel = relative(DIST, pathname).split(sep).join('/');
  if (rel === 'index.html') return '/';
  return `/${rel.replace(/\/index\.html$/, '')}`;
}

function canonicalForRoute(route) {
  if (route === '/') return `${SITE_URL}/`;
  if (/^\/(blog|cases)\/[^/]+$/.test(route)) return `${SITE_URL}${route}`;
  return `${SITE_URL}${route}/`;
}

function tags(source, name) {
  return [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => match[0]);
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'));
  return match?.[1] ?? null;
}

function meta(head, attributeName, attributeValue) {
  return tags(head, 'meta').filter((tag) => attribute(tag, attributeName)?.toLowerCase() === attributeValue.toLowerCase());
}

function links(head, rel) {
  return tags(head, 'link').filter((tag) => attribute(tag, 'rel')?.toLowerCase() === rel.toLowerCase());
}

function findManifestEntry(manifest, sourcePath) {
  const normalizedSource = sourcePath.replace(/\\/g, '/');
  const expectedName = normalizedSource.split('/').pop().replace(/\.[^.]+$/, '');
  return Object.entries(manifest)
    .map(([key, item]) => {
      const source = String(item?.src || '').replace(/\\/g, '/');
      const file = String(item?.file || '');
      const fileStem = file.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
      let score = 0;
      if (key === normalizedSource) score = 100;
      else if (source === normalizedSource) score = 90;
      else if (item?.name === expectedName) score = 70;
      else if (file.endsWith('.js') && (fileStem === expectedName || fileStem.startsWith(`${expectedName}-`))) score = 60;
      return { key, item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .map(({ key, item }) => [key, item])[0];
}

function parseJsonLd(head, route) {
  const result = [];
  const scripts = [...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [, attrs, content] of scripts) {
    if (attribute(`<script ${attrs}>`, 'type') !== 'application/ld+json') continue;
    assert.doesNotMatch(content, /<\/script/i, `${route}: JSON-LD must not contain a raw closing script tag`);
    assert.doesNotThrow(() => JSON.parse(content), `${route}: JSON-LD must be valid JSON`);
    result.push({ id: attribute(`<script ${attrs}>`, 'id'), value: JSON.parse(content) });
  }
  return result;
}

test('every generated HTML route has one coherent SEO contract', () => {
  assert.ok(existsSync(DIST), 'dist/ is missing; run the production build first');
  const files = walkIndexFiles(DIST);
  assert.ok(files.length >= 10, 'expected generated HTML routes');

  const indexableCanonicals = new Set();
  for (const pathname of files) {
    const route = routeFromFile(pathname);
    const html = readFileSync(pathname, 'utf8');
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
    const expectedCanonical = canonicalForRoute(route);
    const noIndex = NO_INDEX_ROUTES.has(route);

    assert.match(html, /<html\b[^>]*\blang=["']ru["']/i, `${route}: html lang must be ru`);
    const titles = [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
    assert.equal(titles.length, 1, `${route}: expected exactly one title`);
    assert.ok(titles[0][1].trim().length > 0, `${route}: title must not be empty`);
    assert.doesNotMatch(titles[0][1], /\| Whale Wizard\s*\| Whale Wizard/i, `${route}: duplicated site-name suffix`);

    const descriptions = meta(head, 'name', 'description');
    assert.equal(descriptions.length, 1, `${route}: expected exactly one meta description`);
    assert.ok((attribute(descriptions[0], 'content') || '').trim().length >= 20, `${route}: description is too short`);

    const canonicalLinks = links(head, 'canonical');
    assert.equal(canonicalLinks.length, 1, `${route}: expected exactly one canonical`);
    assert.equal(attribute(canonicalLinks[0], 'href'), expectedCanonical, `${route}: canonical mismatch`);

    const robots = meta(head, 'name', 'robots');
    assert.equal(robots.length, 1, `${route}: expected exactly one robots meta`);
    assert.equal(
      attribute(robots[0], 'content'),
      noIndex ? 'noindex, nofollow, noarchive' : 'index, follow',
      `${route}: robots directive mismatch`,
    );

    const alternates = links(head, 'alternate');
    for (const language of ['ru', 'x-default']) {
      const matches = alternates.filter((tag) => attribute(tag, 'hreflang') === language);
      assert.equal(matches.length, 1, `${route}: expected one ${language} alternate`);
      assert.equal(attribute(matches[0], 'href'), expectedCanonical, `${route}: ${language} alternate mismatch`);
    }

    const ogUrls = meta(head, 'property', 'og:url');
    const twitterUrls = meta(head, 'name', 'twitter:url');
    assert.equal(ogUrls.length, 1, `${route}: expected one og:url`);
    assert.equal(twitterUrls.length, 1, `${route}: expected one twitter:url`);
    assert.equal(attribute(ogUrls[0], 'content'), expectedCanonical, `${route}: og:url mismatch`);
    assert.equal(attribute(twitterUrls[0], 'content'), expectedCanonical, `${route}: twitter:url mismatch`);

    assert.equal((html.match(/<h1\b/gi) || []).length, 1, `${route}: expected exactly one H1`);
    assert.doesNotMatch(html, /\bPROBE\b/, `${route}: probe marker leaked into generated HTML`);

    const jsonLd = parseJsonLd(head, route);
    const ids = jsonLd.map((item) => item.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${route}: duplicate JSON-LD ids`);
    const types = jsonLd.map((item) => item.value?.['@type']);
    if (noIndex) {
      assert.equal(jsonLd.length, 0, `${route}: noindex utility page must not carry indexable JSON-LD`);
    } else {
      assert.ok(types.includes('ProfessionalService'), `${route}: missing organization schema`);
      assert.ok(types.includes('WebSite'), `${route}: missing website schema`);
      indexableCanonicals.add(expectedCanonical);
    }

    if (/^\/(blog|cases)\/[^/]+$/.test(route)) {
      assert.equal(jsonLd.filter((item) => item.id === 'ld-article').length, 1, `${route}: expected one article schema`);
      assert.equal(jsonLd.filter((item) => item.id === 'ld-breadcrumbs').length, 1, `${route}: expected one breadcrumb schema`);
      assert.equal(meta(head, 'property', 'og:type').map((tag) => attribute(tag, 'content'))[0], 'article', `${route}: og:type must be article`);
      assert.equal(meta(head, 'property', 'article:published_time').length, 1, `${route}: missing published time`);
    }
    const articleSeeds = [...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(([, attrs]) => attribute(`<script ${attrs}>`, 'id') === 'ww-article-seed')
      .map(([, , content]) => content);
    if (route === '/' || route === '/blog' || route === '/cases') {
      assert.equal(articleSeeds.length, 1, `${route}: expected exactly one article-list seed`);
      const seed = JSON.parse(articleSeeds[0]);
      assert.ok(Array.isArray(seed), `${route}: article-list seed must be an array`);
      assert.ok(seed.every((article) => article?._summary === true && article?.content === ''), `${route}: seed must contain summaries only`);
    } else if (/^\/(blog|cases)\/[^/]+$/.test(route)) {
      assert.equal(articleSeeds.length, 1, `${route}: expected exactly one article detail seed`);
      const seed = JSON.parse(articleSeeds[0]);
      assert.ok(!Array.isArray(seed) && seed?._summary !== true, `${route}: detail seed must stay complete`);
    }
    if (route === '/faq') assert.ok(types.includes('FAQPage'), '/faq: missing FAQPage schema');
    if (route === '/marketing-glossary') assert.ok(types.includes('DefinedTermSet'), '/marketing-glossary: missing DefinedTermSet schema');
  }

  const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
  const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replace(/&amp;/g, '&')));
  assert.deepEqual(sitemapUrls, indexableCanonicals, 'sitemap must contain exactly the indexable canonical HTML routes');
  assert.ok(!sitemap.includes('/feed.xml</loc>'), 'feed.xml must not be listed as an indexable page');
  assert.ok(!sitemap.includes('/llms.txt</loc>'), 'llms.txt must not be listed as an indexable page');
});

test('discovery files are present and robots points to the canonical sitemap', () => {
  for (const filename of ['llms.txt', 'robots.txt', 'sitemap.xml']) {
    assert.ok(existsSync(join(DIST, filename)), `${filename} is missing`);
  }
  const dynamicFeedPath = join(ROOT, 'functions', 'feed.xml.ts');
  const dynamicSitemapPath = join(ROOT, 'functions', 'sitemap.xml.ts');
  assert.ok(existsSync(dynamicFeedPath), 'dynamic feed.xml function is missing');
  assert.ok(existsSync(dynamicSitemapPath), 'dynamic sitemap.xml function is missing');
  const dynamicSitemap = readFileSync(dynamicSitemapPath, 'utf8');
  assert.doesNotMatch(dynamicSitemap, /['"]\/feed\.xml['"]/, 'dynamic sitemap must not index feed.xml');
  assert.doesNotMatch(dynamicSitemap, /['"]\/llms\.txt['"]/, 'dynamic sitemap must not index llms.txt');
  const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8');
  assert.match(robots, new RegExp(`Sitemap: ${SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap\\.xml`));
  assert.match(robots, /^Disallow: \/admin$/m);
});

test('article routes are served with their own meta, not the home page shell', () => {
  // Раньше страница статьи отдавала обычному браузеру корневой index.html:
  // Google видел на каждом материале canonical главной и не индексировал их.
  const handler = readFileSync(join(ROOT, 'functions', '_lib', 'article-page.ts'), 'utf8');

  for (const section of ['blog', 'cases']) {
    const route = readFileSync(join(ROOT, 'functions', section, '[slug].ts'), 'utf8');
    assert.match(route, /createArticlePageHandler/, `functions/${section}/[slug].ts must use the shared handler`);
    assert.doesNotMatch(
      route,
      /new URL\('\/index\.html'/,
      `functions/${section}/[slug].ts must not swap the article for the home shell`,
    );
  }

  assert.match(handler, /applyArticleMeta/, 'handler must rewrite the shell meta tags');
  assert.match(handler, /link\[rel="canonical"\]/, 'handler must rewrite the canonical link');
  assert.match(handler, /return articleRedirect\(requestUrl, siteUrl, `\$\{sectionPath\}\/\$\{slug\}`\)/, 'trailing-slash article URLs must redirect to the canonical form');
  assert.match(handler, /target\.search = requestUrl\.search/, 'article redirects must preserve UTM and click-id query parameters');
  assert.match(handler, /status: 404/, 'a missing article must answer 404, not 200');
});

test('blog and article HTML preload the private BlogPage route chunk', () => {
  const manifestPath = join(DIST, '.vite', 'manifest.json');
  assert.ok(existsSync(manifestPath), 'Vite manifest is missing');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const resolved = findManifestEntry(manifest, 'src/app/pages/BlogPage.tsx');
  assert.ok(resolved, 'BlogPage entry is missing from the Vite manifest');

  const [, blogEntry] = resolved;
  assert.ok(blogEntry.file, 'BlogPage manifest entry must name its output file');

  const articleFile = walkIndexFiles(DIST).find((pathname) => (
    /^\/(blog|cases)\/[^/]+$/.test(routeFromFile(pathname))
  ));
  assert.ok(articleFile, 'expected at least one generated article page');

  const routes = [
    { route: '/blog', pathname: join(DIST, 'blog', 'index.html') },
    { route: routeFromFile(articleFile), pathname: articleFile },
  ];
  const expectedFiles = [
    blogEntry.file,
    ...(blogEntry.imports || [])
      .filter((reference) => reference !== 'index.html')
      .map((reference) => manifest[reference]?.file)
      .filter(Boolean),
  ];

  for (const { route, pathname } of routes) {
    const html = readFileSync(pathname, 'utf8');
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
    const preloads = new Set(links(head, 'modulepreload').map((tag) => attribute(tag, 'href')));
    for (const file of expectedFiles) {
      assert.ok(preloads.has(`/${file}`), `${route}: missing modulepreload for ${file}`);
    }
  }
});

test('service HTML links route stylesheets before its lazy route executes', () => {
  const manifestPath = join(DIST, '.vite', 'manifest.json');
  assert.ok(existsSync(manifestPath), 'Vite manifest is missing');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const resolved = findManifestEntry(manifest, 'src/app/pages/ServiceLandingPage.tsx');
  assert.ok(resolved, 'ServiceLandingPage entry is missing from the Vite manifest');

  const [, serviceEntry] = resolved;
  const expectedCss = new Set([
    ...(serviceEntry.css || []),
    ...(serviceEntry.imports || []).flatMap((reference) => manifest[reference]?.css || []),
  ]);
  assert.ok(expectedCss.size > 0, 'ServiceLandingPage manifest entry must expose route CSS');

  for (const route of ['/google-ads', '/meta-ads']) {
    const html = readFileSync(join(DIST, route.slice(1), 'index.html'), 'utf8');
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
    const stylesheets = new Set(links(head, 'stylesheet').map((tag) => attribute(tag, 'href')));
    for (const file of expectedCss) {
      assert.ok(stylesheets.has(`/${file}`), `${route}: missing route stylesheet ${file}`);
    }
  }
});

test('critical lazy route visuals are linked before React discovers them', () => {
  const manifestPath = join(DIST, '.vite', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const casesArticle = walkIndexFiles(DIST).find((pathname) => /^\/cases\/[^/]+$/.test(routeFromFile(pathname)));
  const routes = [
    ['/consult', join(DIST, 'consult', 'index.html'), 'src/app/components/service-heroes/ConsultStudioHero.tsx'],
    ['/meta-apps', join(DIST, 'meta-apps', 'index.html'), 'src/app/components/MetaAppsHeroVisual.tsx'],
    ...(casesArticle ? [[routeFromFile(casesArticle), casesArticle, 'src/app/components/CaseArticleView.tsx']] : []),
  ];

  for (const [route, pathname, source] of routes) {
    const resolved = findManifestEntry(manifest, source);
    assert.ok(resolved, `${route}: ${source} is missing from manifest`);
    const [, entry] = resolved;
    const html = readFileSync(pathname, 'utf8');
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
    const preloads = new Set(links(head, 'modulepreload').map((tag) => attribute(tag, 'href')));
    const stylesheets = new Set(links(head, 'stylesheet').map((tag) => attribute(tag, 'href')));
    assert.ok(preloads.has(`/${entry.file}`), `${route}: missing modulepreload for ${entry.file}`);
    for (const css of entry.css || []) {
      assert.ok(stylesheets.has(`/${css}`), `${route}: missing stylesheet ${css}`);
    }
  }
});

test('the page generator refuses an already generated root shell', () => {
  const source = readFileSync(join(ROOT, 'scripts', 'generate-pages.js'), 'utf8');
  assert.match(source, /dist\/index\.html is already generated/);
  assert.match(source, /<div id="root"><\\\/div>/);
});

test('crawlers that verify indexing are recognised as bots', () => {
  const seoSource = readFileSync(join(ROOT, 'functions', '_lib', 'seo.ts'), 'utf8');
  const patternMatch = seoSource.match(/const BOT_UA_PATTERN = (\/.+\/i);/);
  assert.ok(patternMatch, 'BOT_UA_PATTERN must stay a single-line regexp literal');
  const pattern = new RegExp(patternMatch[1].slice(1, -2), 'i');

  const mustMatch = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)',
    'AdsBot-Google (+http://www.google.com/adsbot.html)',
    'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)',
    'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  ];
  for (const userAgent of mustMatch) {
    assert.ok(pattern.test(userAgent), `must be treated as a bot: ${userAgent}`);
  }

  const mustNotMatch = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ];
  for (const userAgent of mustNotMatch) {
    assert.ok(!pattern.test(userAgent), `must be treated as a visitor: ${userAgent}`);
  }
});

test('unknown addresses answer with a noindex 404 page', () => {
  // Без этого файла Cloudflare Pages отвечал на любой несуществующий адрес
  // кодом 200 с разметкой главной — Google засчитывал soft 404.
  const notFoundPath = join(DIST, '404.html');
  assert.ok(existsSync(notFoundPath), 'dist/404.html is missing');
  const html = readFileSync(notFoundPath, 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));

  assert.equal(links(head, 'canonical').length, 0, '404 page must not claim a canonical URL');
  const robots = meta(head, 'name', 'robots').map((tag) => attribute(tag, 'content'));
  assert.deepEqual(robots, ['noindex, nofollow, noarchive'], '404 page must be closed from indexing');
  assert.equal((html.match(/<h1\b/gi) || []).length, 1, '404 page needs exactly one H1');
});

test('only static asset directories bypass Pages Functions', () => {
  const sourcePath = join(ROOT, 'public', '_routes.json');
  const outputPath = join(DIST, '_routes.json');
  assert.ok(existsSync(sourcePath), 'public/_routes.json is missing');
  assert.ok(existsSync(outputPath), 'dist/_routes.json is missing; Vite must publish the routing contract');

  const source = readFileSync(sourcePath, 'utf8');
  assert.equal(readFileSync(outputPath, 'utf8'), source, 'build output must keep the reviewed routing contract unchanged');

  const config = JSON.parse(source);
  assert.deepEqual(config, {
    version: 1,
    include: ['/*'],
    exclude: ['/assets/*', '/fonts/*', '/images/*'],
  });

  for (const pathname of [
    '/assets/index-B7H3P.js',
    '/assets/index-C4K2A.css',
    '/fonts/library/onest-400-normal-cyrillic.woff2',
    '/images/meta-proof/paper-stack.png',
  ]) {
    assert.equal(invokesFunction(config, pathname), false, `${pathname} must be served as a free static request`);
  }

  for (const pathname of [
    '/',
    '/google-ads',
    '/admin',
    '/admin/content-preview',
    '/api/articles',
    '/api/admin/articles',
    '/blog',
    '/blog/article-slug',
    '/cases/case-slug',
    '/sitemap.xml',
    '/feed.xml',
    '/robots.txt',
    '/llms.txt',
    '/articles.seed.json',
    '/definitely-missing',
  ]) {
    assert.equal(invokesFunction(config, pathname), true, `${pathname} must keep its Function/middleware coverage`);
  }
});

test('bypassed static assets retain security and cache headers', () => {
  const sourcePath = join(ROOT, 'public', '_headers');
  const outputPath = join(DIST, '_headers');
  assert.ok(existsSync(outputPath), 'dist/_headers is missing');

  const source = readFileSync(sourcePath, 'utf8');
  assert.equal(readFileSync(outputPath, 'utf8'), source, 'build output must keep the static header contract unchanged');
  for (const line of source.split(/\r?\n/)) {
    assert.ok(line.length <= 2_000, `_headers line exceeds the Cloudflare Pages 2,000-character limit`);
  }

  const rules = parseHeadersFile(source);
  const globalHeaders = rules.get('/*');
  assert.ok(globalHeaders, 'static responses need a global security-header rule');
  for (const [name, value] of STATIC_SECURITY_HEADERS) {
    assert.equal(globalHeaders.get(name), value, `static ${name} must match the Function security policy`);
  }

  assert.equal(
    rules.get('/assets/*')?.get('cache-control'),
    'public, max-age=31536000, immutable',
    'hashed Vite assets need immutable browser caching',
  );
  for (const pattern of ['/images/*', '/fonts/*']) {
    assert.equal(
      rules.get(pattern)?.get('cache-control'),
      'public, max-age=604800, stale-while-revalidate=86400',
      `${pattern} needs bounded caching because its filenames are not content hashes`,
    );
  }

  const middleware = readFileSync(join(ROOT, 'functions', '_middleware.ts'), 'utf8');
  for (const [name, value] of STATIC_SECURITY_HEADERS) {
    if (name === 'content-security-policy') {
      for (const directive of value.split('; ')) {
        assert.ok(middleware.includes(directive), `Function CSP is missing: ${directive}`);
      }
      continue;
    }
    assert.ok(middleware.includes(value), `Function security headers are missing the static value: ${value}`);
  }
});
