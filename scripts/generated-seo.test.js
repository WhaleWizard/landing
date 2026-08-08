import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const SITE_URL = String(process.env.SITE_URL || 'https://www.whalewzrd.com').replace(/\/$/, '');
const NO_INDEX_ROUTES = new Set(['/admin', '/admin/content-preview', '/thank-you']);

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
