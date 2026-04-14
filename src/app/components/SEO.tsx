import { useEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
}

const SITE_URL = 'https://whalewzrd.com';

const toAbsoluteUrl = (path: string): string => {
  if (!path) return SITE_URL;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return path.startsWith('/') ? `${SITE_URL}${path}` : `${SITE_URL}/${path}`;
};

export default function SEO({
  title = "Whale Wzrd | Performance-таргетолог",
  description = "Настраиваю рекламу в Google Ads и Meta Ads, которая приводит первые заявки уже в период теста и масштабируется в прибыль. $2M+ рекламного бюджета в управлении • 500 000+ лидов. Средняя окупаемость — 240% (e-commerce и B2C). Беру на себя всё: стратегия, креативы, аналитика и оптимизация. Настройка google ads и Настройка Meta ads.",
  image = "/og-image.jpg",
  url = "/",
  type = "website",
}: SEOProps) {
  const siteTitle = "Whale Wzrd";
  const fullTitle = title === siteTitle ? title : `${title} | ${siteTitle}`;

  const absoluteUrl = toAbsoluteUrl(url);
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
    setMeta('robots', 'index, follow');

    setMeta('og:title', fullTitle, true);
    setMeta('og:description', description, true);
    setMeta('og:image', absoluteImage, true);
    setMeta('og:url', absoluteUrl, true);
    setMeta('og:type', type, true);

    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', fullTitle, true);
    setMeta('twitter:description', description, true);
    setMeta('twitter:image', absoluteImage, true);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', absoluteUrl);
  }, [fullTitle, description, absoluteImage, absoluteUrl, type]);

  return null;
}
