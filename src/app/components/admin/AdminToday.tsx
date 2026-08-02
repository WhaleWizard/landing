import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, BarChart3, CalendarCheck,
  CheckCircle2, CircleDot, Clock3, FileText, Gauge, Images, Inbox,
  ListChecks, PanelsTopLeft, RefreshCw, Send, Sparkles, Target, TrendingUp, Users,
} from 'lucide-react';
import { useArticles } from '../../context/ArticlesContext';
import { AdminPanel } from './AdminUI';
import TodayPlan, { type PlanTask } from './TodayPlan';
import TodayGoal from './TodayGoal';
import AdminAlerts from './AdminAlerts';
import {
  CountUpValue, DeltaBadge, StatTile, TrendGroup,
  formatNumber, type SeriesPoint,
} from './AttributionCharts';

type Destination = 'leads' | 'articles' | 'health' | 'meta' | 'content' | 'planner' | 'attribution' | 'performance' | 'media' | 'goals';
type Level = 'critical' | 'attention' | 'info';
type FocusKind = 'lead_overdue' | 'lead_new' | 'task_overdue' | 'task_today' | 'planner_task';

interface TodayItem {
  id: string;
  title: string;
  detail: string;
  count: number;
  level: Level;
  destination: Destination;
}

interface FocusItem {
  id: string;
  kind: FocusKind;
  title: string;
  subtitle: string;
  when: string | null;
  destination: Destination;
}

interface TodayResponse {
  success?: boolean;
  error?: string;
  localOnly?: boolean;
  generatedAt?: string;
  items?: TodayItem[];
  focus?: FocusItem[];
  planner?: { done: number; total: number; tasks: PlanTask[]; weekStart: string; dayIndex: number } | null;
  health?: { outboxPending: number; outboxRetry: number; outboxDead: number; telegramMissing: number };
  summary?: Record<string, number>;
}

interface StatsResponse {
  success?: boolean;
  error?: string;
  viewsDaily?: Array<{ day: string; views: number }>;
  uniquesDaily?: Array<{ day: string; uniques: number }>;
  leadsDaily?: Array<{ day: string; leads: number }>;
  topPages?: Array<{ page_path: string; views: number }>;
  totals?: {
    views7: number; views7Prev: number;
    uniques7: number; uniques7Prev: number;
    leadsTotal: number; leadsNew: number; leads7: number;
  };
  recentLeads?: Array<{ id: number; name: string; service: string; budget: string; status: string; created_at: string }>;
  capi?: { outboxPending: number; sent24h: number; failed24h: number };
}

const LEVEL_UI: Record<Level, { icon: typeof AlertTriangle; label: string }> = {
  critical: { icon: AlertTriangle, label: 'Критично' },
  attention: { icon: Clock3, label: 'Требует внимания' },
  info: { icon: CircleDot, label: 'К сведению' },
};

const FOCUS_UI: Record<FocusKind, { icon: typeof AlertTriangle; label: string; tone: 'danger' | 'warning' | 'primary' | 'muted' }> = {
  lead_overdue: { icon: AlertTriangle, label: 'Просрочен шаг', tone: 'danger' },
  task_overdue: { icon: AlertTriangle, label: 'Просрочена задача', tone: 'danger' },
  task_today: { icon: Clock3, label: 'Задача на сегодня', tone: 'warning' },
  lead_new: { icon: Inbox, label: 'Новая заявка', tone: 'primary' },
  planner_task: { icon: ListChecks, label: 'Планер', tone: 'muted' },
};

const QUICK_ACTIONS: Array<{ destination: Destination; label: string; icon: typeof AlertTriangle }> = [
  { destination: 'leads', label: 'Сделки', icon: Inbox },
  { destination: 'planner', label: 'Планер', icon: CalendarCheck },
  { destination: 'goals', label: 'Цели', icon: Target },
  { destination: 'attribution', label: 'Воронка', icon: BarChart3 },
  { destination: 'articles', label: 'Написать статью', icon: FileText },
  { destination: 'content', label: 'Тексты сайта', icon: PanelsTopLeft },
  { destination: 'media', label: 'Медиатека', icon: Images },
  { destination: 'performance', label: 'Скорость', icon: Gauge },
  { destination: 'meta', label: 'Meta CAPI', icon: Activity },
];

const LEAD_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  new: { label: 'новая', tone: 'is-primary' },
  in_progress: { label: 'в работе', tone: 'is-warning' },
  closed: { label: 'закрыта', tone: 'is-success' },
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function todayLabel(): string {
  const formatted = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function plural(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count) % 100;
  const tail = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (tail > 1 && tail < 5) return forms[1];
  if (tail === 1) return forms[0];
  return forms[2];
}

/**
 * «Просрочено на 2 дня» читается быстрее, чем дата и время. У заявки и
 * задачи планера прошедшее время — это не просрочка, а возраст, поэтому
 * подпись зависит от типа дела.
 */
function timeLabel(kind: FocusKind, raw: string | null): string {
  if (!raw) return '';
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const time = new Date(normalized).getTime();
  if (Number.isNaN(time)) return '';
  const diffMinutes = Math.round((time - Date.now()) / 60000);
  const minutes = Math.abs(diffMinutes);
  const value = minutes < 60
    ? `${minutes} мин`
    : minutes < 60 * 24
      ? `${Math.round(minutes / 60)} ч`
      : `${Math.round(minutes / (60 * 24))} дн`;
  if (diffMinutes >= 0) return `через ${value}`;
  return kind === 'lead_new' || kind === 'planner_task' ? `${value} назад` : `просрочено на ${value}`;
}

function buildSeries(
  views: Array<{ day: string; views: number }>,
  uniques: Array<{ day: string; uniques: number }>,
  leads: Array<{ day: string; leads: number }>,
): SeriesPoint[] {
  const viewsByDay = new Map(views.map((point) => [point.day, Number(point.views || 0)]));
  const uniquesByDay = new Map(uniques.map((point) => [point.day, Number(point.uniques || 0)]));
  const leadsByDay = new Map(leads.map((point) => [point.day, Number(point.leads || 0)]));
  const points: SeriesPoint[] = [];
  for (let index = 13; index >= 0; index -= 1) {
    const day = new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10);
    points.push({
      day,
      views: viewsByDay.get(day) || 0,
      visitors: uniquesByDay.get(day) || 0,
      leads: leadsByDay.get(day) || 0,
      qualified: null,
    });
  }
  return points;
}

export default function AdminToday({
  password,
  onNavigate,
}: {
  password: string;
  onNavigate: (destination: Destination) => void;
}) {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllFocus, setShowAllFocus] = useState(false);
  const { articles } = useArticles();

  const load = useCallback(async () => {
    setLoading(true);
    const headers = { 'X-Admin-Password': password };
    const options = { headers, credentials: 'same-origin' as const, cache: 'no-store' as const };
    try {
      const [todayResponse, statsResponse] = await Promise.all([
        fetch('/api/admin/today', options),
        fetch('/api/admin/stats', options),
      ]);
      const todayPayload = await todayResponse.json().catch(() => null) as TodayResponse | null;
      const statsPayload = await statsResponse.json().catch(() => null) as StatsResponse | null;
      setData(todayPayload || { success: false, error: `HTTP ${todayResponse.status}` });
      setStats(statsPayload?.success ? statsPayload : null);
    } catch (error) {
      setData({ success: false, error: error instanceof Error ? error.message : 'Не удалось загрузить сводку' });
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const items = data?.items || [];
  const focus = data?.focus || [];
  const shownFocus = showAllFocus ? focus : focus.slice(0, 6);
  const totals = stats?.totals;
  const capi = stats?.capi;
  const health = data?.health;

  const series = useMemo(
    () => buildSeries(stats?.viewsDaily || [], stats?.uniquesDaily || [], stats?.leadsDaily || []),
    [stats],
  );

  const pageTitle = useCallback((path: string): string => {
    const match = path.match(/^\/(blog|cases)\/(.+)$/);
    if (match) {
      const article = articles.find((item) => item.slug === match[2]);
      if (article) return article.title;
    }
    return path === '/' ? 'Главная' : path;
  }, [articles]);

  // Одна фраза вместо чтения всех карточек: что именно горит прямо сейчас.
  const headline = useMemo(() => {
    if (!data?.success) return 'Рабочая сводка появится, когда подключится база.';
    const critical = items.filter((item) => item.level === 'critical').length;
    const urgent = focus.filter((item) => item.kind === 'lead_overdue' || item.kind === 'task_overdue').length;
    if (urgent > 0) {
      return `Горит ${urgent} ${plural(urgent, ['дело', 'дела', 'дел'])} — начни с ${urgent === 1 ? 'него' : 'них'}.`;
    }
    if (critical > 0) {
      return `${critical} ${plural(critical, ['блок требует', 'блока требуют', 'блоков требуют'])} решения.`;
    }
    if (focus.length > 0) {
      return `Срочного нет, в работе ${focus.length} ${plural(focus.length, ['дело', 'дела', 'дел'])}.`;
    }
    return 'Всё под контролем — срочных дел нет.';
  }, [data?.success, focus, items]);

  const plannerProgress = data?.planner && data.planner.total > 0
    ? Math.round((data.planner.done / data.planner.total) * 100)
    : null;

  // Очередь досылки — штатное состояние, у неё своя плитка; тревожит только
  // фактическая ошибка Meta или события, которые уже некуда повторять.
  const capiOk = Boolean(capi) && capi!.failed24h === 0 && Number(health?.outboxDead || 0) === 0;

  return (
    <div className="admin-stack admin-stack--lg today">
      <section className="today-hero" aria-labelledby="admin-today-title">
        <div className="today-hero__glow" aria-hidden="true" />
        <div className="today-hero__main">
          <p className="admin-eyebrow">{todayLabel()}</p>
          <h2 id="admin-today-title" className="today-hero__title">{greeting()}</h2>
          <p className="today-hero__headline">{headline}</p>
          <div className="today-hero__actions">
            <button type="button" className="admin-button" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              {loading ? 'Обновляю' : 'Обновить'}
            </button>
            {data?.generatedAt && (
              <span className="admin-meta">Обновлено {new Date(data.generatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>
        </div>

        {plannerProgress !== null && data?.planner && (
          <button type="button" className="today-hero__planner" onClick={() => onNavigate('planner')}>
            <span
              className="today-ring"
              style={{ ['--today-ring-value' as string]: `${plannerProgress}` }}
              role="img"
              aria-label={`План на сегодня: выполнено ${data.planner.done} из ${data.planner.total}`}
            >
              <span className="today-ring__value">{plannerProgress}%</span>
            </span>
            <span className="today-hero__planner-copy">
              <strong>План на сегодня</strong>
              <span>{data.planner.done} из {data.planner.total} задач</span>
            </span>
          </button>
        )}
      </section>

      {!data?.success && !loading && (
        <div className="admin-empty">
          <CircleDot aria-hidden="true" />
          <div>
            <strong>{data?.localOnly ? 'Рабочая сводка доступна на production' : 'Не удалось загрузить рабочую сводку'}</strong>
            <p>{data?.error || 'Для этого экрана требуется подключённая Cloudflare D1.'}</p>
          </div>
        </div>
      )}

      {totals && (
        <div className="adm-tiles">
          <StatTile
            icon={<Users aria-hidden="true" />}
            title="Уникальные за 7 дней"
            value={<CountUpValue value={totals.uniques7} />}
            detail="Обезличенный отпечаток дня, без cookies."
            delta={<DeltaBadge current={totals.uniques7} previous={totals.uniques7Prev} label="Уникальные" />}
          />
          <StatTile
            icon={<TrendingUp aria-hidden="true" />}
            title="Просмотры за 7 дней"
            value={<CountUpValue value={totals.views7} />}
            detail="Все просмотры страниц сайта."
            delta={<DeltaBadge current={totals.views7} previous={totals.views7Prev} label="Просмотры" />}
          />
          <StatTile
            icon={<Inbox aria-hidden="true" />}
            title="Заявки за 7 дней"
            value={<CountUpValue value={totals.leads7} />}
            detail={totals.leadsNew > 0 ? `${totals.leadsNew} ждут ответа.` : 'Все заявки обработаны.'}
          />
          <StatTile
            icon={<ListChecks aria-hidden="true" />}
            title="Задачи в работе"
            value={<CountUpValue value={Number(data?.summary?.tasksOpen ?? 0)} />}
            detail={Number(data?.summary?.tasksOverdue || 0) > 0
              ? `${formatNumber(data?.summary?.tasksOverdue)} просрочено.`
              : 'Просроченных задач нет.'}
          />
        </div>
      )}

      <AdminAlerts password={password} onNavigate={(destination) => onNavigate(destination as Destination)} />

      {/* Широкий монитор: слева работа с делами и графиком, справа —
          рельс со статусами и переходами. Раньше всё шло одной колонкой
          во всю ширину, и экран приходилось долго прокручивать. */}
      <div className="today-grid">
        <div className="today-grid__main">
        {data?.success && (
          <section className="admin-panel adm-card today-focus">
            <header className="adm-card__head adm-card__head--row">
              <div>
                <h3 className="admin-card-title"><Sparkles aria-hidden="true" /> Фокус дня</h3>
                <p className="admin-hint">Конкретные дела с именами и сроками — сверху то, что уже горит.</p>
              </div>
              {focus.length > 6 && (
                <button type="button" className="admin-button admin-button--quiet" onClick={() => setShowAllFocus((value) => !value)}>
                  {showAllFocus ? 'Свернуть' : `Показать все ${focus.length}`}
                </button>
              )}
            </header>

            {focus.length === 0 ? (
              <div className="admin-empty admin-empty--success">
                <CheckCircle2 aria-hidden="true" />
                <div>
                  <strong>На сегодня ничего не горит</strong>
                  <p>Просроченных шагов и задач нет, новые заявки обработаны.</p>
                </div>
              </div>
            ) : (
              <ul className="today-focus__list">
                {shownFocus.map((item) => {
                  const ui = FOCUS_UI[item.kind];
                  const Icon = ui.icon;
                  const when = timeLabel(item.kind, item.when);
                  return (
                    <li key={item.id}>
                      <button type="button" className={`today-focus__item is-${ui.tone}`} onClick={() => onNavigate(item.destination)}>
                        <span className="today-focus__icon" aria-hidden="true"><Icon /></span>
                        <span className="today-focus__body">
                          <span className="today-focus__title">{item.title}</span>
                          <span className="today-focus__subtitle">{item.subtitle}</span>
                        </span>
                        <span className="today-focus__meta">
                          <span className="today-focus__kind">{ui.label}</span>
                          {when ? <span className="today-focus__when">{when}</span> : null}
                        </span>
                        <ArrowRight className="today-focus__go" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {data?.success && data.planner && (
          <TodayPlan
            password={password}
            tasks={data.planner.tasks || []}
            weekStart={data.planner.weekStart}
            dayIndex={data.planner.dayIndex}
            onNavigate={() => onNavigate('planner')}
            onSaved={() => void load()}
          />
        )}

        {stats && (
          <section className="admin-panel adm-card">
            <header className="adm-card__head">
              <h3 className="admin-card-title">Две недели одним взглядом</h3>
              <p className="admin-hint">Наведи курсор или пройди стрелками — покажет значение конкретного дня.</p>
            </header>
            <TrendGroup
              points={series}
              series={[
                { key: 'visitors', label: 'Уникальные посетители', slot: 5 },
                { key: 'views', label: 'Просмотры', slot: 2 },
                { key: 'leads', label: 'Заявки', slot: 1 },
              ]}
            />
          </section>
        )}

        {items.length > 0 && (
          <section className="admin-panel adm-card">
            <header className="adm-card__head">
              <h3 className="admin-card-title">Требует решения</h3>
              <p className="admin-hint">Сгруппировано по разделам: нажми, чтобы перейти и разобрать.</p>
            </header>
            <div className="today-cards">
              {items.map((item) => {
                const ui = LEVEL_UI[item.level];
                const Icon = ui.icon;
                return (
                  <button key={item.id} type="button" className={`today-card is-${item.level}`} onClick={() => onNavigate(item.destination)}>
                    <span className="today-card__top">
                      <span className="today-card__level"><Icon aria-hidden="true" />{ui.label}</span>
                      <span className="today-card__count">{item.count}</span>
                    </span>
                    <strong>{item.title}</strong>
                    <span className="today-card__detail">{item.detail}</span>
                    <span className="today-card__link">Открыть <ArrowUpRight aria-hidden="true" /></span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        </div>

        <aside className="today-grid__rail" aria-label="Статус и быстрые переходы">
          <TodayGoal password={password} onNavigate={() => onNavigate('goals')} />

        {(capi || health) && (
          <section className="admin-panel adm-card">
            <header className="adm-card__head">
              <h3 className="admin-card-title"><Activity aria-hidden="true" /> Здоровье системы</h3>
              <p className="admin-hint">Доставка событий и уведомлений за последние сутки.</p>
            </header>
            <div className="today-health">
              <div className={capiOk ? 'is-ok' : 'is-warn'}>
                <Activity aria-hidden="true" />
                <span>Meta CAPI за сутки</span>
                <strong>{capiOk ? 'в порядке' : 'нужна проверка'}</strong>
                <em>{formatNumber(capi?.sent24h ?? null)} отправлено · {formatNumber(capi?.failed24h ?? null)} ошибок</em>
              </div>
              <div className={Number(health?.outboxPending || 0) + Number(health?.outboxRetry || 0) > 0 ? 'is-warn' : 'is-ok'}>
                <Clock3 aria-hidden="true" />
                <span>Очередь досылки</span>
                <strong>{formatNumber((health?.outboxPending || 0) + (health?.outboxRetry || 0))}</strong>
                <em>событий ждут повторной отправки</em>
              </div>
              <div className={Number(health?.outboxDead || 0) > 0 ? 'is-alarm' : 'is-ok'}>
                <AlertTriangle aria-hidden="true" />
                <span>Остановленные события</span>
                <strong>{formatNumber(health?.outboxDead ?? 0)}</strong>
                <em>исчерпаны попытки — нужна диагностика</em>
              </div>
              <div className={Number(health?.telegramMissing || 0) > 0 ? 'is-warn' : 'is-ok'}>
                <Send aria-hidden="true" />
                <span>Telegram-уведомления</span>
                <strong>{formatNumber(health?.telegramMissing ?? 0)}</strong>
                <em>заявок без подтверждения за 7 дней</em>
              </div>
            </div>
          </section>
        )}

        {stats && (
          <div className="today-columns">
            <AdminPanel className="adm-card">
              <header className="adm-card__head">
                <h3 className="admin-card-title">Топ страниц за 7 дней</h3>
              </header>
              {(stats.topPages || []).length === 0 ? (
                <p className="admin-muted">Пока нет данных — статистика начнёт собираться после деплоя.</p>
              ) : (
                <ul className="today-rank">
                  {(stats.topPages || []).map((page, index) => (
                    <li key={page.page_path}>
                      <span className="today-rank__index">{index + 1}</span>
                      <span className="today-rank__label" title={page.page_path}>{pageTitle(page.page_path)}</span>
                      <span className="today-rank__value">{formatNumber(page.views)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </AdminPanel>

            <AdminPanel className="adm-card">
              <header className="adm-card__head adm-card__head--row">
                <h3 className="admin-card-title">Последние заявки</h3>
                <button type="button" className="admin-button admin-button--quiet" onClick={() => onNavigate('leads')}>
                  Все сделки <ArrowRight aria-hidden="true" />
                </button>
              </header>
              {(stats.recentLeads || []).length === 0 ? (
                <p className="admin-muted">Заявок пока нет.</p>
              ) : (
                <ul className="today-leads">
                  {(stats.recentLeads || []).map((lead) => {
                    const status = LEAD_STATUS_LABELS[lead.status] || LEAD_STATUS_LABELS.new;
                    return (
                      <li key={lead.id}>
                        <button type="button" onClick={() => onNavigate('leads')}>
                          <span className="today-leads__name">{lead.name || 'Без имени'}</span>
                          <span className="today-leads__meta">
                            {[lead.service, lead.budget].filter(Boolean).join(' · ') || 'Без деталей'}
                          </span>
                          <span className={`today-leads__status ${status.tone}`}>{status.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </AdminPanel>
          </div>
        )}

        <section className="admin-panel adm-card">
          <header className="adm-card__head">
            <h3 className="admin-card-title">Быстрый переход</h3>
          </header>
          <div className="today-quick">
            {QUICK_ACTIONS.map((action) => (
              <button key={action.destination} type="button" onClick={() => onNavigate(action.destination)}>
                <action.icon aria-hidden="true" />
                {action.label}
              </button>
            ))}
          </div>
        </section>
        </aside>
      </div>

      <p className="admin-meta">
        Уникальные посетители считаются по обезличенному отпечатку дня (без cookies), личные данные не сохраняются.
      </p>
    </div>
  );
}
