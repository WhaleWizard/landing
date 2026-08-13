// src/app/context/ArticlesContext.tsx
import React, { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { fetchAdminArticles, fetchArticle, fetchArticles, saveArticles, Article } from '../components/hooks/useArticlesApi';

interface ArticlesContextType {
  articles: Article[];
  loading: boolean;
  error: string | null;
  refreshArticles: () => Promise<void>;
  loadArticle: (slug: string) => Promise<Article | null>;
  forceRefreshArticles: () => Promise<void>;
  forceRefreshAdminArticles: (password: string) => Promise<void>;
  updateArticles: (newArticles: Article[], password: string) => Promise<boolean>;
}

const ArticlesContext = createContext<ArticlesContextType | undefined>(undefined);

export const useArticles = () => {
  const context = useContext(ArticlesContext);
  if (!context) throw new Error('useArticles must be used within ArticlesProvider');
  return context;
};

type InitialLoadMode = 'immediate' | 'deferred' | 'manual';

export function articleVersion(article?: Article | null): number {
  for (const value of [article?.updatedAt, article?.publishedAt]) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  const legacyDate = String(article?.date || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return legacyDate
    ? Date.UTC(Number(legacyDate[3]), Number(legacyDate[2]) - 1, Number(legacyDate[1]))
    : 0;
}

export function mergePublicArticleSummaries(current: Article[], incoming: Article[]): Article[] {
  const currentBySlug = new Map(current.map((article) => [article.slug, article]));
  const merged = incoming.map((article) => {
    const existing = currentBySlug.get(article.slug);
    if (!existing) return article;

    const existingVersion = articleVersion(existing);
    const incomingVersion = articleVersion(article);
    // A late cache hit must not roll either a loaded body or a newer summary
    // back to an older CMS revision.
    if (incomingVersion < existingVersion) return existing;
    if (!article._summary || existing._summary) return article;
    // A build-time seed is safe to keep only while it describes the same CMS
    // revision. If the article changed after the deploy, keep the summary
    // marker so BlogPage requests the current body by slug.
    if (incomingVersion > existingVersion) return article;
    return {
      ...existing,
      ...article,
      content: existing.content,
      _summary: false,
    };
  });

  const incomingSlugs = new Set(incoming.map((article) => article.slug));
  // A live article page can be newer than an edge-cached summary list. Keep
  // its already loaded body until navigation/reload instead of redirecting the
  // reader away merely because that older list has not observed the slug yet.
  for (const article of current) {
    if (!article._summary && !incomingSlugs.has(article.slug)) merged.push(article);
  }
  return merged;
}

export function mergeArticleDetailResult(
  current: Article[],
  slug: string,
  incoming: Article | null,
  expected?: Article | null,
): Article[] {
  const index = current.findIndex((article) => article.slug === slug);
  const expectedVersion = articleVersion(expected);

  if (!incoming) {
    if (index < 0 || !expected) return current;
    const existing = current[index];
    // A 404 only applies to the summary revision that initiated this request.
    // It must never delete a newer summary or a full body loaded in parallel.
    if (!existing._summary || articleVersion(existing) > expectedVersion) return current;
    return current.filter((article) => article.slug !== slug);
  }

  const incomingVersion = articleVersion(incoming);
  if (incomingVersion < expectedVersion) return current;
  if (index < 0) {
    // The article disappeared from a newer list while this request was in
    // flight. Do not resurrect it with the old detail response.
    return expected ? current : [...current, incoming];
  }

  const existing = current[index];
  const existingVersion = articleVersion(existing);
  if (existingVersion > incomingVersion) return current;
  if (existingVersion === incomingVersion && !existing._summary) return current;

  const next = [...current];
  next[index] = incoming;
  return next;
}

export function shouldReuseArticleDetailRequest(pendingVersion: number, expectedVersion: number): boolean {
  return pendingVersion >= expectedVersion;
}

interface PendingArticleDetailRequest {
  id: symbol;
  expectedVersion: number;
  promise: Promise<Article | null>;
}

const INLINE_SUMMARY_STRING_FIELDS = [
  'slug',
  'title',
  'category',
  'readTime',
  'date',
  'description',
  'content',
  'image',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasSeedSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isInlineArticleSummary(value: unknown): value is Article {
  if (!isRecord(value) || value._summary !== true || value.content !== '') return false;
  if (!hasSeedSlug(value.slug)) return false;
  if (!INLINE_SUMMARY_STRING_FIELDS.every((field) => typeof value[field] === 'string')) return false;
  if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== 'string'))) {
    return false;
  }
  if (value.caseData !== undefined && !isRecord(value.caseData)) return false;
  return true;
}

/**
 * Detail routes embed one complete article, while /blog and /cases embed a
 * compact array of public summaries. `null` distinguishes an invalid or
 * unrelated script from an intentionally empty, authoritative list (`[]`).
 */
export function parseArticleSeed(value: unknown): Article[] | null {
  if (Array.isArray(value)) {
    return value.every(isInlineArticleSummary) ? value : null;
  }

  // Keep the established detail-seed contract deliberately permissive: the
  // server owns the full Article shape and older generated pages may not have
  // fields added to the CMS later.
  if (isRecord(value) && hasSeedSlug(value.slug)) return [value as unknown as Article];
  return null;
}

interface InlineArticleSeed {
  articles: Article[];
  present: boolean;
}

/**
 * Страница статьи приезжает с полным материалом, а /blog и /cases — с лёгким
 * списком карточек. Оба варианта можно показать сразу; актуальная публичная
 * выдача догружается следом, не задерживая первую отрисовку.
 */
function readArticleSeed(): InlineArticleSeed {
  const missing = { articles: [], present: false };
  if (typeof document === 'undefined') return missing;
  const node = document.getElementById('ww-article-seed');
  if (!node?.textContent) return missing;
  try {
    const articles = parseArticleSeed(JSON.parse(node.textContent));
    return articles === null ? missing : { articles, present: true };
  } catch {
    return missing;
  }
}

interface Props {
  children: ReactNode;
  initialLoad?: InitialLoadMode;
}

export const ArticlesProvider = ({ children, initialLoad = 'immediate' }: Props) => {
  const [initialSeed] = useState<InlineArticleSeed>(() => (
    initialLoad === 'manual'
      ? { articles: [], present: false }
      : readArticleSeed()
  ));
  const [articles, setArticles] = useState<Article[]>(() => initialSeed.articles);
  const seededRef = useRef(initialSeed.present);
  const [loading, setLoading] = useState(!seededRef.current);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const detailRequests = useRef(new Map<string, PendingArticleDetailRequest>());

  const runArticlesRequest = useCallback(async (
    loader: () => Promise<Article[]>,
    silent = false,
    preserveLoadedDetails = false,
  ) => {
    const sequence = ++requestSequence.current;
    // Догрузка поверх вложенных в страницу данных идёт молча: включённый
    // индикатор подменил бы уже показанный текст статьи скелетоном.
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await loader();
      // Быстрый переход или повторное обновление не должны позволять старому
      // медленному ответу перезаписать результат последнего действия.
      if (sequence === requestSequence.current) {
        setArticles((current) => (
          preserveLoadedDetails ? mergePublicArticleSummaries(current, data) : data
        ));
      }
    } catch (requestError) {
      // Молчаливая догрузка не должна рушить уже показанную статью экраном
      // ошибки: на странице есть всё, что нужно читателю.
      if (sequence === requestSequence.current && !silent) {
        setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить публикации');
      }
      throw requestError;
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  const loadArticles = useCallback(async () => {
    await runArticlesRequest(() => fetchArticles(), seededRef.current, true);
  }, [runArticlesRequest]);

  const refreshArticles = useCallback(async () => {
    await loadArticles();
  }, [loadArticles]);

  const forceRefreshArticles = useCallback(async () => {
    await runArticlesRequest(() => fetchArticles({ bypassCache: true }), false, true);
  }, [runArticlesRequest]);

  const forceRefreshAdminArticles = useCallback(async (password: string) => {
    await runArticlesRequest(() => fetchAdminArticles(password));
  }, [runArticlesRequest]);

  const loadArticle = useCallback((slug: string): Promise<Article | null> => {
    const normalizedSlug = String(slug || '').trim();
    const expected = articles.find((item) => item.slug === normalizedSlug);
    const expectedVersion = articleVersion(expected);
    const pending = detailRequests.current.get(normalizedSlug);
    if (pending && shouldReuseArticleDetailRequest(pending.expectedVersion, expectedVersion)) {
      return pending.promise;
    }

    const requestId = Symbol(normalizedSlug);
    const request = (async () => {
      setError(null);
      try {
        const article = await fetchArticle(normalizedSlug, {
          // A summary marker means the list observed a newer CMS revision than
          // the full body in memory. Do not satisfy that request from an older
          // stale edge entry.
          bypassCache: Boolean(expected?._summary),
        });
        if (article && articleVersion(article) < expectedVersion) {
          throw new Error('Получена устаревшая версия публикации. Повторите загрузку.');
        }
        setArticles((current) => mergeArticleDetailResult(current, normalizedSlug, article, expected));
        return article;
      } catch (requestError) {
        if (detailRequests.current.get(normalizedSlug)?.id === requestId) {
          setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить публикацию');
        }
        throw requestError;
      } finally {
        if (detailRequests.current.get(normalizedSlug)?.id === requestId) {
          detailRequests.current.delete(normalizedSlug);
        }
      }
    })();

    detailRequests.current.set(normalizedSlug, {
      id: requestId,
      expectedVersion,
      promise: request,
    });
    return request;
  }, [articles]);

  const updateArticles = useCallback(async (newArticles: Article[], password: string) => {
    const sequence = ++requestSequence.current;
    const result = await saveArticles(newArticles, password);
    if (result.success && sequence === requestSequence.current) {
      setArticles(result.articles);
    }
    return result.success;
  }, []);

  useEffect(() => {
    // Вход в админку не должен заранее тянуть публичную выдачу: после успешной
    // проверки пароля Admin сам загружает полный набор материалов.
    if (initialLoad === 'manual') {
      setLoading(false);
      setError(null);
      return;
    }

    // В блоге и кейсах материалы — основной контент первого экрана, поэтому
    // ожидание requestIdleCallback только ухудшает LCP и воспринимаемую скорость.
    if (initialLoad === 'immediate') {
      void loadArticles().catch(() => undefined);
      return;
    }

    if (typeof window === 'undefined') {
      void loadArticles().catch(() => undefined);
      return;
    }

    // Загрузку статей откладываем до простоя браузера НА ВСЕХ устройствах:
    // раньше мобильные (самые слабые) грузили список сразу, конкурируя
    // с отрисовкой первого экрана.
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void loadArticles().catch(() => undefined);
    };

    const idleWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(run, { timeout: 1200 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(idleId);
      };
    }

    const timer = globalThis.setTimeout(run, 600);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [initialLoad, loadArticles]);

  useEffect(() => () => {
    requestSequence.current += 1;
  }, []);

  return (
    <ArticlesContext.Provider value={{ articles, loading, error, refreshArticles, loadArticle, forceRefreshArticles, forceRefreshAdminArticles, updateArticles }}>
      {children}
    </ArticlesContext.Provider>
  );
};
