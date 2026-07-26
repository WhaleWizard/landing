import { useEffect, useState, useMemo, useCallback, useRef, createContext, useContext } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  Lock, LogIn, Save, Plus, Trash2, Sun, Moon,
  Search, Copy, Calendar, EyeOff, Upload, GripVertical,
  ShieldCheck, ExternalLink, History, RotateCcw,
  LayoutDashboard, Newspaper, Briefcase, Inbox, Images, Stethoscope,
  Activity, BarChart3, PanelsTopLeft
} from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useArticles } from '../context/ArticlesContext';
import { Article } from '../components/hooks/useArticlesApi';
import { API_ROUTES } from '../config';
import ArticleEditor from '../components/ArticleEditor';
import CaseFieldsEditor from '../components/CaseFieldsEditor';
import AdminLeads from '../components/admin/AdminLeads';
import AdminMedia from '../components/admin/AdminMedia';
import AdminHealth from '../components/admin/AdminHealth';
import AdminToday from '../components/admin/AdminToday';
import AdminMetaCenter from '../components/admin/AdminMetaCenter';
import AdminAttribution from '../components/admin/AdminAttribution';
import AdminContentControl from '../components/admin/AdminContentControl';
import { AdminSelect } from '../components/admin/AdminUI';
import WhaleMark from '../components/brand/WhaleMark';
import SEO from '../components/SEO';

type AdminView = 'dashboard' | 'articles' | 'leads' | 'media' | 'health' | 'meta' | 'attribution' | 'content';

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

const PROTECTED_ARTICLE_SLUG = 'kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh';
const CASES_CATEGORY = 'Кейсы';

function isProtectedArticle(article?: Pick<Article, 'slug'> | null): boolean {
  return article?.slug === PROTECTED_ARTICLE_SLUG;
}

function stripHtmlToText(html = ''): string {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text = ''): number {
  const normalized = text.trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

function publicationIssues(article: Article | null): string[] {
  if (!article) return [];
  const issues: string[] = [];
  if (!article.title.trim()) issues.push('нет заголовка');
  if (!article.slug.trim()) issues.push('нет URL');
  if (!article.image.trim()) issues.push('нет обложки');
  if (article.description.trim().length < 80) issues.push('короткое описание');
  if (article.seoTitle?.trim().length === 0) issues.push('нет SEO title');
  if (article.seoDescription?.trim().length === 0) issues.push('нет SEO description');
  if (countWords(stripHtmlToText(article.content || '')) < 120) issues.push('мало текста');
  return issues;
}

function snapshotArticle(article: Article | null): string {
  if (!article) return '';
  return JSON.stringify({
    id: article.id || 0,
    slug: article.slug || '',
    title: article.title || '',
    category: article.category || '',
    readTime: article.readTime || '',
    date: article.date || '',
    description: article.description || '',
    summary: article.summary || '',
    content: article.content || '',
    image: article.image || '',
    seoTitle: article.seoTitle || '',
    seoDescription: article.seoDescription || '',
    publishedAt: article.publishedAt || '',
    status: article.status || 'published',
    tags: article.tags || [],
    keyTakeaways: article.keyTakeaways || [],
    faq: article.faq || [],
    caseData: article.caseData || null,
  });
}

// Автосохранение черновика: страховка от закрытия вкладки/падения браузера.
const EDITOR_BACKUP_KEY = 'ww-admin-editor-backup-v1';

type EditorBackup = { article: Article; savedAt: number };

function readEditorBackup(): EditorBackup | null {
  try {
    const raw = localStorage.getItem(EDITOR_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditorBackup;
    if (!parsed?.article || typeof parsed.article !== 'object' || !parsed.savedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function formatVersionDate(raw: string): string {
  // SQLite CURRENT_TIMESTAMP отдаёт UTC без таймзоны — приводим к ISO с Z
  const isoCandidate = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const parsed = new Date(isoCandidate);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString('ru-RU');
}

type ArticleVersionRow = { id: number; slug: string; version_data: string; created_at: string };

interface ArticleVersionsPanelProps {
  slug: string;
  password: string;
  onRestore: (article: Article) => void;
}

function ArticleVersionsPanel({ slug, password, onRestore }: ArticleVersionsPanelProps) {
  const [versions, setVersions] = useState<ArticleVersionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/article-versions?slug=${encodeURIComponent(slug)}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(res.status === 503 ? 'История версий доступна только на продакшене (нужна база D1)' : payload?.error || `HTTP ${res.status}`);
      }
      setVersions(Array.isArray(payload.versions) ? payload.versions : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить версии');
      setVersions(null);
    } finally {
      setLoading(false);
    }
  }, [password, slug]);

  const restoreVersion = (row: ArticleVersionRow) => {
    try {
      const parsed = JSON.parse(row.version_data) as Article;
      if (!parsed || typeof parsed !== 'object' || !parsed.title) throw new Error('invalid payload');
      if (!confirm(`Восстановить версию от ${formatVersionDate(row.created_at)}? Текущие несохранённые изменения в редакторе будут заменены.`)) return;
      onRestore(parsed);
    } catch {
      alert('Не удалось прочитать данные этой версии.');
    }
  };

  return (
    <details className="rounded-xl border border-[var(--adm-border)] bg-[var(--adm-muted)]/25">
      <summary
        onClick={() => { if (versions === null && !loading) void loadVersions(); }}
        className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--adm-fg)]/90"
      >
        <History className="w-4 h-4" /> История версий
      </summary>
      <div className="space-y-2 px-4 pb-4">
        {loading && <div className="text-sm text-[var(--adm-fg)]/60">Загрузка…</div>}
        {error && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--adm-danger)]">
            <span>{error}</span>
            <button type="button" onClick={() => void loadVersions()} className="rounded-lg border border-[var(--adm-border)] px-3 py-1 text-xs text-[var(--adm-fg)]/80 hover:bg-[var(--adm-muted)]/50">Повторить</button>
          </div>
        )}
        {versions?.length === 0 && !loading && !error && (
          <div className="text-sm text-[var(--adm-fg)]/60">Версий пока нет — они появляются после каждого сохранения.</div>
        )}
        {(versions || []).map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-card)] px-3 py-2">
            <span className="text-sm text-[var(--adm-fg)]/80">{formatVersionDate(row.created_at)}</span>
            <button
              type="button"
              onClick={() => restoreVersion(row)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--adm-border)] px-3 py-1.5 text-xs text-[var(--adm-fg)] hover:bg-[var(--adm-primary)]/10 hover:text-[var(--adm-primary)] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Восстановить
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}

const themeTokens = {
  light: {
    '--adm-surface-canvas': '#f4f6fb',
    '--adm-surface-elevated': '#ffffff',
    '--adm-surface-raised': '#fbfcff',
    '--adm-surface-subtle': '#edf1f7',
    '--adm-text-primary': '#171c28',
    '--adm-text-secondary': '#566075',
    '--adm-text-tertiary': '#7b8599',
    '--adm-border-subtle': '#dce2ec',
    '--adm-border-strong': '#c8d0de',
    '--adm-primary': '#6958e8',
    '--adm-primary-strong': '#5544d5',
    '--adm-success': '#14795b',
    '--adm-warning': '#ad6800',
    '--adm-danger': '#d34867',
    '--adm-info': '#2874c8',
    '--adm-shadow-xs': '0 1px 2px rgba(24, 31, 47, 0.04)',
    '--adm-shadow-sm': '0 8px 24px rgba(24, 31, 47, 0.06)',
    '--adm-shadow-md': '0 16px 36px rgba(24, 31, 47, 0.09)',
    '--adm-shadow-lg': '0 22px 52px rgba(24, 31, 47, 0.14)',
    '--adm-bg': 'var(--adm-surface-canvas)',
    '--adm-fg': 'var(--adm-text-primary)',
    '--adm-card': 'var(--adm-surface-elevated)',
    '--adm-muted': 'var(--adm-surface-subtle)',
    '--adm-border': 'var(--adm-border-subtle)',
    '--adm-textarea-bg': 'var(--adm-surface-raised)',
    '--adm-input-bg': 'var(--adm-surface-raised)',
    '--adm-button-bg': 'var(--adm-primary)',
    '--adm-button-text': '#ffffff',
  },
  dark: {
    '--adm-surface-canvas': '#0d1119',
    '--adm-surface-elevated': '#151b26',
    '--adm-surface-raised': '#111722',
    '--adm-surface-subtle': '#202938',
    '--adm-text-primary': '#eef2f8',
    '--adm-text-secondary': '#acb5c6',
    '--adm-text-tertiary': '#7f8a9f',
    '--adm-border-subtle': 'rgba(148, 163, 190, 0.21)',
    '--adm-border-strong': 'rgba(159, 174, 202, 0.36)',
    '--adm-primary': '#9185ff',
    '--adm-primary-strong': '#7466ed',
    '--adm-success': '#51c69a',
    '--adm-warning': '#f2b55f',
    '--adm-danger': '#ff7898',
    '--adm-info': '#6db5ff',
    '--adm-shadow-xs': '0 1px 2px rgba(0, 0, 0, 0.22)',
    '--adm-shadow-sm': '0 10px 28px rgba(0, 0, 0, 0.2)',
    '--adm-shadow-md': '0 18px 42px rgba(0, 0, 0, 0.28)',
    '--adm-shadow-lg': '0 24px 58px rgba(0, 0, 0, 0.36)',
    '--adm-bg': 'var(--adm-surface-canvas)',
    '--adm-fg': 'var(--adm-text-primary)',
    '--adm-card': 'var(--adm-surface-elevated)',
    '--adm-muted': 'var(--adm-surface-subtle)',
    '--adm-border': 'var(--adm-border-subtle)',
    '--adm-textarea-bg': 'var(--adm-surface-raised)',
    '--adm-input-bg': 'var(--adm-surface-raised)',
    '--adm-button-bg': 'var(--adm-primary)',
    '--adm-button-text': '#ffffff',
  }
};

interface AdminThemeContextValue {
  mode: 'light' | 'dark';
  toggleMode: () => void;
}

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

function useAdminTheme() {
  const context = useContext(AdminThemeContext);
  if (!context) {
    return {
      mode: 'light' as const,
      toggleMode: () => {},
    };
  }
  return context;
}

function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('ww-admin-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem('ww-admin-theme', mode);
    document.body.dataset.adminTheme = mode;
    Object.entries(themeTokens[mode]).forEach(([name, value]) => {
      document.body.style.setProperty(name, value);
    });
    return () => {
      delete document.body.dataset.adminTheme;
      Object.keys(themeTokens[mode]).forEach((name) => document.body.style.removeProperty(name));
    };
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const vars = themeTokens[mode] as React.CSSProperties;

  return (
    <AdminThemeContext.Provider value={{ mode, toggleMode }}>
      <div style={{ ...vars, minHeight: '100vh' }} className="admin-root transition-colors duration-300" data-theme={mode}>
        <div className="admin-shell bg-[var(--adm-bg)] text-[var(--adm-fg)] min-h-screen">
          {children}
        </div>
      </div>
    </AdminThemeContext.Provider>
  );
}

function AdminThemeToggleButton() {
  const { mode, toggleMode } = useAdminTheme();
  return (
    <button
      type="button"
      onClick={toggleMode}
      className="admin-button h-10 w-10 p-0"
      title={mode === 'dark' ? 'Включить светлую тему' : 'Включить темную тему'}
      aria-label={mode === 'dark' ? 'Включить светлую тему' : 'Включить темную тему'}
    >
      {mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
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
  onDragEnd: () => void;
  locked: boolean;
}


function AdminArticleItem({ article, index, onEdit, onDuplicate, onDelete, onMove, onDragEnd, locked }: AdminArticleItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ADMIN_DND_TYPE,
    item: { index },
    canDrag: !locked,
    end: () => onDragEnd(),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [index, locked, onDragEnd]);

  // Перестановка происходит уже при наведении (а не при отпускании):
  // соседние статьи плавно сдвигаются, видно направление перемещения.
  const [{ isOver }, drop] = useDrop(() => ({
    accept: ADMIN_DND_TYPE,
    hover: (dragged: { index: number }, monitor) => {
      if (locked || !ref.current || dragged.index === index) return;
      const rect = ref.current.getBoundingClientRect();
      const middleY = (rect.bottom - rect.top) / 2;
      const offset = monitor.getClientOffset();
      if (!offset) return;
      const hoverY = offset.y - rect.top;
      if (dragged.index < index && hoverY < middleY) return;
      if (dragged.index > index && hoverY > middleY) return;
      onMove(dragged.index, index);
      dragged.index = index;
    },
    collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }) }),
  }), [index, locked, onMove]);

  drag(drop(ref));

  return (
    <motion.div
      ref={ref}
      layout
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`flex items-center gap-2 p-2.5 rounded-xl border ${isOver ? 'border-[var(--adm-primary)] bg-[var(--adm-primary)]/10' : 'border-[var(--adm-border)] bg-[var(--adm-card)] hover:bg-[var(--adm-muted)]/50'}`}
      style={{ opacity: isDragging ? 0.35 : 1 }}
    >
      <button
        type="button"
        className={`p-1.5 rounded-lg text-[var(--adm-fg)]/50 ${locked ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
        title={locked ? 'Статья защищена от изменений' : 'Перетащить'}
        aria-label={locked ? 'Статья защищена от перемещения' : 'Перетащить статью'}
        disabled={locked}
      >
        {locked ? <ShieldCheck className="w-4 h-4" /> : <GripVertical className="w-4 h-4" />}
      </button>
      <button type="button" onClick={() => onEdit(article)} className="flex-1 text-left truncate" aria-label={`Редактировать: ${article.title}`}>
        <div className="font-medium truncate flex items-center gap-2">
          {article.title}
          {locked && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--adm-primary)]/20 text-[var(--adm-primary)]">защищена</span>
          )}
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
      <button
        type="button"
        onClick={() => onDuplicate(article)}
        disabled={locked}
        className="p-1.5 rounded-lg hover:bg-[var(--adm-primary)]/10 text-[var(--adm-fg)]/60 disabled:opacity-40 disabled:cursor-not-allowed"
        title={locked ? 'Защищенную статью нельзя дублировать' : 'Дублировать'}
      >
        <Copy className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(article.slug)}
        disabled={locked}
        className="p-1.5 rounded-lg hover:bg-[var(--adm-danger)]/10 text-[var(--adm-danger)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title={locked ? 'Защищенную статью нельзя удалить' : 'Удалить'}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

function moveArrayItem<T>(array: T[], fromIndex: number, toIndex: number): T[] {
  const copy = [...array];
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);
  return copy;
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
  const { articles, loading, forceRefreshAdminArticles, updateArticles } = useArticles();
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [savedArticleSnapshot, setSavedArticleSnapshot] = useState('');
  const [sourceLabel, setSourceLabel] = useState<string>('unknown');
  const navigate = useNavigate();
  const faqText = editingArticle?.faq?.map((item) => `${item.question}::${item.answer}`).join('\n') || '';
  const takeawaysText = editingArticle?.keyTakeaways?.join('\n') || '';
  const tagsText = editingArticle?.tags?.join('\n') || '';

  // Черновик порядка на время перетаскивания: список перестраивается на лету
  // (с анимацией), в базу порядок уходит один раз — при отпускании.
  const [draftOrder, setDraftOrderState] = useState<Article[] | null>(null);
  const draftOrderRef = useRef<Article[] | null>(null);
  const setDraftOrder = useCallback((value: Article[] | null) => {
    draftOrderRef.current = value;
    setDraftOrderState(value);
  }, []);
  const orderedArticles = draftOrder ?? articles;

  const { query, setQuery, filtered } = useFilteredArticles(orderedArticles);
  const [adminSectionFilter, setAdminSectionFilter] = useState<'all' | 'blog' | 'cases'>('all');
  const [adminView, setAdminView] = useState<AdminView>('dashboard');
  const currentArticleSnapshot = useMemo(() => snapshotArticle(editingArticle), [editingArticle]);
  const hasUnsavedChanges = Boolean(editingArticle && currentArticleSnapshot !== savedArticleSnapshot);

  // Ниши для подсказки в редакторе кейса: собираются из уже существующих кейсов,
  // новую нишу можно просто вписать — она появится в списке после сохранения.
  const knownNiches = useMemo(() => {
    const set = new Set<string>();
    articles.forEach((article) => {
      const niche = article.caseData?.niche?.trim();
      if (article.category === CASES_CATEGORY && niche) set.add(niche);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [articles]);
  const isEditingProtected = Boolean(
    editingArticle && (
      isProtectedArticle(editingArticle) ||
      articles.some((article) => article.id === editingArticle.id && isProtectedArticle(article))
    )
  );
  const filteredBySection = useMemo(() => {
    return filtered.filter((article) => (
      adminSectionFilter === 'all'
        ? true
        : adminSectionFilter === 'cases'
          ? article.category === CASES_CATEGORY
          : article.category !== CASES_CATEGORY
    ));
  }, [adminSectionFilter, filtered]);
  const articleStats = useMemo(() => {
    const drafts = articles.filter((article) => article.status === 'draft').length;
    const planned = articles.filter((article) => (
      article.status !== 'draft' &&
      article.publishedAt &&
      new Date(article.publishedAt) > new Date()
    )).length;
    return { total: articles.length, drafts, planned, shown: filteredBySection.length };
  }, [articles, filteredBySection.length]);
  const contentStats = useMemo(() => {
    const text = stripHtmlToText(editingArticle?.content || '');
    return {
      words: countWords(text),
      chars: text.length,
      seoTitle: (editingArticle?.seoTitle || '').length,
      seoDescription: (editingArticle?.seoDescription || '').length,
      description: (editingArticle?.description || '').length,
    };
  }, [editingArticle?.content, editingArticle?.description, editingArticle?.seoDescription, editingArticle?.seoTitle]);
  const editorIssues = useMemo(() => publicationIssues(editingArticle), [editingArticle]);

  const openArticleEditor = useCallback((article: Article, options?: { dirty?: boolean; slugEdited?: boolean }) => {
    const draft = { ...article };
    setEditingArticle(draft);
    setSavedArticleSnapshot(options?.dirty ? '' : snapshotArticle(draft));
    setSlugManuallyEdited(Boolean(options?.slugEdited));
  }, []);

  const [editorBackup, setEditorBackup] = useState<EditorBackup | null>(() => readEditorBackup());

  const clearEditorBackup = useCallback(() => {
    try {
      localStorage.removeItem(EDITOR_BACKUP_KEY);
    } catch {
      // storage может быть недоступен — не критично
    }
    setEditorBackup(null);
  }, []);

  // Автосохранение открытого черновика раз в ~800мс после изменений
  useEffect(() => {
    if (!editingArticle || !hasUnsavedChanges || isEditingProtected) return;
    const timer = window.setTimeout(() => {
      try {
        const backup: EditorBackup = { article: editingArticle, savedAt: Date.now() };
        localStorage.setItem(EDITOR_BACKUP_KEY, JSON.stringify(backup));
        setEditorBackup(backup);
      } catch {
        // например, переполнен localStorage — просто пропускаем
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [editingArticle, hasUnsavedChanges, isEditingProtected]);

  const closeArticleEditor = useCallback(() => {
    if (hasUnsavedChanges && !confirm('Есть несохраненные изменения. Закрыть редактор?')) return;
    setEditingArticle(null);
    setSavedArticleSnapshot('');
    setSlugManuallyEdited(false);
    clearEditorBackup();
  }, [hasUnsavedChanges, clearEditorBackup]);

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
        await forceRefreshAdminArticles(password);
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
    const shouldAutogenerateSlug = !slugManuallyEdited && (!editingArticle.id || !editingArticle.slug);
    const newSlug = shouldAutogenerateSlug ? transliterate(title) : editingArticle.slug;
    setEditingArticle({ ...editingArticle, title, slug: newSlug });
  };

  const handleSlugChange = (slug: string) => {
    if (!editingArticle) return;
    setSlugManuallyEdited(true);
    setEditingArticle({ ...editingArticle, slug: transliterate(slug) });
  };

  const handleContentChange = (html: string) => {
    setEditingArticle((current) => current ? { ...current, content: html } : current);
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    const form = new FormData();
    form.append('file', file);
    try {
      form.append('password', password);
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'X-Admin-Password': password },
        body: form,
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.url || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      alert('Ошибка загрузки файла: ' + message);
      return null;
    }
  };

  const handleSave = async (status: Article['status'] = 'published') => {
    if (!editingArticle) return;
    if (isEditingProtected) {
      alert('Эта статья защищена от изменений. Ее нельзя сохранять, удалять или перетаскивать через админку.');
      return;
    }
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
      title: editingArticle.title.trim(),
      slug: editingArticle.slug.trim(),
      description: editingArticle.description?.trim() || '',
      seoTitle: editingArticle.seoTitle?.trim() || undefined,
      seoDescription: editingArticle.seoDescription?.trim() || undefined,
      tags: (editingArticle.tags || []).map((item) => item.trim()).filter(Boolean).slice(0, 20),
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
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Password': password,
            },
            credentials: 'same-origin',
            body: JSON.stringify({ password, slug: normalizedArticle.slug, article: normalizedArticle }),
          }).catch(() => {});
        }
        alert(status === 'draft' ? 'Черновик сохранён!' : 'Сохранено!');
        setEditingArticle(null);
        setSavedArticleSnapshot('');
        setSlugManuallyEdited(false);
        clearEditorBackup();
        await forceRefreshAdminArticles(password);
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
    if (slug === PROTECTED_ARTICLE_SLUG) {
      alert('Эта статья защищена от удаления.');
      return;
    }
    if (!confirm('Удалить статью?')) return;
    const updated = articles.filter(a => a.slug !== slug);
    try {
      const success = await updateArticles(updated, password);
      if (success) {
        if (editingArticle?.slug === slug) setEditingArticle(null);
        await forceRefreshAdminArticles(password);
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
    if (isProtectedArticle(article)) {
      alert('Защищенную статью нельзя дублировать.');
      return;
    }
    const newSlug = `${article.slug}-copy`;
    openArticleEditor({
      ...article,
      id: 0,
      slug: newSlug,
      title: `${article.title} (копия)`,
      date: new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
    }, { dirty: true, slugEdited: true });
  };


  // Визуальная перестановка при наведении (во время перетаскивания)
  const moveArticle = useCallback((fromIndex: number, toIndex: number) => {
    const base = draftOrderRef.current ?? articles;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= base.length || toIndex >= base.length) return;
    if (isProtectedArticle(base[fromIndex]) || isProtectedArticle(base[toIndex])) return;
    const protectedIndex = base.findIndex(isProtectedArticle);
    const crossesProtectedArticle = protectedIndex >= 0 && (
      (fromIndex < protectedIndex && toIndex >= protectedIndex) ||
      (fromIndex > protectedIndex && toIndex <= protectedIndex)
    );
    if (crossesProtectedArticle) return; // тихо не пускаем через защищённую статью
    setDraftOrder(moveArrayItem(base, fromIndex, toIndex));
  }, [articles, setDraftOrder]);

  // Сохранение нового порядка — один раз, когда статью отпустили
  const commitArticleOrder = useCallback(async () => {
    const draft = draftOrderRef.current;
    if (!draft) return;
    const changed = draft.some((article, index) => article.slug !== articles[index]?.slug);
    if (!changed) {
      setDraftOrder(null);
      return;
    }
    try {
      const success = await updateArticles(draft, password);
      if (!success) {
        alert('Не удалось сохранить новый порядок статей');
      }
      await forceRefreshAdminArticles(password);
      await refreshHealth();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      alert('Ошибка при смене порядка: ' + message);
      await forceRefreshAdminArticles(password);
    } finally {
      setDraftOrder(null);
    }
  }, [articles, forceRefreshAdminArticles, password, setDraftOrder, updateArticles]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  type AdminNavKey = 'dashboard' | 'attribution' | 'meta' | 'articles' | 'cases' | 'content' | 'leads' | 'media' | 'health';
  const currentNavKey: AdminNavKey = adminView === 'articles'
    ? (adminSectionFilter === 'cases' ? 'cases' : 'articles')
    : adminView;
  const adminNavigation = [
    { key: 'dashboard', label: 'Сегодня', icon: LayoutDashboard },
    { key: 'attribution', label: 'Воронка', icon: BarChart3 },
    { key: 'meta', label: 'Meta CAPI', icon: Activity },
    { key: 'articles', label: 'Статьи', icon: Newspaper },
    { key: 'cases', label: 'Кейсы', icon: Briefcase },
    { key: 'content', label: 'Тексты сайта', icon: PanelsTopLeft },
    { key: 'leads', label: 'Заявки', icon: Inbox },
    { key: 'media', label: 'Медиатека', icon: Images },
    { key: 'health', label: 'Проверка', icon: Stethoscope },
  ] as const;
  const navigateToAdminSection = (destination: AdminNavKey) => {
    if (destination === 'articles' || destination === 'cases') {
      setAdminSectionFilter(destination === 'cases' ? 'cases' : 'blog');
      setAdminView('articles');
      return;
    }
    setAdminView(destination);
  };

  if (!isAuthenticated) {
    return (
      <AdminThemeProvider>
        <SEO title="Admin" description="Admin panel" url="/admin" noIndex />
        <main className="flex items-center justify-center p-4 min-h-screen">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="admin-panel w-full max-w-md p-6 sm:p-8">
            <div className="flex justify-between items-center mb-6">
              <div className="admin-login-brand">
                <WhaleMark size="var(--adm-login-whale-size)" className="admin-brand-whale" priority />
                <span className="admin-login-security">
                  <Lock aria-hidden="true" />
                  Защищённый доступ
                </span>
              </div>
              <AdminThemeToggleButton />
            </div>
            <h1 className="text-2xl text-center mb-2">Вход в админку</h1>
            <p className="text-center text-sm text-[var(--adm-fg)]/70 mb-6">Безопасный вход в CMS для управления контентом.</p>
            <form onSubmit={handleLogin} className="space-y-4">
              <label htmlFor="admin-password" className="block text-sm font-semibold text-[var(--adm-fg)]/80">Пароль администратора</label>
              <input id="admin-password" name="password" type="password" autoComplete="current-password" placeholder="Введите пароль" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] placeholder:text-[var(--adm-fg)]/54 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50" autoFocus />
              {error && <p className="text-[var(--adm-danger)] text-sm text-center" role="alert">{error}</p>}
              <button type="submit" disabled={authLoading} className="admin-button admin-button--primary w-full">
                <LogIn className="w-5 h-5" /> {authLoading ? 'Проверка...' : 'Войти'}
              </button>
            </form>
          </motion.div>
        </main>
      </AdminThemeProvider>
    );
  }

  return (
    <AdminThemeProvider>
      <SEO title="Admin" description="Admin panel" url="/admin" noIndex />
      <main className="px-4 py-6 sm:py-8 lg:py-10">
        <div className="max-w-7xl mx-auto">
          <header className="admin-header">
            <div className="admin-header__brand">
              <WhaleMark size="var(--adm-header-whale-size)" className="admin-brand-whale" priority />
              <div className="admin-header__brand-copy">
                <p className="admin-eyebrow">Control center</p>
                <h1 className="admin-header__title bg-gradient-to-r from-[var(--adm-primary)] to-[var(--adm-primary-strong)] bg-clip-text text-transparent">Whale Wizard</h1>
              </div>
            </div>
            <div className="admin-header__actions">
              <AdminThemeToggleButton />
              <span className="admin-source-pill admin-state">Источник: {sourceLabel}</span>
              <button type="button" onClick={async () => { await forceRefreshAdminArticles(password); await refreshHealth(); }} className="admin-button admin-button--quiet">Обновить данные</button>
              <button type="button" onClick={() => navigate('/')} className="admin-button admin-button--quiet">← На сайт</button>
            </div>
          </header>

          <div className="admin-mobile-nav" aria-label="Текущий раздел админки">
            <AdminSelect
              ariaLabel="Раздел админки"
              value={currentNavKey}
              options={adminNavigation.map((item) => ({ value: item.key, label: item.label }))}
              onValueChange={(value) => navigateToAdminSection(value as AdminNavKey)}
            />
          </div>

          <div className="flex flex-col lg:flex-row gap-5 lg:gap-6">
            <aside className="lg:w-52 shrink-0">
              <nav aria-label="Разделы админки" className="admin-sidebar-nav flex lg:flex-col gap-1.5 overflow-x-auto rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-2 lg:sticky lg:top-4">
                {adminNavigation.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => navigateToAdminSection(item.key)}
                    aria-current={currentNavKey === item.key ? 'page' : undefined}
                    className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm transition-colors ${currentNavKey === item.key ? 'bg-[var(--adm-primary)]/15 font-semibold text-[var(--adm-primary)]' : 'text-[var(--adm-fg)]/70 hover:bg-[var(--adm-muted)]/50'}`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" /> {item.label}
                  </button>
                ))}
              </nav>
            </aside>

            <div className="min-w-0 flex-1">
              {adminView === 'dashboard' && (
                <AdminToday
                  password={password}
                  onNavigate={(destination) => {
                    if (destination === 'articles') {
                      setAdminSectionFilter('all');
                      setAdminView('articles');
                    } else {
                      setAdminView(destination);
                    }
                  }}
                />
              )}
              {adminView === 'attribution' && <AdminAttribution password={password} />}
              {adminView === 'meta' && <AdminMetaCenter password={password} />}
              {adminView === 'content' && <AdminContentControl password={password} />}
              {adminView === 'leads' && <AdminLeads password={password} />}
              {adminView === 'media' && <AdminMedia password={password} articles={orderedArticles} />}
              {adminView === 'health' && <AdminHealth password={password} />}

              {adminView === 'articles' && (
          <div className="admin-editor-layout grid lg:grid-cols-3">
            <div className="admin-editor-list lg:col-span-1 p-4 h-fit rounded-2xl bg-[var(--adm-card)] border border-[var(--adm-border)]">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold text-[var(--adm-fg)]/90">
                  {adminSectionFilter === 'cases' ? 'Кейсы' : adminSectionFilter === 'all' ? 'Все публикации' : 'Статьи'}
                </h2>
                <button onClick={() => {
                  openArticleEditor({
                    // Раздел новой статьи подстраивается под активный фильтр:
                    // включён фильтр «Кейсы» — сразу создаём кейс
                    id: 0, slug: '', title: '', category: adminSectionFilter === 'cases' ? CASES_CATEGORY : 'Блог', readTime: '5 мин',
                    date: new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
                    description: '', summary: '', keyTakeaways: [], faq: [], tags: [], content: '', image: '',
                    status: 'published'
                  }, { dirty: true });
                }} className="admin-button h-10 w-10 p-0 text-[var(--adm-primary)]" aria-label="Создать публикацию" title="Создать публикацию">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="mb-3 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-muted)]/30 px-2 py-1.5">
                  <div className="text-sm font-semibold">{articleStats.total}</div>
                  <div className="admin-meta">всего</div>
                </div>
                <div className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-muted)]/30 px-2 py-1.5">
                  <div className="text-sm font-semibold">{articleStats.shown}</div>
                  <div className="admin-meta">видно</div>
                </div>
                <div className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-muted)]/30 px-2 py-1.5">
                  <div className="text-sm font-semibold">{articleStats.drafts}</div>
                  <div className="admin-meta">черн.</div>
                </div>
                <div className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-muted)]/30 px-2 py-1.5">
                  <div className="text-sm font-semibold">{articleStats.planned}</div>
                  <div className="admin-meta">план</div>
                </div>
              </div>
              <div className="mb-3 flex gap-2">
                <button type="button" aria-pressed={adminSectionFilter === 'all'} onClick={() => setAdminSectionFilter('all')} className={`px-3 py-1.5 rounded-lg border text-xs ${adminSectionFilter==='all' ? 'bg-[var(--adm-primary)]/20 border-[var(--adm-primary)] text-[var(--adm-primary)]' : 'border-[var(--adm-border)] text-[var(--adm-fg)]/70'}`}>Все</button>
                <button type="button" aria-pressed={adminSectionFilter === 'blog'} onClick={() => setAdminSectionFilter('blog')} className={`px-3 py-1.5 rounded-lg border text-xs ${adminSectionFilter==='blog' ? 'bg-[var(--adm-primary)]/20 border-[var(--adm-primary)] text-[var(--adm-primary)]' : 'border-[var(--adm-border)] text-[var(--adm-fg)]/70'}`}>Блог</button>
                <button type="button" aria-pressed={adminSectionFilter === 'cases'} onClick={() => setAdminSectionFilter('cases')} className={`px-3 py-1.5 rounded-lg border text-xs ${adminSectionFilter==='cases' ? 'bg-[var(--adm-primary)]/20 border-[var(--adm-primary)] text-[var(--adm-primary)]' : 'border-[var(--adm-border)] text-[var(--adm-fg)]/70'}`}>Кейсы</button>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--adm-fg)]/40" />
                <input
                  aria-label="Поиск публикаций"
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
                  <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-brand">
                    {filteredBySection.length === 0 && (
                      <div className="rounded-xl border border-[var(--adm-border)] bg-[var(--adm-muted)]/30 p-4 text-sm text-[var(--adm-fg)]/60">
                        Ничего не найдено. Проверьте поиск или фильтр раздела.
                      </div>
                    )}
                    {filteredBySection.map((article) => {
                      const articleIndex = orderedArticles.findIndex((item) => item.slug === article.slug);
                      return (
                        <AdminArticleItem
                          key={article.slug}
                          article={article}
                          index={articleIndex}
                          onEdit={(item) => openArticleEditor(item)}
                          onDuplicate={handleDuplicate}
                          onDelete={handleDelete}
                          onMove={moveArticle}
                          onDragEnd={() => void commitArticleOrder()}
                          locked={isProtectedArticle(article)}
                        />
                      );
                    })}
                  </div>
                </DndProvider>
              )}
            </div>

            <div className="admin-editor-main lg:col-span-2 p-4 sm:p-6 rounded-2xl bg-[var(--adm-card)] border border-[var(--adm-border)]">
              {editingArticle ? (
                <div className="space-y-4">
                  <div className="admin-editor-toolbar flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-muted)]/90 px-4 py-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <span>{editingArticle.id ? 'Редактирование статьи' : 'Новая статья'}</span>
                        {hasUnsavedChanges && <span className="text-xs rounded-full bg-yellow-500/15 px-2 py-0.5 text-yellow-500">есть изменения</span>}
                        {isEditingProtected && <span className="text-xs rounded-full bg-[var(--adm-primary)]/20 px-2 py-0.5 text-[var(--adm-primary)]">защищена</span>}
                      </div>
                      <div className="mt-1 text-xs text-[var(--adm-fg)]/55">
                        {contentStats.words} слов / {contentStats.chars} знаков в тексте
                      </div>
                    </div>
                    {editingArticle.slug && (
                      <button
                        type="button"
                        onClick={() => window.open(`/blog/${editingArticle.slug}`, '_blank', 'noopener,noreferrer')}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] px-3 py-2 text-sm text-[var(--adm-fg)] hover:bg-[var(--adm-muted)]/50"
                      >
                        <ExternalLink className="h-4 w-4" /> Открыть статью
                      </button>
                    )}
                  </div>

                  <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${editorIssues.length ? 'border-amber-500/25 bg-amber-500/8 text-amber-700 dark:text-amber-300' : 'border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300'}`}>
                    <span className="font-semibold">{editorIssues.length ? `Перед публикацией: ${editorIssues.length}` : 'Материал готов к публикации'}</span>
                    {editorIssues.length ? editorIssues.map((issue) => <span key={issue} className="rounded-full border border-current/15 bg-white/10 px-2 py-0.5">{issue}</span>) : <span className="opacity-75">проверьте финальную фактуру и ссылки</span>}
                  </div>

                  {isEditingProtected && (
                    <div className="rounded-xl border border-[var(--adm-primary)]/30 bg-[var(--adm-primary)]/10 px-4 py-3 text-sm text-[var(--adm-fg)]/80">
                      Эта статья защищена: ее нельзя сохранять, удалять, дублировать или перемещать. Можно только открыть и проверить содержимое.
                    </div>
                  )}

                  <fieldset disabled={isEditingProtected} className={`space-y-4 ${isEditingProtected ? 'opacity-70' : ''}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Заголовок</label>
                      <input aria-label="Заголовок публикации" type="text" value={editingArticle.title} onChange={(e) => handleTitleChange(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] placeholder:text-[var(--adm-fg)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Раздел публикации</label>
                      <AdminSelect
                        ariaLabel="Раздел публикации"
                        value={editingArticle.category || 'Блог'}
                        options={[{ value: 'Блог', label: 'Блог' }, { value: 'Кейсы', label: 'Кейсы' }]}
                        onValueChange={(value) => setEditingArticle({ ...editingArticle, category: value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Время чтения</label>
                      <input aria-label="Время чтения" type="text" value={editingArticle.readTime} onChange={(e) => setEditingArticle({ ...editingArticle, readTime: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Дата</label>
                      <input aria-label="Дата публикации текстом" type="text" value={editingArticle.date} onChange={(e) => setEditingArticle({ ...editingArticle, date: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="text-sm font-medium text-[var(--adm-fg)]/80">Статус:</label>
                    <div className="min-w-[190px]">
                      <AdminSelect
                        ariaLabel="Статус публикации"
                        value={editingArticle.status || 'published'}
                        options={[{ value: 'published', label: 'Опубликована' }, { value: 'draft', label: 'Черновик' }]}
                        onValueChange={(value) => setEditingArticle({ ...editingArticle, status: value as Article['status'] })}
                      />
                    </div>
                    {editingArticle.publishedAt && new Date(editingArticle.publishedAt) > new Date() && editingArticle.status === 'published' && (
                      <span className="text-xs text-blue-400">(запланирована на {new Date(editingArticle.publishedAt).toLocaleString()})</span>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80 flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> Дата публикации (оставьте пустой для немедленной)
                    </label>
                    <input
                      aria-label="Дата и время публикации"
                      type="datetime-local"
                      value={editingArticle.publishedAt ? editingArticle.publishedAt.slice(0, 16) : ''}
                      onChange={(e) => setEditingArticle({ ...editingArticle, publishedAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all"
                    />
                  </div>

                  {editingArticle.category === CASES_CATEGORY && (
                    <CaseFieldsEditor
                      value={editingArticle.caseData}
                      niches={knownNiches}
                      onChange={(caseData) => setEditingArticle({ ...editingArticle, caseData })}
                    />
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Краткое описание</label>
                    <textarea aria-label="Краткое описание" value={editingArticle.description} onChange={(e) => setEditingArticle({ ...editingArticle, description: e.target.value })} rows={3} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-textarea-bg)] text-[var(--adm-fg)] resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Краткое описание (AEO)</label>
                    <textarea aria-label="Краткое описание AEO" value={editingArticle.summary || ''} onChange={(e) => setEditingArticle({ ...editingArticle, summary: e.target.value })} rows={3} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-textarea-bg)] text-[var(--adm-fg)] resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                  </div>

                  <div className="rounded-xl border border-[var(--adm-border)] bg-[var(--adm-muted)]/25 p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[var(--adm-fg)]/90">SEO</h3>
                      <div className="text-xs text-[var(--adm-fg)]/55">
                        title {contentStats.seoTitle}/70 · description {contentStats.seoDescription}/170 · intro {contentStats.description}/160
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">SEO title</label>
                      <input
                        aria-label="SEO title"
                        type="text"
                        value={editingArticle.seoTitle || ''}
                        maxLength={120}
                        onChange={(e) => setEditingArticle({ ...editingArticle, seoTitle: e.target.value })}
                        placeholder={editingArticle.title}
                        className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all"
                      />
                      <p className="mt-1 text-xs text-[var(--adm-fg)]/50">Лучше держать в районе 50-70 знаков. API пропустит до 120.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">SEO description</label>
                      <textarea
                        aria-label="SEO description"
                        value={editingArticle.seoDescription || ''}
                        maxLength={220}
                        onChange={(e) => setEditingArticle({ ...editingArticle, seoDescription: e.target.value })}
                        placeholder={editingArticle.description}
                        rows={3}
                        className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-textarea-bg)] text-[var(--adm-fg)] resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all"
                      />
                      <p className="mt-1 text-xs text-[var(--adm-fg)]/50">Лучше держать в районе 140-170 знаков. API пропустит до 220.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Теги (по одному на строку)</label>
                      <textarea
                        aria-label="Теги публикации"
                        value={tagsText}
                        onChange={(e) => {
                          const tags = e.target.value.split('\n').map((line) => line.trim()).filter(Boolean);
                          setEditingArticle({ ...editingArticle, tags });
                        }}
                        rows={3}
                        className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-textarea-bg)] text-[var(--adm-fg)] resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Ключевые тезисы (по одному на строку)</label>
                    <textarea
                      aria-label="Ключевые тезисы"
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
                      aria-label="FAQ публикации"
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
                    <div className="admin-mobile-stack flex gap-2">
                      <input aria-label="URL обложки" type="text" value={editingArticle.image} onChange={(e) => setEditingArticle({ ...editingArticle, image: e.target.value })} className="flex-1 w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                      <label className="cursor-pointer px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] hover:bg-[var(--adm-muted)]/50 text-[var(--adm-fg)] transition-all flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        <input
                          type="file"
                          aria-label="Загрузить обложку"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const url = await uploadFile(file);
                            if (url) setEditingArticle({ ...editingArticle, image: url });
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Slug (URL-адрес статьи)</label>
                    <input aria-label="Slug публикации" type="text" value={editingArticle.slug} onChange={(e) => handleSlugChange(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                    <p className="text-xs text-[var(--adm-fg)]/50 mt-1">Автоматически из заголовка (если не трогать вручную). Только латиница и дефисы.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Содержание статьи</label>
                    <ArticleEditor content={editingArticle.content} onChange={handleContentChange} onUpload={uploadFile} readOnly={isEditingProtected} />
                  </div>
                  </fieldset>

                  {Boolean(editingArticle.id) && editingArticle.slug && !isEditingProtected && (
                    <ArticleVersionsPanel
                      key={editingArticle.slug}
                      slug={editingArticle.slug}
                      password={password}
                      onRestore={(article) => {
                        // Восстановленная версия применяется как несохранённые изменения:
                        // snapshot не трогаем, чтобы сработала защита от случайного закрытия.
                        setEditingArticle({ ...article, id: editingArticle.id, slug: editingArticle.slug });
                      }}
                    />
                  )}

                  <div className="admin-editor-actions flex gap-3">
                    <button onClick={() => handleSave('published')} disabled={isEditingProtected} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[var(--adm-primary)] to-[var(--adm-primary-strong)] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                      <Save className="w-4 h-4" /> Сохранить и опубликовать
                    </button>
                    <button onClick={() => handleSave('draft')} disabled={isEditingProtected} className="px-6 py-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] text-[var(--adm-fg)] hover:bg-[var(--adm-muted)]/50 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                      <EyeOff className="w-4 h-4" /> Черновик
                    </button>
                    <button onClick={closeArticleEditor} className="px-6 py-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] text-[var(--adm-fg)] hover:bg-[var(--adm-muted)]/50 transition-all">Отмена</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 py-6">
                  {editorBackup && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
                      <div className="text-sm text-[var(--adm-fg)]/85">
                        Найден автосохранённый черновик «{editorBackup.article.title || 'Без названия'}» от {new Date(editorBackup.savedAt).toLocaleString('ru-RU')}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openArticleEditor(editorBackup.article, { dirty: true, slugEdited: true })}
                          className="rounded-lg bg-[var(--adm-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                        >
                          Восстановить
                        </button>
                        <button
                          onClick={() => { if (confirm('Удалить автосохранённый черновик?')) clearEditorBackup(); }}
                          className="rounded-lg border border-[var(--adm-border)] px-4 py-2 text-sm text-[var(--adm-fg)]/70 hover:bg-[var(--adm-muted)]/50 transition-colors"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="text-center py-6 text-[var(--adm-fg)]/60">Выберите статью из списка или создайте новую</div>
                </div>
              )}
            </div>
          </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </AdminThemeProvider>
  );
}
