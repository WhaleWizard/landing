import type { Article } from './types';
import { sanitizeArticleHtml } from './sanitize';

// Google обходит сайт не только под именем Googlebot. Проверка URL и запрос
// индексирования в Search Console ходят под Google-InspectionTool, а качество
// посадочных для Google Ads проверяет AdsBot — оба присылают Mozilla/5.0 и без
// явного упоминания здесь считались бы обычным браузером.
const BOT_UA_PATTERN = /(googlebot|googleother|google-extended|google-inspectiontool|adsbot-google|mediapartners-google|storebot-google|feedfetcher-google|apis-google|google-safety|google-site-verification|googleweblight|bingbot|bingpreview|msnbot|adidxbot|yandex|duckduckbot|baiduspider|petalbot|slurp|facebot|facebookexternalhit|meta-externalagent|meta-externalfetcher|twitterbot|rogerbot|linkedinbot|embedly|quora\slink\spreview|slackbot|discordbot|telegrambot|whatsapp|viber|skypeuripreview|vkshare|mail\.ru|pinterest|redditbot|tiktokspider|applebot|ia_archiver|archive\.org_bot|gptbot|chatgpt-user|oai-searchbot|ccbot|claudebot|claude-web|claude-searchbot|anthropic-ai|perplexitybot|perplexity-user|youbot|bytespider|cohere-ai|cohere-training-data-crawler|amazonbot|diffbot|timpibot|omgili|omgilibot|webzio-extended|semrushbot|ahrefsbot|mj12bot|dotbot|seekportbot|imagesiftbot|grok|xai-|mistralai-user|bravebot|bravesearch|duckassistbot|meta-webindexer)/i;

// У большинства настоящих браузеров в User-Agent есть "Mozilla/5.0" — простые HTTP-клиенты,
// SDK и многие ИИ-агенты (в т.ч. ещё не внесённые в список выше) его не подделывают.
const LOOKS_LIKE_BROWSER = /mozilla\/5\.0/i;

export function isBotRequest(request: Request): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  if (!userAgent) return true;
  if (BOT_UA_PATTERN.test(userAgent)) return true;
  return !LOOKS_LIKE_BROWSER.test(userAgent);
}

function escapeHtml(value = ''): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function xmlEscape(value = ''): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toAbsoluteUrl(siteUrl: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return `${siteUrl}${path}`;
  return `${siteUrl}/${path}`;
}

export function isCaseArticle(article: Article): boolean {
  return String(article.category || '').trim().toLowerCase() === 'кейсы';
}

export function getArticleSectionPath(article: Article): '/blog' | '/cases' {
  return isCaseArticle(article) ? '/cases' : '/blog';
}

export function getArticlePath(article: Article): string {
  return `${getArticleSectionPath(article)}/${article.slug}`;
}

function getSectionLabel(sectionPath: '/blog' | '/cases'): string {
  return sectionPath === '/cases' ? 'Кейсы' : 'Блог';
}

function toIsoDate(value?: string): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const ddmmyyyy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Дата публикации для RSS.
 *
 * Именно публикации, а не правки: `pubDate` в RSS означает «когда материал
 * вышел». Раньше первым стоял `updatedAt`, и отредактированная старая статья
 * всплывала у подписчиков как новая.
 */
function resolveArticleDate(article: Article): string | null {
  return (
    toIsoDate(article.publishedAt) ||
    toIsoDate(article.date) ||
    toIsoDate(article.updatedAt)
  );
}

function formatReadTime(value = ''): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^\d+$/.test(raw) ? `${raw} мин` : raw;
}

export function buildSeoTitle(article: Article): string {
  if (article.seoTitle?.trim()) return article.seoTitle.trim();
  return `${article.title} — ${article.category || 'Маркетинг'}`;
}

export function buildSeoDescription(article: Article): string {
  if (article.seoDescription?.trim()) return article.seoDescription.trim();
  if (article.summary?.trim()) return article.summary.trim();
  return article.description || 'Практическая статья о маркетинге и рекламе.';
}

// JSON-LD is embedded in an HTML <script> element. Escaping markup-significant
// characters prevents an article title/FAQ value such as "</script>" from
// terminating the element while preserving the exact JSON value for parsers.
function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function articleJsonLd(siteUrl: string, article: Article, sectionPath = getArticleSectionPath(article)): string {
  const canonical = `${siteUrl}${sectionPath}/${article.slug}`;
  const image = toAbsoluteUrl(siteUrl, article.image || '/og-image-v2.jpg');
  // datePublished должен оставаться датой первой публикации,
  // а dateModified — двигаться при правках.
  const publishedDate = toIsoDate(article.publishedAt) || toIsoDate(article.date);
  const modifiedDate = toIsoDate(article.updatedAt) || publishedDate;

  return safeJsonLd(
    {
      '@context': 'https://schema.org',
      '@type': isCaseArticle(article) ? 'Article' : 'BlogPosting',
      headline: buildSeoTitle(article),
      description: buildSeoDescription(article),
      image: [image],
      ...(publishedDate ? { datePublished: publishedDate } : {}),
      ...(modifiedDate ? { dateModified: modifiedDate } : {}),
      mainEntityOfPage: canonical,
      author: {
        '@type': 'Person',
        name: 'Whale Wizard',
      },
      publisher: {
        '@type': 'Organization',
        name: 'Whale Wizard',
        logo: {
          '@type': 'ImageObject',
          url: `${siteUrl}/images/brand/whale-wizard.png`,
        },
      },
      keywords: article.tags || [],
      articleSection: article.category,
    },
  );
}

function breadcrumbJsonLd(siteUrl: string, article: Article, sectionPath = getArticleSectionPath(article)): string {
  const sectionLabel = getSectionLabel(sectionPath);

  return safeJsonLd(
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Главная',
          item: `${siteUrl}/`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: sectionLabel,
          item: `${siteUrl}${sectionPath}/`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: article.title,
          item: `${siteUrl}${sectionPath}/${article.slug}`,
        },
      ],
    },
  );
}

function faqJsonLd(article: Article): string | null {
  const items = (article.faq || [])
    .filter((item) => item?.question && item?.answer)
    .map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    }));

  if (items.length === 0) return null;

  return safeJsonLd(
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: items,
    },
  );
}

export function buildArticleMeta(siteUrl: string, article: Article, sectionPath = getArticleSectionPath(article)) {
  return {
    canonical: `${siteUrl}${sectionPath}/${article.slug}`,
    title: `${buildSeoTitle(article)} | Whale Wizard`,
    description: buildSeoDescription(article),
    image: toAbsoluteUrl(siteUrl, article.image || '/og-image-v2.jpg'),
    publishedTime: toIsoDate(article.publishedAt || article.date),
    modifiedTime: toIsoDate(article.updatedAt || article.publishedAt || article.date),
    section: article.category || '',
  };
}

export function renderArticleHtml(siteUrl: string, article: Article, sectionPath = getArticleSectionPath(article)): string {
  const canonical = `${siteUrl}${sectionPath}/${article.slug}`;
  const sectionLabel = getSectionLabel(sectionPath);
  const ogImage = toAbsoluteUrl(siteUrl, article.image || '/og-image-v2.jpg');
  const title = `${buildSeoTitle(article)} | Whale Wizard`;
  const description = buildSeoDescription(article);
  const faqJson = faqJsonLd(article);
  const publishedTime = toIsoDate(article.publishedAt || article.date);
  const modifiedTime = toIsoDate(article.updatedAt || article.publishedAt || article.date);
  const keyTakeaways = (article.keyTakeaways || []).filter(Boolean);
  const faqItems = (article.faq || []).filter((item) => item?.question && item?.answer);
  const safeContent = sanitizeArticleHtml(article.content || '');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:site_name" content="Whale Wizard" />
  <meta property="og:locale" content="ru_RU" />
  ${publishedTime ? `<meta property="article:published_time" content="${escapeHtml(publishedTime)}" />` : ''}
  ${modifiedTime ? `<meta property="article:modified_time" content="${escapeHtml(modifiedTime)}" />` : ''}
  ${article.category ? `<meta property="article:section" content="${escapeHtml(article.category)}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
  <meta name="twitter:url" content="${escapeHtml(canonical)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <link rel="alternate" hreflang="ru" href="${escapeHtml(canonical)}" />
  <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}" />
  <script type="application/ld+json">${articleJsonLd(siteUrl, article, sectionPath)}</script>
  <script type="application/ld+json">${breadcrumbJsonLd(siteUrl, article, sectionPath)}</script>
  ${faqJson ? `<script type="application/ld+json">${faqJson}</script>` : ''}
</head>
<body>
  <main>
    <nav aria-label="breadcrumb">
      <a href="/">Главная</a> › <a href="${sectionPath}">${sectionLabel}</a> › <span>${escapeHtml(article.title)}</span>
    </nav>
    <article>
      <header>
        <h1>${escapeHtml(article.title)}</h1>
        <p>${escapeHtml(description)}</p>
        <p><strong>Категория:</strong> ${escapeHtml(article.category)} | <strong>Дата:</strong> ${escapeHtml(article.date)}${article.readTime ? ` | <strong>Время чтения:</strong> ${escapeHtml(formatReadTime(article.readTime))}` : ''}</p>
      </header>
      ${article.summary ? `<aside><h2>Краткий ответ</h2><p>${escapeHtml(article.summary)}</p></aside>` : ''}
      ${keyTakeaways.length > 0 ? `<section><h2>Ключевые тезисы</h2><ul>${keyTakeaways.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul></section>` : ''}
      <section>
${safeContent}
      </section>
      ${faqItems.length > 0 ? `<section><h2>FAQ</h2>${faqItems.map((item) => `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`).join('')}</section>` : ''}
    </article>
  </main>
</body>
</html>`;
}

export function renderArticleNotFoundHtml(siteUrl: string, sectionPath: '/blog' | '/cases'): string {
  const sectionLabel = getSectionLabel(sectionPath);
  // Раздел канонизирован со слешем: без него ссылка ловит 308 и Google
  // считает такой canonical переадресацией, а не адресом раздела.
  const canonical = `${siteUrl}${sectionPath}/`;

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Статья не найдена | Whale Wizard</title>
  <meta name="robots" content="noindex, follow, noarchive" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
</head>
<body>
  <main>
    <h1>Статья не найдена</h1>
    <p>Материал недоступен или URL был изменён.</p>
    <a href="${sectionPath}">Вернуться в ${escapeHtml(sectionLabel)}</a>
  </main>
</body>
</html>`;
}

export function findArticleBySlugPrefix(articles: Article[], slug: string, sectionPath: '/blog' | '/cases'): Article | null {
  const normalizedSlug = String(slug || '').trim();
  if (!normalizedSlug) return null;

  const candidates = articles.filter((article) => (
    getArticleSectionPath(article) === sectionPath &&
    article.slug.startsWith(`${normalizedSlug}-`)
  ));

  return candidates.length === 1 ? candidates[0] : null;
}

export function renderSitemapXml(siteUrl: string, routes: string[], articleDates: Record<string, string>): string {
  const uniqueRoutes = [...new Set(routes)];

  const canonicalRoute = (route: string): string => {
    if (route === '/' || /\.[a-z0-9]+$/i.test(route) || /^\/(blog|cases)\/[^/]+$/.test(route)) {
      return route;
    }
    return route.endsWith('/') ? route : `${route}/`;
  };

  const urls = uniqueRoutes
    .map((route) => {
      const loc = xmlEscape(`${siteUrl}${canonicalRoute(route)}`);
      const isArticle = /^\/(blog|cases)\/[^/]+$/.test(route);
      // `lastmod` ставится только там, где дата действительно известна, — то
      // есть у статей. Раньше остальным страницам подставлялась сегодняшняя
      // дата, и карта сайта каждый день заявляла, что изменились все страницы
      // сразу. Поисковик такому полю перестаёт доверять целиком, и оно
      // перестаёт работать даже там, где дата настоящая.
      const lastmod = toIsoDate(articleDates[route]);
      const priority = isArticle ? '0.8' : route === '/' ? '1.0' : '0.7';
      const changefreq = isArticle ? 'weekly' : route === '/' ? 'daily' : 'monthly';
      return `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

export function renderFeedXml(siteUrl: string, articles: Article[]): string {
  const sorted = [...articles].sort((a, b) => {
    const ad = new Date(a.updatedAt || a.publishedAt || 0).getTime();
    const bd = new Date(b.updatedAt || b.publishedAt || 0).getTime();
    return bd - ad;
  });

  const items = sorted
    .slice(0, 100)
    .map((article) => {
      const link = `${siteUrl}${getArticlePath(article)}`;
      const isoDate = resolveArticleDate(article);
      const pubDate = isoDate ? new Date(`${isoDate}T00:00:00Z`).toUTCString() : new Date().toUTCString();
      const description = buildSeoDescription(article);
      return `<item>
  <title>${xmlEscape(article.seoTitle || article.title)}</title>
  <link>${xmlEscape(link)}</link>
  <guid isPermaLink="true">${xmlEscape(link)}</guid>
  <pubDate>${xmlEscape(pubDate)}</pubDate>
  <description>${xmlEscape(description)}</description>
</item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Whale Wizard Blog</title>
  <link>${xmlEscape(`${siteUrl}/blog/`)}</link>
  <description>Новые статьи Whale Wizard</description>
  <language>ru-RU</language>
${items}
</channel>
</rss>`;
}
