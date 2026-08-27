// Тот же файл стилей, что и у CaseArticleView: кроме .case-article-* в нём
// лежат все .cases-* правила витрины кейсов, поэтому импорт нужен и здесь.
import '../../styles/cases-finder.css';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpDown,
  BriefcaseBusiness,
  Check,
  Filter,
  Search,
  Sparkles,
  Trophy,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import SEO from '../components/SEO';
import { isCaseArticle } from '../utils/articleCategory';
import Navbar from '../components/Navbar';
import PageNav from '../components/PageNav';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../components/ui/sheet';
import { useArticles } from '../context/ArticlesContext';
import { isMetaSafeCaseFilterValue, trackCaseFilter } from '../consent/consent';
import type { Article, CaseData } from '../components/hooks/useArticlesApi';
import DeferredImage from '../components/DeferredImage';
import ArticlesLoadError from '../components/ArticlesLoadError';
import { useManagedTitleFit } from '../utils/contentTypography';
import {
  CASE_BACK_TARGETS,
  getCaseCover,
  getCaseCoverAlt,
  getCaseDisplayTitle,
  getCaseGoals,
  getMergedCaseData,
} from '../data/caseCatalog';

const Footer = lazy(() => import('../components/Footer'));

const INTRO_TITLE_LINES = { titleMaxLinesDesktop: 2, titleMaxLinesMobile: 2 };

// Keep only known acquisition parameters while the catalog rewrites its own
// filters. This preserves attribution without forwarding arbitrary query data.
const CASE_ATTRIBUTION_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'fbclid',
  'gclid',
  'wbraid',
  'gbraid',
  'yclid',
] as const;

const SOURCE_LABELS: Record<string, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  tiktok: 'TikTok',
};

const ENTRY_PRESETS: Record<string, { sources: string[]; nicheHints: string[]; text: string }> = {
  'meta-apps': {
    sources: ['meta'],
    nicheHints: ['приложен'],
    text: 'Показаны кейсы, где Meta Ads была частью системы продвижения. Отдельные разборы приложений будут добавляться по мере публикации.',
  },
  'meta-ads': {
    sources: ['meta'],
    nicheHints: [],
    text: 'Показаны кейсы, в которых использовались Facebook и Instagram Ads.',
  },
  'google-ads': {
    sources: ['google'],
    nicheHints: [],
    text: 'Показаны кейсы, в которых Google Ads была частью рекламной системы.',
  },
};

type SortValue = 'fresh' | 'roi' | 'budget';
type CaseFilterKind = 'niche' | 'source' | 'result';

type CatalogArticle = Pick<
  Article,
  'id' | 'slug' | 'title' | 'category' | 'readTime' | 'date' | 'description' | 'image' | 'tags' | 'caseData' | 'publishedAt' | 'updatedAt'
>;

type CaseView = {
  key: string;
  slug: string;
  title: string;
  description: string;
  readTime: string;
  date: string;
  publishedAt?: string;
  fallback: boolean;
  image: string;
  imageAlt: string;
  goals: string[];
  data: CaseData;
};

type FilterOption = {
  value: string;
  label: string;
  count: number;
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] || source.charAt(0).toUpperCase() + source.slice(1);
}

function caseViewFromArticle(article: CatalogArticle, fallback = false): CaseView {
  return {
    key: `${fallback ? 'fallback' : 'article'}-${article.slug}`,
    slug: article.slug,
    title: getCaseDisplayTitle(article.title),
    description: article.description || '',
    readTime: article.readTime || '8 мин',
    date: article.date || '',
    publishedAt: article.publishedAt || article.updatedAt,
    fallback,
    image: getCaseCover(article),
    imageAlt: getCaseCoverAlt(article),
    goals: getCaseGoals(article),
    data: getMergedCaseData(article),
  };
}

function formatInteger(value?: number): string {
  if (!value) return '—';
  return `${new Intl.NumberFormat('ru-RU').format(value)}+`;
}

function formatBudget(value?: number, label?: string): string {
  if (label) return label;
  if (!value) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)} млн+`;
  return `$${Math.round(value / 1000)}k+`;
}

function parseCaseDate(item: CaseView): number {
  const iso = Date.parse(item.publishedAt || '');
  if (Number.isFinite(iso)) return iso;
  const match = item.date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return 0;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function pluralCases(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'кейс';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'кейса';
  return 'кейсов';
}

function filterUrlToken(kind: CaseFilterKind, value: string): string {
  if (isMetaSafeCaseFilterValue(value)) return value;
  let hash = 2166136261;
  const input = `${kind}:${value.trim().toLocaleLowerCase('ru')}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `f_${(hash >>> 0).toString(36)}`;
}

function readSelectedParams(params: URLSearchParams, key: string, kind: CaseFilterKind, allowed: string[]): string[] {
  return params.getAll(key).flatMap((rawValue) => {
    const tokenMatch = allowed.find((value) => filterUrlToken(kind, value) === rawValue);
    if (tokenMatch) return [tokenMatch];
    // Legacy comma links remain valid only for values from the neutral allowlist.
    return rawValue.split(',').map((value) => value.trim()).filter((value) => (
      allowed.includes(value) && isMetaSafeCaseFilterValue(value)
    ));
  });
}

function FilterCheckbox({ active, count, label, onClick }: { active: boolean; count: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onClick}
      className="cases-filter-option group"
    >
      <span className={`cases-filter-check ${active ? 'is-active' : ''}`} aria-hidden="true">
        {active ? <Check className="h-3.5 w-3.5" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className="cases-filter-count">{count}</span>
    </button>
  );
}

function FilterGroup({ label, options, selected, onToggle }: {
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="cases-filter-group">
      <legend>{label}</legend>
      <div className="space-y-1">
        {options.map((option) => (
          <FilterCheckbox
            key={option.value}
            active={selected.has(option.value)}
            count={option.count}
            label={option.label}
            onClick={() => onToggle(option.value)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function CatalogFilters({
  nicheOptions,
  sourceOptions,
  goalOptions,
  niches,
  sources,
  goals,
  onToggleNiche,
  onToggleSource,
  onToggleGoal,
  onClear,
  hasFilters,
}: {
  nicheOptions: FilterOption[];
  sourceOptions: FilterOption[];
  goalOptions: FilterOption[];
  niches: Set<string>;
  sources: Set<string>;
  goals: Set<string>;
  onToggleNiche: (value: string) => void;
  onToggleSource: (value: string) => void;
  onToggleGoal: (value: string) => void;
  onClear: () => void;
  hasFilters: boolean;
}) {
  return (
    <div className="cases-filter-panel">
      <div className="cases-filter-heading">
        <strong>Фильтры</strong>
        {hasFilters ? (
          <button type="button" onClick={onClear}>Сбросить</button>
        ) : null}
      </div>
      <FilterGroup label="Канал" options={sourceOptions} selected={sources} onToggle={onToggleSource} />
      <FilterGroup label="Ниша" options={nicheOptions} selected={niches} onToggle={onToggleNiche} />
      <FilterGroup label="Результат" options={goalOptions} selected={goals} onToggle={onToggleGoal} />
    </div>
  );
}

function ResultMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="cases-result-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function CaseResultCard({ item, index, href, onOpen }: { item: CaseView; index: number; href: string; onOpen: (item: CaseView) => void }) {
  const reduceMotion = useReducedMotion();
  const isFeatured = Boolean(item.data.featured);
  const metrics = item.data.metrics || [];
  const mainMetric = item.data.headline || metrics[0]?.value || 'Разбор';
  const mainMetricLabel = item.data.headlineLabel || metrics[0]?.label || 'проекта';
  const mobileMetrics = metrics.length ? metrics.slice(0, 3) : [{ value: mainMetric, label: mainMetricLabel }];

  return (
    <motion.article
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
      transition={reduceMotion ? undefined : { duration: 0.24, delay: Math.min(index, 4) * 0.035 }}
      className={`cases-result-card ${isFeatured ? 'is-featured' : ''}`}
    >
      <a
        href={href}
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onOpen(item);
        }}
        className="cases-result-card-hit"
        aria-label={`Открыть кейс: ${item.title}`}
      >
        <div className="cases-result-cover">
          <DeferredImage
            src={item.image}
            alt={item.imageAlt}
            loading={index === 0 ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={index === 0 ? 'high' : 'low'}
          />
          {isFeatured ? <span className="cases-featured-label">Топ-кейс</span> : null}
        </div>

        <div className="cases-result-copy">
          <div className="cases-result-tags" aria-label="Категории кейса">
            {(item.data.sources || []).map((source) => (
              <span key={source}>{sourceLabel(source)}</span>
            ))}
            {item.data.niche ? <span>{item.data.niche}</span> : null}
          </div>
          <h2>{item.title}</h2>
          <span className="cases-context-label">Контекст</span>
          <p>{item.description}</p>
          <div className="cases-card-mobile-metrics" style={{ gridTemplateColumns: `repeat(${mobileMetrics.length}, minmax(0, 1fr))` }}>
            {mobileMetrics.map((metric, metricIndex) => (
              <ResultMetric key={`${metric.value}-${metric.label}-${metricIndex}`} value={metric.value} label={metric.label} />
            ))}
          </div>
        </div>

        <div className="cases-result-proof">
          {isFeatured && metrics.length >= 2 ? (
            <div className="cases-result-proof-list">
              {metrics.slice(0, 3).map((metric, metricIndex) => (
                <ResultMetric key={`${metric.value}-${metric.label}-${metricIndex}`} value={metric.value} label={metric.label} />
              ))}
            </div>
          ) : (
            <ResultMetric value={mainMetric} label={mainMetricLabel} />
          )}
          <div className="cases-result-action">
            <span>{item.readTime}</span>
            <strong>Читать разбор <ArrowRight className="h-4 w-4" aria-hidden="true" /></strong>
          </div>
        </div>
      </a>
    </motion.article>
  );
}

function StatCard({ icon: Icon, value, label }: { icon: ComponentType<{ className?: string }>; value: string; label: string }) {
  return (
    <div className="cases-stat-card">
      <span className="cases-stat-icon" aria-hidden="true"><Icon className="h-5 w-5" /></span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export default function CasesPage() {
  const { articles, loading, error: articlesError, refreshArticles } = useArticles();
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  // Шапка витрины: две строки — потолок, третья ломает ритм экрана.
  const introTitleFit = useManagedTitleFit<HTMLHeadingElement>(INTRO_TITLE_LINES, { minFontSize: 22 });  const internalSearchRef = useRef<string | null>(null);
  const hydratedSearchRef = useRef<string | null>(null);
  const skipUrlWriteRef = useRef(false);
  const [urlReady, setUrlReady] = useState(false);
  const [urlSyncRevision, setUrlSyncRevision] = useState(0);

  const [niches, setNiches] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [goals, setGoals] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortValue>('fresh');
  const [entry, setEntry] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const publishedCases = useMemo<CaseView[]>(() => (
    articles
      .filter((article: Article) => isCaseArticle(article))
      .map((article) => caseViewFromArticle(article))
  ), [articles]);

  const cases = publishedCases;

  const allNiches = useMemo(() => Array.from(new Set(cases.map((item) => item.data.niche).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru')), [cases]);
  const allSources = useMemo(() => Array.from(new Set(cases.flatMap((item) => item.data.sources || []))).sort(), [cases]);
  const allGoals = useMemo(() => Array.from(new Set(cases.flatMap((item) => item.goals))).sort((a, b) => a.localeCompare(b, 'ru')), [cases]);

  useEffect(() => {
    if (loading) return;
    if (internalSearchRef.current === location.search) {
      internalSearchRef.current = null;
      hydratedSearchRef.current = location.search;
      return;
    }

    const shouldResetLocalQuery = hydratedSearchRef.current !== location.search;
    skipUrlWriteRef.current = true;
    const params = new URLSearchParams(location.search);
    const from = params.get('from');
    const presetDisabled = params.get('all') === '1';
    const hasExplicitFilters = presetDisabled || ['niche', 'src', 'result'].some((key) => params.has(key));

    setOrigin(from && CASE_BACK_TARGETS[from] ? from : null);
    setEntry(from && ENTRY_PRESETS[from] && !hasExplicitFilters ? from : null);
    if (from && ENTRY_PRESETS[from] && !hasExplicitFilters) {
      const preset = ENTRY_PRESETS[from];
      setSources(new Set(preset.sources.filter((source) => allSources.includes(source))));
      setNiches(new Set(allNiches.filter((niche) => preset.nicheHints.some((hint) => niche.toLowerCase().includes(hint)))));
      setGoals(new Set());
    } else {
      const nicheValues = readSelectedParams(params, 'niche', 'niche', allNiches);
      const sourceValues = readSelectedParams(params, 'src', 'source', allSources);
      const goalValues = readSelectedParams(params, 'result', 'result', allGoals);
      setNiches(new Set(nicheValues));
      setSources(new Set(sourceValues));
      setGoals(new Set(goalValues));
    }

    if (shouldResetLocalQuery) setQuery('');
    const requestedSort = params.get('sort');
    setSort(requestedSort === 'roi' || requestedSort === 'budget' || requestedSort === 'fresh' ? requestedSort : 'fresh');
    hydratedSearchRef.current = location.search;
    setUrlReady(true);
  }, [allGoals, allNiches, allSources, loading, location.search]);

  useEffect(() => {
    if (skipUrlWriteRef.current) {
      skipUrlWriteRef.current = false;
      // Hydration state lands on this render; schedule one clean pass that
      // normalizes the URL using the newly applied filters rather than stale state.
      setUrlSyncRevision((revision) => revision + 1);
      return;
    }
    if (!urlReady) return;
    const currentParams = new URLSearchParams(location.search);
    const params = new URLSearchParams();
    CASE_ATTRIBUTION_PARAMS.forEach((key) => {
      currentParams.getAll(key).forEach((value) => params.append(key, value));
    });
    if (!entry) {
      Array.from(niches).sort().forEach((value) => params.append('niche', filterUrlToken('niche', value)));
      Array.from(sources).sort().forEach((value) => params.append('src', filterUrlToken('source', value)));
      Array.from(goals).sort().forEach((value) => params.append('result', filterUrlToken('result', value)));
    }
    if (sort !== 'fresh') params.set('sort', sort);
    if (origin) params.set('from', origin);
    if (origin && !entry && niches.size === 0 && sources.size === 0 && goals.size === 0) {
      params.set('all', '1');
    }
    const search = params.toString();
    const nextSearch = search ? `?${search}` : '';
    const nextUrl = `/cases${search ? `?${search}` : ''}`;
    if (`${location.pathname}${location.search}` !== nextUrl) {
      internalSearchRef.current = nextSearch;
      navigate(nextUrl, { replace: true });
    }
  }, [entry, goals, location.pathname, location.search, navigate, niches, origin, sort, sources, urlReady, urlSyncRevision]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');
    const list = cases.filter((item) => {
      const matchNiche = niches.size === 0 || Boolean(item.data.niche && niches.has(item.data.niche));
      const matchSource = sources.size === 0 || (item.data.sources || []).some((source) => sources.has(source));
      const matchGoal = goals.size === 0 || item.goals.some((goal) => goals.has(goal));
      const haystack = [
        item.title,
        item.description,
        item.data.niche,
        ...(item.data.sources || []).map(sourceLabel),
        ...item.goals,
        item.data.headline,
        ...(item.data.metrics || []).flatMap((metric) => [metric.value, metric.label]),
      ].filter(Boolean).join(' ').toLocaleLowerCase('ru');
      const matchQuery = !normalizedQuery || normalizedQuery.split(/\s+/).every((token) => haystack.includes(token));
      return matchNiche && matchSource && matchGoal && matchQuery;
    });

    const sorted = [...list].sort((a, b) => {
      if (sort === 'roi') return (b.data.roiValue || 0) - (a.data.roiValue || 0);
      if (sort === 'budget') return (b.data.budgetValue || 0) - (a.data.budgetValue || 0);
      const dateDifference = parseCaseDate(b) - parseCaseDate(a);
      if (dateDifference !== 0) return dateDifference;
      if (Boolean(a.data.featured) !== Boolean(b.data.featured)) return a.data.featured ? -1 : 1;
      return 0;
    });
    return sorted;
  }, [cases, goals, niches, query, sort, sources]);

  const stats = useMemo(() => {
    const maxLeads = Math.max(0, ...filtered.map((item) => item.data.leadsValue || 0));
    const budgetItem = [...filtered].sort((a, b) => (b.data.budgetValue || 0) - (a.data.budgetValue || 0))[0];
    const maxRoi = Math.max(0, ...filtered.map((item) => item.data.roiValue || 0));
    return {
      count: String(filtered.length),
      leads: formatInteger(maxLeads),
      budget: formatBudget(budgetItem?.data.budgetValue, budgetItem?.data.budgetLabel),
      roi: maxRoi ? `до ${maxRoi}%` : '—',
    };
  }, [filtered]);

  const nicheOptions = useMemo<FilterOption[]>(() => allNiches.map((value) => ({
    value,
    label: value,
    count: cases.filter((item) => item.data.niche === value).length,
  })), [allNiches, cases]);

  const sourceOptions = useMemo<FilterOption[]>(() => allSources.map((value) => ({
    value,
    label: sourceLabel(value),
    count: cases.filter((item) => (item.data.sources || []).includes(value)).length,
  })), [allSources, cases]);

  const goalOptions = useMemo<FilterOption[]>(() => allGoals.map((value) => ({
    value,
    label: value,
    count: cases.filter((item) => item.goals.includes(value)).length,
  })), [allGoals, cases]);

  const toggleValue = useCallback((setter: Dispatch<SetStateAction<Set<string>>>, kind: 'niche' | 'source' | 'result', value: string) => {
    setEntry(null);
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(value)) next.delete(value);
      else {
        next.add(value);
        trackCaseFilter(kind, value);
      }
      return next;
    });
  }, []);

  const toggleNiche = useCallback((value: string) => toggleValue(setNiches, 'niche', value), [toggleValue]);
  const toggleSource = useCallback((value: string) => toggleValue(setSources, 'source', value), [toggleValue]);
  const toggleGoal = useCallback((value: string) => toggleValue(setGoals, 'result', value), [toggleValue]);

  const clearAll = useCallback(() => {
    setEntry(null);
    setNiches(new Set());
    setSources(new Set());
    setGoals(new Set());
    setQuery('');
  }, []);

  const goToContact = useCallback(() => {
    // Хеш вместо перехода на «/» с последующим поиском секции: главная
    // поднимает адресуемый блок сразу, и переход не зависит от того, успел ли
    // загрузиться её чанк.
    navigate('/#contact');
  }, [navigate]);

  const openCase = useCallback((item: CaseView) => {
    if (item.fallback) {
      goToContact();
      return;
    }
    navigate(`/cases/${item.slug}${window.location.search}`);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [goToContact, navigate]);

  const hasFilters = niches.size > 0 || sources.size > 0 || goals.size > 0 || Boolean(query.trim());
  const filterCount = niches.size + sources.size + goals.size;
  const activeChips = [
    ...Array.from(sources).map((value) => ({ key: `source-${value}`, label: sourceLabel(value), onRemove: () => toggleSource(value) })),
    ...Array.from(niches).map((value) => ({ key: `niche-${value}`, label: value, onRemove: () => toggleNiche(value) })),
    ...Array.from(goals).map((value) => ({ key: `goal-${value}`, label: value, onRemove: () => toggleGoal(value) })),
  ];

  const filtersProps = {
    nicheOptions,
    sourceOptions,
    goalOptions,
    niches,
    sources,
    goals,
    onToggleNiche: toggleNiche,
    onToggleSource: toggleSource,
    onToggleGoal: toggleGoal,
    onClear: clearAll,
    hasFilters,
  };

  return (
    <>
      <SEO
        title="Кейсы рекламных проектов — задачи, решения и результаты"
        description="Опубликованные проекты Whale Wizard: исходная задача, рекламные каналы, бюджет, ключевые метрики и логика решений."
        url="/cases"
      />
      <Navbar variant="content" />
      <main className="cases-finder marketing-typography min-h-screen bg-background">
        <section className="cases-finder-hero">
          <div className="cases-finder-container">
            <PageNav
              crumbs={[
                { label: 'Главная', to: '/' },
                { label: 'Кейсы' },
              ]}
              backFallback="/"
              className="mb-7"
            />

            <div className="cases-finder-intro">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              >
                <span className="cases-finder-eyebrow"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Библиотека кейсов</span>
                <h1 ref={introTitleFit}>Найдите кейс, похожий&nbsp;на <span>ваш проект</span></h1>
                <p>Выберите канал, нишу или результат — и откройте полный разбор с контекстом, решениями и цифрами.</p>
              </motion.div>
              <label className="cases-search">
                <Search className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Поиск по кейсам</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => { setEntry(null); setQuery(event.target.value); }}
                  placeholder="Поиск по кейсам"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск"><X className="h-4 w-4" /></button>
                ) : null}
              </label>
            </div>

            <div className="cases-stats" aria-label="Показатели опубликованных кейсов">
              <StatCard icon={BriefcaseBusiness} value={stats.count} label={pluralCases(filtered.length)} />
              <StatCard icon={Users} value={stats.leads} label="лидов / покупок" />
              <StatCard icon={WalletCards} value={stats.budget} label="макс. бюджет" />
              <StatCard icon={Trophy} value={stats.roi} label="макс. ROI" />
            </div>
          </div>
        </section>

        <section className="cases-finder-catalog">
          <div className="cases-finder-container">
            {entry && ENTRY_PRESETS[entry] ? (
              <div className="cases-entry-note">
                <span>{ENTRY_PRESETS[entry].text}</span>
                <button type="button" onClick={clearAll}>Показать все</button>
              </div>
            ) : null}

            <div className="cases-mobile-controls">
              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger asChild>
                  <button type="button" className="cases-mobile-filter-button">
                    <Filter className="h-4 w-4" aria-hidden="true" />
                    Фильтры{filterCount ? ` · ${filterCount}` : ''}
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="cases-filter-sheet max-h-[88dvh] rounded-t-3xl border-white/10 bg-[#0c0d16] px-0 pb-[max(16px,env(safe-area-inset-bottom))]">
                  <SheetHeader className="border-b border-white/[.08] px-5 py-5 text-left">
                    <SheetTitle className="text-lg">Фильтры кейсов</SheetTitle>
                    <SheetDescription>Можно выбрать несколько значений в каждой группе.</SheetDescription>
                  </SheetHeader>
                  <div className="overflow-y-auto px-5"><CatalogFilters {...filtersProps} /></div>
                  <SheetFooter className="cases-filter-sheet-footer border-t border-white/[.08] px-5 pt-4">
                    {hasFilters ? <button type="button" className="cases-filter-sheet-reset" onClick={clearAll}>Сбросить</button> : null}
                    <SheetClose asChild>
                      <button type="button" className="cases-filter-apply">Показать {filtered.length} {pluralCases(filtered.length)}</button>
                    </SheetClose>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              <Select value={sort} onValueChange={(value) => setSort(value as SortValue)}>
                <SelectTrigger aria-label="Сортировка кейсов" className="cases-sort-select">
                  <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" className="rounded-2xl border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl">
                  <SelectItem value="fresh">Сначала новые</SelectItem>
                  <SelectItem value="roi">Сначала высокий ROI</SelectItem>
                  <SelectItem value="budget">Сначала крупный бюджет</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {activeChips.length ? (
              <div className="cases-active-chips" aria-label="Активные фильтры">
                {activeChips.map((chip) => (
                  <button type="button" key={chip.key} onClick={chip.onRemove}>
                    {chip.label}<X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="cases-catalog-layout">
              <aside className="cases-desktop-filters" aria-label="Фильтры кейсов">
                <CatalogFilters {...filtersProps} />
              </aside>

              <div className="min-w-0">
                <div className="cases-results-toolbar">
                  <strong role="status" aria-live="polite" aria-atomic="true">Найдено кейсов: {filtered.length}</strong>
                  <div className="cases-toolbar-chips">
                    {activeChips.map((chip) => (
                      <button type="button" key={chip.key} onClick={chip.onRemove}>
                        {chip.label}<X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ))}
                    {hasFilters ? <button type="button" className="cases-clear-link" onClick={clearAll}>Сбросить всё</button> : null}
                  </div>
                  <Select value={sort} onValueChange={(value) => setSort(value as SortValue)}>
                    <SelectTrigger aria-label="Сортировка кейсов" className="cases-sort-select">
                      <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end" className="rounded-2xl border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl">
                      <SelectItem value="fresh">Сначала новые</SelectItem>
                      <SelectItem value="roi">Сначала высокий ROI</SelectItem>
                      <SelectItem value="budget">Сначала крупный бюджет</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {loading && publishedCases.length === 0 ? (
                  <div className="cases-loading" role="status">Загружаю опубликованные кейсы…</div>
                ) : articlesError && publishedCases.length === 0 ? (
                  <ArticlesLoadError onRetry={refreshArticles} />
                ) : filtered.length ? (
                  <div className="cases-results-list">
                    <AnimatePresence initial={false}>
                      {filtered.map((item, index) => (
                        <CaseResultCard
                          key={item.key}
                          item={item}
                          index={index}
                          href={item.fallback ? '/#contact' : `/cases/${item.slug}${location.search}`}
                          onOpen={openCase}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="cases-empty-state">
                    <strong>Под эту комбинацию пока нет опубликованного кейса</strong>
                    <p>Снимите часть фильтров или расскажите о проекте — проверю, есть ли похожий опыт, без публичного названия клиента.</p>
                    <div>
                      <button type="button" onClick={clearAll}>Сбросить фильтры</button>
                      <button type="button" onClick={goToContact}>
                        Обсудить проект <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Перекрёстная связь разделов: из кейсов — в блог. */}
            <section className="mt-14 overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-r from-primary/10 via-card/60 to-accent/10 p-6 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Дальше по теме</p>
                  <h2 className="mt-1.5 text-balance text-xl font-bold sm:text-2xl">Как эти решения устроены изнутри</h2>
                  <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
                    В блоге — разборы механик, которые стоят за этими цифрами: воронки, аналитика, ставки и креативы.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/blog')}
                  className="group inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-accent px-6 font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03] active:scale-95"
                >
                  <span className="text-sm md:text-base">Читать блог</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </button>
              </div>
            </section>
          </div>
        </section>
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      </main>
    </>
  );
}
