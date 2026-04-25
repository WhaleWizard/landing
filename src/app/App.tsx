// src/app/App.tsx
import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { ArticlesProvider } from './context/ArticlesContext';
import CookieConsentManager from './components/cookie/CookieConsentManager';

type UiTheme = 'dark' | 'light';

function resolveTheme(): UiTheme {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem('ww_admin_theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [theme, setTheme] = useState<UiTheme>(() => resolveTheme());

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('ww_admin_theme', theme);
  }, [theme]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: UiTheme }>).detail;
      if (detail?.theme === 'dark' || detail?.theme === 'light') {
        setTheme(detail.theme);
      }
    };
    window.addEventListener('ww-theme-change', handler as EventListener);
    return () => window.removeEventListener('ww-theme-change', handler as EventListener);
  }, []);

  return (
    <div>
      <ArticlesProvider>
        <RouterProvider router={router} />
        <CookieConsentManager />
      </ArticlesProvider>
    </div>
  );
}
