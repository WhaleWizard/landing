// src/app/pages/BlogPage.tsx
import { AnimatePresence, motion, useInView, useScroll, useSpring } from 'motion/react';
import { AlertTriangle, Clock, ArrowRight, ArrowLeft, Calendar, Download, X, ListTree, Sparkles } from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useEffect, useState, useRef, useCallback, useMemo, memo, lazy, Suspense } from 'react';
import SEO from '../components/SEO';
import { useArticles } from '../context/ArticlesContext';
import RouteSkeleton from '../components/RouteSkeleton';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { hasCustomCover } from '../utils/articleCover';
import { formatReadTime } from '../utils/articleMeta';
import { useScrollTo } from '../components/hooks/useScrollTo';
import CaseArticleView from '../components/CaseArticleView';

const PlexusBackdrop = lazy(() => import('../components/PlexusBackdrop'));

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
  const [selectedArticle, setSelectedArticle] = useState(null);
  // Поддержка /blog?search=… — этот формат заявлен в JSON-LD SearchAction (SEO.tsx)
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  const [activeCategory, setActiveCategory] = useState('');
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
      const article = allArticles.find((a) => a.slug === slug && (isCasesRoute ? a.category === 'Кейсы' : a.category !== 'Кейсы'));
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
  const scopedArticles = allArticles.filter((article) => (isCasesRoute ? article.category === 'Кейсы' : article.category !== 'Кейсы'));
  const categories = [...new Set(scopedArticles.map((article) => article.category).filter(Boolean))];
  const normalizedQueryTokens = normalizeTokens(searchQuery);
  const filteredArticles = scopedArticles.filter((article) => {
    if (activeCategory && article.category !== activeCategory) return false;
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

  if (loading) return <RouteSkeleton />;

  if (selectedArticle) {
    const relatedArticles = extractRelatedArticles(
      allArticles.filter((article) => (isCasesRoute ? article.category === 'Кейсы' : article.category !== 'Кейсы')),
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
        <SEO
          title={seoTitle}
          description={seoDescription}
          url={`${routeBase}/${selectedArticle.slug}`}
          type="article"
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
          <div className="relative overflow-hidden pt-16 pb-12 md:pt-24 md:pb-20">
            {/* Орбы + плексус только в шапке статьи — под текстом их нет, чтобы не мешать чтению */}
            <ArticleHeroBackdrop />
            <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
              <div className="flex flex-col gap-3 mb-4 md:mb-0 md:block">
                <nav className="text-xs text-muted-foreground" aria-label="breadcrumb">
                  <button onClick={goHome} className="hover:text-primary bg-transparent border-none cursor-pointer p-0">Главная</button>
                  <span className="mx-2">›</span>
                  <button onClick={goToBlogList} className="hover:text-primary bg-transparent border-none cursor-pointer p-0">
                    {isCasesRoute ? 'Кейсы' : 'Блог'}
                  </button>
                  <span className="mx-2">›</span>
                  <span className="text-foreground break-words">{selectedArticle.title}</span>
                </nav>
              </div>

              <button onClick={goToBlogList} className="blog-touch-target inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8 bg-transparent border-none cursor-pointer">
                <ArrowLeft className="w-4 h-4" /><span>{isCasesRoute ? 'Все кейсы' : 'Все статьи'}</span>
              </button>
              <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-5">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="px-3 py-1 rounded-full bg-primary/20 text-primary font-medium">{selectedArticle.category}</span>
                  <div className="flex items-center gap-1 text-muted-foreground"><Clock className="w-4 h-4" /><span>{formatReadTime(selectedArticle.readTime)}</span></div>
                  <div className="flex items-center gap-1 text-muted-foreground"><Calendar className="w-4 h-4" /><span>{selectedArticle.date}</span></div>
                </div>
                <h1 ref={articleTitleRef} tabIndex={-1} className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent focus:outline-none">{selectedArticle.title}</h1>
                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed border-l-4 border-primary/50 pl-4">{seoDescription}</p>
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
                  fetchPriority="high"
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
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="blog-reading-wrap max-w-3xl mx-auto px-4 sm:px-6 pb-20">
            {selectedArticle.summary && (
              <aside className="mb-8 rounded-2xl border border-primary/30 bg-primary/10 p-5">
                <h2 className="text-lg font-semibold mb-2">Коротко</h2>
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

            {toc.length >= 3 && (
              <details className="blog-toc group mb-8 rounded-2xl border border-border bg-card/40 open:bg-card/60 transition-colors">
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
      <SEO
        title={isCasesRoute ? 'Кейсы рекламных проектов' : 'Блог о рекламе и аналитике'}
        description={isCasesRoute ? 'Разборы рекламных проектов: исходная задача, решения, метрики и выводы.' : 'Практические материалы о Google Ads, Meta Ads, аналитике и экономике рекламы.'}
        url={routeBase}
      />
      <section
        data-blog-ui="true"
        className="marketing-typography blog-page blog-page--list relative min-h-screen overflow-hidden bg-background py-20 px-4 sm:px-6"
        style={{ contain: 'layout style paint' }}
      >
        {/* Плексус-сеть на весь список: карточки почти непрозрачные, сеть видна в промежутках и не мешает чтению */}
        <InViewPlexus />

        <div className="relative z-10 max-w-6xl mx-auto">
          <div className="flex justify-end mb-4"><button onClick={goHome} className="blog-touch-target text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer bg-transparent border-none">← На главную</button></div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10 md:mb-14">
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {isCasesRoute ? `Кейсы · ${scopedArticles.length}` : `База знаний · ${scopedArticles.length} статей`}
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold">
              {isCasesRoute ? 'Кейсы и ' : 'Практика '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {isCasesRoute ? 'разборы' : 'рекламы и аналитики'}
              </span>
            </h1>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto text-base">
              {isCasesRoute
                ? 'В каждом материале — исходная задача, принятые решения, цифры и ограничения результата.'
                : 'Разборы настройки, измерения и решений по данным — без пересказа справки рекламных кабинетов.'}
            </p>
          </motion.div>

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
        </div>
      </section>
    </>
  );
}

export default memo(BlogPageComponent);
