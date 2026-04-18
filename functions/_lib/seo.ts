import type { Article } from './types';

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

function toAbsoluteUrl(siteUrl: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return `${siteUrl}${path}`;
  return `${siteUrl}/${path}`;
}

function articleJsonLd(siteUrl: string, article: Article): string {
  const canonical = `${siteUrl}/blog/${article.slug}`;
  const image = toAbsoluteUrl(siteUrl, article.image || '/og-image.jpg');

  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.description,
      image: [image],
      datePublished: article.date,
      dateModified: article.date,
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
    },
    null,
    0,
  );
}

export function renderArticleHtml(siteUrl: string, article: Article): string {
  const canonical = `${siteUrl}/blog/${article.slug}`;
  const ogImage = toAbsoluteUrl(siteUrl, article.image || '/og-image.jpg');
  const title = `${article.title} | Whale Wzrd`;
  const description = article.description;

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
</head>
<body>
  <main>
    <article>
      <header>
        <h1>${escapeHtml(article.title)}</h1>
        <p>${escapeHtml(article.description)}</p>
        <p><strong>Категория:</strong> ${escapeHtml(article.category)} | <strong>Дата:</strong> ${escapeHtml(article.date)}${article.readTime ? ` | <strong>Время чтения:</strong> ${escapeHtml(article.readTime)}` : ''}</p>
      </header>
      <section>
${article.content}
      </section>
    </article>
  </main>
</body>
</html>`;
}

export function renderSitemapXml(siteUrl: string, routes: string[]): string {
  const lastmod = new Date().toISOString().slice(0, 10);

  const urls = routes
    .map((route) => {
      const loc = `${siteUrl}${route}`
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}
