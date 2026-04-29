// src/app/context/ArticlesContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { fetchArticles, saveArticles, Article } from '../components/hooks/useArticlesApi';

interface ArticlesContextType {
  articles: Article[];
  loading: boolean;
  refreshArticles: () => Promise<void>;
  forceRefreshArticles: () => Promise<void>;
  updateArticles: (newArticles: Article[], password: string) => Promise<boolean>;
}

const ArticlesContext = createContext<ArticlesContextType | undefined>(undefined);

export const useArticles = () => {
  const context = useContext(ArticlesContext);
  if (!context) throw new Error('useArticles must be used within ArticlesProvider');
  return context;
};

interface Props {
  children: ReactNode;
}

export const ArticlesProvider = ({ children }: Props) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  const loadArticles = async () => {
    setLoading(true);
    const data = await fetchArticles();
    setArticles(data);
    setLoading(false);
  };

  const refreshArticles = async () => {
    await loadArticles();
  };

  const forceRefreshArticles = async () => {
    setLoading(true);
    const data = await fetchArticles({ bypassCache: true });
    setArticles(data);
    setLoading(false);
  };

  const updateArticles = async (newArticles: Article[], password: string) => {
    const result = await saveArticles(newArticles, password);
    if (result.success) {
      setArticles(result.articles);
    }
    return result.success;
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      loadArticles();
      return;
    }

    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (!isDesktop) {
      loadArticles();
      return;
    }

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void loadArticles();
    };

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(run, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timer = window.setTimeout(run, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <ArticlesContext.Provider value={{ articles, loading, refreshArticles, forceRefreshArticles, updateArticles }}>
      {children}
    </ArticlesContext.Provider>
  );
};
