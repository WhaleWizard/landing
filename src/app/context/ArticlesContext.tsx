// src/app/context/ArticlesContext.tsx
import React, { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { fetchAdminArticles, fetchArticles, saveArticles, Article } from '../components/hooks/useArticlesApi';

interface ArticlesContextType {
  articles: Article[];
  loading: boolean;
  error: string | null;
  refreshArticles: () => Promise<void>;
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

interface Props {
  children: ReactNode;
  initialLoad?: InitialLoadMode;
}

export const ArticlesProvider = ({ children, initialLoad = 'immediate' }: Props) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const runArticlesRequest = useCallback(async (loader: () => Promise<Article[]>) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const data = await loader();
      // Быстрый переход или повторное обновление не должны позволять старому
      // медленному ответу перезаписать результат последнего действия.
      if (sequence === requestSequence.current) setArticles(data);
    } catch (requestError) {
      if (sequence === requestSequence.current) {
        setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить публикации');
      }
      throw requestError;
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  const loadArticles = useCallback(async () => {
    await runArticlesRequest(() => fetchArticles());
  }, [runArticlesRequest]);

  const refreshArticles = useCallback(async () => {
    await loadArticles();
  }, [loadArticles]);

  const forceRefreshArticles = useCallback(async () => {
    await runArticlesRequest(() => fetchArticles({ bypassCache: true }));
  }, [runArticlesRequest]);

  const forceRefreshAdminArticles = useCallback(async (password: string) => {
    await runArticlesRequest(() => fetchAdminArticles(password));
  }, [runArticlesRequest]);

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
    <ArticlesContext.Provider value={{ articles, loading, error, refreshArticles, forceRefreshArticles, forceRefreshAdminArticles, updateArticles }}>
      {children}
    </ArticlesContext.Provider>
  );
};
