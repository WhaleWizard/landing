// src/app/pages/BlogPage.tsx
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  ChevronDown,
  Clock,
  Download,
  ListTree,
  Megaphone,
  Search,
  Smartphone,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useEffect, useState, useRef, useCallback, useMemo, memo, lazy, Suspense } from 'react';
import SEO from '../components/SEO';
import Navbar from '../components/Navbar';
import PageNav from '../components/PageNav';
import { isCaseArticle } from '../utils/articleCategory';
import { useArticles } from '../context/ArticlesContext';
import type { Article } from '../components/hooks/useArticlesApi';
import RouteSkeleton from '../components/RouteSkeleton';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { hasCustomCover } from '../utils/articleCover';
import { formatReadTime } from '../utils/articleMeta';
import { useAmbientVisibility } from '../components/hooks/useAmbientVisibility';
import DeferredImage from '../components/DeferredImage';
import { optimizeArticleContentImages } from '../utils/articleContentImages';
import ArticlesLoadError from '../components/ArticlesLoadError';
import { useManagedTitleFit } from '../utils/contentTypography';
import { smartTitleBreaks } from '../utils/smartTitle';

const PlexusBackdrop = lazy(() => import('../components/PlexusBackdrop'));
const Footer = lazy(() => import('../components/Footer'));
// Разметка кейса тянет за собой cases-finder.css (~36 КБ). Статический импорт
// грузил его и на списке статей, где ни одного .case-article-* нет.
const CaseArticleView = lazy(() => import('../components/CaseArticleView'));
const SITE_URL = 'https://www.whalewzrd.com';

// Потолок строк в заголовках. Заголовки статей приходят из CMS и бывают
// сколь угодно длинными: без потолка самый длинный разъезжался на семь строк.
// Кегль подбирается вниз от заданного в вёрстке, вверх заголовок не растёт.
const ARTICLE_TITLE_LINES = { titleMaxLinesDesktop: 2, titleMaxLinesMobile: 3 };
const LIST_TITLE_LINES = { titleMaxLinesDesktop: 1, titleMaxLinesMobile: 2 };

type BlogTopicRule = {
  id: string;
  label: string;
  description: string;
  icon: typeof BarChart3;
  categories: string[];
  tokens: string[];
};

type BlogTopic = BlogTopicRule & { count: number };

// Темы блога. Раньше здесь были четыре «цели» с зашитым списком категорий:
// они не совпадали с тем, о чём статьи написаны на самом деле, и читатель,
// которому нужен был Google или приложения, не мог их найти. Теперь темы
// подбираются по категории и ключевым словам самой статьи.
const BLOG_TOPIC_RULES: BlogTopicRule[] = [
  {
    id: 'meta',
    label: 'Meta Ads',
    description: 'Facebook и Instagram',
    icon: Megaphone,
    categories: ['Meta Ads', 'Ретаргетинг'],
    tokens: ['meta ads', 'facebook', 'instagram', 'ретаргет'],
  },
  {
    id: 'google',
    label: 'Google Ads',
    description: 'Поиск, PMax и YouTube',
    icon: Search,
    categories: ['Google Ads'],
    tokens: ['google ads', 'performance max', 'pmax', 'shopping', 'youtube'],
  },
  {
    id: 'apps',
    label: 'Приложения',
    description: 'Установки и события в приложении',
    icon: Smartphone,
    categories: ['Mobile Apps', 'Приложения'],
    tokens: ['приложен', 'app install', 'mobile app'],
  },
  {
    id: 'analytics',
    label: 'Аналитика и данные',
    description: 'Атрибуция, CAPI и отчёты',
    icon: BarChart3,
    categories: ['Аналитика', 'Reporting', 'CRM'],
    tokens: ['атрибуц', 'capi', 'дашборд', 'сквозная аналитика'],
  },
  {
    id: 'growth',
    label: 'Рост и экономика',
    description: 'Масштабирование, ниши, окупаемость',
    icon: TrendingUp,
    categories: ['E-commerce', 'B2B', 'GEO', 'Оптимизация', 'Стратегии', 'Запуск', 'Google + Meta'],
    tokens: ['масштабирован', 'рентабельн', 'окупаем'],
  },
];

// Подписи короткие: рядом стоит слово «Сначала», и «Сначала: Сначала новые»
// читалось как ошибка, а на узком экране занимало три строки.
const BLOG_SORTS = [
  { id: 'new', label: 'новые' },
  { id: 'old', label: 'старые' },
  { id: 'short', label: 'короткие' },
] as const;

type BlogSort = (typeof BLOG_SORTS)[number]['id'];

function articleHaystack(article: Article): string {
  return [
    article.title,
    article.description,
    article.category,
    Array.isArray(article.tags) ? article.tags.join(' ') : '',
  ].filter(Boolean).join(' ').toLowerCase();
}

function matchesTopic(article: Article, rule: BlogTopicRule): boolean {
  if (article.category && rule.categories.includes(article.category)) return true;
  if (rule.tokens.length === 0) return false;
  const haystack = articleHaystack(article);
  return rule.tokens.some((token) => haystack.includes(token));
}

/**
 * Темы для фильтра: сначала подготовленные, затем — категории, которые
 * ни в одну не попали. Благодаря этому новый раздел появляется в фильтре
 * сам, без правки кода, и ни одна статья не остаётся недоступной.
 */
function buildBlogTopics(articles: Article[]): BlogTopic[] {
  const covered = new Set<string>();
  const topics: BlogTopic[] = [];

  BLOG_TOPIC_RULES.forEach((rule) => {
    const matched = articles.filter((article) => matchesTopic(article, rule));
    if (matched.length === 0) return;
    matched.forEach((article) => covered.add(article.slug));
    topics.push({ ...rule, count: matched.length });
  });

  const leftovers = new Map<string, number>();
  articles.forEach((article) => {
    if (covered.has(article.slug) || !article.category) return;
    leftovers.set(article.category, (leftovers.get(article.category) || 0) + 1);
  });

  Array.from(leftovers.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .forEach(([category, count]) => {
      topics.push({
        id: `category:${category}`,
        label: category,
        description: 'Отдельная тема',
        icon: Sparkles,
        categories: [category],
        tokens: [],
        count,
      });
    });

  return topics;
}

/** Дата статьи числом: сначала ISO, затем формат «дд.мм.гггг» из админки. */
function articleTimestamp(article: Article): number {
  const iso = Date.parse(article.publishedAt || '');
  if (Number.isFinite(iso)) return iso;
  const match = String(article.date || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return 0;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function articleReadMinutes(article: Article): number {
  const match = String(article.readTime || '').match(/\d+/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

// Сеть следит за собой сама, поэтому обёртке нечего хранить в состоянии.
// Прежний useInView возвращал значение в React, и страница блога
// перерисовывалась на каждом пересечении границы экрана.
function InViewPlexus({ viewportBound = false }: { viewportBound?: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className={viewportBound ? 'sticky top-0 h-[100svh] w-full' : 'absolute inset-0'}>
        <Suspense fallback={null}>
          <PlexusBackdrop className="absolute inset-0 h-full w-full" />
        </Suspense>
      </div>
    </div>
  );
}

function ArticleHeroBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  // Пятна ставит на паузу CSS по атрибуту на этой же обёртке.
  useAmbientVisibility(ref);
  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="ww-ambient-motion absolute top-0 left-1/4 w-48 h-48 md:w-96 md:h-96 bg-primary/20 rounded-full blur-[128px] animate-pulse" style={{ willChange: 'opacity' }} />
      <div className="ww-ambient-motion absolute bottom-0 right-1/4 w-48 h-48 md:w-96 md:h-96 bg-accent/20 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }} />
      <Suspense fallback={null}>
        <PlexusBackdrop className="absolute inset-0 h-full w-full" />
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

function buildArticleSeoTitle(article: Article | null | undefined) {
  if (article?.seoTitle?.trim()) return article.seoTitle.trim();
  return `${article?.title || 'Статья'} — ${article?.category || 'Маркетинг'}`;
}

function buildArticleSeoDescription(article: Article | null | undefined) {
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

function extractRelatedArticles(allArticles: Article[], currentArticle: Article | null | undefined) {
  if (!currentArticle) return [];
  const currentTags = new Set((currentArticle.tags || []).map((tag) => String(tag).toLowerCase()));
  const currentTokens = new Set(normalizeTokens(`${currentArticle.title} ${currentArticle.description}`));

  return allArticles
    .filter((article) => article.slug !== currentArticle.slug)
    .sort((a, b) => {
      const score = (article: Article) => {
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

interface ZipDownload {
  href: string;
  target: string;
  fileName: string;
}

function CaseZipWarning({ download, onClose, onConfirm }: {
  download: ZipDownload | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
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
  const {
    articles: allArticles,
    loading,
    error: articlesError,
    refreshArticles,
    loadArticle,
  } = useArticles();
  const selectedArticle = useMemo(() => {
    if (!slug || loading) return null;
    return allArticles.find((article) => (
      article.slug === slug && (isCasesRoute ? isCaseArticle(article) : !isCaseArticle(article))
    )) ?? null;
  }, [allArticles, isCasesRoute, loading, slug]);
  // Поддержка /blog?search=… — этот формат заявлен в JSON-LD SearchAction (SEO.tsx)
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  const [activeTopic, setActiveTopic] = useState(() => new URLSearchParams(window.location.search).get('topic') || '');
  const [sort, setSort] = useState<BlogSort>(() => {
    const requested = new URLSearchParams(window.location.search).get('sort');
    return BLOG_SORTS.some((item) => item.id === requested) ? (requested as BlogSort) : 'new';
  });
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [pendingZipDownload, setPendingZipDownload] = useState<{ href: string; target: string; fileName: string } | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const articleTitleRef = useRef<HTMLHeadingElement | null>(null);
  const articleTitleFit = useManagedTitleFit<HTMLHeadingElement>(ARTICLE_TITLE_LINES, { minFontSize: 19 });
  // Тот же элемент нужен и для подгонки кегля, и для переноса фокуса на
  // заголовок после открытия статьи.
  const setArticleTitleRef = useCallback((node: HTMLHeadingElement | null) => {
    articleTitleRef.current = node;
    articleTitleFit(node);
  }, [articleTitleFit]);
  const listTitleFit = useManagedTitleFit<HTMLHeadingElement>(LIST_TITLE_LINES, { minFontSize: 22 });
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
      optimizeArticleContentImages(doc);
      // Второй проход санитайзера — не перестраховка, а закрытие разрыва.
      // Между первой очисткой и вставкой в страницу разметка разбирается и
      // собирается заново, а DOMPurify прямо предупреждает: часть конструкций
      // переживает очистку и меняет смысл при повторном разборе. Здесь
      // санитайзер — последнее, что трогает строку перед вставкой.
      //
      // Подсказки загрузки картинок при этом не теряются: `decoding` и
      // `fetchpriority` внесены во все три списка разрешённых атрибутов.
      return { articleHtml: sanitizeHtml(doc.body.innerHTML), toc: items };
    } catch {
      return { articleHtml: safe, toc: [] };
    }
  }, [selectedArticle]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [slug]);

  useEffect(() => {
    document.body.dataset.blogRoute = slug ? 'article' : 'list';
    return () => {
      delete document.body.dataset.blogRoute;
    };
  }, [slug]);

  useEffect(() => {
    if (slug && !loading && !articlesError && !selectedArticle) navigate(listUrl, { replace: true });
  }, [articlesError, listUrl, loading, navigate, selectedArticle, slug]);

  useEffect(() => {
    if (!slug || !selectedArticle?._summary) return;
    void loadArticle(slug).catch(() => undefined);
  }, [loadArticle, selectedArticle?._summary, slug]);

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
    // Узел запоминается сразу: к моменту уборки ссылка в ref может быть уже
    // пустой, и слушатель снимался бы не с того элемента.
    const content = contentRef.current;
    if (!content || !selectedArticle) return;

    const handler = (event: MouseEvent) => {
      const target = event.target;
      const link = target instanceof Element ? target.closest('a') : null;
      const href = link?.getAttribute('href') || '';
      if (href === '/#contact') {
        event.preventDefault();
        // Хеш сохраняется, а не отбрасывается ради последующего поиска секции:
        // главная поднимает адресуемый блок сразу, и переход не зависит от
        // того, успел ли загрузиться её чанк.
        navigate('/#contact');
        return;
      }

      if (isZipDownloadLink(href)) {
        event.preventDefault();
        setPendingZipDownload({
          href: (link as HTMLAnchorElement | null)?.href || href,
          target: link?.getAttribute('target') || '_blank',
          fileName: getDownloadFileName(href),
        });
      }
    };

    content.addEventListener('click', handler);
    return () => content.removeEventListener('click', handler);
  }, [selectedArticle, navigate]);

  const goToBlogList = useCallback(() => navigate(listUrl), [navigate, listUrl]);

  const openRelatedArticle = useCallback((nextSlug: string) => {
    navigate(`${routeBase}/${nextSlug}${preservedCaseSearch}`);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [navigate, preservedCaseSearch, routeBase]);

  const goToContact = useCallback(() => {
    navigate('/#contact');
  }, [navigate]);

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

  // Сначала раздел (блог/кейсы), затем тема, затем поиск — раньше поиск
  // игнорировал раздел и на /cases находил статьи блога.
  const scopedArticles = allArticles.filter((article) => (isCasesRoute ? isCaseArticle(article) : !isCaseArticle(article)));
  const topics = useMemo(() => buildBlogTopics(scopedArticles), [scopedArticles]);
  const activeTopicRule = topics.find((topic) => topic.id === activeTopic) ?? null;
  const normalizedQueryTokens = normalizeTokens(searchQuery);
  const filteredArticles = scopedArticles
    .filter((article) => {
      if (activeTopicRule && !matchesTopic(article, activeTopicRule)) return false;
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
    })
    .sort((a, b) => {
      if (sort === 'short') return articleReadMinutes(a) - articleReadMinutes(b);
      const difference = articleTimestamp(a) - articleTimestamp(b);
      return sort === 'old' ? difference : -difference;
    });
  const featuredArticle = !isCasesRoute ? filteredArticles[0] ?? null : null;
  const feedArticles = !isCasesRoute ? filteredArticles.slice(1) : filteredArticles;

  // Тема, сортировка и поиск живут в адресе: такую ссылку можно отправить,
  // и она откроется с тем же набором статей. Чужие параметры (utm и прочие)
  // остаются нетронутыми.
  useEffect(() => {
    if (slug || isCasesRoute || loading) return;

    const params = new URLSearchParams(location.search);
    const apply = (key: string, value: string) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };

    apply('topic', activeTopicRule ? activeTopic : '');
    apply('sort', sort === 'new' ? '' : sort);
    apply('search', searchQuery.trim());

    const query = params.toString();
    const nextUrl = `/blog${query ? `?${query}` : ''}`;
    if (`${location.pathname}${location.search}` !== nextUrl) {
      navigate(nextUrl, { replace: true });
    }
  }, [activeTopic, activeTopicRule, isCasesRoute, loading, location.pathname, location.search, navigate, searchQuery, slug, sort]);

  if (loading) return <RouteSkeleton />;

  if (slug && selectedArticle?._summary) {
    if (articlesError) {
      return <ArticlesLoadError onRetry={() => loadArticle(slug).then(() => undefined)} />;
    }
    return <RouteSkeleton />;
  }

  if (selectedArticle) {
    const relatedArticles = extractRelatedArticles(
      allArticles.filter((article) => (isCasesRoute ? isCaseArticle(article) : !isCaseArticle(article))),
      selectedArticle,
    );
    const seoTitle = buildArticleSeoTitle(selectedArticle);
    const seoDescription = buildArticleSeoDescription(selectedArticle);

    if (isCasesRoute) {
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
          <Suspense fallback={<RouteSkeleton />}>
            <CaseArticleView
              article={selectedArticle}
              seoDescription={seoDescription}
              articleHtml={articleHtml}
              toc={toc}
              relatedArticles={relatedArticles}
              listHref={listUrl}
              relatedSearch={preservedCaseSearch}
              contentRef={contentRef}
              articleTitleRef={articleTitleRef}
              onBackToCases={goToBlogList}
              onContact={goToContact}
              onRelated={openRelatedArticle}
            />
          </Suspense>
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
              <PageNav
                crumbs={[
                  { label: 'Главная', to: '/' },
                  { label: 'Блог', to: '/blog' },
                  { label: selectedArticle.title },
                ]}
                backFallback="/blog"
                className="mb-6"
              />

              <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="max-w-5xl space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  <span className="rounded-lg border border-primary/25 bg-primary/15 px-3 py-1.5 font-semibold uppercase tracking-[0.04em] text-primary">{selectedArticle.category}</span>
                  <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-4 w-4" /><span>{formatReadTime(selectedArticle.readTime)}</span></div>
                  <div className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="h-4 w-4" /><span>{selectedArticle.date}</span></div>
                </div>
                <h1 ref={setArticleTitleRef} tabIndex={-1} className="text-balance text-[clamp(1.85rem,8vw,2.75rem)] font-bold leading-[1.08] tracking-[-0.032em] text-foreground focus:outline-none md:max-w-4xl">{smartTitleBreaks(selectedArticle.title)}</h1>
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
                  decoding="async"
                  fetchpriority="high"
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
                  Разбор по вашему проекту
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
                  <span className="relative text-sm md:text-base">Обсудить проект</span>
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
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
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
        <InViewPlexus viewportBound />

        <div className="relative z-10 mx-auto max-w-7xl">
          <PageNav
            crumbs={[
              { label: 'Главная', to: '/' },
              { label: 'Блог' },
            ]}
            backFallback="/"
            className="mb-7"
          />
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={isCasesRoute ? 'mb-10 text-center md:mb-14' : 'mb-8 max-w-3xl md:mb-10'}>
            <div className={`mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary ${isCasesRoute ? 'mx-auto' : ''}`}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {isCasesRoute ? `Кейсы · ${scopedArticles.length}` : `Практический блог · ${russianCountLabel(scopedArticles.length, ['статья', 'статьи', 'статей'])}`}
            </div>
            <h1 ref={listTitleFit} className="text-balance text-[clamp(1.9rem,9.6vw,2.6rem)] font-bold leading-[1.05] tracking-[-0.038em] md:text-[3.25rem]">
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
              <section aria-labelledby="blog-topic-heading" className="mb-7">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 id="blog-topic-heading" className="text-sm font-semibold text-foreground">
                    О чём хотите почитать
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
                  {topics.map((topic, topicIndex) => {
                    const TopicIcon = topic.icon;
                    const isActive = activeTopic === topic.id;
                    // По умолчанию видно три темы на телефоне и четыре на планшете
                    // и выше; остальные раскрывает кнопка под списком.
                    const visibility = showAllTopics
                      ? 'flex'
                      : topicIndex < 3
                        ? 'flex'
                        : topicIndex === 3
                          ? 'hidden sm:flex'
                          : 'hidden';
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => setActiveTopic(isActive ? '' : topic.id)}
                        aria-pressed={isActive}
                        className={`${visibility} blog-touch-target min-h-[68px] items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                          isActive
                            ? 'border-primary bg-gradient-to-r from-primary/25 to-accent/15 text-foreground shadow-lg shadow-primary/10'
                            : 'border-border/80 bg-card/55 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                        }`}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${isActive ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-background/50 text-muted-foreground'}`}>
                          <TopicIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{topic.label}</span>
                          <span className="mt-0.5 block truncate text-[11px] leading-snug text-muted-foreground">{topic.description}</span>
                        </span>
                        <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold tabular-nums ${isActive ? 'bg-primary/20 text-primary' : 'bg-background/60 text-muted-foreground'}`}>
                          {topic.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {topics.length > 3 && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextShown = !showAllTopics;
                      setShowAllTopics(nextShown);
                      // Свернули список — не оставляем активной тему, которую больше не видно.
                      if (!nextShown) {
                        const hiddenIndex = topics.findIndex((topic) => topic.id === activeTopic);
                        if (hiddenIndex >= 4) setActiveTopic('');
                      }
                    }}
                    className={`blog-touch-target mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary ${topics.length > 4 ? '' : 'sm:hidden'}`}
                    aria-expanded={showAllTopics}
                  >
                    {showAllTopics ? 'Свернуть темы' : `Показать все темы · ${topics.length}`}
                    <ChevronDown className={`h-4 w-4 transition-transform ${showAllTopics ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                )}

                {/* Порядок статей. Сделан кнопками, а не системным списком:
                    <select> выбивается из тёмного оформления сайта. */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Сначала:</span>
                  {BLOG_SORTS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSort(option.id)}
                      aria-pressed={sort === option.id}
                      className={`blog-touch-target inline-flex items-center rounded-full border px-3.5 text-xs font-medium transition ${
                        sort === option.id
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border/80 bg-card/55 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                  {(activeTopic || searchQuery.trim()) && (
                    <button
                      type="button"
                      onClick={() => { setActiveTopic(''); setSearchQuery(''); }}
                      className="blog-touch-target inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/55 px-3.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                    >
                      Сбросить <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground" role="status" aria-live="polite">
                    {russianCountLabel(filteredArticles.length, ['материал', 'материала', 'материалов'])}
                  </span>
                </div>
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

              {articlesError && scopedArticles.length === 0 ? (
                <ArticlesLoadError onRetry={refreshArticles} />
              ) : scopedArticles.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card/70 p-8 text-center">
                  <h2 className="text-xl font-semibold">Раздел пока пуст</h2>
                  <p className="mt-2 text-muted-foreground">Расскажите о проекте — подскажу, с чего начать.</p>
                </div>
              ) : !featuredArticle ? (
                <div className="rounded-2xl border border-border bg-card/70 p-8 text-center">
                  <h2 className="text-xl font-semibold">По этой теме пока ничего нет</h2>
                  <p className="mt-2 text-muted-foreground">Снимите фильтр или попробуйте другое ключевое слово.</p>
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setActiveTopic(''); }}
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
                          fetchpriority="high"
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
                                <DeferredImage
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


          {/* Перекрёстная связь разделов: из блога — в кейсы, чтобы список
              материалов не был тупиком. */}
          <section className="mt-12 overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-r from-primary/10 via-card/60 to-accent/10 p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Дальше по теме</p>
                <h2 className="mt-1.5 text-balance text-xl font-bold sm:text-2xl">Как это выглядит на реальных проектах</h2>
                <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
                  В кейсах — те же принципы, но с бюджетами, сроками и цифрами конкретных проектов.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/cases?from=blog')}
                className="group inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-accent px-6 font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03] active:scale-95"
              >
                <span className="text-sm md:text-base">Смотреть кейсы</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>
      </section>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </>
  );
}

export default memo(BlogPageComponent);
