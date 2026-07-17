import { useEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  noIndex?: boolean;
}

const SITE_URL = 'https://www.whalewzrd.com';

const toAbsoluteUrl = (path: string): string => {
  if (!path) return SITE_URL;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return path.startsWith('/') ? `${SITE_URL}${path}` : `${SITE_URL}/${path}`;
};

const toCanonicalUrl = (path: string): string => {
  const url = new URL(toAbsoluteUrl(path));
  const pathname = url.pathname;
  const isFile = /\.[a-z0-9]+$/i.test(pathname);
  const isArticle = /^\/(blog|cases)\/[^/]+$/.test(pathname);

  if (pathname !== '/' && !isFile && !isArticle && !pathname.endsWith('/')) {
    url.pathname = `${pathname}/`;
  }

  return url.toString();
};

export default function SEO({
  title = 'Performance-маркетинг в Google Ads и Meta Ads',
  description = 'Настраиваю и веду рекламу в Google Ads и Meta Ads: аналитика, события, креативы и оптимизация по заявкам и продажам. Работаю с бизнесом, e-commerce и мобильными приложениями.',
  image = '/og-image.jpg',
  url = '/',
  type = 'website',
  noIndex = false,
}: SEOProps) {
  const siteTitle = 'Whale Wizard';
  const fullTitle = title === siteTitle ? title : `${title} | ${siteTitle}`;

  const absoluteUrl = toCanonicalUrl(url);
  const absoluteImage = toAbsoluteUrl(image);

  useEffect(() => {
    document.title = fullTitle;

    const setMeta = (name: string, content: string, isProperty = false) => {
      const selector = isProperty ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let meta = document.querySelector(selector);
      if (!meta) {
        meta = document.createElement('meta');
        if (isProperty) meta.setAttribute('property', name);
        else meta.setAttribute('name', name);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    setMeta('description', description);
    setMeta('robots', noIndex ? 'noindex, nofollow, noarchive' : 'index, follow');

    setMeta('og:title', fullTitle, true);
    setMeta('og:description', description, true);
    setMeta('og:image', absoluteImage, true);
    setMeta('og:url', absoluteUrl, true);
    setMeta('og:type', type, true);
    setMeta('og:site_name', siteTitle, true);
    setMeta('og:locale', 'ru_RU', true);

    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', description);
    setMeta('twitter:image', absoluteImage);
    setMeta('twitter:url', absoluteUrl);

    const setAlternate = (hrefLang: string, href: string) => {
      const selector = `link[rel="alternate"][hreflang="${hrefLang}"]`;
      let link = document.querySelector(selector) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'alternate');
        link.setAttribute('hreflang', hrefLang);
        document.head.appendChild(link);
      }
      link.setAttribute('href', href);
    };

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', absoluteUrl);
    setAlternate('ru', absoluteUrl);
    setAlternate('x-default', absoluteUrl);

    const upsertJsonLd = (id: string, payload: Record<string, unknown>) => {
      let script = document.getElementById(id) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = id;
        script.type = 'application/ld+json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(payload);
    };

    upsertJsonLd('ld-organization', {
      '@context': 'https://schema.org',
      '@type': 'ProfessionalService',
      name: siteTitle,
      url: SITE_URL,
      logo: `${SITE_URL}/og-image.jpg`,
      image: absoluteImage,
      description: 'Настройка и ведение Google Ads и Meta Ads с аналитикой, событиями и оценкой рекламы по заявкам, продажам и экономике проекта.',
      email: 'whalewzrd@gmail.com',
      areaServed: ['RU', 'US', 'AE', 'TR', 'EU'],
      serviceType: ['Google Ads', 'Meta Ads', 'Performance Marketing', 'Lead Generation'],
      sameAs: ['https://t.me/white_rsh'],
    });

    upsertJsonLd('ld-website', {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteTitle,
      url: SITE_URL,
      inLanguage: 'ru',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/blog?search={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    });
  }, [fullTitle, description, absoluteImage, absoluteUrl, type, noIndex]);

  return null;
}
