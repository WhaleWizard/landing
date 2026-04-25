import type { Article } from './types';
import { sanitizeArticleHtml } from './sanitize';

const BOT_UA_PATTERN = /(googlebot|bingbot|yandexbot|duckduckbot|baiduspider|slurp|facebot|twitterbot|rogerbot|linkedinbot|embedly|quora\slink\spreview|slackbot|applebot|ia_archiver)/i;

export function isBotRequest(request: Request): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  return BOT_UA_PATTERN.test(userAgent);
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

function buildSeoTitle(article: Article): string {
  if (article.seoTitle?.trim()) return article.seoTitle.trim();
  return `${article.title} — ${article.category || 'Маркетинг'}`;
}

function buildSeoDescription(article: Article): string {
  if (article.seoDescription?.trim()) return article.seoDescription.trim();
  if (article.summary?.trim()) return article.summary.trim();
  return article.description || 'Практическая статья о маркетинге и рекламе.';
}

function articleJsonLd(siteUrl: string, article: Article): string {
  const canonical = `${siteUrl}/blog/${article.slug}`;
  const image = toAbsoluteUrl(siteUrl, article.image || '/og-image.jpg');

  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: buildSeoTitle(article),
      description: buildSeoDescription(article),
      image: [image],
      datePublished: article.publishedAt || article.updatedAt || article.date,
      dateModified: article.updatedAt || article.publishedAt || article.date,
      mainEntityOfPage: canonical,
      author: {
        '@type': 'Person',
        name: 'Whale Wzrd',
      },
      publisher: {
        '@type': 'Organization',
        name: 'Whale Wzrd',
        logo: {
          '@type': 'ImageObject',
          url: `${siteUrl}/og-image.jpg`,
        },
      },
      keywords: article.tags || [],
      articleSection: article.category,
    },
    null,
    0,
  );
}

function breadcrumbJsonLd(siteUrl: string, article: Article): string {
  return JSON.stringify(
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
          name: 'Блог',
          item: `${siteUrl}/blog`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: article.title,
          item: `${siteUrl}/blog/${article.slug}`,
        },
      ],
    },
    null,
    0,
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

  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: items,
    },
    null,
    0,
  );
}

export function renderArticleHtml(siteUrl: string, article: Article): string {
  const canonical = `${siteUrl}/blog/${article.slug}`;
  const ogImage = toAbsoluteUrl(siteUrl, article.image || '/og-image.jpg');
  const title = `${buildSeoTitle(article)} | Whale Wzrd`;
  const description = buildSeoDescription(article);
  const faqJson = faqJsonLd(article);
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
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <script type="application/ld+json">${articleJsonLd(siteUrl, article)}</script>
  <script type="application/ld+json">${breadcrumbJsonLd(siteUrl, article)}</script>
  ${faqJson ? `<script type="application/ld+json">${faqJson}</script>` : ''}
</head>
<body>
  <main>
    <nav aria-label="breadcrumb">
      <a href="/">Главная</a> › <a href="/blog">Блог</a> › <span>${escapeHtml(article.title)}</span>
    </nav>
    <article>
      <header>
        <h1>${escapeHtml(article.title)}</h1>
        <p>${escapeHtml(description)}</p>
        <p><strong>Категория:</strong> ${escapeHtml(article.category)} | <strong>Дата:</strong> ${escapeHtml(article.date)}${article.readTime ? ` | <strong>Время чтения:</strong> ${escapeHtml(article.readTime)}` : ''}</p>
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

export function renderSitemapXml(siteUrl: string, routes: string[], articleDates: Record<string, string>): string {
  const defaultLastmod = new Date().toISOString().slice(0, 10);

  const urls = routes
    .map((route) => {
      const loc = xmlEscape(`${siteUrl}${route}`);
      const lastmod = (articleDates[route] || defaultLastmod).slice(0, 10);
      const isBlogArticle = route.startsWith('/blog/') && route !== '/blog';
      const priority = isBlogArticle ? '0.8' : route === '/' ? '1.0' : '0.7';
      const changefreq = isBlogArticle ? 'weekly' : route === '/' ? 'daily' : 'monthly';
      return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
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
      const link = `${siteUrl}/blog/${article.slug}`;
      const pubDate = new Date(article.publishedAt || article.updatedAt || Date.now()).toUTCString();
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
  <title>Whale Wzrd Blog</title>
  <link>${xmlEscape(`${siteUrl}/blog`)}</link>
  <description>Новые статьи Whale Wzrd</description>
  <language>ru-RU</language>
${items}
</channel>
</rss>`;
}
