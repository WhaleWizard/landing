// src/app/pages/BlogPage.tsx
import { AnimatePresence, motion, useInView, useScroll, useSpring } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Calendar,
  ChevronDown,
  Clock,
  Download,
  ListTree,
  Rocket,
  Search,
  Sparkles,
  Target,
  TrendingDown,
  X,
} from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useEffect, useState, useRef, useCallback, useMemo, memo, lazy, Suspense } from 'react';
import SEO from '../components/SEO';
import Navbar from '../components/Navbar';
import { isCaseArticle } from '../utils/articleCategory';
import { useArticles } from '../context/ArticlesContext';
import type { Article } from '../components/hooks/useArticlesApi';
import RouteSkeleton from '../components/RouteSkeleton';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { hasCustomCover } from '../utils/articleCover';
import { formatReadTime } from '../utils/articleMeta';
import { useScrollTo } from '../components/hooks/useScrollTo';
import CaseArticleView from '../components/CaseArticleView';

const PlexusBackdrop = lazy(() => import('../components/PlexusBackdrop'));
const SITE_URL = 'https://www.whalewzrd.com';

const BLOG_GOALS = [
  {
    id: 'leads',
    label: 'Получить лиды',
    description: 'B2B, услуги и запуск',
    icon: Target,
    categories: ['B2B', 'Запуск', 'Google + Meta', 'Стратегии'],
    tokens: ['лид', 'воронк', 'запуск'],
  },
  {
    id: 'efficiency',
    label: 'Снизить CPL / CPA',
    description: 'Оптимизация без магии',
    icon: TrendingDown,
    categories: ['Оптимизация', 'Meta Ads'],
    tokens: ['cpa', 'cpl', 'антикризис'],
  },
  {
    id: 'analytics',
    label: 'Настроить аналитику',
    description: 'Атрибуция и first-party data',
    icon: BarChart3,
    categories: ['Аналитика', 'Ретаргетинг'],
    tokens: ['аналитик', 'атрибуц', 'данн'],
  },
  {
    id: 'scale',
    label: 'Масштабировать',
    description: 'E-commerce и рост',
    icon: Rocket,
    categories: ['E-commerce', 'Google Ads', 'Стратегии'],
    tokens: ['масштаб', 'рентабельн', 'roi'],
  },
] as const;

// useInView должен наблюдать элемент, который монтируется ВМЕСТЕ с хуком.
// Раньше ref висел на секции, которая появлялась после скелетона загрузки —
// observer привязывался к null, inView навсегда оставался false, и плексус
// с орбами стояли замороженными. Обёртки ниже монтируют ref и хук синхронно.
function InViewPlexus() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: false, margin: '0px 0px -10% 0px' });
  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0">
      <Suspense fallback={null}>
        <PlexusBackdrop inView={inView} className="absolute inset-0 h-full w-full" />
      </Suspense>
    </div>
  );
}

function ArticleHeroBackdrop() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: false, margin: '0px 0px -10% 0px' });
  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute top-0 left-1/4 w-48 h-48 md:w-96 md:h-96 bg-primary/20 rounded-full blur-[128px] animate-pulse" style={{ willChange: 'opacity', animationPlayState: inView ? 'running' : 'paused' }} />
      <div className="absolute bottom-0 right-1/4 w-48 h-48 md:w-96 md:h-96 bg-accent/20 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s', animationPlayState: inView ? 'running' : 'paused' }} />
      <Suspense fallback={null}>
        <PlexusBackdrop inView={inView} className="absolute inset-0 h-full w-full" />
      </Suspense>
    </div>
  );
}

function normalizeTokens(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function russianCountLabel(count: number, forms: [string, string, string]) {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  const form = mod100 >= 11 && mod100 <= 14
    ? forms[2]
    : mod10 === 1
      ? forms[0]
      : mod10 >= 2 && mod10 <= 4
        ? forms[1]
        : forms[2];
  return `${count} ${form}`;
}

function buildArticleSeoTitle(article) {
  if (article?.seoTitle?.trim()) return article.seoTitle.trim();
  return `${article?.title || 'Статья'} — ${article?.category || 'Маркетинг'}`;
}

function buildArticleSeoDescription(article) {
  if (article?.seoDescription?.trim()) return article.seoDescription.trim();
  if (article?.summary?.trim()) return article.summary.trim();
  return article?.description || 'Практическая статья о рекламе и маркетинге.';
}


function isZipDownloadLink(href = '') {
  if (!href) return false;
  try {
    const url = new URL(href, window.location.href);
    return url.pathname.toLowerCase().endsWith('.zip');
  } catch {
    return String(href).split('?')[0].split('#')[0].toLowerCase().endsWith('.zip');
  }
}

function getDownloadFileName(href = '') {
  try {
    const url = new URL(href, window.location.href);
    const pathname = url.pathname.split('/').filter(Boolean).pop() || 'archive.zip';
    return decodeURIComponent(pathname);
  } catch {
    const pathname = String(href).split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || 'archive.zip';
    return decodeURIComponent(pathname);
  }
}

function extractRelatedArticles(allArticles, currentArticle) {
  if (!currentArticle) return [];
  const currentTags = new Set((currentArticle.tags || []).map((tag) => String(tag).toLowerCase()));
  const currentTokens = new Set(normalizeTokens(`${currentArticle.title} ${currentArticle.description}`));

  return allArticles
    .filter((article) => article.slug !== currentArticle.slug)
    .sort((a, b) => {
      const score = (article) => {
        const sameCategory = Number(article.category === currentArticle.category) * 3;
        const tagsScore = (article.tags || []).reduce((acc, tag) => acc + Number(currentTags.has(String(tag).toLowerCase())), 0);
        const articleTokens = normalizeTokens(`${article.title} ${article.description}`);
        const tokenScore = articleTokens.reduce((acc, token) => acc + Number(currentTokens.has(token)), 0);
        return sameCategory + tagsScore * 2 + tokenScore;
      };

      const byCategory = score(b) - score(a);
      if (byCategory !== 0) return byCategory;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 3);
}

function toIsoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);
  const match = value.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function absoluteArticleImage(path = ''): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path || 'og-image-v2.jpg'}`}`;
}

function buildArticleStructuredData(article: Article, routeBase: '/blog' | '/cases') {
  const canonical = `${SITE_URL}${routeBase}/${article.slug}`;
  const publishedDate = toIsoDate(article.publishedAt) || toIsoDate(article.date);
  const modifiedDate = toIsoDate(article.updatedAt) || publishedDate;
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': routeBase === '/cases' ? 'Article' : 'BlogPosting',
    headline: buildArticleSeoTitle(article),
    description: buildArticleSeoDescription(article),
    image: [absoluteArticleImage(article.image)],
    ...(publishedDate ? { datePublished: publishedDate } : {}),
    ...(modifiedDate ? { dateModified: modifiedDate } : {}),
    mainEntityOfPage: canonical,
    author: { '@type': 'Person', name: 'Whale Wizard' },
    publisher: {
      '@type': 'Organization',
      name: 'Whale Wizard',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/images/brand/whale-wizard.png` },
    },
    keywords: article.tags || [],
    articleSection: article.category,
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: routeBase === '/cases' ? 'Кейсы' : 'Блог', item: `${SITE_URL}${routeBase}/` },
      { '@type': 'ListItem', position: 3, name: article.title, item: canonical },
    ],
  };
  const faqItems = (article.faq || []).filter((item) => item?.question && item?.answer);
  const faqSchema = faqItems.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  } : null;
  return { articleSchema, breadcrumbSchema, faqSchema };
}

function CaseZipWarning({ download, onClose, onConfirm }) {
  return (
    <AnimatePresence>
      {download && (
        <>
          <motion.div
            className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="case-zip-download-warning-title"
            className="fixed left-1/2 top-1/2 z-[1001] max-h-[calc(100dvh-24px)] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-amber-400/40 bg-card shadow-2xl shadow-amber-500/10"
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 18 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <div className="relative p-5 sm:p-6">
              <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition-colors hover:bg-amber-400/10 hover:text-foreground" aria-label="Закрыть предупреждение">
                <X className="h-5 w-5" />
              </button>
              <div className="mb-5 flex items-start gap-4 pr-10">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-300/40">
                  <AlertTriangle className="h-8 w-8" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="case-zip-download-warning-title" className="text-xl font-bold text-foreground">Проверьте ZIP-архив перед распаковкой</h2>
                  <p className="mt-1 break-words text-sm text-muted-foreground">Файл: <span className="font-medium text-foreground">{download.fileName}</span></p>
                </div>
              </div>
              <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm leading-relaxed text-foreground/90">
                <p>ZIP-архивы могут содержать разные файлы. Перед распаковкой проверьте содержимое архива.</p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>Не открывайте файлы, которые не соответствуют описанию.</li>
                  <li>Не запускайте неизвестные установщики, скрипты или программы.</li>
                  <li>Сначала проверьте архив системной защитой.</li>
                </ul>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={onClose} className="rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50">Отмена</button>
                <button type="button" onClick={onConfirm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-bold text-black shadow-lg shadow-amber-500/20 transition-transform hover:scale-[1.02] active:scale-[0.98]">
                  <Download className="h-4 w-4" /> Всё понимаю, скачать ZIP
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function BlogPageComponent() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isCasesRoute = location.pathname === '/cases' || location.pathname.startsWith('/cases/');
  const routeBase = isCasesRoute ? '/cases' : '/blog';
  const preservedCaseSearch = isCasesRoute ? location.search : '';
  const listUrl = `${routeBase}${preservedCaseSearch}`;
  const { articles: allArticles, loading } = useArticles();
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  // Поддержка /blog?search=… — этот формат заявлен в JSON-LD SearchAction (SEO.tsx)
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  const [activeCategory, setActiveCategory] = useState('');
  const [activeGoal, setActiveGoal] = useState('');
  const [showAllGoals, setShowAllGoals] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [pendingZipDownload, setPendingZipDownload] = useState(null);
  const contentRef = useRef(null);
  const articleTitleRef = useRef<HTMLHeadingElement>(null);
  const { scrollToWhenReady } = useScrollTo();

  // Прогресс чтения статьи — тонкая полоса под шапкой
  const { scrollYProgress } = useScroll();
  const readingProgress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });

  // Санитизация + оглавление: проставляем id всем h2, чтобы работали якоря
  const { articleHtml, toc } = useMemo(() => {
    if (!selectedArticle) return { articleHtml: '', toc: [] };
    const safe = sanitizeHtml(selectedArticle.content || '');
    try {
      const doc = new DOMParser().parseFromString(safe, 'text/html');
      const headings = Array.from(doc.body.querySelectorAll('h2'));
      const items = headings.map((heading, index) => {
        const text = heading.textContent?.trim() || `Раздел ${index + 1}`;
        const id = heading.id || `razdel-${index + 1}`;
        heading.id = id;
        return { id, text };
      });
      return { articleHtml: doc.body.innerHTML, toc: items };
    } catch {
      return { articleHtml: safe, toc: [] };
    }
  }, [selectedArticle]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    document.body.dataset.blogRoute = slug ? 'article' : 'list';
    return () => {
      delete document.body.dataset.blogRoute;
    };
  }, [slug]);

  useEffect(() => {
    if (slug && !loading) {
      const article = allArticles.find((a) => a.slug === slug && (isCasesRoute ? isCaseArticle(a) : !isCaseArticle(a)));
      if (article) setSelectedArticle(article);
      else navigate(listUrl, { replace: true });
    } else {
      setSelectedArticle(null);
    }
  }, [slug, allArticles, loading, navigate, isCasesRoute, listUrl]);

  useEffect(() => {
    if (!selectedArticle) return;
    articleTitleRef.current?.focus({ preventScroll: true });
  }, [selectedArticle]);

  useEffect(() => {
    const ids = ['ld-article', 'ld-breadcrumbs', 'ld-faq-page'] as const;
    if (!selectedArticle) {
      ids.forEach((id) => document.getElementById(id)?.remove());
      return;
    }

    const { articleSchema, breadcrumbSchema, faqSchema } = buildArticleStructuredData(
      selectedArticle,
      routeBase as '/blog' | '/cases',
    );
    const entries = [
      ['ld-article', articleSchema],
      ['ld-breadcrumbs', breadcrumbSchema],
      ['ld-faq-page', faqSchema],
    ] as const;

    for (const [id, payload] of entries) {
      const existing = document.getElementById(id);
      if (!payload) {
        existing?.remove();
        continue;
      }
      const script = existing instanceof HTMLScriptElement ? existing : document.createElement('script');
      script.id = id;
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(payload);
      if (!script.isConnected) document.head.appendChild(script);
    }

    return () => ids.forEach((id) => document.getElementById(id)?.remove());
  }, [selectedArticle, routeBase]);

  useEffect(() => {
    if (!contentRef.current || !selectedArticle) return;
    const handler = (e) => {
      const link = e.target.closest('a');
      const href = link?.getAttribute('href') || '';
      if (href === '/#contact') {
        e.preventDefault();
        navigate('/');
        setTimeout(() => scrollToWhenReady('contact'), 40);
        return;
      }

      if (isZipDownloadLink(href)) {
        e.preventDefault();
        setPendingZipDownload({
          href: link.href || href,
          target: link.getAttribute('target') || '_blank',
          fileName: getDownloadFileName(href),
        });
      }
    };
    contentRef.current.addEventListener('click', handler);
    return () => contentRef.current?.removeEventListener('click', handler);
  }, [selectedArticle, navigate, scrollToWhenReady]);

  const goHome = useCallback(() => {
    navigate('/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [navigate]);

  const goToBlogList = useCallback(() => navigate(listUrl), [navigate, listUrl]);

  const openRelatedArticle = useCallback((nextSlug: string) => {
    navigate(`${routeBase}/${nextSlug}${preservedCaseSearch}`);
    window.scrollTo({ top: 0 });
  }, [navigate, preservedCaseSearch, routeBase]);

  const goToContact = useCallback(() => {
    navigate('/');
    setTimeout(() => scrollToWhenReady('contact'), 40);
  }, [navigate, scrollToWhenReady]);

  const closeZipWarning = useCallback(() => {
    setPendingZipDownload(null);
  }, []);

  const confirmZipDownload = useCallback(() => {
    if (!pendingZipDownload?.href) return;
    const href = pendingZipDownload.href;
    const target = pendingZipDownload.target;
    setPendingZipDownload(null);
    if (target === '_blank') {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    window.location.href = href;
  }, [pendingZipDownload]);

  // Сначала раздел (блог/кейсы), затем категория, затем поиск — раньше поиск
  // игнорировал раздел и на /cases находил статьи блога.
  const scopedArticles = allArticles.filter((article) => (isCasesRoute ? isCaseArticle(article) : !isCaseArticle(article)));
  const categories = [...new Set(scopedArticles.map((article) => article.category).filter(Boolean))];
  const normalizedQueryTokens = normalizeTokens(searchQuery);
  const filteredArticles = scopedArticles.filter((article) => {
    if (activeCategory && article.category !== activeCategory) return false;
    if (!isCasesRoute && activeGoal) {
      const goal = BLOG_GOALS.find((item) => item.id === activeGoal);
      const normalizedArticle = `${article.title} ${article.description} ${article.category}`.toLowerCase();
      const matchesGoal = goal && (
        (goal.categories as readonly string[]).includes(article.category)
        || goal.tokens.some((token) => normalizedArticle.includes(token))
      );
      if (!matchesGoal) return false;
    }
    if (normalizedQueryTokens.length === 0) return true;

    const haystack = normalizeTokens([
      article.title,
      article.description,
      article.category,
      Array.isArray(article.tags) ? article.tags.join(' ') : '',
      article.summary || '',
    ].join(' '));

    const haystackSet = new Set(haystack);
    return normalizedQueryTokens.every((token) => haystackSet.has(token));
  });
  const featuredArticle = !isCasesRoute ? filteredArticles[0] ?? null : null;
  const feedArticles = !isCasesRoute ? filteredArticles.slice(1) : filteredArticles;

  if (loading) return <RouteSkeleton />;

  if (selectedArticle) {
    const relatedArticles = extractRelatedArticles(
      allArticles.filter((article) => (isCasesRoute ? isCaseArticle(article) : !isCaseArticle(article))),
      selectedArticle,
    );
    const seoTitle = buildArticleSeoTitle(selectedArticle);
    const seoDescription = buildArticleSeoDescription(selectedArticle);

    if (isCasesRoute) {
      const origin = new URLSearchParams(location.search).get('from');
      return (
        <>
          <SEO
            title={seoTitle}
            description={seoDescription}
            url={`/cases/${selectedArticle.slug}`}
            type="article"
            articlePublishedTime={toIsoDate(selectedArticle.publishedAt) || toIsoDate(selectedArticle.date)}
            articleModifiedTime={toIsoDate(selectedArticle.updatedAt) || toIsoDate(selectedArticle.publishedAt) || toIsoDate(selectedArticle.date)}
            articleSection={selectedArticle.category}
          />
          <motion.div
            aria-hidden="true"
            className="fixed left-0 right-0 top-0 z-[70] h-1 origin-left bg-gradient-to-r from-primary via-accent to-secondary"
            style={{ scaleX: readingProgress }}
          />
          <CaseArticleView
            article={selectedArticle}
            seoDescription={seoDescription}
            articleHtml={articleHtml}
            toc={toc}
            relatedArticles={relatedArticles}
            listHref={listUrl}
            relatedSearch={preservedCaseSearch}
            origin={origin}
            contentRef={contentRef}
            articleTitleRef={articleTitleRef}
            onHome={goHome}
            onBackToCases={goToBlogList}
            onContact={goToContact}
            onRelated={openRelatedArticle}
          />
          <CaseZipWarning download={pendingZipDownload} onClose={closeZipWarning} onConfirm={confirmZipDownload} />
        </>
      );
    }

    return (
      <>
        <Navbar variant="content" />
        <SEO
          title={seoTitle}
          description={seoDescription}
          url={`${routeBase}/${selectedArticle.slug}`}
          type="article"
          articlePublishedTime={toIsoDate(selectedArticle.publishedAt) || toIsoDate(selectedArticle.date)}
          articleModifiedTime={toIsoDate(selectedArticle.updatedAt) || toIsoDate(selectedArticle.publishedAt) || toIsoDate(selectedArticle.date)}
          articleSection={selectedArticle.category}
        />
        {/* Прогресс чтения — поверх всего, тонкая градиентная полоса */}
        <motion.div
          aria-hidden="true"
          className="fixed top-0 left-0 right-0 z-[60] h-1 origin-left bg-gradient-to-r from-primary via-accent to-secondary"
          style={{ scaleX: readingProgress }}
        />
        <section
          data-blog-ui="true"
          className="marketing-typography blog-page blog-page--article min-h-screen bg-background"
          style={{ contain: 'layout style paint' }}
        >
          <div className="relative overflow-hidden pb-12 pt-28 md:pb-20 md:pt-32">
            {/* Орбы + плексус только в шапке статьи — под текстом их нет, чтобы не мешать чтению */}
            <ArticleHeroBackdrop />
            <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <nav className="min-w-0 truncate text-xs text-muted-foreground" aria-label="breadcrumb">
                  <button onClick={goHome} className="blog-touch-target inline-flex items-center bg-transparent px-1 hover:text-primary border-none cursor-pointer">Главная</button>
                  <span className="mx-2">›</span>
                  <button onClick={goToBlogList} className="blog-touch-target inline-flex items-center bg-transparent px-1 hover:text-primary border-none cursor-pointer">
                    {isCasesRoute ? 'Кейсы' : 'Блог'}
                  </button>
                </nav>
                <button onClick={goToBlogList} className="blog-touch-target inline-flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-background/35 px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
                  <ArrowLeft className="h-4 w-4" /><span>Все статьи</span>
                </button>
              </div>

              <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="max-w-5xl space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  <span className="rounded-lg border border-primary/25 bg-primary/15 px-3 py-1.5 font-semibold uppercase tracking-[0.04em] text-primary">{selectedArticle.category}</span>
                  <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-4 w-4" /><span>{formatReadTime(selectedArticle.readTime)}</span></div>
                  <div className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="h-4 w-4" /><span>{selectedArticle.date}</span></div>
                </div>
                <h1 ref={articleTitleRef} tabIndex={-1} className="text-balance text-[clamp(2rem,8vw,3.25rem)] font-bold leading-[1.05] tracking-[-0.035em] text-foreground focus:outline-none md:max-w-4xl">{selectedArticle.title}</h1>
                <p className="max-w-3xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl">{seoDescription}</p>
                <div className="flex items-center gap-3 border-t border-border/60 pt-5">
                  <img
                    src="/images/brand/whale-wizard-256.webp"
                    alt=""
                    width="44"
                    height="44"
                    className="h-11 w-11 rounded-xl object-contain"
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Whale Wizard</p>
                    <p className="text-xs text-muted-foreground">Практика performance-маркетинга</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
          {hasCustomCover(selectedArticle.image) && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="max-w-5xl mx-auto px-4 sm:px-6 mb-10">
              <div className="blog-hero-cover rounded-2xl overflow-hidden border border-border shadow-2xl">
                <img
                  src={selectedArticle.image}
                  alt={selectedArticle.title}
                  loading="eager"
                  className="w-full h-auto object-cover max-h-[500px]"
                  onError={(event) => {
                    // Битая обложка — прячем весь блок, статья начинается с текста
                    const wrap = event.currentTarget.closest('.blog-hero-cover');
                    if (wrap instanceof HTMLElement) wrap.style.display = 'none';
                  }}
                />
              </div>
            </motion.div>
          )}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="blog-reading-wrap mx-auto max-w-6xl px-4 pb-20 sm:px-6">
            <div className="lg:grid lg:grid-cols-[minmax(0,760px)_minmax(230px,290px)] lg:items-start lg:justify-between lg:gap-12">
              <main className="min-w-0">
            {toc.length >= 3 && (
              <details className="blog-toc group mb-8 rounded-2xl border border-border bg-card/40 open:bg-card/60 transition-colors lg:hidden">
                <summary className="blog-touch-target flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-semibold text-foreground">
                  <ListTree className="h-5 w-5 text-primary" aria-hidden="true" />
                  Содержание
                  <span className="ml-auto text-xs font-normal text-muted-foreground transition-transform group-open:rotate-180">▾</span>
                </summary>
                <nav aria-label="Оглавление статьи" className="px-5 pb-4">
                  <ol className="space-y-1.5 border-t border-border/60 pt-3">
                    {toc.map((item, index) => (
                      <li key={item.id}>
                        <a
                          href={`#${item.id}`}
                          className="blog-toc-link flex items-baseline gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          <span className="text-xs tabular-nums text-primary/70">{String(index + 1).padStart(2, '0')}</span>
                          <span>{item.text}</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              </details>
            )}

            {selectedArticle.summary && (
              <aside className="mb-8 rounded-2xl border border-primary/30 bg-primary/[0.08] p-5 sm:p-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-primary">Ключевой вывод</p>
                <p className="text-sm md:text-base text-foreground/90 leading-relaxed">{selectedArticle.summary}</p>
              </aside>
            )}

            {Array.isArray(selectedArticle.keyTakeaways) && selectedArticle.keyTakeaways.length > 0 && (
              <section className="mb-8 rounded-2xl border border-border bg-card/30 p-5">
                <h2 className="text-lg font-semibold mb-3">Ключевые тезисы</h2>
                <ul className="space-y-2 list-disc pl-5 text-sm md:text-base text-muted-foreground">
                  {selectedArticle.keyTakeaways.map((point, index) => (
                    <li key={`${point}-${index}`}>{point}</li>
                  ))}
                </ul>
              </section>
            )}

            <div
              ref={contentRef}
              className="blog-article-content max-w-none"
              dangerouslySetInnerHTML={{ __html: articleHtml }}
            />

            {Array.isArray(selectedArticle.faq) && selectedArticle.faq.length > 0 && (
              <section className="mt-10 rounded-2xl border border-border bg-card/30 p-6">
                <h2 className="text-xl font-semibold mb-4">Частые вопросы</h2>
                <div className="space-y-4">
                  {selectedArticle.faq.map((item, index) => (
                    <details key={`${item.question}-${index}`} className="group rounded-xl border border-border/70 bg-background/40 px-4 py-3">
                      <summary className="blog-touch-target cursor-pointer list-none font-medium text-foreground group-open:text-primary">
                        {item.question}
                      </summary>
                      <p className="mt-2 text-sm md:text-base text-muted-foreground leading-relaxed">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {relatedArticles.length > 0 && (
              <aside className="mt-12 rounded-2xl border border-border bg-card/30 p-6">
                <h2 className="text-xl font-semibold mb-4">{isCasesRoute ? 'Похожие кейсы' : 'Похожие статьи'}</h2>
                <ul className="space-y-3">
                  {relatedArticles.map((article) => (
                    <li key={article.slug}>
                      <motion.button
                        whileHover={{ x: 4 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                        onClick={() => navigate(`${routeBase}/${article.slug}`)}
                        className="text-left bg-transparent border-none p-0 text-primary hover:underline cursor-pointer"
                      >
                        {article.title}
                      </motion.button>
                    </li>
                  ))}
                </ul>
              </aside>
            )}

            {/* Финальный CTA с плексус-сетью — после текста, чтению не мешает */}
            <div className="relative mt-12 overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-b from-primary/10 via-card/60 to-card/80 px-5 py-10 text-center sm:px-8 md:py-12">
              <InViewPlexus />
              <div className="relative z-10">
                <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Разбор по вашей задаче
                </div>
                <h2 className="text-balance text-xl font-bold text-foreground sm:text-2xl">Нужно применить это к вашему проекту?</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground sm:text-base">
                  Пришлите ссылку и короткие вводные. Я посмотрю, с какого шага разумнее начать и какие данные подготовить.
                </p>
                <button
                  onClick={goToContact}
                  className="blog-touch-target group relative mt-6 inline-flex items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-accent px-7 py-3 font-semibold text-white shadow-xl shadow-primary/30 transition-all hover:scale-105 active:scale-95 cursor-pointer md:px-10 md:py-4"
                >
                  <div className="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-[120%]" />
                  <span className="relative text-sm md:text-base">Обсудить задачу</span>
                  <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </button>
              </div>
            </div>
              </main>

              {toc.length >= 3 && (
                <aside className="sticky top-24 hidden rounded-2xl border border-border/70 bg-card/35 p-4 lg:block">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ListTree className="h-4 w-4 text-primary" aria-hidden="true" />
                    Содержание
                  </div>
                  <nav aria-label="Оглавление статьи">
                    <ol className="space-y-1">
                      {toc.map((item, index) => (
                        <li key={item.id}>
                          <a
                            href={`#${item.id}`}
                            className="blog-toc-link flex items-baseline gap-2 rounded-lg px-2 py-2 text-xs leading-relaxed text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                          >
                            <span className="tabular-nums text-primary/70">{String(index + 1).padStart(2, '0')}</span>
                            <span>{item.text}</span>
                          </a>
                        </li>
                      ))}
                    </ol>
                  </nav>
                </aside>
              )}
            </div>
          </motion.div>
        </section>
        <AnimatePresence>
          {pendingZipDownload && (
            <>
              <motion.div
                className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeZipWarning}
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="zip-download-warning-title"
                className="fixed left-1/2 top-1/2 z-[1001] max-h-[calc(100dvh-24px)] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-amber-400/40 bg-card shadow-2xl shadow-amber-500/10"
                initial={{ opacity: 0, scale: 0.92, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 18 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              >
                <div className="relative p-5 sm:p-6">
                  <button
                    type="button"
                    onClick={closeZipWarning}
                    className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition-colors hover:bg-amber-400/10 hover:text-foreground"
                    aria-label="Закрыть предупреждение"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <div className="mb-5 flex items-start gap-4 pr-10">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-300/40">
                      <AlertTriangle className="h-8 w-8" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 id="zip-download-warning-title" className="text-xl font-bold text-foreground">
                        Проверьте ZIP-архив перед распаковкой
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground break-words">
                        Файл: <span className="font-medium text-foreground">{pendingZipDownload.fileName}</span>
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm leading-relaxed text-foreground/90">
                    <p>
                      ZIP-архивы могут содержать разные файлы. Перед распаковкой всегда проверьте содержимое архива.
                    </p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
                      <li>Если файлы внутри не соответствуют описанию в статье — не открывайте их.</li>
                      <li>Не запускайте установщики, скрипты или неизвестные программы из архива.</li>
                      <li>Сначала проверьте архив антивирусом или системной защитой.</li>
                    </ul>
                  </div>

                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeZipWarning}
                      className="rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={confirmZipDownload}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-bold text-black shadow-lg shadow-amber-500/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Download className="h-4 w-4" />
                      Всё понимаю, скачать ZIP
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
      <Navbar variant="content" />
      <SEO
        title={isCasesRoute ? 'Кейсы рекламных проектов' : 'Блог о рекламе и аналитике'}
        description={isCasesRoute ? 'Разборы рекламных проектов: исходная задача, решения, метрики и выводы.' : 'Практические материалы о Google Ads, Meta Ads, аналитике и экономике рекламы.'}
        url={routeBase}
      />
      <section
        data-blog-ui="true"
        className="marketing-typography blog-page blog-page--list relative min-h-screen overflow-hidden bg-background px-4 pb-16 pt-28 sm:px-6 md:pb-20 md:pt-32"
        style={{ contain: 'layout style paint' }}
      >
        {/* Плексус-сеть на весь список: карточки почти непрозрачные, сеть видна в промежутках и не мешает чтению */}
        <InViewPlexus />

        <div className="relative z-10 mx-auto max-w-7xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={isCasesRoute ? 'mb-10 text-center md:mb-14' : 'mb-8 max-w-3xl md:mb-10'}>
            <div className={`mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary ${isCasesRoute ? 'mx-auto' : ''}`}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {isCasesRoute ? `Кейсы · ${scopedArticles.length}` : `Практический блог · ${russianCountLabel(scopedArticles.length, ['статья', 'статьи', 'статей'])}`}
            </div>
            <h1 className="text-balance text-4xl font-bold leading-[1.03] tracking-[-0.04em] sm:text-5xl md:text-6xl">
              {isCasesRoute ? 'Кейсы и ' : 'Решения для '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {isCasesRoute ? 'разборы' : 'реальных задач'}
              </span>
            </h1>
            <p className={`mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground ${isCasesRoute ? 'mx-auto' : ''}`}>
              {isCasesRoute
                ? 'В каждом материале — исходная задача, принятые решения, цифры и ограничения результата.'
                : 'Выберите, что нужно решить. Покажу разборы, которые помогают принять решение, а не пересказывают справку рекламного кабинета.'}
            </p>
          </motion.div>

          {!isCasesRoute && (
            <>
              <section aria-labelledby="blog-goal-heading" className="mb-7">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 id="blog-goal-heading" className="text-sm font-semibold text-foreground">
                    Что хотите улучшить
                  </h2>
                  <button
                    type="button"
                    onClick={() => setMobileSearchOpen((open) => !open)}
                    aria-expanded={mobileSearchOpen}
                    aria-controls="blog-search-wrap"
                    className="blog-touch-target inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-card/55 text-muted-foreground transition hover:border-primary/40 hover:text-primary sm:hidden"
                    aria-label={mobileSearchOpen ? 'Закрыть поиск' : 'Открыть поиск по статьям'}
                  >
                    <Search className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {BLOG_GOALS.map((goal, goalIndex) => {
                    const GoalIcon = goal.icon;
                    const isActive = activeGoal === goal.id;
                    return (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => setActiveGoal(isActive ? '' : goal.id)}
                        aria-pressed={isActive}
                        className={`${goalIndex === BLOG_GOALS.length - 1 && !showAllGoals ? 'hidden sm:flex' : 'flex'} blog-touch-target min-h-[68px] items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                          isActive
                            ? 'border-primary bg-gradient-to-r from-primary/25 to-accent/15 text-foreground shadow-lg shadow-primary/10'
                            : 'border-border/80 bg-card/55 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                        }`}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${isActive ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-background/50 text-muted-foreground'}`}>
                          <GoalIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{goal.label}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{goal.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextShown = !showAllGoals;
                    setShowAllGoals(nextShown);
                    if (!nextShown && activeGoal === BLOG_GOALS[BLOG_GOALS.length - 1].id) {
                      setActiveGoal('');
                    }
                  }}
                  className="blog-touch-target mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary sm:hidden"
                  aria-expanded={showAllGoals}
                >
                  {showAllGoals ? 'Скрыть дополнительные темы' : 'Показать больше тем'}
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAllGoals ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              </section>

              <div id="blog-search-wrap" className={`relative mb-8 ${mobileSearchOpen ? 'block' : 'hidden sm:block'}`}>
                <label htmlFor="blog-search" className="sr-only">Поиск по статьям</label>
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="blog-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Поиск по теме, каналу или метрике"
                  className="h-12 w-full rounded-2xl border border-border bg-card/70 pl-11 pr-4 text-sm outline-none backdrop-blur-sm focus:border-primary focus:ring-2 focus:ring-primary/15 md:text-base"
                />
              </div>

              {scopedArticles.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card/70 p-8 text-center">
                  <h2 className="text-xl font-semibold">Раздел пока пуст</h2>
                  <p className="mt-2 text-muted-foreground">Опишите задачу — подскажу, с чего начать разбор.</p>
                </div>
              ) : !featuredArticle ? (
                <div className="rounded-2xl border border-border bg-card/70 p-8 text-center">
                  <h2 className="text-xl font-semibold">По этой задаче ничего не найдено</h2>
                  <p className="mt-2 text-muted-foreground">Сбросьте выбор или попробуйте другое ключевое слово.</p>
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setActiveGoal(''); }}
                    className="blog-touch-target mt-4 rounded-xl border border-primary/30 px-5 text-sm font-semibold text-primary hover:bg-primary/10"
                  >
                    Показать все статьи
                  </button>
                </div>
              ) : (
                <>
                  <article className="group overflow-hidden rounded-3xl border border-primary/25 bg-card/65 shadow-2xl shadow-primary/[0.06]">
                    <button
                      type="button"
                      onClick={() => navigate(`/blog/${featuredArticle.slug}`)}
                      className="grid w-full text-left md:grid-cols-[minmax(0,1.02fr)_minmax(320px,0.98fr)]"
                    >
                      <div className="relative min-h-[230px] overflow-hidden bg-background/50 sm:min-h-[300px]">
                        <img
                          src={hasCustomCover(featuredArticle.image) ? featuredArticle.image : '/images/brand/whale-wizard.webp'}
                          alt=""
                          loading="eager"
                          decoding="async"
                          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
                          onError={(event) => {
                            event.currentTarget.src = '/images/brand/whale-wizard.webp';
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent md:bg-gradient-to-r md:from-transparent md:to-card/60" aria-hidden="true" />
                        <span className="absolute bottom-4 left-4 rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.05em] text-white backdrop-blur-sm">
                          Рекомендуем
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-col justify-center p-5 sm:p-7 md:p-9">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">{featuredArticle.category}</p>
                        <h2 className="mt-3 text-balance text-2xl font-bold leading-tight tracking-[-0.025em] text-foreground transition group-hover:text-primary sm:text-3xl">
                          {featuredArticle.title}
                        </h2>
                        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                          {featuredArticle.description}
                        </p>
                        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{featuredArticle.date}</span>
                          <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{formatReadTime(featuredArticle.readTime)}</span>
                        </div>
                        <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                          Читать статью <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </span>
                      </div>
                    </button>
                  </article>

                  {feedArticles.length > 0 && (
                    <section className="mt-10" aria-labelledby="blog-feed-heading">
                      <div className="mb-4 flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Ещё по теме</p>
                          <h2 id="blog-feed-heading" className="mt-1 text-2xl font-bold">Практические разборы</h2>
                        </div>
                        <span className="text-xs text-muted-foreground">{russianCountLabel(feedArticles.length, ['материал', 'материала', 'материалов'])}</span>
                      </div>
                      <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/80 bg-card/50">
                        {feedArticles.map((article, index) => (
                          <motion.article
                            key={article.slug}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: Math.min(index, 5) * 0.04 }}
                            className="group"
                          >
                            <button
                              type="button"
                              onClick={() => navigate(`/blog/${article.slug}`)}
                              className="grid w-full grid-cols-[88px_minmax(0,1fr)] items-center gap-3 p-3 text-left transition hover:bg-primary/[0.05] sm:grid-cols-[136px_minmax(0,1fr)_auto] sm:gap-5 sm:p-4"
                            >
                              <div className="aspect-[4/3] overflow-hidden rounded-xl bg-background/60 sm:aspect-[16/10]">
                                <img
                                  src={hasCustomCover(article.image) ? article.image : '/images/brand/whale-wizard.webp'}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                                  onError={(event) => {
                                    event.currentTarget.src = '/images/brand/whale-wizard.webp';
                                  }}
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-primary sm:text-xs">{article.category}</p>
                                <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground transition group-hover:text-primary sm:text-lg">
                                  {article.title}
                                </h3>
                                <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground sm:text-xs">
                                  <span>{article.date}</span>
                                  <span>{formatReadTime(article.readTime)}</span>
                                </div>
                              </div>
                              <ArrowRight className="hidden h-5 w-5 text-primary transition-transform group-hover:translate-x-1 sm:block" aria-hidden="true" />
                            </button>
                          </motion.article>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          )}

          {isCasesRoute && (
            <>
          <div className="mb-5">
            <label htmlFor="blog-search" className="sr-only">Поиск по статьям</label>
            <input
              id="blog-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={isCasesRoute ? 'Поиск по нише, каналу или метрике' : 'Поиск по теме, каналу или метрике'}
              className="w-full rounded-xl border border-border bg-card/70 px-4 py-3 text-sm md:text-base outline-none ring-0 focus:border-primary backdrop-blur-sm"
            />
          </div>

          {categories.length > 1 && (
            <div className="blog-category-chips -mx-1 mb-8 flex gap-2 overflow-x-auto px-1 pb-2" role="tablist" aria-label="Категории статей">
              <button
                role="tab"
                aria-selected={activeCategory === ''}
                onClick={() => setActiveCategory('')}
                className={`blog-touch-target shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${activeCategory === '' ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}
              >
                Все
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  role="tab"
                  aria-selected={activeCategory === category}
                  onClick={() => setActiveCategory(activeCategory === category ? '' : category)}
                  className={`blog-touch-target shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${activeCategory === category ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}
                >
                  {category}
                </button>
              ))}
            </div>
          )}

          {scopedArticles.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card/70 p-8 text-center">
              <h2 className="text-xl font-semibold mb-2">Раздел пока пуст</h2>
              <p className="text-muted-foreground mb-4">Если у вас есть конкретная задача, опишите её — подскажу, с чего начать разбор.</p>
              <button
                onClick={goToContact}
                className="blog-touch-target inline-flex items-center justify-center px-5 py-3 rounded-xl font-medium text-white bg-gradient-to-r from-primary to-accent hover:opacity-95 transition-opacity"
              >
                Обсудить задачу
              </button>
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card/70 p-8 text-center">
              <h2 className="text-xl font-semibold mb-2">Ничего не найдено</h2>
              <p className="text-muted-foreground mb-4">Попробуйте другое ключевое слово или сбросьте фильтр категории.</p>
              <button
                onClick={() => { setSearchQuery(''); setActiveCategory(''); }}
                className="blog-touch-target inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                Сбросить фильтры
              </button>
            </div>
          ) : (
            <div className="blog-list-grid grid md:grid-cols-2 gap-6 md:gap-8">
              {filteredArticles.map((article, i) => (
                <motion.article
                  key={article.slug}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: Math.min(i, 6) * 0.05 }}
                  className="group relative cursor-pointer"
                  onClick={() => navigate(`${routeBase}/${article.slug}`)}
                >
                  <div className="blog-card h-full flex flex-col overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-sm transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10">
                    <div className="blog-card-cover relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-[#181430] via-[#121220] to-[#0d1726]">
                      {/* Градиентная подложка видна для статей без своей обложки и при ошибке загрузки картинки */}
                      <div className="absolute -top-10 -left-10 h-44 w-44 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
                      <div className="absolute -bottom-12 -right-8 h-48 w-48 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
                      <span className="absolute inset-0 flex select-none items-center justify-center text-3xl md:text-4xl font-black tracking-tight text-foreground/[0.08]" aria-hidden="true">Whale Wizard</span>
                      {hasCustomCover(article.image) && (
                        <>
                          <img
                            src={article.image}
                            alt=""
                            loading={i < 2 ? 'eager' : 'lazy'}
                            decoding="async"
                            className="relative h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                            onError={(event) => {
                              // Битая обложка — прячем картинку, остаётся градиентная подложка
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" aria-hidden="true" />
                        </>
                      )}
                      <span className="absolute left-3 bottom-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">{article.category}</span>
                    </div>
                    <div className="blog-card-body flex flex-1 flex-col p-5 md:p-6">
                      <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" aria-hidden="true" />{article.date}</span>
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{formatReadTime(article.readTime)}</span>
                      </div>
                      <h2 className="text-lg md:text-xl font-bold leading-snug group-hover:text-primary transition-colors line-clamp-2">{article.title}</h2>
                      <p className="text-muted-foreground mt-2.5 text-sm leading-relaxed line-clamp-3 flex-1">{article.description}</p>
                      <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
                        <span>{isCasesRoute ? 'Смотреть кейс' : 'Читать статью'}</span>
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          )}
            </>
          )}
        </div>
      </section>
    </>
  );
}

export default memo(BlogPageComponent);
