// src/app/pages/Admin.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Lock, LogIn, Save, Plus, Trash2 } from 'lucide-react';
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
  return text.toLowerCase().split('').map(ch => map[ch] || ch).join('').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function verifyAdminPassword(password: string): Promise<boolean> {
  const res = await fetch(API_ROUTES.adminArticles, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({ password }),
  });

  if (!res.ok) return false;

  const payload = await res.json().catch(() => ({}));
  return Boolean(payload?.success);
}

export default function Admin() {
  const adminTheme = {
    page: 'min-h-screen bg-[hsl(228_25%_97%)] text-[hsl(228_20%_20%)]',
    glassPanel: 'bg-[hsl(0_0%_100%/0.76)] backdrop-blur-xl border border-[hsl(225_26%_86%/0.9)] shadow-[0_12px_30px_-18px_hsl(228_35%_45%/0.45)]',
    card: 'rounded-2xl',
    input: 'w-full px-4 py-2.5 rounded-xl border border-[hsl(225_23%_84%)] bg-[hsl(220_30%_99%)] text-[hsl(228_24%_24%)] placeholder:text-[hsl(226_10%_58%)] focus:outline-none focus:ring-2 focus:ring-[hsl(248_83%_66%/0.28)] focus:border-[hsl(248_83%_66%/0.68)] transition-all duration-200',
    subtleButton: 'text-sm text-[hsl(225_12%_43%)] hover:text-[hsl(248_64%_52%)] transition-colors duration-200',
    primaryButton: 'py-3 rounded-xl bg-gradient-to-r from-[hsl(248_78%_64%)] to-[hsl(265_75%_68%)] text-white font-semibold flex items-center justify-center gap-2 hover:brightness-[1.03] active:brightness-95 disabled:opacity-60 transition-all duration-200 shadow-[0_12px_24px_-16px_hsl(250_70%_48%)]',
    secondaryButton: 'px-4 py-2.5 rounded-xl border border-[hsl(226_20%_82%)] bg-[hsl(0_0%_100%/0.65)] hover:bg-[hsl(230_33%_98%)] transition-all duration-200 text-[hsl(226_20%_33%)]',
    sectionTitle: 'text-sm font-semibold tracking-[0.01em] text-[hsl(226_25%_28%)]',
  } as const;

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

  const refreshHealth = async () => {
    try {
      const res = await fetch(`/api/health/content?_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const payload = await res.json().catch(() => null) as { source?: string } | null;
      if (payload?.source) setSourceLabel(payload.source);
    } catch {
      // noop
    }
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
    setEditingArticle({
      ...editingArticle,
      title,
      slug: newSlug,
    });
  };

  const handleSlugChange = (slug: string) => {
    if (!editingArticle) return;
    setSlugManuallyEdited(true);
    setEditingArticle({ ...editingArticle, slug });
  };

  const handleContentChange = (html: string) => {
    if (editingArticle) {
      setEditingArticle({ ...editingArticle, content: html });
    }
  };

  const handleSave = async () => {
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
      summary: editingArticle.summary?.trim() || editingArticle.description?.trim() || '',
      keyTakeaways: (editingArticle.keyTakeaways || []).map((item) => item.trim()).filter(Boolean),
      faq: (editingArticle.faq || [])
        .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() }))
        .filter((item) => item.question && item.answer),
    };

    let updatedArticles = [...articles];
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
        alert('Сохранено!');
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

  if (!isAuthenticated) {
    return (
      <>
        <SEO title="Admin" description="Admin panel" url="/admin" noIndex />
      <div className={`${adminTheme.page} flex items-center justify-center p-4`}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`w-full max-w-md p-8 ${adminTheme.card} ${adminTheme.glassPanel}`}>
          <div className="flex justify-center mb-6"><div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[hsl(248_78%_64%)] to-[hsl(265_74%_68%)] flex items-center justify-center shadow-[0_14px_26px_-18px_hsl(252_80%_40%)]"><Lock className="w-8 h-8 text-white" /></div></div>
          <h2 className="text-2xl font-semibold text-center mb-2 text-[hsl(225_30%_24%)]" style={{ textWrap: 'balance' }}>Вход в админку</h2>
          <p className="text-center text-sm text-[hsl(225_10%_46%)] mb-6 max-w-[28ch] mx-auto leading-relaxed">Безопасный вход в CMS для управления контентом.</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="password" placeholder="Введите пароль" value={password} onChange={(e) => setPassword(e.target.value)} className={adminTheme.input} autoFocus />
            {error && <p className="text-[hsl(0_62%_48%)] text-sm text-center">{error}</p>}
            <button type="submit" disabled={authLoading} className={`w-full ${adminTheme.primaryButton}`}><LogIn className="w-5 h-5" /> {authLoading ? 'Проверка...' : 'Войти'}</button>
          </form>
        </motion.div>
      </div>
      </>
    );
  }

  return (
    <>
      <SEO title="Admin" description="Admin panel" url="/admin" noIndex />
    <div className={`${adminTheme.page} py-12 px-4`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <h1 className="text-3xl font-semibold bg-gradient-to-r from-[hsl(248_73%_59%)] to-[hsl(265_66%_62%)] bg-clip-text text-transparent leading-tight max-w-[20ch]" style={{ textWrap: 'balance' }}>Управление статьями</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs px-2.5 py-1.5 rounded-full bg-[hsl(248_85%_64%/0.12)] text-[hsl(248_52%_43%)] border border-[hsl(248_68%_60%/0.25)]">Источник: {sourceLabel}</span>
            <button
              onClick={async () => {
                await forceRefreshArticles();
                await refreshHealth();
              }}
              className={adminTheme.subtleButton}
            >
              Обновить из API (no-cache)
            </button>
            <button onClick={() => navigate('/')} className={adminTheme.subtleButton}>← На главную</button>
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-8">
          <div className={`lg:col-span-1 p-4 h-fit ${adminTheme.card} ${adminTheme.glassPanel}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={adminTheme.sectionTitle}>Статьи</h2>
              <button onClick={() => {
                setEditingArticle({
                  id: 0,
                  slug: '',
                  title: '',
                  category: '',
                  readTime: '5 мин',
                  date: new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
                  description: '',
                  summary: '',
                  keyTakeaways: [],
                  faq: [],
                  content: '',
                  image: ''
                });
                setSlugManuallyEdited(false);
              }} className="p-2 rounded-lg bg-[hsl(248_86%_66%/0.14)] text-[hsl(248_50%_46%)] hover:bg-[hsl(248_86%_66%/0.22)] transition-all duration-200"><Plus className="w-4 h-4" /></button>
            </div>
            {loading && <p className="text-[hsl(226_9%_50%)] text-sm">Загрузка...</p>}
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {articles.map(article => (
                <div key={article.slug} className="flex items-center gap-2 p-2.5 rounded-xl bg-[hsl(220_25%_98%/0.92)] border border-[hsl(227_20%_86%)] hover:border-[hsl(248_70%_64%/0.5)] transition-all duration-200">
                  <button onClick={() => {
                    setEditingArticle(article);
                    setSlugManuallyEdited(false);
                  }} className="flex-1 text-left truncate">
                    <div className="font-medium truncate text-[hsl(227_24%_26%)]">{article.title}</div>
                    <div className="text-xs text-[hsl(225_8%_50%)] truncate">{article.slug}</div>
                  </button>
                  <button onClick={() => handleDelete(article.slug)} className="p-1.5 rounded-lg hover:bg-[hsl(0_74%_54%/0.14)] text-[hsl(0_65%_56%)] transition-colors duration-200"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className={`lg:col-span-2 p-6 ${adminTheme.card} ${adminTheme.glassPanel}`}>
            {editingArticle ? (
              <div className="space-y-4">
                <div><label className="block text-sm font-medium mb-1.5 text-[hsl(226_25%_28%)]">Заголовок</label><input type="text" value={editingArticle.title} onChange={(e) => handleTitleChange(e.target.value)} className={adminTheme.input} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium mb-1.5 text-[hsl(226_25%_28%)]">Категория</label><input type="text" value={editingArticle.category} onChange={(e) => setEditingArticle({ ...editingArticle, category: e.target.value })} className={adminTheme.input} /></div>
                  <div><label className="block text-sm font-medium mb-1.5 text-[hsl(226_25%_28%)]">Время чтения</label><input type="text" value={editingArticle.readTime} onChange={(e) => setEditingArticle({ ...editingArticle, readTime: e.target.value })} className={adminTheme.input} /></div>
                </div>
                <div><label className="block text-sm font-medium mb-1.5 text-[hsl(226_25%_28%)]">Дата</label><input type="text" value={editingArticle.date} onChange={(e) => setEditingArticle({ ...editingArticle, date: e.target.value })} className={adminTheme.input} /></div>
                <div><label className="block text-sm font-medium mb-1.5 text-[hsl(226_25%_28%)]">Краткое описание</label><textarea value={editingArticle.description} onChange={(e) => setEditingArticle({ ...editingArticle, description: e.target.value })} rows={3} className={`${adminTheme.input} resize-y leading-relaxed max-w-full`} /></div>
                <div><label className="block text-sm font-medium mb-1.5 text-[hsl(226_25%_28%)]">TL;DR / Краткий ответ (AEO)</label><textarea value={editingArticle.summary || ''} onChange={(e) => setEditingArticle({ ...editingArticle, summary: e.target.value })} rows={3} className={`${adminTheme.input} resize-y leading-relaxed max-w-full`} /></div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[hsl(226_25%_28%)]">Ключевые тезисы (по одному на строку)</label>
                  <textarea
                    value={takeawaysText}
                    onChange={(e) => {
                      const keyTakeaways = e.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean);
                      setEditingArticle({ ...editingArticle, keyTakeaways });
                    }}
                    rows={4}
                    className={`${adminTheme.input} resize-y leading-relaxed max-w-full`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[hsl(226_25%_28%)]">FAQ (формат: вопрос::ответ, каждая пара с новой строки)</label>
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
                    className={`${adminTheme.input} resize-y leading-relaxed max-w-full`}
                  />
                </div>
                <div><label className="block text-sm font-medium mb-1.5 text-[hsl(226_25%_28%)]">URL обложки (картинка)</label><input type="text" value={editingArticle.image} onChange={(e) => setEditingArticle({ ...editingArticle, image: e.target.value })} className={adminTheme.input} /></div>
                <div><label className="block text-sm font-medium mb-1.5 text-[hsl(226_25%_28%)]">Slug (URL-адрес статьи)</label><input type="text" value={editingArticle.slug} onChange={(e) => handleSlugChange(e.target.value)} className={adminTheme.input} /><p className="text-xs text-[hsl(225_10%_46%)] mt-1.5 max-w-[72ch] leading-relaxed">Автоматически из заголовка (если не трогать вручную). Только латиница и дефисы.</p></div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[hsl(226_25%_28%)]">Содержание статьи</label>
                  <ArticleEditor content={editingArticle.content} onChange={handleContentChange} />
                </div>
                <div className="flex gap-3">
                  <button onClick={handleSave} className={`flex-1 ${adminTheme.primaryButton}`}><Save className="w-4 h-4" /> Сохранить</button>
                  <button onClick={() => setEditingArticle(null)} className={adminTheme.secondaryButton}>Отмена</button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-[hsl(225_10%_48%)] leading-relaxed max-w-[34ch] mx-auto">Выберите статью из списка или создайте новую</div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
