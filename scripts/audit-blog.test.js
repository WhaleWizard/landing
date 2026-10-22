import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('F-010: seed consumed after initial read in ArticlesContext', () => {
  const code = readFileSync('src/app/context/ArticlesContext.tsx', 'utf8');
  assert.match(code, /consumeArticleSeed\(\)/);
  assert.match(code, /seedConsumed/);
  assert.match(code, /if \(seedConsumed\) return missing;/);
});

test('F-013: ё to е normalization and prefix matching in BlogPage and CasesPage', () => {
  const blogCode = readFileSync('src/app/pages/BlogPage.tsx', 'utf8');
  assert.match(blogCode, /\.replace\(\/ё\/g, 'е'\)/);
  assert.match(blogCode, /haystack\.some\(\(word\) => word\.startsWith\(token\)\)/);

  const casesCode = readFileSync('src/app/pages/CasesPage.tsx', 'utf8');
  assert.match(casesCode, /\.replace\(\/ё\/g, 'е'\)/);
  assert.match(casesCode, /word\.startsWith\(token\)/);
});

test('F-014 & F-046: extractRelatedArticles matches by section first, sorts by score', () => {
  const code = readFileSync('src/app/pages/BlogPage.tsx', 'utf8');
  assert.match(code, /articleSectionId/);
  assert.match(code, /const sameSection = currentSectionId && articleSectionId/);
  assert.match(code, /const byScore = b\.score - a\.score;/);
});

test('F-043: useDragScroll prevents default on dragstart', () => {
  const code = readFileSync('src/app/hooks/useDragScroll.ts', 'utf8');
  assert.match(code, /node\.addEventListener\('dragstart', handleDragStart\)/);
  assert.match(code, /node\.removeEventListener\('dragstart', handleDragStart\)/);
});

test('F-045: breadcrumbs preserved and updated when leaving article in BlogPage', () => {
  const code = readFileSync('src/app/pages/BlogPage.tsx', 'utf8');
  assert.match(code, /listBreadcrumbPayload/);
  assert.match(code, /'@type': 'BreadcrumbList'/);
});

test('F-048: absoluteArticleImage preserves full URLs and prepends site url', () => {
  const code = readFileSync('src/app/pages/BlogPage.tsx', 'utf8');
  assert.match(code, /\/\^https\?:\\\/\\\//i);
});

test('F-049: listPathname uses trailing slash to match static build', () => {
  const blogCode = readFileSync('src/app/pages/BlogPage.tsx', 'utf8');
  assert.match(blogCode, /const listPathname = '\/blog\/';/);
  const casesCode = readFileSync('src/app/pages/CasesPage.tsx', 'utf8');
  assert.match(casesCode, /const listPathname = '\/cases\/';/);
});

test('F-050: mobile topics limit is 3, desktop is 4', () => {
  const code = readFileSync('src/app/pages/BlogPage.tsx', 'utf8');
  assert.match(code, /const visibleLimit = isMobile \? 3 : 4;/);
  assert.match(code, /hiddenIndex >= visibleLimit/);
});

test('F-130: article date formatting uses Asia/Tashkent timezone', () => {
  const articleDateCode = readFileSync('src/app/utils/articleDate.ts', 'utf8');
  assert.match(articleDateCode, /timeZone: 'Asia\/Tashkent'/);

  const seoCode = readFileSync('functions/_lib/seo.ts', 'utf8');
  assert.match(seoCode, /timeZone: 'Asia\/Tashkent'/);

  const genCode = readFileSync('scripts/generate-pages.js', 'utf8');
  assert.match(genCode, /timeZone: 'Asia\/Tashkent'/);

  const calCode = readFileSync('src/app/components/admin/ArticleCalendar.tsx', 'utf8');
  assert.match(calCode, /timeZone: 'Asia\/Tashkent'/);
});
