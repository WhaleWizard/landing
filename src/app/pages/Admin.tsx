// src/app/pages/Admin.tsx
import { useState } from 'react';
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const { articles, loading, refreshArticles, updateArticles } = useArticles();
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const navigate = useNavigate();
  const faqText = editingArticle?.faq?.map((item) => `${item.question}::${item.answer}`).join('\n') || '';
  const takeawaysText = editingArticle?.keyTakeaways?.join('\n') || '';

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
    if (normalizedArticle.id && normalizedArticle.id !== 0) {
      const index = updatedArticles.findIndex(a => a.id === normalizedArticle.id);
      if (index !== -1) updatedArticles[index] = normalizedArticle;
    } else {
      const newId = Math.max(0, ...articles.map(a => a.id), 0) + 1;
      updatedArticles.push({ ...normalizedArticle, id: newId });
    }

    try {
      const success = await updateArticles(updatedArticles, password);
      if (success) {
        alert('Сохранено!');
        setEditingArticle(null);
        setSlugManuallyEdited(false);
        await refreshArticles();
      } else {
        alert('Ошибка сохранения. Проверьте консоль (F12)');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      console.error('Ошибка при сохранении:', err);
      alert('Ошибка: ' + message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить статью?')) return;
    const updated = articles.filter(a => a.id !== id);
    try {
      const success = await updateArticles(updated, password);
      if (success) {
        if (editingArticle?.id === id) setEditingArticle(null);
        await refreshArticles();
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md p-8 rounded-2xl bg-card/40 backdrop-blur-xl border border-primary/30 shadow-2xl">
          <div className="flex justify-center mb-6"><div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg"><Lock className="w-8 h-8 text-white" /></div></div>
          <h2 className="text-2xl font-bold text-center mb-6">Вход в админку</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="password" placeholder="Введите пароль" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-background/60 border border-border focus:border-primary outline-none transition-colors" autoFocus />
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button type="submit" disabled={authLoading} className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60"><LogIn className="w-5 h-5" /> {authLoading ? 'Проверка...' : 'Войти'}</button>
          </form>
        </motion.div>
      </div>
      </>
    );
  }

  return (
    <>
      <SEO title="Admin" description="Admin panel" url="/admin" noIndex />
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Управление статьями</h1>
          <button onClick={() => navigate('/')} className="text-sm text-muted-foreground hover:text-primary transition">← На главную</button>
        </div>
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 bg-card/40 backdrop-blur-sm border border-border rounded-2xl p-4 h-fit">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold">Статьи</h2>
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
              }} className="p-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition"><Plus className="w-4 h-4" /></button>
            </div>
            {loading && <p className="text-muted-foreground text-sm">Загрузка...</p>}
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {articles.map(article => (
                <div key={article.id} className="flex items-center gap-2 p-2 rounded-xl bg-background/50 border border-border hover:border-primary/50 transition">
                  <button onClick={() => {
                    setEditingArticle(article);
                    setSlugManuallyEdited(false);
                  }} className="flex-1 text-left truncate">
                    <div className="font-medium truncate">{article.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{article.slug}</div>
                  </button>
                  <button onClick={() => handleDelete(article.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 bg-card/40 backdrop-blur-sm border border-border rounded-2xl p-6">
            {editingArticle ? (
              <div className="space-y-4">
                <div><label className="block text-sm font-medium mb-1">Заголовок</label><input type="text" value={editingArticle.title} onChange={(e) => handleTitleChange(e.target.value)} className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border focus:border-primary outline-none" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium mb-1">Категория</label><input type="text" value={editingArticle.category} onChange={(e) => setEditingArticle({ ...editingArticle, category: e.target.value })} className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border focus:border-primary outline-none" /></div>
                  <div><label className="block text-sm font-medium mb-1">Время чтения</label><input type="text" value={editingArticle.readTime} onChange={(e) => setEditingArticle({ ...editingArticle, readTime: e.target.value })} className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border focus:border-primary outline-none" /></div>
                </div>
                <div><label className="block text-sm font-medium mb-1">Дата</label><input type="text" value={editingArticle.date} onChange={(e) => setEditingArticle({ ...editingArticle, date: e.target.value })} className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border focus:border-primary outline-none" /></div>
                <div><label className="block text-sm font-medium mb-1">Краткое описание</label><textarea value={editingArticle.description} onChange={(e) => setEditingArticle({ ...editingArticle, description: e.target.value })} rows={3} className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border focus:border-primary outline-none resize-none" /></div>
                <div><label className="block text-sm font-medium mb-1">TL;DR / Краткий ответ (AEO)</label><textarea value={editingArticle.summary || ''} onChange={(e) => setEditingArticle({ ...editingArticle, summary: e.target.value })} rows={3} className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border focus:border-primary outline-none resize-none" /></div>
                <div>
                  <label className="block text-sm font-medium mb-1">Ключевые тезисы (по одному на строку)</label>
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
                    className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border focus:border-primary outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">FAQ (формат: вопрос::ответ, каждая пара с новой строки)</label>
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
                    className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border focus:border-primary outline-none resize-none"
                  />
                </div>
                <div><label className="block text-sm font-medium mb-1">URL обложки (картинка)</label><input type="text" value={editingArticle.image} onChange={(e) => setEditingArticle({ ...editingArticle, image: e.target.value })} className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border focus:border-primary outline-none" /></div>
                <div><label className="block text-sm font-medium mb-1">Slug (URL-адрес статьи)</label><input type="text" value={editingArticle.slug} onChange={(e) => handleSlugChange(e.target.value)} className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border focus:border-primary outline-none" /><p className="text-xs text-muted-foreground mt-1">Автоматически из заголовка (если не трогать вручную). Только латиница, дефисы.</p></div>
                <div>
                  <label className="block text-sm font-medium mb-1">Содержание статьи</label>
                  <ArticleEditor content={editingArticle.content} onChange={handleContentChange} />
                </div>
                <div className="flex gap-3">
                  <button onClick={handleSave} className="flex-1 py-2 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition"><Save className="w-4 h-4" /> Сохранить</button>
                  <button onClick={() => setEditingArticle(null)} className="px-4 py-2 rounded-xl border border-primary/30 hover:bg-primary/10 transition">Отмена</button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">Выберите статью из списка или создайте новую</div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
