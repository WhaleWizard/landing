import { useEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
}

export default function SEO({
  title = "Whale Wzrd | Performance-таргетолог",
  description = "Увеличу поток клиентов через Google Ads и Meta Ads. Настройка рекламы, которая приносит результат с первого месяца. Бесплатная консультация.",
  keywords = "таргетолог, google ads, meta ads, реклама, контекстная реклама, seo, продвижение",
  image = "/og-image.jpg",
  url = "https://whalewzrd.com",
  type = "website",
}: SEOProps) {
  const siteTitle = "Whale Wzrd";
  const fullTitle = title === siteTitle ? title : `${title} | ${siteTitle}`;

  useEffect(() => {
    document.title = fullTitle;

    const setMetaTag = (name: string, content: string, isProperty = false) => {
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

    setMetaTag('description', description);
    setMetaTag('keywords', keywords);
    setMetaTag('og:title', fullTitle, true);
    setMetaTag('og:description', description, true);
    setMetaTag('og:image', image, true);
    setMetaTag('og:url', url, true);
    setMetaTag('og:type', type, true);
    setMetaTag('twitter:card', 'summary_large_image');
    setMetaTag('twitter:title', fullTitle, true);
    setMetaTag('twitter:description', description, true);
    setMetaTag('twitter:image', image, true);
    // перед setMetaTag('robots', 'index, follow') добавь:
const existingRobots = document.querySelector('meta[name="robots"]');
if (existingRobots) existingRobots.remove();
    setMetaTag('robots', 'index, follow');

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
  }, [fullTitle, description, keywords, image, url, type]);

  return null;
}