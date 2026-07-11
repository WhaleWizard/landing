import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import SEO from '../components/SEO';
import { useArticles } from '../context/ArticlesContext';
import { trackCaseFilter } from '../consent/consent';
import type { Article, CaseData } from '../components/hooks/useArticlesApi';

const CASES_CATEGORY = 'Кейсы';

const SOURCE_LABELS: Record<string, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  tiktok: 'TikTok',
};

// Витрина по умолчанию: те же 4 кейса, что на главной (реальные цифры сайта).
// Показывается, пока в админке нет статей категории «Кейсы» с кейс-полями.
type CaseView = {
  key: string;
  slug?: string;
  title: string;
  description: string;
  fallback?: boolean;
  data: CaseData;
};

const SHOWCASE: CaseView[] = [
  {
    key: 'showcase-concierge',
    fallback: true,
    title: 'Premium Concierge Service',
    description: 'Четыре года стабильной лидогенерации для премиум-сервиса: квалификация, ретаргетинг, контроль качества обращений.',
    data: {
      niche: 'Услуги', sources: ['meta'], period: '4 года', featured: true,
      budgetLabel: '$1 Млн+', budgetValue: 1_000_000, leadsValue: 65_000,
      headline: '65к+', headlineLabel: 'лидов за 4 года',
      metrics: [
        { value: '$1 Млн+', label: 'бюджет' },
        { value: '65к+', label: 'лидов' },
        { value: '4 года', label: 'срок' },
      ],
      chartPoints: [18, 22, 21, 28, 31, 29, 38, 45, 52, 58, 66, 78],
    },
  },
  {
    key: 'showcase-ecom',
    fallback: true,
    title: 'E-commerce: магазин полного цикла',
    description: 'Google Ads + Shopping + Meta Ads: 120 000+ добавлений в корзину, 30 000+ покупок.',
    data: {
      niche: 'E-commerce', sources: ['google', 'meta'], roiValue: 210, leadsValue: 30_000,
      headline: '210%', headlineLabel: 'ROI', trend: '▲ рост',
      metrics: [
        { value: '120к+', label: 'add to cart' },
        { value: '30к+', label: 'покупок' },
        { value: '210%', label: 'ROI' },
      ],
      chartPoints: [24, 30, 28, 38, 36, 46, 52, 50, 62, 70, 76, 86],
    },
  },
  {
    key: 'showcase-info',
    fallback: true,
    title: 'Инфобизнес на весь мир',
    description: 'Инфопродукты на русскоязычную аудиторию по всему миру, $600к+ открученного бюджета.',
    data: {
      niche: 'Инфобизнес', sources: ['google', 'meta'], roiValue: 180,
      budgetLabel: '$600к+', budgetValue: 600_000,
      headline: 'до $5', headlineLabel: 'стоимость лида', trend: '▼ CPL',
      metrics: [
        { value: '$600к+', label: 'бюджет' },
        { value: 'до $5', label: 'CPL' },
        { value: '180%', label: 'ROI' },
      ],
      chartPoints: [52, 48, 45, 40, 42, 36, 32, 30, 26, 24, 21, 18],
    },
  },
  {
    key: 'showcase-b2c',
    fallback: true,
    title: 'B2C услуги: 50+ проектов',
    description: 'Пакетные запуски для сферы услуг: салоны, образование, локальный бизнес.',
    data: {
      niche: 'Услуги', sources: ['google', 'meta'], roiValue: 300,
      headline: 'до 300%', headlineLabel: 'ROI по проектам', trend: '▲ 50+ ниш',
      metrics: [
        { value: '50+', label: 'проектов' },
        { value: 'до $25', label: 'CPL' },
        { value: 'до 300%', label: 'ROI' },
      ],
      chartPoints: [22, 28, 26, 34, 32, 42, 40, 50, 56, 54, 64, 72],
    },
  },
];

// Контекстный вход со страниц услуг: /cases?from=meta-apps
const ENTRIES: Record<string, { srcs: string[]; nicheHints: string[]; text: string }> = {
  'meta-apps': { srcs: ['meta'], nicheHints: ['приложен'], text: 'Вы пришли со страницы Meta Apps — показал кейсы по приложениям и Meta-трафику.' },
  'meta-ads': { srcs: ['meta'], nicheHints: [], text: 'Вы пришли со страницы Meta Ads — показал кейсы с трафиком из Facebook и Instagram.' },
  'google-ads': { srcs: ['google'], nicheHints: [], text: 'Вы пришли со страницы Google Ads — показал кейсы с трафиком из Google.' },
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] || source.charAt(0).toUpperCase() + source.slice(1);
}

function sourceClass(source: string): string {
  if (source === 'meta') return 'cse-tag-meta';
  if (source === 'google') return 'cse-tag-google';
  return 'cse-tag-other';
}

/* ── График-линия (единый для всех карточек) ── */
function LineChart({ points, id }: { points: number[]; id: string }) {
  const w = 340;
  const h = 128;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const px = (i: number) => (i / (points.length - 1)) * w;
  const py = (v: number) => h - 10 - ((v - min) / (max - min || 1)) * (h * 0.62);
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const gridYs = [h * 0.3, h * 0.54, h * 0.78];
  const lastX = px(points.length - 1);
  const lastY = py(points[points.length - 1]);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.38" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
        <filter id={`${id}-glow`}>
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      {gridYs.map((y) => (
        <line key={y} x1="0" y1={y} x2={w} y2={y} stroke="rgba(255,255,255,.05)" strokeDasharray="3 5" />
      ))}
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id}-fill)`} />
      <path d={line} fill="none" stroke={`url(#${id}-stroke)`} strokeWidth="2.6" filter={`url(#${id}-glow)`} opacity="0.8" pathLength={1} className="cse-draw" />
      <path d={line} fill="none" stroke={`url(#${id}-stroke)`} strokeWidth="2.2" strokeLinecap="round" pathLength={1} className="cse-draw" />
      <circle cx={lastX} cy={lastY} r="4" fill="var(--accent)" className="cse-blip" />
      <circle cx={lastX} cy={lastY} r="8" fill="none" stroke="var(--accent)" strokeOpacity="0.4" className="cse-blip" />
    </svg>
  );
}

/* ── Карточка кейса ── */
function CaseCard({ item, onOpen }: { item: CaseView; onOpen: (item: CaseView) => void }) {
  const d = item.data;
  const hasViz = Boolean(d.headline || (d.chartPoints && d.chartPoints.length >= 2));

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.3 }}
      tabIndex={0}
      role="link"
      aria-label={`Открыть кейс: ${item.title}`}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item); } }}
      className={`cse-card group relative cursor-pointer overflow-hidden rounded-[22px] p-[1.4px] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_26px_60px_rgba(0,0,0,.55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${d.featured ? 'cse-featured' : ''}`}
    >
      <div className={`relative flex h-full flex-col overflow-hidden rounded-[21px] bg-gradient-to-br from-[#12142e] to-[#0b0c1c] ${d.featured ? 'md:flex-row' : ''}`}>
        {hasViz && (
          <div className={`relative flex-none overflow-hidden border-b border-white/[.07] bg-[radial-gradient(420px_160px_at_20%_0%,rgba(139,92,246,.16),transparent_70%)] ${d.featured ? 'h-32 md:h-auto md:w-[44%] md:border-b-0 md:border-r' : 'h-32'}`}>
            {d.chartPoints && d.chartPoints.length >= 2 && <LineChart points={d.chartPoints} id={`ch-${item.key}`} />}
            {d.headline && (
              <div className="absolute left-4 top-3 z-[2]">
                <b className={`block bg-gradient-to-r from-white to-[#c9d6ff] bg-clip-text font-extrabold leading-none tracking-tighter text-transparent [text-shadow:0_4px_30px_rgba(139,92,246,.5)] ${d.featured ? 'text-4xl md:text-5xl' : 'text-3xl'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {d.headline}
                </b>
                {d.headlineLabel && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{d.headlineLabel}</span>
                )}
              </div>
            )}
            {d.trend && (
              <span className="absolute right-3.5 top-3.5 z-[2] rounded-lg border border-emerald-400/35 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-200" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {d.trend}
              </span>
            )}
          </div>
        )}

        <div className={`flex flex-1 flex-col gap-2.5 p-4 ${d.featured ? 'md:w-[56%]' : ''}`}>
          <div className="flex flex-wrap gap-1.5">
            {d.niche && (
              <span className="cse-tag cse-tag-niche"><i />{d.niche}</span>
            )}
            {(d.sources || []).map((s) => (
              <span key={s} className={`cse-tag ${sourceClass(s)}`}><i />{sourceLabel(s)}</span>
            ))}
          </div>

          <h3 className={`font-extrabold leading-snug tracking-tight ${d.featured ? 'text-lg md:text-xl' : 'text-[17px]'}`}>{item.title}</h3>
          {item.description && <p className="text-[12.5px] leading-relaxed text-muted-foreground">{item.description}</p>}

          {d.beforeAfter && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[.07] px-3 py-2 text-xs font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <span className="text-muted-foreground">{d.beforeAfter.label}:</span>
              <span className="text-muted-foreground/60 line-through decoration-red-400/60">{d.beforeAfter.from}</span>
              <span className="text-emerald-400">→</span>
              <span className="text-sm text-emerald-200">{d.beforeAfter.to}</span>
              {d.beforeAfter.delta && (
                <span className="ml-auto rounded-md bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-200">{d.beforeAfter.delta}</span>
              )}
            </div>
          )}

          {d.metrics && d.metrics.length > 0 && (
            <div className="mt-auto flex border-t border-white/[.08] pt-2.5">
              {d.metrics.map((m, i) => (
                <div key={`${m.label}-${i}`} className={`min-w-0 flex-1 ${i > 0 ? 'border-l border-white/[.07] pl-3' : ''} pr-2`}>
                  <b className="block text-[15.5px] font-extrabold tracking-tight text-[#e9ebff]" style={{ fontVariantNumeric: 'tabular-nums' }}>{m.value}</b>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">{m.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className={`flex items-center justify-between gap-2 ${d.metrics?.length ? '' : 'mt-auto'}`}>
            <span className="text-[11px] text-muted-foreground/60">{d.period || ''}</span>
            <span className="cse-open inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#c4b5fd] transition-colors group-hover:text-[#ddd1ff]">
              {item.fallback ? 'Обсудить похожий проект' : 'Разбор кейса'}
            </span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

/* ── Страница ── */
export default function CasesPage() {
  const { articles, loading } = useArticles();
  const navigate = useNavigate();

  const [niches, setNiches] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<'roi' | 'budget' | 'fresh'>('roi');
  const [entry, setEntry] = useState<string | null>(null);

  const adminCases = useMemo<CaseView[]>(() => (
    articles
      .filter((a: Article) => a.category === CASES_CATEGORY)
      .map((a) => ({
        key: `a-${a.slug}`,
        slug: a.slug,
        title: a.title,
        description: a.description || '',
        data: a.caseData || {},
      }))
  ), [articles]);

  const cases = adminCases.length > 0 ? adminCases : SHOWCASE;

  const allNiches = useMemo(() => {
    const set = new Set<string>();
    cases.forEach((c) => { if (c.data.niche) set.add(c.data.niche); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [cases]);

  const allSources = useMemo(() => {
    const set = new Set<string>();
    cases.forEach((c) => (c.data.sources || []).forEach((s) => set.add(s)));
    return Array.from(set).sort();
  }, [cases]);

  // Инициализация из URL: ?from=meta-apps / ?niche=..&src=..
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    if (from && ENTRIES[from]) {
      setEntry(from);
      const preset = ENTRIES[from];
      setSources(new Set(preset.srcs.filter((s) => allSources.includes(s))));
      const nicheMatch = allNiches.filter((n) => preset.nicheHints.some((hint) => n.toLowerCase().includes(hint)));
      setNiches(new Set(nicheMatch));
      return;
    }
    const niche = params.get('niche');
    const src = params.get('src');
    if (niche) setNiches(new Set(niche.split(',').filter((n) => allNiches.includes(n))));
    if (src) setSources(new Set(src.split(',').filter((s) => allSources.includes(s))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNiches.join('|'), allSources.join('|')]);

  // Фильтры → адресная строка (ссылкой можно делиться)
  useEffect(() => {
    const params = new URLSearchParams();
    if (niches.size) params.set('niche', Array.from(niches).join(','));
    if (sources.size) params.set('src', Array.from(sources).join(','));
    if (entry) params.set('from', entry);
    const qs = params.toString();
    window.history.replaceState(null, '', `/cases${qs ? `?${qs}` : ''}`);
  }, [niches, sources, entry]);

  const filtered = useMemo(() => {
    const list = cases.filter((c) => (
      (niches.size === 0 || (c.data.niche && niches.has(c.data.niche))) &&
      (sources.size === 0 || (c.data.sources || []).some((s) => sources.has(s)))
    ));
    const sorted = [...list];
    if (sort === 'roi') sorted.sort((a, b) => (b.data.roiValue || 0) - (a.data.roiValue || 0));
    if (sort === 'budget') sorted.sort((a, b) => (b.data.budgetValue || 0) - (a.data.budgetValue || 0));
    if (sort === 'fresh') sorted.reverse();
    sorted.sort((a, b) => (b.data.featured ? 1 : 0) - (a.data.featured ? 1 : 0));
    return sorted;
  }, [cases, niches, sources, sort]);

  const stats = useMemo(() => {
    const budget = filtered.reduce((s, c) => s + (c.data.budgetValue || 0), 0);
    const leads = filtered.reduce((s, c) => s + (c.data.leadsValue || 0), 0);
    const rois = filtered.map((c) => c.data.roiValue || 0).filter((v) => v > 0);
    const roi = rois.length ? Math.round(rois.reduce((s, v) => s + v, 0) / rois.length) : 0;
    return {
      count: filtered.length,
      budget: budget >= 1_000_000 ? `$${(budget / 1_000_000).toFixed(1).replace('.0', '')}М+` : budget > 0 ? `$${Math.round(budget / 1000)}к+` : '—',
      leads: leads >= 1000 ? `${Math.round(leads / 1000)}к+` : leads > 0 ? String(leads) : '—',
      roi: roi ? `${roi}%` : '—',
    };
  }, [filtered]);

  const toggleNiche = useCallback((n: string) => {
    setEntry(null);
    setNiches((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else { next.add(n); trackCaseFilter('niche', n); }
      return next;
    });
  }, []);

  const toggleSource = useCallback((s: string) => {
    setEntry(null);
    setSources((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else { next.add(s); trackCaseFilter('source', s); }
      return next;
    });
  }, []);

  const clearAll = useCallback(() => { setEntry(null); setNiches(new Set()); setSources(new Set()); }, []);

  const goHome = useCallback(() => { navigate('/'); window.scrollTo({ top: 0 }); }, [navigate]);

  const openCase = useCallback((item: CaseView) => {
    if (item.slug) {
      navigate(`/cases/${item.slug}`);
      window.scrollTo({ top: 0 });
    } else {
      navigate('/');
      window.setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }), 600);
    }
  }, [navigate]);

  const hasFilters = niches.size > 0 || sources.size > 0;

  return (
    <>
      <SEO
        title="Кейсы по маркетингу"
        description="Кейсы Whale Wizard с фильтрами по нишам и источникам трафика: бюджеты, лиды, ROI и разбор решений."
        url="/cases"
      />
      <section className="relative min-h-screen overflow-hidden bg-background px-4 py-16 sm:px-6 md:py-20">
        <div className="pointer-events-none absolute left-1/4 top-0 h-96 w-96 rounded-full bg-primary/15 blur-[128px]" />
        <div className="pointer-events-none absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-accent/10 blur-[128px]" />

        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="mb-4 flex justify-end">
            <button onClick={goHome} className="cursor-pointer border-none bg-transparent text-sm text-muted-foreground transition-colors hover:text-primary">← На главную</button>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center md:mb-10">
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Кейсы · {cases.length}
            </div>
            <h1 className="text-3xl font-bold sm:text-4xl md:text-5xl">
              Кейсы с <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">цифрами</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
              Ниши, источники трафика, бюджеты и результаты — выбирайте, что ближе к вашему проекту.
            </p>
          </motion.div>

          {entry && ENTRIES[entry] && (
            <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-2xl border border-accent/30 bg-gradient-to-r from-primary/15 to-accent/10 px-4 py-3 text-[13px] text-muted-foreground">
              <span>📌 {ENTRIES[entry].text}</span>
              <button onClick={clearAll} className="ml-auto cursor-pointer border-none bg-transparent text-xs text-[#9fd8ff] underline decoration-dotted underline-offset-2">
                показать все кейсы
              </button>
            </div>
          )}

          <div className="mb-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              [String(stats.count), 'кейсов'],
              [stats.budget, 'бюджета откручено'],
              [stats.leads, 'лидов / покупок'],
              [stats.roi, 'средний ROI'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-border/60 bg-card/40 px-4 py-3 backdrop-blur-sm">
                <b className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-xl font-extrabold tracking-tight text-transparent md:text-2xl" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</b>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</span>
              </div>
            ))}
          </div>

          <div className="sticky top-2 z-20 mb-6 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border/70 bg-background/85 px-3.5 py-3 backdrop-blur-xl">
            {allNiches.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <em className="mr-1 text-[10px] font-extrabold uppercase not-italic tracking-widest text-muted-foreground/60">Ниша</em>
                {allNiches.map((n) => (
                  <button key={n} onClick={() => toggleNiche(n)} aria-pressed={niches.has(n)}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${niches.has(n) ? 'border-transparent bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/30' : 'border-border bg-card/40 text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}>
                    {n}
                  </button>
                ))}
              </div>
            )}
            {allSources.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <em className="mr-1 text-[10px] font-extrabold uppercase not-italic tracking-widest text-muted-foreground/60">Источник</em>
                {allSources.map((s) => (
                  <button key={s} onClick={() => toggleSource(s)} aria-pressed={sources.has(s)}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${sources.has(s) ? 'border-transparent bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/30' : 'border-border bg-card/40 text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}>
                    {sourceLabel(s)}
                  </button>
                ))}
              </div>
            )}
            <div className="ml-auto flex items-center gap-2.5">
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Сортировка"
                className="cursor-pointer rounded-xl border border-border bg-card/60 px-2.5 py-1.5 text-xs font-semibold text-foreground">
                <option value="roi">Сначала высокий ROI</option>
                <option value="budget">Сначала крупный бюджет</option>
                <option value="fresh">Сначала свежие</option>
              </select>
              {hasFilters && (
                <button onClick={clearAll} className="cursor-pointer border-none bg-transparent text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">
                  сбросить
                </button>
              )}
            </div>
          </div>

          {loading && cases.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground">Загружаю кейсы…</div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((item) => <CaseCard key={item.key} item={item} onOpen={openCase} />)}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border px-6 py-14 text-center">
              <b className="mb-2 block text-lg">В этой комбинации кейса пока нет в открытом доступе</b>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">Часть проектов под NDA — расскажу о результатах в вашей нише лично.</p>
              <button onClick={() => openCase({ key: 'empty', title: '', description: '', data: {} })}
                className="mt-5 cursor-pointer rounded-xl border-none bg-gradient-to-r from-primary to-accent px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-opacity hover:opacity-90">
                Обсудить мой проект →
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
