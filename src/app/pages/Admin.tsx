// Стили админки живут здесь, а не в глобальном index.css: иначе их 74 КБ
// попадают в блокирующую рендер таблицу стилей каждой публичной страницы.
//
// Шрифты подключены здесь же и по той же причине: Onest и Inter нужны только
// админке, публичные страницы остаются на системном стеке. Пакеты отдают
// woff2 из проекта — со сторонних доменов ничего не грузится, поэтому CSP
// трогать не пришлось. Браузер скачивает только кириллицу и латиницу:
// подмножества разделены unicode-range.
import '@fontsource-variable/onest';
import '@fontsource-variable/inter';
import '../../styles/admin-tailwind.css';
import '../../styles/admin-ui.css';
// Строго после admin-ui.css: слой темы переопределяет её поверхности.
import '../../styles/admin-theme.css';
import { lazy, Suspense, useEffect, useState, useMemo, useCallback, useRef, createContext, useContext } from 'react';
import { useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import {
  LogIn, Save, Plus, Trash2, Sun, Moon,
  Search, Copy, Calendar, EyeOff, Upload, GripVertical,
  ShieldCheck, ExternalLink, History, RotateCcw,
  LayoutDashboard, Newspaper, Briefcase, Inbox, Images, Stethoscope,
  Activity, BarChart3, PanelsTopLeft, Gauge, CalendarCheck, RefreshCw, Target, FileText,
  Rows2, Rows3, Users, Wallet, Lock, Radio, Database,
  type LucideIcon
} from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useArticles } from '../context/ArticlesContext';
import type { Article, CaseData } from '../components/hooks/useArticlesApi';
import { AdminSelect } from '../components/admin/AdminUI';
import { AdminConfirmProvider, AdminSectionSkeleton, AdminToaster, notify, useConfirm } from '../components/admin/AdminFeedback';
import { AdminPromptProvider } from '../components/admin/AdminPrompt';
import AdminCommandPalette, { type AdminCommandGroup } from '../components/admin/AdminCommandPalette';
import WhaleMark from '../components/brand/WhaleMark';
import SEO from '../components/SEO';

const ArticleEditor = lazy(() => import('../components/ArticleEditor'));
const CaseFieldsEditor = lazy(() => import('../components/CaseFieldsEditor'));
const AdminLeads = lazy(() => import('../components/admin/AdminLeads'));
const AdminClients = lazy(() => import('../components/admin/AdminClients'));
const AdminFinance = lazy(() => import('../components/admin/AdminFinance'));
const AdminMedia = lazy(() => import('../components/admin/AdminMedia'));
const AdminHealth = lazy(() => import('../components/admin/AdminHealth'));
const AdminSecurity = lazy(() => import('../components/admin/AdminSecurity'));
const AdminPageLocks = lazy(() => import('../components/admin/AdminPageLocks'));
const AdminDataLayer = lazy(() => import('../components/admin/AdminDataLayer'));
const AdminMigrations = lazy(() => import('../components/admin/AdminMigrations'));
const AdminToday = lazy(() => import('../components/admin/AdminToday'));
const AdminMetaCenter = lazy(() => import('../components/admin/AdminMetaCenter'));
const AdminAttribution = lazy(() => import('../components/admin/AdminAttribution'));
const AdminGoals = lazy(() => import('../components/admin/AdminGoals'));
const AdminReport = lazy(() => import('../components/admin/AdminReport'));
const ContentPerformance = lazy(() => import('../components/admin/ContentPerformance'));
const SeoAssistant = lazy(() => import('../components/admin/SeoAssistant'));
const AdminContentControl = lazy(() => import('../components/admin/AdminContentControl'));
const AdminPerformance = lazy(() => import('../components/admin/AdminPerformance'));
const AdminPlanner = lazy(() => import('../components/admin/AdminPlanner'));
const ArticleCalendar = lazy(() => import('../components/admin/ArticleCalendar'));

type AdminView = 'dashboard' | 'planner' | 'articles' | 'leads' | 'clients' | 'finance' | 'media' | 'health' | 'access' | 'meta' | 'attribution' | 'content' | 'performance' | 'goals' | 'report' | 'events' | 'migrations';
type AdminNavKey = AdminView | 'cases';

function preloadAdminSection(destination: AdminNavKey): Promise<unknown> {
  switch (destination) {
    case 'dashboard': return import('../components/admin/AdminToday');
    case 'planner': return import('../components/admin/AdminPlanner');
    case 'goals': return import('../components/admin/AdminGoals');
    case 'report': return import('../components/admin/AdminReport');
    case 'attribution': return import('../components/admin/AdminAttribution');
    case 'meta': return import('../components/admin/AdminMetaCenter');
    case 'performance': return import('../components/admin/AdminPerformance');
    case 'content': return import('../components/admin/AdminContentControl');
    case 'leads': return import('../components/admin/AdminLeads');
    case 'clients': return import('../components/admin/AdminClients');
    case 'finance': return import('../components/admin/AdminFinance');
    case 'media': return import('../components/admin/AdminMedia');
    case 'health': return import('../components/admin/AdminHealth');
    case 'access': return import('../components/admin/AdminPageLocks');
    case 'events': return import('../components/admin/AdminDataLayer');
    case 'migrations': return import('../components/admin/AdminMigrations');
    case 'articles':
    case 'cases':
      return Promise.all([
        import('../components/ArticleEditor'),
        import('../components/CaseFieldsEditor'),
        import('../components/admin/ContentPerformance'),
        import('../components/admin/SeoAssistant'),
        import('../components/admin/ArticleCalendar'),
      ]);
  }
}

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

interface AdminLoginResult {
  ok: boolean;
  /** Пароль верный, но нужен одноразовый код из приложения. */
  codeRequired?: boolean;
  error?: string;
}

const LOGIN_ERROR_TEXT: Record<string, string> = {
  invalid_credentials: 'Неверный пароль',
  invalid_code: 'Неверный код. Проверьте время на телефоне и введите свежий код',
  code_already_used: 'Этим кодом уже входили. Дождитесь следующего',
  password_required: 'Введите пароль',
  admin_password_not_configured: 'На сервере не задан пароль администратора',
};

/**
 * Поиск по карте значением из ответа: без проверки собственного ключа код
 * ответа `toString` вернул бы функцию, и на экран входа попал бы не текст.
 */
function loginErrorText(code: unknown): string {
  const key = String(code ?? '');
  if (Object.prototype.hasOwnProperty.call(LOGIN_ERROR_TEXT, key)) return LOGIN_ERROR_TEXT[key];
  return 'Не удалось войти';
}

/**
 * Вход отдаёт подписанную сессию в cookie. Пароль после этого в запросах не
 * участвует, поэтому перезагрузка страницы больше не разлогинивает.
 */
async function adminLogin(password: string, code: string): Promise<AdminLoginResult> {
  const res = await fetch('/api/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ action: 'login', password, code: code || undefined }),
  });
  const payload = await res.json().catch(() => null) as { success?: boolean; codeRequired?: boolean; error?: string } | null;

  if (res.ok && payload?.success) return { ok: true };
  if (payload?.codeRequired) return { ok: false, codeRequired: true };
  if (res.status === 429) return { ok: false, error: 'Слишком много попыток. Подождите и попробуйте снова' };
  return { ok: false, error: loginErrorText(payload?.error) };
}

/** Жива ли сессия с прошлого раза — проверяется один раз при открытии. */
async function checkAdminSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'status' }),
    });
    if (!res.ok) return false;
    const payload = await res.json().catch(() => null) as { authenticated?: boolean } | null;
    return payload?.authenticated === true;
  } catch {
    return false;
  }
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
  const confirmDialog = useConfirm();
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

  const restoreVersion = async (row: ArticleVersionRow) => {
    let parsed: Article;
    try {
      parsed = JSON.parse(row.version_data) as Article;
      if (!parsed || typeof parsed !== 'object' || !parsed.title) throw new Error('invalid payload');
    } catch {
      notify.error('Не удалось прочитать данные этой версии');
      return;
    }
    const confirmed = await confirmDialog({
      title: `Восстановить версию от ${formatVersionDate(row.created_at)}?`,
      description: 'Текущие несохранённые изменения в редакторе будут заменены.',
      confirmLabel: 'Восстановить',
    });
    if (confirmed) onRestore(parsed);
  };

  return (
    <details className="adm-inset">
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
              onClick={() => void restoreVersion(row)}
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

type AdminDensity = 'cozy' | 'compact';

interface AdminThemeContextValue {
  mode: 'light' | 'dark';
  toggleMode: () => void;
  density: AdminDensity;
  setDensity: (value: AdminDensity) => void;
}

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

function useAdminTheme() {
  const context = useContext(AdminThemeContext);
  if (!context) {
    return {
      mode: 'light' as const,
      toggleMode: () => {},
      density: 'cozy' as const,
      setDensity: () => {},
    };
  }
  return context;
}

/*
 * Свет за курсором. Обработчик один на всю админку и только пишет две
 * координаты в CSS-переменные ближайшей карточки — рисует уже CSS. Слушатель
 * пассивный и с кадровым троттлингом, поэтому прокрутка не проседает; при
 * системной настройке «меньше движения» он вообще не подключается.
 */
function useCardSpotlight() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia?.('(hover: none)').matches) return;

    const selector = '.adm-tile, .today-card, .crm-card, .admin-action-card, .clients__card, .fin-card, .admin-card, .today-quick, .planner-stat, .media-card, .admin-panel--interactive';
    // Наклон намеренно мелкий. Уже на 6-7° карточка начинает вести себя как
    // игрушка, текст на дальнем краю плывёт и читается хуже; 3° дают ощущение
    // отзывчивой поверхности, но буквы остаются на месте.
    const MAX_TILT = 3;
    let frame = 0;
    let last: MouseEvent | null = null;
    let active: HTMLElement | null = null;

    const clear = (element: HTMLElement) => {
      element.style.removeProperty('--adm-tilt-x');
      element.style.removeProperty('--adm-tilt-y');
    };

    const paint = () => {
      frame = 0;
      const event = last;
      if (!event) return;
      const target = event.target instanceof Element ? event.target.closest(selector) : null;

      if (active && active !== target) {
        clear(active);
        active = null;
      }
      if (!(target instanceof HTMLElement)) return;

      const box = target.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      target.style.setProperty('--adm-spot-x', `${Math.round(x)}px`);
      target.style.setProperty('--adm-spot-y', `${Math.round(y)}px`);

      // Доля смещения от центра: -1 у одного края, +1 у противоположного.
      const offsetX = box.width ? (x / box.width - 0.5) * 2 : 0;
      const offsetY = box.height ? (y / box.height - 0.5) * 2 : 0;
      target.style.setProperty('--adm-tilt-y', `${(offsetX * MAX_TILT).toFixed(2)}deg`);
      target.style.setProperty('--adm-tilt-x', `${(-offsetY * MAX_TILT).toFixed(2)}deg`);
      active = target;
    };

    const handleMove = (event: MouseEvent) => {
      last = event;
      if (frame) return;
      frame = requestAnimationFrame(paint);
    };

    // Уход курсора за пределы окна не даёт mousemove, и карточка осталась бы
    // наклонённой навсегда.
    const handleLeave = () => {
      if (active) {
        clear(active);
        active = null;
      }
    };

    document.addEventListener('mousemove', handleMove, { passive: true });
    document.addEventListener('mouseleave', handleLeave);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseleave', handleLeave);
      if (frame) cancelAnimationFrame(frame);
      if (active) clear(active);
    };
  }, []);
}

/*
 * Фактическая высота шапки — в переменную. На неё опираются липкие панели
 * внутри разделов (--adm-sticky-top), а записана она была числом 60px. Стоило
 * шапке стать выше — на узком экране она переносится в две строки — и панели
 * уезжали под неё. Наблюдатель за размером снимает вопрос навсегда: любая
 * будущая правка шапки больше не ломает липкие панели.
 */
function useTopbarHeight() {
  // Ref-функция, а не useRef: до входа шапки в разметке нет, и эффект с
  // обычным ref отработал бы один раз на пустоте и больше не запустился —
  // объект ref не меняется, зависимость не срабатывает. Состояние меняется
  // ровно тогда, когда узел появляется и исчезает.
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!node) return undefined;
    // Переменную нужно писать на .admin-root: она же объявляет её значение по
    // умолчанию, и запись на body ниже по каскаду просто не видна.
    const scope = node.closest('.admin-root') as HTMLElement | null;
    if (!scope) return undefined;

    // Пишем в отдельную переменную, а не в --adm-topbar-height. Та задаёт
    // шапке min-height: записав в неё измеренную высоту, наблюдатель получал
    // петлю — шапка запоминала свой самый высокий размер и уже не могла стать
    // ниже при возврате на широкий экран.
    const apply = (height: number) => {
      if (height > 0) scope.style.setProperty('--adm-topbar-measured', `${Math.round(height)}px`);
    };
    apply(node.getBoundingClientRect().height);

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => apply(entries[0]?.contentRect.height || 0));
    observer.observe(node);
    return () => {
      observer.disconnect();
      scope.style.removeProperty('--adm-topbar-measured');
    };
  }, [node]);

  return setNode;
}

function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  useCardSpotlight();
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('ww-admin-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Атрибут на body — единственное, что ставит JS. Сами значения живут в
  // admin-theme.css: инлайновые стили побеждали бы таблицу стилей, и обе темы
  // пришлось бы держать в двух местах сразу.
  useEffect(() => {
    localStorage.setItem('ww-admin-theme', mode);
    document.body.dataset.adminTheme = mode;
    return () => {
      delete document.body.dataset.adminTheme;
    };
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  // Плотность списков: «просторно» удобно читать, «плотно» — когда заявок или
  // файлов много и важнее увидеть больше строк за один экран.
  const [density, setDensityState] = useState<AdminDensity>(() => (
    localStorage.getItem('ww-admin-density') === 'compact' ? 'compact' : 'cozy'
  ));

  const setDensity = useCallback((value: AdminDensity) => setDensityState(value), []);

  useEffect(() => {
    localStorage.setItem('ww-admin-density', density);
  }, [density]);

  return (
    <AdminThemeContext.Provider value={{ mode, toggleMode, density, setDensity }}>
      <div style={{ minHeight: '100vh' }} className="admin-root transition-colors duration-300" data-theme={mode} data-density={density}>
        <div className="admin-shell bg-[var(--adm-bg)] text-[var(--adm-fg)] min-h-screen">
          <AdminConfirmProvider><AdminPromptProvider>{children}</AdminPromptProvider></AdminConfirmProvider>
          <AdminToaster theme={mode} />
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



/**
 * Палитра живёт внутри провайдера темы — только отсюда виден переключатель,
 * поэтому команду «сменить тему» дописываем здесь, а не в теле Admin.
 */
function AdminCommandHost({ open, onOpenChange, groups }: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  groups: AdminCommandGroup[];
}) {
  const { mode, toggleMode, density, setDensity } = useAdminTheme();
  const withTheme = groups.map((group) => (group.heading !== 'Действия' ? group : {
    ...group,
    items: [
      ...group.items,
      {
        id: 'density',
        label: density === 'compact' ? 'Просторные списки' : 'Плотные списки',
        searchText: 'Плотность списков просторно плотно',
        keywords: ['density', 'компактно', 'строки'],
        icon: density === 'compact' ? <Rows3 /> : <Rows2 />,
        run: () => setDensity(density === 'compact' ? 'cozy' : 'compact'),
      },
      {
        id: 'theme',
        label: mode === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему',
        // Ищется по «тема», а не по «включить»: иначе совпадение начинается
        // с середины строки и команда тонет под статьями.
        searchText: 'Тема оформления светлая тёмная',
        keywords: ['theme', 'dark', 'light', 'оформление'],
        icon: mode === 'dark' ? <Sun /> : <Moon />,
        run: toggleMode,
      },
    ],
  }));
  return <AdminCommandPalette open={open} onOpenChange={onOpenChange} groups={withTheme} />;
}

// Синонимы для поиска: «лиды» должны находить «Заявки», «pagespeed» — «Скорость».
// Само название раздела сюда не дублируется: поиск нечёткий, и повтор слова
// создаёт лишние совпадения (запрос «тема» находил «Медиатека медиатека»).
const ADMIN_NAV_KEYWORDS: Record<string, string[]> = {
  dashboard: ['главная', 'дашборд', 'старт', 'dashboard'],
  planner: ['неделя', 'задачи', 'привычки', 'planner'],
  leads: ['лиды', 'crm', 'сделки', 'контакты'],
  clients: ['абонентка', 'договор', 'отчёты', 'доступы', 'продление'],
  goals: ['план', 'выручка', 'бюджет', 'romi'],
  finance: ['счета', 'оплаты', 'налог', 'прибыль', 'часы', 'расходы'],
  attribution: ['атрибуция', 'конверсия', 'источники', 'utm', 'расходы'],
  meta: ['пиксель', 'события', 'facebook', 'фейсбук'],
  events: ['datalayer', 'gtm', 'tag manager', 'триггер', 'аналитика', 'ga4'],
  migrations: ['база', 'd1', 'схема', 'sql', 'миграция'],
  performance: ['pagespeed', 'vitals', 'производительность', 'lcp'],
  report: ['итоги', 'report'],
  articles: ['блог', 'публикации'],
  cases: ['портфолио', 'примеры'],
  content: ['редактор сайта', 'страницы', 'тексты', 'лендинг', 'шрифты', 'faq'],
  media: ['файлы', 'картинки', 'изображения', 'загрузки'],
  health: ['здоровье', 'диагностика', 'health'],
  access: ['блокировка', 'закрыть страницу', 'заглушка', 'разработка', 'доступ'],
};

function AdminDensitySwitch() {
  const { density, setDensity } = useAdminTheme();
  return (
    <div className="admin-density" role="group" aria-label="Плотность длинных списков">
      <span className="admin-density__label">Списки</span>
      <div className="admin-density__options">
        <button type="button" className="admin-density__option" aria-pressed={density === 'cozy'} onClick={() => setDensity('cozy')}>
          Просторно
        </button>
        <button type="button" className="admin-density__option" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}>
          Плотно
        </button>
      </div>
    </div>
  );
}

// Полгода без правок — материал пора перечитать: цифры, цены и скриншоты
// в маркетинговых статьях устаревают быстрее, чем сам текст.
const STALE_AFTER_DAYS = 180;

function daysSinceUpdate(article: Article): number | null {
  const raw = article.updatedAt || article.publishedAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86_400_000));
}

function formatStaleAge(days: number): string {
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} мес.`;
  const years = Math.floor(months / 12);
  if (years === 1) return 'год';
  return `${years} ${years < 5 ? 'года' : 'лет'}`;
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
  const staleDays = daysSinceUpdate(article);
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
      className={`admin-article-row p-2.5 rounded-xl border ${isOver ? 'border-[var(--adm-primary)] bg-[var(--adm-primary)]/10' : 'border-[var(--adm-border)] bg-[var(--adm-card)] hover:bg-[var(--adm-muted)]/50'}`}
      style={{ opacity: isDragging ? 0.35 : 1 }}
    >
      <button
        type="button"
        className={`admin-article-row__grab p-1.5 rounded-lg text-[var(--adm-fg)]/50 ${locked ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
        title={locked ? 'Статья защищена от изменений' : 'Перетащить'}
        aria-label={locked ? 'Статья защищена от перемещения' : 'Перетащить статью'}
        disabled={locked}
      >
        {locked ? <ShieldCheck className="w-4 h-4" /> : <GripVertical className="w-4 h-4" />}
      </button>
      <button type="button" onClick={() => onEdit(article)} className="admin-article-row__main" aria-label={`Редактировать: ${article.title}`}>
        <span className="admin-article-row__title">{article.title}</span>
        <span className="admin-article-row__slug">{article.slug}</span>
      </button>
      <div className="admin-article-row__badges">
        {locked && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--adm-primary)]/20 text-[var(--adm-primary)]">защищена</span>
        )}
        {staleDays !== null && staleDays >= STALE_AFTER_DAYS && article.status !== 'draft' && (
          <span
            className="admin-article-row__stale"
            title={`Последнее изменение: ${new Date(article.updatedAt || article.publishedAt || '').toLocaleDateString('ru-RU')}`}
          >
            не обновлялась {formatStaleAge(staleDays)}
          </span>
        )}
        {article.status === 'draft' ? (
          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">черновик</span>
        ) : article.publishedAt && new Date(article.publishedAt) > new Date() ? (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">запланирована</span>
        ) : (
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">опубл.</span>
        )}
      </div>
      <div className="admin-article-row__actions">
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
      </div>
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
  const confirmDialog = useConfirm();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [codeRequired, setCodeRequired] = useState(false);
  // Пока идёт проверка живой сессии, форму входа показывать нельзя: иначе она
  // мелькает на долю секунды у того, кто уже вошёл.
  const [sessionChecking, setSessionChecking] = useState(true);
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
  const reduceMotion = useReducedMotion();
  const [paletteOpen, setPaletteOpen] = useState(false);
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

  const closeArticleEditor = useCallback(async () => {
    if (hasUnsavedChanges) {
      const confirmed = await confirmDialog({
        title: 'Закрыть редактор?',
        description: 'Есть несохранённые изменения — они пропадут.',
        confirmLabel: 'Закрыть без сохранения',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    setEditingArticle(null);
    setSavedArticleSnapshot('');
    setSlugManuallyEdited(false);
    clearEditorBackup();
  }, [confirmDialog, hasUnsavedChanges, clearEditorBackup]);

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

  // Смена раздела начинается сверху: иначе после длинной страницы новый раздел
  // открывается где-то в середине, и кажется, что он загрузился неправильно.
  useEffect(() => {
    if (!isAuthenticated) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [adminView, isAuthenticated]);

  // Сессия с прошлого визита восстанавливается при открытии страницы.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const alive = await checkAdminSession();
      if (cancelled) return;
      if (alive) {
        void preloadAdminSection('dashboard');
        setIsAuthenticated(true);
        // Публикации грузятся и здесь, а не только после ввода пароля. Пока
        // перезагрузка разлогинивала, вход всегда шёл через форму и список
        // приходил вместе с ним. С появлением сессии перезагрузка оставляла
        // «Статьи» и «Кейсы» пустыми при полной базе — раздел уверенно
        // показывал ноль вместо тринадцати.
        //
        // Пароль здесь пуст: он живёт в памяти вкладки и перезагрузку не
        // переживает. Запрос всё равно проходит — действующую сессию
        // проверяет `api/admin/_middleware.ts` и сам подставляет пароль.
        void forceRefreshAdminArticles(password);
      }
      setSessionChecking(false);
    })();
    return () => { cancelled = true; };
    // Пустой список зависимостей намеренный: проверка сессии выполняется один
    // раз при открытии страницы.
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Введите пароль');
      return;
    }
    if (codeRequired && !twoFactorCode.trim()) {
      setError('Введите код из приложения');
      return;
    }
    setAuthLoading(true);
    try {
      const result = await adminLogin(password, twoFactorCode.trim());
      if (result.ok) {
        void preloadAdminSection('dashboard');
        await forceRefreshAdminArticles(password);
        setIsAuthenticated(true);
        setTwoFactorCode('');
        setError('');
      } else if (result.codeRequired) {
        // Пароль принят, остался второй шаг.
        setCodeRequired(true);
        setError('');
      } else {
        setTwoFactorCode('');
        setError(result.error || 'Не удалось войти');
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
      notify.error('Файл не загрузился', message);
      return null;
    }
  };

  const handleSave = async (status: Article['status'] = 'published') => {
    if (!editingArticle) return;
    if (isEditingProtected) {
      notify.error('Статья защищена', 'Её нельзя сохранять, удалять или перетаскивать через админку.');
      return;
    }
    if (!editingArticle.title.trim()) {
      notify.error('Нужен заголовок', 'Без него статью нельзя сохранить.');
      return;
    }
    if (!editingArticle.slug.trim()) {
      notify.error('Нужен адрес страницы', 'Заполните поле slug — это часть ссылки на статью.');
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
      notify.error('Такой адрес уже занят', `Slug «${normalizedArticle.slug}» стоит у статьи «${conflictingArticle.title}». Выберите другой.`);
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
        notify.success(status === 'draft' ? 'Черновик сохранён' : 'Опубликовано');
        setEditingArticle(null);
        setSavedArticleSnapshot('');
        setSlugManuallyEdited(false);
        clearEditorBackup();
        await forceRefreshAdminArticles(password);
        await refreshHealth();
      } else {
        notify.error('Не удалось сохранить', 'Проверьте консоль браузера (F12) — там будет причина.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      console.error('Ошибка при сохранении:', err);
      notify.error('Ошибка при сохранении', message);
    }
  };

  const handleDelete = async (slug: string) => {
    if (slug === PROTECTED_ARTICLE_SLUG) {
      notify.error('Статья защищена от удаления');
      return;
    }
    const confirmed = await confirmDialog({
      title: 'Удалить статью?',
      description: 'Публикация исчезнет с сайта. Действие необратимо.',
      confirmLabel: 'Удалить',
      tone: 'danger',
    });
    if (!confirmed) return;
    const updated = articles.filter(a => a.slug !== slug);
    try {
      const success = await updateArticles(updated, password);
      if (success) {
        if (editingArticle?.slug === slug) setEditingArticle(null);
        await forceRefreshAdminArticles(password);
        await refreshHealth();
      } else {
        notify.error('Не удалось удалить статью');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      notify.error('Ошибка при удалении', message);
    }
  };

  const handleDuplicate = (article: Article) => {
    if (isProtectedArticle(article)) {
      notify.error('Защищённую статью нельзя дублировать');
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
        notify.error('Порядок статей не сохранился');
      }
      await forceRefreshAdminArticles(password);
      await refreshHealth();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      notify.error('Ошибка при смене порядка', message);
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

  const currentNavKey: AdminNavKey = adminView === 'articles'
    ? (adminSectionFilter === 'cases' ? 'cases' : 'articles')
    : adminView;
  // Разделы сгруппированы по смыслу: одиннадцать пунктов подряд читаются
  // как список без приоритетов, а группами глаз находит нужное сразу.
  //
  // Тип задан явно. С `as const` без него каждая группа получала свой кортеж
  // с литеральными ключами, flatMap не выводил общий элемент и весь список
  // разделов становился unknown — а вместе с ним и подсветка активного пункта,
  // и заголовок раздела, и палитра команд.
  type AdminNavItem = {
    readonly key: AdminNavKey;
    readonly label: string;
    readonly icon: LucideIcon;
  };
  const adminNavGroups: ReadonlyArray<{ readonly title: string; readonly items: readonly AdminNavItem[] }> = [
    {
      title: 'Работа',
      items: [
        { key: 'dashboard', label: 'Сегодня', icon: LayoutDashboard },
        { key: 'planner', label: 'Планер', icon: CalendarCheck },
        { key: 'leads', label: 'Заявки', icon: Inbox },
        { key: 'clients', label: 'Клиенты', icon: Users },
      ],
    },
    {
      title: 'Аналитика',
      items: [
        { key: 'finance', label: 'Финансы', icon: Wallet },
        { key: 'goals', label: 'Цели и деньги', icon: Target },
        { key: 'attribution', label: 'Воронка', icon: BarChart3 },
        { key: 'meta', label: 'Meta CAPI', icon: Activity },
        { key: 'events', label: 'События', icon: Radio },
        { key: 'performance', label: 'Скорость', icon: Gauge },
        { key: 'report', label: 'Отчёт за месяц', icon: FileText },
      ],
    },
    {
      title: 'Контент',
      items: [
        { key: 'articles', label: 'Статьи', icon: Newspaper },
        { key: 'cases', label: 'Кейсы', icon: Briefcase },
        { key: 'content', label: 'Редактор сайта', icon: PanelsTopLeft },
        { key: 'media', label: 'Медиатека', icon: Images },
      ],
    },
    {
      title: 'Система',
      items: [
        { key: 'access', label: 'Доступ к страницам', icon: Lock },
        { key: 'migrations', label: 'Миграции', icon: Database },
        { key: 'health', label: 'Проверка', icon: Stethoscope },
      ],
    },
  ];
  const topbarRef = useTopbarHeight();

  const adminNavigation = adminNavGroups.flatMap((group) => group.items);
  const navigateToAdminSection = (destination: AdminNavKey) => {
    void preloadAdminSection(destination);
    if (destination === 'articles' || destination === 'cases') {
      setAdminSectionFilter(destination === 'cases' ? 'cases' : 'blog');
      setAdminView('articles');
      return;
    }
    setAdminView(destination);
  };

  const createArticleDraft = (category: string) => openArticleEditor({
    id: 0, slug: '', title: '', category, readTime: '5 мин',
    date: new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
    description: '', summary: '', keyTakeaways: [], faq: [], tags: [], content: '', image: '',
    status: 'published',
  }, { dirty: true });

  /**
   * Черновик кейса, собранный из помесячных результатов клиента.
   *
   * Раздел «Клиенты» считает числа, а редактор статей умеет их показывать —
   * здесь эти два места встречаются. Публикация не происходит: создаётся
   * черновик, который владелец дописывает своими словами и публикует сам.
   */
  const createCaseFromClient = (payload: { caseData: CaseData; outline: string; title: string }) => {
    setAdminSectionFilter('cases');
    setAdminView('articles');
    openArticleEditor({
      id: 0,
      slug: '',
      title: payload.title,
      category: CASES_CATEGORY,
      readTime: '5 мин',
      date: new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
      description: '',
      summary: '',
      keyTakeaways: [],
      faq: [],
      tags: [],
      content: payload.outline,
      image: '',
      // Черновик, а не публикация: цифры посчитаны, но история кейса ещё не
      // написана, и выкладывать такое на сайт нельзя.
      status: 'draft',
      caseData: payload.caseData,
    }, { dirty: true });
    notify.success('Черновик кейса собран', 'Цифры подставлены — допишите историю и опубликуйте');
  };

  const openArticleFromPalette = (article: Article) => {
    setAdminSectionFilter('all');
    setAdminView('articles');
    openArticleEditor(article);
  };

  const commandGroups: AdminCommandGroup[] = [
    {
      heading: 'Разделы',
      items: adminNavigation.map((item) => ({
        id: `nav-${item.key}`,
        label: item.label,
        keywords: ADMIN_NAV_KEYWORDS[item.key],
        icon: <item.icon />,
        run: () => navigateToAdminSection(item.key),
      })),
    },
    {
      heading: 'Действия',
      items: [
        {
          id: 'new-article',
          label: 'Написать статью',
          keywords: ['новая', 'создать', 'пост', 'блог'],
          icon: <Plus />,
          run: () => { setAdminSectionFilter('blog'); setAdminView('articles'); createArticleDraft('Блог'); },
        },
        {
          id: 'new-case',
          label: 'Добавить кейс',
          keywords: ['новый', 'создать', 'портфолио'],
          icon: <Briefcase />,
          run: () => { setAdminSectionFilter('cases'); setAdminView('articles'); createArticleDraft(CASES_CATEGORY); },
        },
        {
          id: 'refresh',
          label: 'Обновить данные',
          keywords: ['перезагрузить', 'обновить', 'refresh'],
          icon: <RefreshCw />,
          run: () => { void (async () => { await forceRefreshAdminArticles(password); await refreshHealth(); })(); },
        },
        {
          id: 'open-site',
          label: 'Открыть сайт',
          keywords: ['сайт', 'главная', 'публичная'],
          icon: <ExternalLink />,
          run: () => navigate('/'),
        },
      ],
    },
    {
      heading: 'Публикации',
      items: orderedArticles.slice(0, 60).map((article) => ({
        id: `article-${article.slug}`,
        label: article.title || 'Без названия',
        // Slug уникален — он же не даёт совпасть двум одинаковым заголовкам.
        searchText: `${article.title} ${article.slug}`,
        hint: article.category === CASES_CATEGORY ? 'кейс' : 'статья',
        icon: article.category === CASES_CATEGORY ? <Briefcase /> : <Newspaper />,
        run: () => openArticleFromPalette(article),
      })),
    },
  ];

  if (!isAuthenticated && sessionChecking) {
    return (
      <AdminThemeProvider>
        <SEO title="Admin" description="Admin panel" url="/admin" noIndex />
        <main className="admin-login">
          <div className="admin-login__card">
            <div className="admin-login__head">
              <WhaleMark size="var(--adm-login-whale-size)" className="admin-brand-whale" priority />
            </div>
            <p className="admin-login__note">Проверяю сессию…</p>
          </div>
        </main>
      </AdminThemeProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <AdminThemeProvider>
        <SEO title="Admin" description="Admin panel" url="/admin" noIndex />
        <main className="admin-login">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
            className="admin-login__card"
          >
            <div className="admin-login__head">
              <WhaleMark size="var(--adm-login-whale-size)" className="admin-brand-whale" priority />
              <AdminThemeToggleButton />
            </div>
            <h1 className="admin-login__title">Вход в админку</h1>
            <p className="admin-login__note">Сайт, заявки и отчёты Whale Wizard.</p>
            <form onSubmit={handleLogin} className="admin-login__form">
              <div className="admin-field">
                <label htmlFor="admin-password" className="admin-label">Пароль</label>
                <input
                  id="admin-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Введите пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="admin-input"
                  autoFocus
                />
              </div>
              {codeRequired && (
                <div className="admin-field">
                  <label htmlFor="admin-2fa-code" className="admin-label">Код из приложения</label>
                  <input
                    id="admin-2fa-code"
                    name="one-time-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    // Резервный код длиннее шести цифр, поэтому жёсткого
                    // ограничения по длине здесь нет.
                    placeholder="6 цифр или резервный код"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    className="admin-input"
                    autoFocus
                  />
                  <p className="admin-login__note">Google Authenticator на телефоне. Если телефона нет — введите один из резервных кодов.</p>
                </div>
              )}
              {error && <p className="admin-login__error" role="alert">{error}</p>}
              <button type="submit" disabled={authLoading} className="admin-button admin-button--primary admin-login__submit">
                <LogIn aria-hidden="true" /> {authLoading ? 'Проверяю' : 'Войти'}
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
      <AdminCommandHost open={paletteOpen} onOpenChange={setPaletteOpen} groups={commandGroups} />
      {/* data-section красит обложку раздела и активный пункт меню: пара тонов
          задана в admin-theme.css, а не здесь, поэтому цвет и разметка не
          расходятся при добавлении раздела. */}
      <div className="admin-app" data-section={currentNavKey}>
        {/*
          Световая волна при смене раздела. key по разделу обязателен:
          CSS-анимация запускается на монтировании узла, и без пересоздания
          она проиграла бы один раз за загрузку страницы, а не на каждом
          переходе.
        */}
        <span className="admin-sweep" key={`sweep-${currentNavKey}`} aria-hidden="true" />
        <header className="admin-topbar" ref={topbarRef}>
          <div className="admin-topbar__inner">
            <div className="admin-topbar__brand">
              <WhaleMark size="var(--adm-header-whale-size)" className="admin-brand-whale" priority />
              <span className="admin-topbar__brand-copy">
                <span className="admin-topbar__brand-name">Whale Wizard</span>
                <span className="admin-topbar__brand-note">Control center</span>
              </span>
            </div>

            <div className="admin-mobile-nav" aria-label="Текущий раздел админки">
              <AdminSelect
                ariaLabel="Раздел админки"
                value={currentNavKey}
                options={adminNavigation.map((item) => ({ value: item.key, label: item.label }))}
                onValueChange={(value) => navigateToAdminSection(value as AdminNavKey)}
              />
            </div>

            <div className="admin-topbar__actions">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="admin-button admin-button--quiet admin-topbar__search"
                title="Поиск и команды (Ctrl+K)"
                aria-label="Поиск и команды"
              >
                <Search aria-hidden="true" />
                <span className="admin-topbar__label">Найти</span>
                <kbd className="admin-topbar__kbd" aria-hidden="true">Ctrl K</kbd>
              </button>
              <button
                type="button"
                onClick={async () => { await forceRefreshAdminArticles(password); await refreshHealth(); }}
                className="admin-button admin-button--quiet"
                title={`Источник контента: ${sourceLabel}`}
              >
                <RefreshCw aria-hidden="true" /> <span className="admin-topbar__label">Обновить данные</span>
              </button>
              <AdminThemeToggleButton />
              <button type="button" onClick={() => navigate('/')} className="admin-button admin-button--quiet" title="Открыть сайт">
                <ExternalLink aria-hidden="true" /> <span className="admin-topbar__label">На сайт</span>
              </button>
            </div>
          </div>
        </header>

        <div className="admin-app__body">
          <aside className="admin-sidebar">
            <nav aria-label="Разделы админки" className="admin-sidebar__nav">
              {adminNavGroups.map((group) => (
                <div className="admin-sidebar__group" key={group.title}>
                  <p className="admin-sidebar__group-title">{group.title}</p>
                  {group.items.map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => navigateToAdminSection(item.key)}
                      onPointerEnter={() => { void preloadAdminSection(item.key); }}
                      onFocus={() => { void preloadAdminSection(item.key); }}
                      aria-current={currentNavKey === item.key ? 'page' : undefined}
                      className="admin-sidebar__link"
                    >
                      <span className="admin-sidebar__icon" aria-hidden="true"><item.icon /></span>
                      <span className="admin-sidebar__label">{item.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <AdminDensitySwitch />
            <p className="admin-sidebar__foot">Источник контента: {sourceLabel}</p>
          </aside>

          <main className="admin-content">
            {/*
              key по разделу заставляет React пересобрать поддерево при
              переключении — иначе браузер считает узлы теми же самыми и
              анимация появления проигрывается только один раз за загрузку.
            */}
            <div className="admin-content__inner" key={currentNavKey}>
              {/*
                Названия раздела над заголовком больше нет: оно повторяло и
                подсвеченный пункт бокового меню, и сам заголовок страницы —
                три раза одно слово подряд. На узком экране раздел по-прежнему
                виден в шапке, там боковое меню скрыто.
              */}

            <Suspense fallback={<AdminSectionSkeleton />}>
              <motion.div
                key={adminView}
                className="min-w-0"
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.26, ease: [0.22, 0.61, 0.36, 1] }}
              >
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
              {adminView === 'planner' && <AdminPlanner password={password} />}
              {adminView === 'goals' && <AdminGoals password={password} />}
              {adminView === 'report' && <AdminReport password={password} />}
              {adminView === 'attribution' && <AdminAttribution password={password} />}
              {adminView === 'meta' && <AdminMetaCenter password={password} />}
              {adminView === 'performance' && <AdminPerformance password={password} />}
              {adminView === 'content' && <AdminContentControl password={password} />}
              {adminView === 'leads' && <AdminLeads password={password} onOpenClients={() => setAdminView('clients')} />}
              {adminView === 'clients' && (
                <AdminClients
                  password={password}
                  onOpenLead={() => setAdminView('leads')}
                  onCreateCase={createCaseFromClient}
                />
              )}
              {adminView === 'finance' && <AdminFinance password={password} />}
              {adminView === 'media' && <AdminMedia password={password} articles={orderedArticles} />}
              {adminView === 'access' && <AdminPageLocks password={password} />}
              {adminView === 'events' && <AdminDataLayer />}
              {adminView === 'migrations' && <AdminMigrations password={password} />}
              {adminView === 'health' && (
                <div className="admin-stack admin-stack--lg">
                  {/* Настройки входа живут рядом с остальными проверками
                      здоровья: это тоже «всё ли в порядке», а не отдельный
                      раздел меню. */}
                  <AdminSecurity />
                  <AdminHealth password={password} />
                </div>
              )}

              {adminView === 'articles' && (
          <DndProvider backend={HTML5Backend}>
          <div className="admin-editor-layout">
            <div className="admin-editor-list p-4 h-fit rounded-2xl bg-[var(--adm-card)] border border-[var(--adm-border)]">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold text-[var(--adm-fg)]/90">
                  {adminSectionFilter === 'cases' ? 'Кейсы' : adminSectionFilter === 'all' ? 'Все публикации' : 'Статьи'}
                </h2>
                <button onClick={() => {
                  // Раздел новой статьи подстраивается под активный фильтр:
                  // включён фильтр «Кейсы» — сразу создаём кейс
                  createArticleDraft(adminSectionFilter === 'cases' ? CASES_CATEGORY : 'Блог');
                }} className="admin-button h-10 w-10 p-0 text-[var(--adm-primary)]" aria-label="Создать публикацию" title="Создать публикацию">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="mb-3 grid grid-cols-4 gap-2 text-center">
                <div className="adm-inset px-2 py-1.5">
                  <div className="text-sm font-semibold">{articleStats.total}</div>
                  <div className="admin-meta">всего</div>
                </div>
                <div className="adm-inset px-2 py-1.5">
                  <div className="text-sm font-semibold">{articleStats.shown}</div>
                  <div className="admin-meta">видно</div>
                </div>
                <div className="adm-inset px-2 py-1.5">
                  <div className="text-sm font-semibold">{articleStats.drafts}</div>
                  <div className="admin-meta">черн.</div>
                </div>
                <div className="adm-inset px-2 py-1.5">
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
                  <div className="admin-article-list space-y-2 max-h-[600px] overflow-y-auto scrollbar-brand">
                    {filteredBySection.length === 0 && (
                      <div className="adm-inset p-4 text-sm text-[var(--adm-fg)]/60">
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
              )}

              {/* Окупаемость и календарь стоят под списком и свёрнуты: раньше
                  они занимали два экрана над списком, и до самих публикаций
                  приходилось долго скроллить. */}
              <details className="admin-disclosure mt-3">
                <summary>
                  <span>Что приносит заявки</span>
                  <span className="admin-meta">за 90 дней</span>
                </summary>
                <div className="px-3.5 pb-3.5">
                  <ContentPerformance
                    password={password}
                    articles={orderedArticles}
                    onOpen={(article) => openArticleEditor(article)}
                  />
                </div>
              </details>

              <details className="admin-disclosure mt-2" open>
                <summary>
                  <span>Календарь публикаций</span>
                  <span className="admin-meta">{articleStats.planned} в плане</span>
                </summary>
                <div className="px-3.5 pb-3.5">
                  <ArticleCalendar
                    articles={orderedArticles}
                    onOpen={(article) => openArticleEditor(article)}
                  />
                </div>
              </details>
            </div>

            <div className="admin-editor-main p-4 sm:p-6 rounded-2xl bg-[var(--adm-card)] border border-[var(--adm-border)]">
              {editingArticle ? (
                <div className="space-y-4">
                  <div className="admin-editor-toolbar adm-inset flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
                        onClick={() => window.open(
                          // Кейсы живут на /cases: раньше кнопка всегда вела на /blog
                          // и для кейса открывала несуществующий адрес.
                          `${editingArticle.category === CASES_CATEGORY ? '/cases' : '/blog'}/${editingArticle.slug}`,
                          '_blank',
                          'noopener,noreferrer',
                        )}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] px-3 py-2 text-sm text-[var(--adm-fg)] hover:bg-[var(--adm-muted)]/50"
                      >
                        <ExternalLink className="h-4 w-4" /> {editingArticle.category === CASES_CATEGORY ? 'Открыть кейс' : 'Открыть статью'}
                      </button>
                    )}
                  </div>

                  <SeoAssistant article={editingArticle} />

                  {isEditingProtected && (
                    <div className="rounded-xl border border-[var(--adm-primary)]/30 bg-[var(--adm-primary)]/10 px-4 py-3 text-sm text-[var(--adm-fg)]/80">
                      Эта статья защищена: ее нельзя сохранять, удалять, дублировать или перемещать. Можно только открыть и проверить содержимое.
                    </div>
                  )}

                  <fieldset disabled={isEditingProtected} className={`space-y-4 ${isEditingProtected ? 'opacity-70' : ''}`}>
                  <section className="admin-editor-section space-y-4">
                  <h3 className="admin-editor-section__title">Основное</h3>
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
                  </section>

                  {editingArticle.category === CASES_CATEGORY && (
                    <CaseFieldsEditor
                      value={editingArticle.caseData}
                      niches={knownNiches}
                      onChange={(caseData) => setEditingArticle({ ...editingArticle, caseData })}
                    />
                  )}

                  <section className="admin-editor-section space-y-4">
                  <h3 className="admin-editor-section__title">Описания</h3>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Краткое описание</label>
                    <textarea aria-label="Краткое описание" value={editingArticle.description} onChange={(e) => setEditingArticle({ ...editingArticle, description: e.target.value })} rows={3} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-textarea-bg)] text-[var(--adm-fg)] resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">Краткое описание (AEO)</label>
                    <textarea aria-label="Краткое описание AEO" value={editingArticle.summary || ''} onChange={(e) => setEditingArticle({ ...editingArticle, summary: e.target.value })} rows={3} maxLength={350} className="w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-textarea-bg)] text-[var(--adm-fg)] resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                    <p className="mt-1 text-xs text-[var(--adm-fg)]/50">Ответ для поисковиков и ИИ: {(editingArticle.summary || '').length}/350 знаков — длиннее сервер обрежет.</p>
                  </div>
                  </section>

                  <section className="admin-editor-section space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="admin-editor-section__title mb-0">SEO</h3>
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
                  </section>

                  <section className="admin-editor-section space-y-4">
                  <h3 className="admin-editor-section__title">Тезисы и FAQ</h3>
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
                  </section>

                  <section className="admin-editor-section space-y-4">
                  <h3 className="admin-editor-section__title">Обложка и адрес</h3>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--adm-fg)]/80">URL обложки</label>
                    <div className="admin-mobile-stack flex gap-2">
                      <input aria-label="URL обложки" type="text" value={editingArticle.image} onChange={(e) => setEditingArticle({ ...editingArticle, image: e.target.value })} className="flex-1 w-full px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all" />
                      <label className="cursor-pointer px-4 py-2.5 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] hover:bg-[var(--adm-muted)]/50 text-[var(--adm-fg)] transition-all flex items-center justify-center gap-2 whitespace-nowrap">
                        <Upload className="w-4 h-4" />
                        <span className="sm:hidden">Загрузить файл</span>
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
                  </section>

                  <section className="admin-editor-section space-y-4">
                    <h3 className="admin-editor-section__title">Содержание статьи</h3>
                    <ArticleEditor content={editingArticle.content} onChange={handleContentChange} onUpload={uploadFile} readOnly={isEditingProtected} />
                  </section>
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
                          onClick={() => { void confirmDialog({ title: 'Удалить автосохранённый черновик?', description: 'Восстановить его после этого будет нельзя.', confirmLabel: 'Удалить', tone: 'danger' }).then((ok) => { if (ok) clearEditorBackup(); }); }}
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
          </DndProvider>
              )}
              </motion.div>
            </Suspense>
            </div>
          </main>
        </div>
      </div>
    </AdminThemeProvider>
  );
}
