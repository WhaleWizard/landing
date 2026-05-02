import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  Lock, LogIn, Save, Plus, Trash2, Sun, Moon,
  Search, Copy, Calendar, EyeOff, Upload, GripVertical
} from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useArticles } from '../context/ArticlesContext';
import { Article } from '../components/hooks/useArticlesApi';
import { API_ROUTES } from '../config';
import ArticleEditor from '../components/ArticleEditor';
import SEO from '../components/SEO';

function transliterate(text: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
    'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya', ' ': '-'
  };
  return text.toLowerCase().split('').map(ch => map[ch] || ch).join('')
    .replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function verifyAdminPassword(password: string): Promise<boolean> {
  const res = await fetch(API_ROUTES.adminArticles, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return false;
  const payload = await res.json().catch(() => ({}));
  return Boolean(payload?.success);
}

const themeTokens = {
  light: {
    '--adm-bg': '#f6f7fb',
    '--adm-fg': '#1a2030',
    '--adm-card': '#ffffff',
    '--adm-muted': '#eef1f8',
    '--adm-border': '#d8deec',
    '--adm-primary': '#6d5efc',
    '--adm-primary-strong': '#5e50f0',
    '--adm-danger': '#e0567a',
    '--adm-textarea-bg': '#ffffff',
    '--adm-input-bg': '#ffffff',
    '--adm-button-bg': '#6d5efc',
    '--adm-button-text': '#ffffff',
  },
  dark: {
    '--adm-bg': '#10141e',
    '--adm-fg': '#e8ecf4',
    '--adm-card': '#161c2a',
    '--adm-muted': '#212a3c',
    '--adm-border': 'rgba(135, 147, 180, 0.28)',
    '--adm-primary': '#8f83ff',
    '--adm-primary-strong': '#7f72ff',
    '--adm-danger': '#ff7f9e',
    '--adm-textarea-bg': '#10141e',
    '--adm-input-bg': '#10141e',
    '--adm-button-bg': '#8f83ff',
    '--adm-button-text': '#ffffff',
  }
};

function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('ww-admin-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem('ww-admin-theme', mode);
  }, [mode]);

  const vars = themeTokens[mode] as React.CSSProperties;

  useEffect(() => {
    if (!document.getElementById('prism-css')) {
      const link = document.createElement('link');
      link.id = 'prism-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css';
      document.head.appendChild(link);
    }
    if (!document.getElementById('prism-js')) {
      const script = document.createElement('script');
      script.id = 'prism-js';
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  return (
    <div style={{ ...vars, minHeight: '100vh' }} className="transition-colors duration-300">
      <div className="bg-[var(--adm-bg)] text-[var(--adm-fg)] min-h-screen">
        {children}
      </div>
    </div>
  );
}



const ADMIN_DND_TYPE = 'ADMIN_ARTICLE_ITEM';

interface AdminArticleItemProps {
  article: Article;
  index: number;
  onEdit: (article: Article) => void;
  onDuplicate: (article: Article) => void;
  onDelete: (slug: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
}


function AdminArticleItem({ article, index, onEdit, onDuplicate, onDelete, onMove }: AdminArticleItemProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ADMIN_DND_TYPE,
    item: { index },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [index]);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: ADMIN_DND_TYPE,
    drop: (dragged: { index: number }) => {
      if (dragged.index === index) return;
      onMove(dragged.index, index);
      dragged.index = index;
    },
    collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }) }),
  }), [index, onMove]);

  return (
    <div
      ref={(node) => drag(drop(node))}
      className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${isOver ? 'border-[var(--adm-primary)] bg-[var(--adm-primary)]/10' : 'border-[var(--adm-border)] bg-[var(--adm-card)] hover:bg-[var(--adm-muted)]/50'} ${isDragging ? 'opacity-60' : ''}`}
    >
      <button className="p-1.5 rounded-lg text-[var(--adm-fg)]/50 cursor-grab active:cursor-grabbing" title="Перетащить">
        <GripVertical className="w-4 h-4" />
      </button>
      <button onClick={() => onEdit(article)} className="flex-1 text-left truncate">
        <div className="font-medium truncate flex items-center gap-2">
          {article.title}
          {article.status === 'draft' ? (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">черновик</span>
          ) : article.publishedAt && new Date(article.publishedAt) > new Date() ? (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">запланирована</span>
          ) : (
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">опубл.</span>
          )}
        </div>
        <div className="text-xs text-[var(--adm-fg)]/60 truncate">{article.slug}</div>
      </button>
      <button onClick={() => onDuplicate(article)} className="p-1.5 rounded-lg hover:bg-[var(--adm-primary)]/10 text-[var(--adm-fg)]/60" title="Дублировать">
        <Copy className="w-4 h-4" />
      </button>
      <button onClick={() => onDelete(article.slug)} className="p-1.5 rounded-lg hover:bg-[var(--adm-danger)]/10 text-[var(--adm-danger)] transition-colors" title="Удалить">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function useFilteredArticles(articles: Article[]) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.slug.toLowerCase().includes(q)
    );
  }, [articles, query]);
  return { query, setQuery, filtered };
}

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const { articles, loading, forceRefreshArticles, updateArticles } = useArticles();
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [sourceLabel, setSourceLabel] = useState<string>('unknown');
  const navigate = useNavigate();
  const faqText = editingArticle?.faq?.map((item) => `${item.question}::${item.answer}`).join('\n') || '';
  const takeawaysText = editingArticle?.keyTakeaways?.join('\n') || '';

  const { query, setQuery, filtered } = useFilteredArticles(articles);

  const refreshHealth = async () => {
    try {
      const res = await fetch(`/api/health/content?_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const payload = await res.json().catch(() => null) as { source?: string } | null;
      if (payload?.source) setSourceLabel(payload.source);
    } catch { /* noop */ }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshHealth();
  }, [isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Введите пароль');
      return;
    }
    setAuthLoading(true);
    try {
      const ok = await verifyAdminPassword(password);
      if (ok) {
        setIsAuthenticated(true);
        setError('');
      } else {
        setError('Неверный пароль');
      }
    } catch {
      setError('Ошибка сети. Попробуйте еще раз.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleTitleChange = (title: string) => {
    if (!editingArticle) return;
    const newSlug = !slugManuallyEdited ? transliterate(title) : editingArticle.slug;
    setEditingArticle({ ...editingArticle, title, slug: newSlug });
  };

  const handleSlugChange = (slug: string) => {
    if (!editingArticle) return;
    setSlugManuallyEdited(true);
    setEditingArticle({ ...editingArticle, slug: transliterate(slug) });
  };

  const handleContentChange = (html: string) => {
    if (editingArticle) {
      setEditingArticle({ ...editingArticle, content: html });
    }
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`/api/admin/upload?password=${encodeURIComponent(password)}`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.url || null;
    } catch {
      return null;
    }
  };

  const handleSave = async (status: Article['status'] = 'published') => {
    if (!editingArticle) return;
    if (!editingArticle.title.trim()) {
      alert('Введите заголовок');
      return;
    }
    if (!editingArticle.slug.trim()) {
      alert('Введите slug');
      return;
    }

    const normalizedArticle: Article = {
      ...editingArticle,
      status,
      summary: editingArticle.summary?.trim() || editingArticle.description?.trim() || '',
      keyTakeaways: (editingArticle.keyTakeaways || []).map((item) => item.trim()).filter(Boolean),
      faq: (editingArticle.faq || [])
        .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() }))
        .filter((item) => item.question && item.answer),
    };

    let updatedArticles = [...articles];
    const conflictingArticle = updatedArticles.find((article) => (
      article.slug === normalizedArticle.slug && article.id !== normalizedArticle.id
    ));
    if (conflictingArticle) {
      alert(`Slug "${normalizedArticle.slug}" уже используется в статье "${conflictingArticle.title}". Выберите уникальный slug.`);
      return;
    }

    const nextId = () => Math.max(0, ...updatedArticles.map((a) => a.id), 0) + 1;
    const slugIndex = updatedArticles.findIndex((a) => a.slug === normalizedArticle.slug);
    if (slugIndex !== -1) {
      updatedArticles[slugIndex] = normalizedArticle;
    } else if (normalizedArticle.id && normalizedArticle.id !== 0) {
      const idIndex = updatedArticles.findIndex((a) => a.id === normalizedArticle.id);
      if (idIndex !== -1) {
        updatedArticles[idIndex] = { ...normalizedArticle, id: updatedArticles[idIndex].id };
      } else {
        updatedArticles.push(normalizedArticle);
      }
    } else {
      updatedArticles.push({ ...normalizedArticle, id: nextId() });
    }

    try {
      const success = await updateArticles(updatedArticles, password);
      if (success) {
        if (normalizedArticle.slug) {
          await fetch('/api/admin/article-versions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ password, slug: normalizedArticle.slug, article: normalizedArticle }),
          }).catch(() => {});
        }
        alert(status === 'draft' ? 'Черновик сохранён!' : 'Сохранено!');
        setEditingArticle(null);
        setSlugManuallyEdited(false);
        await forceRefreshArticles();
        await refreshHealth();
      } else {
        alert('Ошибка сохранения. Проверьте консоль (F12)');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      console.error('Ошибка при сохранении:', err);
      alert('Ошибка: ' + message);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!confirm('Удалить статью?')) return;
    const updated = articles.filter(a => a.slug !== slug);
    try {
      const success = await updateArticles(updated, password);
      if (success) {
        if (editingArticle?.slug === slug) setEditingArticle(null);
        await forceRefreshArticles();
        await refreshHealth();
      } else {
        alert('Ошибка удаления');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      alert('Ошибка: ' + message);
    }
  };

  const handleDuplicate = (article: Article) => {
    const newSlug = `${article.slug}-copy`;
    setEditingArticle({
      ...article,
      id: 0,
      slug: newSlug,
      title: `${article.title} (копия)`,
      date: new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
    });
    setSlugManuallyEdited(true);
  };


  const moveArticle = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= articles.length || toIndex >= articles.length) return;
    const reordered = [...articles];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    updateArticles(reordered, password).then(async (success) => {
      if (!success) {
        alert('Не удалось сохранить новый порядок статей');
      }
      await forceRefreshArticles();
      await refreshHealth();
    }).catch(async (err) => {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      alert('Ошибка при смене порядка: ' + message);
      await forceRefreshArticles();
    });
  }, [articles, forceRefreshArticles, password, updateArticles]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (editingArticle) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editingArticle]);

  if (!isAuthenticated) {
    return (
      <AdminThemeProvider>
        <SEO title="Admin" description="Admin panel" url="/admin" noIndex />
        <div className="flex items-center justify-center p-4 min-h-screen">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md p-8 rounded-2xl bg-[var(--adm-card)] border border-[var(--adm-border)] shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--adm-primary)] to-[var(--adm-primary-strong)] flex items-center justify-center">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <button onClick={() => {
                const newMode = localStorage.getItem('ww-admin-theme') === 'dark' ? 'light' : 'dark';
                localStorage.setItem('ww-admin-theme', newMode);
                window.location.reload();
              }} className="px-4 py-2 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] text-[var(--adm-fg)]">
                {localStorage.getItem('ww-admin-theme') === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
            <h2 className="text-2xl font-semibold text-center mb-2">Вход в админку</h2>
            <p className="text-center text-sm text-[var(--adm-fg)]/70 mb-6">Безопасный вход в CMS для управления контентом.</p>
            <form onSubmit={handleLogin} className="space-y-4">
              <input type="password" placeholder="Введите пароль" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] placeholder:text-[var(--adm-fg)]/54 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50" autoFocus />
              {error && <p className="text-[var(--adm-danger)] text-sm text-center">{error}</p>}
              <button type="submit" disabled={authLoading} className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--adm-primary)] to-[var(--adm-primary-strong)] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all">
                <LogIn className="w-5 h-5" /> {authLoading ? 'Проверка...' : 'Войти'}
              </button>
            </form>
          </motion.div>
        </div>
      </AdminThemeProvider>
    );
  }

  return (
    <AdminThemeProvider>
      <SEO title="Admin" description="Admin panel" url="/admin" noIndex />
      <div className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
            <h1 className="text-3xl font-semibold bg-gradient-to-r from-[var(--adm-primary)] to-[var(--adm-primary-strong)] bg-clip-text text-transparent">Управление статьями</h1>
            <div className="flex items-center gap-3">
              <button onClick={() => {
                const newMode = localStorage.getItem('ww-admin-theme') === 'dark' ? 'light' : 'dark';
                localStorage.setItem('ww-admin-theme', newMode);
                window.location.reload();
              }} className="px-4 py-2 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] text-[var(--adm-fg)]">
                {localStorage.getItem('ww-admin-theme') === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <span className="text-xs px-2.5 py-1.5 rounded-full bg-[var(--adm-primary)]/20 text-[var(--adm-primary)] border border-[var(--adm-primary)]/30">Источник: {sourceLabel}</span>
              <button onClick={async () => { await forceRefreshArticles(); await refreshHealth(); }} className="text-sm text-[var(--adm-fg)]/70 hover:text-[var(--adm-primary)] transition-colors">Обновить из API (no-cache)</button>
              <button onClick={() => navigate('/')} className="text-sm text-[var(--adm-fg)]/70 hover:text-[var(--adm-primary)] transition-colors">← На главную</button>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 p-4 h-fit rounded-2xl bg-[var(--adm-card)] border border-[var(--adm-border)] shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold text-[var(--adm-fg)]/90">Статьи</h2>
                <button onClick={() => {
                  setEditingArticle({
                    id: 0, slug: '', title: '', category: '', readTime: '5 мин',
                    date: new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
                    description: '', summary: '', keyTakeaways: [], faq: [], content: '', image: '',
                    status: 'published'
                  });
                  setSlugManuallyEdited(false);
                }} className="p-2 rounded-lg bg-[var(--adm-primary)]/20 text-[var(--adm-primary)] hover:bg-[var(--adm-primary)]/30 transition-all">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--adm-fg)]/40" />
                <input
                  type="text"
                  placeholder="Поиск..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] placeholder:text-[var(--adm-fg)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all"
                />
              </div>
              {loading ? (
                <p className="text-sm text-[var(--adm-fg)]/60">Загрузка...</p>
              ) : (
                <DndProvider backend={HTML5Backend}>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {filtered.map((article) => {
                      const articleIndex = articles.findIndex((item) => item.slug === article.slug);
                      return (
                        <AdminArticleItem
                          key={article.slug}
                          article={article}
                          index={articleIndex}
                          onEdit={(item) => { setEditingArticle(item); setSlugManuallyEdited(false); }}
                          onDuplicate={handleDuplicate}
                          onDelete={handleDelete}
                          onMove={moveArticle}
                        />
                      );
                    })}
                  </div>
                </DndProvider>
              )}
            </div>

            <div className="lg:col-span-2 p-6 rounded-2xl bg-[var(--adm-card)] border border-[var(--adm-border)] shadow-lg">
              {editingArticle ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Заголовок</label>
                      <input type="text" value={editingArticle.title} onChange={(e) => handleTitleChange(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] placeholder:text-[var(--adm-fg)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Категория</label>
                      <input type="text" value={editingArticle.category} onChange={(e) => setEditingArticle({ ...editingArticle, category: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Время чтения</label>
                      <input type="text" value={editingArticle.readTime} onChange={(e) => setEditingArticle({ ...editingArticle, readTime: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Дата</label>
                      <input type="text" value={editingArticle.date} onChange={(e) => setEditingArticle({ ...editingArticle, date: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium text-[var(--adm-fg)]/80">Статус:</label>
                    <select
                      value={editingArticle.status || 'published'}
                      onChange={(e) => setEditingArticle({ ...editingArticle, status: e.target.value as Article['status'] })}
                      className="rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] px-3 py-2 text-sm"
                    >
                      <option value="published">Опубликована</option>
                      <option value="draft">Черновик</option>
                    </select>
                    {editingArticle.publishedAt && new Date(editingArticle.publishedAt) > new Date() && editingArticle.status === 'published' && (
                      <span className="text-xs text-blue-400">(запланирована на {new Date(editingArticle.publishedAt).toLocaleString()})</span>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80 flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> Дата публикации (оставьте пустой для немедленной)
                    </label>
                    <input
                      type="datetime-local"
                      value={editingArticle.publishedAt ? editingArticle.publishedAt.slice(0, 16) : ''}
                      onChange={(e) => setEditingArticle({ ...editingArticle, publishedAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Краткое описание</label>
                    <textarea value={editingArticle.description} onChange={(e) => setEditingArticle({ ...editingArticle, description: e.target.value })} rows={3} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-textarea-bg)] text-[var(--adm-fg)] resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Краткое описание (AEO)</label>
                    <textarea value={editingArticle.summary || ''} onChange={(e) => setEditingArticle({ ...editingArticle, summary: e.target.value })} rows={3} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-textarea-bg)] text-[var(--adm-fg)] resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Ключевые тезисы (по одному на строку)</label>
                    <textarea
                      value={takeawaysText}
                      onChange={(e) => {
                        const keyTakeaways = e.target.value.split('\n').map((line) => line.trim()).filter(Boolean);
                        setEditingArticle({ ...editingArticle, keyTakeaways });
                      }}
                      rows={4}
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-textarea-bg)] text-[var(--adm-fg)] resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">FAQ (формат: вопрос::ответ, каждая пара с новой строки)</label>
                    <textarea
                      value={faqText}
                      onChange={(e) => {
                        const faq = e.target.value
                          .split('\n')
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .map((line) => {
                            const [question, ...rest] = line.split('::');
                            return { question: question?.trim() || '', answer: rest.join('::').trim() };
                          })
                          .filter((item) => item.question && item.answer);
                        setEditingArticle({ ...editingArticle, faq });
                      }}
                      rows={5}
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-textarea-bg)] text-[var(--adm-fg)] resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">URL обложки</label>
                    <div className="flex gap-2">
                      <input type="text" value={editingArticle.image} onChange={(e) => setEditingArticle({ ...editingArticle, image: e.target.value })} className="flex-1 w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                      <label className="cursor-pointer px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] hover:bg-[var(--adm-muted)]/50 text-[var(--adm-fg)] transition-all flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const url = await uploadFile(file);
                            if (url) setEditingArticle({ ...editingArticle, image: url });
                            else alert('Ошибка загрузки');
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Slug (URL-адрес статьи)</label>
                    <input type="text" value={editingArticle.slug} onChange={(e) => handleSlugChange(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                    <p className="text-xs text-[var(--adm-fg)]/50 mt-1">Автоматически из заголовка (если не трогать вручную). Только латиница и дефисы.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Содержание статьи</label>
                    <ArticleEditor content={editingArticle.content} onChange={handleContentChange} onUpload={uploadFile} />
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => handleSave('published')} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[var(--adm-primary)] to-[var(--adm-primary-strong)] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg">
                      <Save className="w-4 h-4" /> Сохранить и опубликовать
                    </button>
                    <button onClick={() => handleSave('draft')} className="px-6 py-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] text-[var(--adm-fg)] hover:bg-[var(--adm-muted)]/50 transition-all flex items-center gap-2">
                      <EyeOff className="w-4 h-4" /> Черновик
                    </button>
                    <button onClick={() => setEditingArticle(null)} className="px-6 py-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] text-[var(--adm-fg)] hover:bg-[var(--adm-muted)]/50 transition-all">Отмена</button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-[var(--adm-fg)]/60">Выберите статью из списка или создайте новую</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminThemeProvider>
  );
}
