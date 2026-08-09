import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, Clock3, Database,
  Info, Inbox, RefreshCw, Send, Server, ShieldCheck, XCircle,
} from 'lucide-react';
import { notify } from './AdminFeedback';

type Tone = 'ok' | 'warn' | 'fail' | 'neutral';

interface TestFieldPreview {
  key: string;
  preview: string;
}

interface TestEventDetail {
  event_name: string;
  event_id: string;
  action_source?: string;
  event_source_url?: string;
  user_data: TestFieldPreview[];
  custom_data: TestFieldPreview[];
}

// Meta присылает поля короткими кодами. Владелец админки — не разработчик,
// поэтому в разборе показываем, что каждый код означает по-русски.
const FIELD_LABELS: Record<string, string> = {
  em: 'E-mail (хеш)',
  ph: 'Телефон (хеш)',
  fn: 'Имя (хеш)',
  ln: 'Фамилия (хеш)',
  country: 'Страна (хеш)',
  ct: 'Город (хеш)',
  st: 'Регион (хеш)',
  zp: 'Индекс (хеш)',
  external_id: 'Свой идентификатор (хеш)',
  fbp: 'Cookie пикселя _fbp',
  fbc: 'Метка клика по рекламе _fbc',
  client_ip_address: 'IP-адрес',
  client_user_agent: 'Браузер (User-Agent)',
  service: 'Услуга',
  service_slug: 'Код услуги',
  contact_method: 'Способ связи',
  form_id: 'Форма',
  form_variant: 'Вариант формы',
  lead_source_page: 'Страница заявки',
  content_name: 'Название содержимого',
  content_type: 'Тип содержимого',
  content_ids: 'Идентификаторы содержимого',
  page_title: 'Заголовок страницы',
  page_location: 'Адрес страницы',
  page_path: 'Путь страницы',
  utm_source: 'utm_source',
  utm_medium: 'utm_medium',
  utm_campaign: 'utm_campaign',
  language: 'Язык браузера',
  device_type: 'Тип устройства',
  consent_source: 'Источник согласия',
  consent_version: 'Версия согласия',
  consent_timestamp: 'Время согласия',
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key;
}

interface EventSummary {
  eventName: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  attempted: number;
  eventsReceived: number;
  deliveryRate: number | null;
  consentObserved: number;
  withConsent: number;
  consentRate: number | null;
  scores: {
    match: number | null;
    identity: number | null;
    attribution: number | null;
    consent: number | null;
    context: number | null;
  };
  latestAt: string | null;
}

interface PeriodSummary {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  attempted: number;
  eventsReceived: number;
  deliveryRate: number | null;
  consentObserved: number;
  withConsent: number;
  consentRate: number | null;
  events: EventSummary[];
}

interface MetaCenterResponse {
  success: boolean;
  error?: string;
  code?: string;
  checkedAt?: string;
  environment?: {
    d1Available: boolean;
    capiTokenConfigured: boolean;
    pixelIdSource?: 'environment' | 'project_default';
    diagnosticsKvConfigured: boolean;
    idempotencyKvConfigured: boolean;
  };
  schema?: {
    ready: boolean;
    tables: Array<{
      table: string;
      exists: boolean;
      ready: boolean;
      missingColumns: string[];
      optionalColumnsPresent: string[];
    }>;
  };
  outbox?: {
    available: boolean;
    total: number;
    counts: Record<string, number>;
    active: number;
    actionable: number;
    overdue: number;
    staleSending: number;
    recoveredAfterRetry: number;
    oldestActiveAt: string | null;
    latestActivityAt: string | null;
    latestSentAt: string | null;
    latestRecoveredAt: string | null;
  };
  periods?: { '24h'?: PeriodSummary; '7d'?: PeriodSummary };
  qualityTrend?: Array<{ day: string; events: number; averageScore: number | null; sent: number; failed: number }>;
  dedupe?: { available: boolean; events: number; withEventId: number; coverage: number | null; duplicateEventIds: number };
  latestErrors?: Array<{
    source: 'diagnostics' | 'outbox';
    eventName: string;
    status: string;
    code: string | null;
    message: string;
    attempts: number | null;
    createdAt: string;
  }>;
  limitations?: string[];
}

const TONES: Record<Tone, string> = {
  ok: 'border-green-500/25 bg-green-500/8 text-green-500',
  warn: 'border-amber-500/25 bg-amber-500/8 text-amber-500',
  fail: 'border-[var(--adm-danger)]/25 bg-[var(--adm-danger)]/8 text-[var(--adm-danger)]',
  neutral: 'border-[var(--adm-border)] bg-[var(--adm-card)] text-[var(--adm-fg)]/70',
};

function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('ru-RU');
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('ru-RU');
}

function StateCard({ icon, title, value, detail, tone = 'neutral' }: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
  tone?: Tone;
}) {
  return (
    <div className="admin-panel p-4">
      <div className="flex items-center gap-2 text-sm text-[var(--adm-fg)]/60">{icon}<span>{title}</span></div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-sm font-semibold ${TONES[tone]}`}>{value}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--adm-fg)]/58">{detail}</p>
    </div>
  );
}

function PeriodCard({ label, data }: { label: string; data?: PeriodSummary }) {
  return (
    <div className="admin-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">События · {label}</h3>
        <span className="admin-meta">
          Доставка {formatPercent(data?.deliveryRate)}
        </span>
      </div>

      {!data ? (
        <p className="mt-4 text-sm text-[var(--adm-fg)]/55">Диагностика недоступна: проверьте таблицу meta_capi_diagnostics.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Подтверждено', data.sent, 'text-green-500'],
              ['Ошибки', data.failed, 'text-[var(--adm-danger)]'],
              ['Пропущено', data.skipped, 'text-amber-500'],
              ['Принято Meta', data.eventsReceived, 'text-[var(--adm-primary)]'],
            ].map(([name, value, className]) => (
              <div key={String(name)} className="rounded-xl bg-[var(--adm-muted)]/42 p-3">
                <div className="text-sm text-[var(--adm-fg)]/55">{name}</div>
                <div className={`mt-1 text-xl font-semibold tabular-nums ${className}`}>{formatNumber(value as number)}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto" role="region" aria-label={`События Meta CAPI за ${label}`} tabIndex={0}>
            <table className="w-full min-w-[680px] text-left text-sm">
              <caption className="sr-only">Доставка событий Meta CAPI за {label}</caption>
              <thead className="text-[var(--adm-fg)]/50">
                <tr className="border-b border-[var(--adm-border)]">
                  <th scope="col" className="px-2 py-2 font-medium">Событие</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Всего</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Доставлено</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Ошибки</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Согласие</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Полнота сигналов · /100</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((event) => (
                  <tr key={event.eventName} className="border-b border-[var(--adm-border)]/55 last:border-0">
                    <td className="px-2 py-2.5 font-medium">{event.eventName}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(event.total)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-green-500">{formatNumber(event.sent)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-[var(--adm-danger)]">{formatNumber(event.failed)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatPercent(event.consentRate)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(event.scores.match)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.events.length === 0 && <p className="py-5 text-sm text-[var(--adm-fg)]/50">За период событий нет.</p>}
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminMetaCenter({ password }: { password: string }) {
  const [data, setData] = useState<MetaCenterResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processArmed, setProcessArmed] = useState(false);
  const [processNotice, setProcessNotice] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testDetail, setTestDetail] = useState<TestEventDetail[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/meta-center', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as MetaCenterResponse | null;
      if (!response.ok || !payload?.success) {
        setData(payload);
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить центр Meta CAPI');
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Тестовое событие уходит с `test_event_code`: оно видно в Events Manager →
   * «Тестирование событий» и не смешивается с живой статистикой. Шлём Lead:
   * PageView подтверждал только связь, а разобраться нужно именно в том, какие
   * параметры доходят с заявки.
   */
  const sendTestEvent = useCallback(async () => {
    setTestSending(true);
    setTestResult(null);
    setTestDetail([]);
    try {
      const response = await fetch('/api/meta-test-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ event_name: 'Lead', page_url: window.location.origin }),
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        error?: string;
        test_event_code?: string;
        events_requested?: { event_name: string; event_id: string }[];
        events_detail?: TestEventDetail[];
        meta?: unknown;
      } | null;

      if (!response.ok || !payload?.success) {
        const metaMessage = typeof payload?.meta === 'string'
          ? payload.meta
          : (payload?.meta as { error?: { message?: string } } | undefined)?.error?.message;
        const raw = payload?.error || metaMessage || `HTTP ${response.status}`;
        // Ответ сервера технический и на английском — самую частую причину
        // переводим, иначе владельцу админки непонятно, что чинить.
        const reason = raw.includes('META_CAPI_TEST_CODE')
          ? 'В Cloudflare не задан META_CAPI_TEST_CODE — код тестирования событий из Events Manager. Без него Meta не примет тестовое событие.'
          : raw;
        setTestResult({ ok: false, text: `Тестовое событие не прошло: ${reason}` });
        notify.error('Тестовое событие не дошло', reason);
        return;
      }

      const eventId = payload.events_requested?.[0]?.event_id || '';
      const code = payload.test_event_code ? ` Код тестирования: ${payload.test_event_code}.` : '';
      setTestDetail(payload.events_detail || []);
      setTestResult({
        ok: true,
        text: `Meta приняла тестовую заявку (Lead)${eventId ? ` — event_id ${eventId}` : ''}.${code} Событие ищите в Events Manager → «Тестирование событий».`,
      });
      notify.success('Тестовое событие принято Meta');
      await load();
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setTestResult({ ok: false, text: `Не удалось отправить: ${reason}` });
      notify.error('Не удалось отправить', reason);
    } finally {
      setTestSending(false);
    }
  }, [load, password]);

  const processQueue = async () => {
    setProcessing(true);
    setProcessNotice('Обрабатываю готовые к повтору и зависшие события…');
    try {
      const response = await fetch('/api/admin/meta-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'process-outbox', limit: 10 }),
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        error?: string;
        summary?: { processed?: number; sent?: number; retried?: number; dead?: number; persistence_failed?: number };
      } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      const summary = payload.summary || {};
      const persistenceWarning = summary.persistence_failed
        ? ` Не удалось зафиксировать в D1: ${summary.persistence_failed}; эти записи будут подобраны повторно.`
        : '';
      setProcessNotice(`Обработано: ${summary.processed || 0}; доставлено: ${summary.sent || 0}; на повторе: ${summary.retried || 0}; остановлено: ${summary.dead || 0}.${persistenceWarning}`);
      setProcessArmed(false);
      await load();
    } catch (err) {
      setProcessNotice(err instanceof Error ? err.message : 'Не удалось обработать очередь');
    } finally {
      setProcessing(false);
    }
  };

  const queueTone = useMemo<Tone>(() => {
    if (!data?.outbox?.available) return 'warn';
    if ((data.outbox.counts.dead_letter || 0) > 0 || data.outbox.staleSending > 0) return 'fail';
    if (data.outbox.overdue > 0) return 'warn';
    if (data.outbox.actionable > 0) return 'neutral';
    return 'ok';
  }, [data]);

  const queueCanBeProcessed = Boolean(
    data?.outbox?.available && (data.outbox.overdue > 0 || data.outbox.staleSending > 0),
  );

  const delivery = data?.periods?.['24h'];
  const deliveryTone: Tone = !delivery || delivery.attempted === 0
    ? 'warn'
    : delivery.failed > 0 ? 'fail' : 'ok';
  const metaAccessConfirmed = Boolean(data?.environment?.capiTokenConfigured && delivery && delivery.sent > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[var(--adm-primary)]" />
            <h2 className="text-lg font-semibold tracking-tight">Центр Meta CAPI</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--adm-fg)]/58">
            Фактическое состояние D1, очереди повторных отправок и ответов Meta — без токенов, payload и персональных данных.
          </p>
          {data?.checkedAt && <p className="admin-meta mt-1">Обновлено: {formatDate(data.checkedAt)}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void sendTestEvent()}
            disabled={testSending}
            className="admin-button"
            title="Отправляет тестовую заявку (Lead) с test_event_code — она видна в «Тестировании событий» Meta и не попадает в живые данные"
          >
            <Send className="h-4 w-4" />
            {testSending ? 'Отправляю…' : 'Тестовое событие'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="admin-button admin-button--secondary"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Проверяю…' : 'Обновить'}
          </button>
        </div>
      </div>

      {testResult && (
        <div
          className={`admin-notice ${testResult.ok ? 'admin-notice--success' : 'admin-notice--warning'}`}
          role="status"
        >
          <div>{testResult.text}</div>

          {/* Разбор лежит свёрнутым внутри уведомления: раздел — это сводка
              состояния, и таблица параметров не должна занимать экран, пока
              её не открыли. */}
          {testDetail.map((event) => (
            <details className="admin-disclosure mt-3" key={event.event_id}>
              <summary>
                <span>Что ушло в Meta</span>
                <span className="admin-meta">
                  {event.user_data.length + event.custom_data.length} параметров
                </span>
              </summary>
              <div className="px-3.5 pb-3.5">
                <p className="admin-meta">
                  Набор полей тот же, что уходит с настоящей заявки. Значения синтетические:
                  проверяется доставка параметров, а не данные реального клиента.
                </p>
                <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <div>
                    <p className="admin-meta">Параметры совпадения пользователя</p>
                    <dl className="mt-1.5 space-y-1">
                      {event.user_data.map((field) => (
                        <div key={field.key} className="flex flex-wrap items-baseline gap-x-2">
                          <dt className="text-sm text-[var(--adm-fg)]/75">{fieldLabel(field.key)}</dt>
                          <dd className="admin-meta break-all">{field.preview}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div>
                    <p className="admin-meta">Данные события</p>
                    <dl className="mt-1.5 space-y-1">
                      {event.custom_data.map((field) => (
                        <div key={field.key} className="flex flex-wrap items-baseline gap-x-2">
                          <dt className="text-sm text-[var(--adm-fg)]/75">{fieldLabel(field.key)}</dt>
                          <dd className="admin-meta break-all">{field.preview}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}

      {loading && !data && !error && (
        <div className="admin-panel p-6 text-sm text-[var(--adm-fg)]/60" role="status" aria-live="polite">
          Проверяю D1, очередь и ответы Meta…
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold">Данные этого окружения недоступны</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--adm-fg)]/65">{error}</p>
              {data?.code === 'D1_NOT_BOUND' && (
                <p className="mt-1 text-sm text-[var(--adm-fg)]/50">Откройте раздел на production: локальный Vite обычно работает без Cloudflare D1.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {data?.success && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StateCard
              icon={<Database className="h-4 w-4" />}
              title="D1 и схема"
              value={data.schema?.ready ? 'Готово' : 'Нужна проверка'}
              detail={data.schema?.ready ? 'Все обязательные таблицы и поля на месте.' : 'Есть отсутствующие таблицы или поля миграций.'}
              tone={data.schema?.ready ? 'ok' : 'fail'}
            />
            <StateCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Доступ к Meta"
              value={metaAccessConfirmed ? 'Подтверждён' : data.environment?.capiTokenConfigured ? 'Токен задан' : 'Нет токена'}
              detail={metaAccessConfirmed
                ? 'За последние 24 часа Meta подтвердила приём хотя бы одного события.'
                : data.environment?.capiTokenConfigured
                  ? 'Переменная задана, но свежей подтверждённой доставки пока нет.'
                  : 'META_CAPI_ACCESS_TOKEN не задан в окружении.'}
              tone={metaAccessConfirmed ? 'ok' : data.environment?.capiTokenConfigured ? 'neutral' : 'fail'}
            />
            <StateCard
              icon={<Inbox className="h-4 w-4" />}
              title="Очередь"
              value={data.outbox?.available ? `${formatNumber(data.outbox.active)} активных` : 'Недоступна'}
              detail={data.outbox?.available
                ? `${formatNumber(data.outbox.active)} обрабатываются автоматически · ${formatNumber(data.outbox.overdue)} просрочены · ${formatNumber(data.outbox.staleSending)} зависли.`
                : 'Таблица meta_outbox не найдена.'}
              tone={queueTone}
            />
            <StateCard
              icon={<Server className="h-4 w-4" />}
              title="Доставка за 24 часа"
              value={formatPercent(delivery?.deliveryRate)}
              detail={delivery ? `${delivery.sent} подтверждено · ${delivery.failed} ошибок · ${delivery.skipped} пропущено.` : 'Пока нет доступной диагностики.'}
              tone={deliveryTone}
            />
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <PeriodCard label="24 часа" data={data.periods?.['24h']} />
            <PeriodCard label="7 дней" data={data.periods?.['7d']} />
          </div>

          {(data.qualityTrend || []).length > 1 && (
            <section className="admin-panel adm-card">
              <header className="adm-card__head">
                <h3 className="admin-card-title">Качество совпадений по дням</h3>
                <p className="admin-hint">
                  Чем выше столбец, тем больше данных Meta может сопоставить с человеком. Падение матчинга поднимает цену заявки, и заметить его здесь можно раньше, чем в кабинете.
                </p>
              </header>
              <div className="meta-trend">
                {(data.qualityTrend || []).map((point) => {
                  const score = point.averageScore ?? 0;
                  const tone = score >= 70 ? 'is-good' : score >= 45 ? 'is-warn' : 'is-bad';
                  return (
                    <div className={`meta-trend__col ${point.averageScore === null ? 'is-empty' : tone}`} key={point.day}>
                      <span
                        className="meta-trend__bar"
                        style={{ height: `${Math.max(score, point.averageScore === null ? 0 : 4)}%` }}
                        title={`${point.day}: качество ${point.averageScore ?? '—'}, событий ${point.events}, ошибок ${point.failed}`}
                      />
                      <span className="meta-trend__value">{point.averageScore === null ? '—' : Math.round(score)}</span>
                      <span className="meta-trend__day">{new Date(`${point.day}T00:00:00Z`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {data.dedupe?.available && (
            <section className="admin-panel adm-card">
              <header className="adm-card__head">
                <h3 className="admin-card-title">Дедупликация за 7 дней</h3>
                <p className="admin-hint">
                  Проверяется только серверная сторона: есть ли у события идентификатор и не ушло ли оно дважды. Совпадение с пикселем видно лишь в Events Manager.
                </p>
              </header>
              <div className="meta-dedupe">
                <div className={data.dedupe.coverage !== null && data.dedupe.coverage >= 99 ? 'is-good' : 'is-warn'}>
                  <span>Событий с идентификатором</span>
                  <strong>{data.dedupe.coverage === null ? '—' : `${data.dedupe.coverage}%`}</strong>
                  <em>{data.dedupe.withEventId} из {data.dedupe.events}. Без event_id пиксель и сервер посчитаются дважды.</em>
                </div>
                <div className={data.dedupe.duplicateEventIds > 0 ? 'is-bad' : 'is-good'}>
                  <span>Повторные отправки с сервера</span>
                  <strong>{data.dedupe.duplicateEventIds}</strong>
                  <em>{data.dedupe.duplicateEventIds > 0
                    ? 'Одно и то же событие ушло больше раза — это двойной счёт.'
                    : 'Каждое событие отправлено ровно один раз.'}</em>
                </div>
              </div>
            </section>
          )}

          <div className="grid gap-3 xl:grid-cols-[1.1fr_.9fr]">
            <section className="admin-panel p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-[var(--adm-primary)]" />
                  <h3 className="text-base font-semibold">Очередь повторных отправок</h3>
                </div>
                {!processArmed ? (
                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    disabled={processing || !queueCanBeProcessed}
                    onClick={() => setProcessArmed(true)}
                  >
                    <RefreshCw aria-hidden="true" /> Запустить обработку
                  </button>
                ) : (
                  <div className="admin-confirm-inline" role="alert">
                    <span>Обработать до 10 реальных событий, готовых к повтору или зависших при прошлой отправке?</span>
                    <button type="button" className="admin-button admin-button--primary" disabled={processing} onClick={() => void processQueue()}>
                      {processing ? 'Отправляю…' : 'Да, обработать'}
                    </button>
                    <button type="button" className="admin-button admin-button--ghost" disabled={processing} onClick={() => setProcessArmed(false)}>Отмена</button>
                  </div>
                )}
              </div>
              {processNotice && <div className="admin-notice mt-3" role="status" aria-live="polite">{processNotice}</div>}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ['Ожидают', data.outbox?.counts.pending || 0],
                  ['Повтор', data.outbox?.counts.retry || 0],
                  ['Отправляются', data.outbox?.counts.sending || 0],
                  ['Доставлены', data.outbox?.counts.sent || 0],
                  ['Остановлены', data.outbox?.counts.dead_letter || 0],
                  ['Восстановлены очередью', data.outbox?.recoveredAfterRetry || 0],
                  ['Всего записей', data.outbox?.total || 0],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-[var(--adm-border)]/70 bg-[var(--adm-muted)]/28 p-3">
                    <div className="text-sm text-[var(--adm-fg)]/52">{label}</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(value as number)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-1.5 text-sm text-[var(--adm-fg)]/58">
                <p><Clock3 className="mr-1.5 inline h-4 w-4" />Самое старое активное: {formatDate(data.outbox?.oldestActiveAt)}</p>
                <p>Последняя доставка: {formatDate(data.outbox?.latestSentAt)}</p>
                <p>Последняя доставка после повтора: {formatDate(data.outbox?.latestRecoveredAt)}</p>
                <p>Последнее изменение очереди: {formatDate(data.outbox?.latestActivityAt)}</p>
              </div>
            </section>

            <section className="admin-panel p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-[var(--adm-primary)]" />
                <h3 className="text-base font-semibold">Готовность схемы</h3>
              </div>
              <div className="mt-3 divide-y divide-[var(--adm-border)]/60">
                {data.schema?.tables.map((table) => {
                  const Icon = table.ready ? CheckCircle2 : XCircle;
                  return (
                    <div key={table.table} className="flex items-start gap-3 py-3">
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${table.ready ? 'text-green-500' : 'text-[var(--adm-danger)]'}`} />
                      <div className="min-w-0">
                        <p className="break-all text-sm font-semibold">{table.table}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-[var(--adm-fg)]/55">
                          {!table.exists
                            ? 'Таблица отсутствует.'
                            : table.missingColumns.length > 0
                              ? `Нет полей: ${table.missingColumns.join(', ')}.`
                              : 'Обязательные поля на месте.'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="admin-panel p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h3 className="text-base font-semibold">Последние предупреждения и ошибки</h3>
            </div>
            {data.latestErrors?.length ? (
              <div className="mt-3 divide-y divide-[var(--adm-border)]/60">
                {data.latestErrors.map((item, index) => (
                  <div key={`${item.source}-${item.createdAt}-${index}`} className="grid gap-1 py-3 sm:grid-cols-[145px_1fr_auto] sm:gap-3">
                    <div>
                      <span className="rounded-full bg-[var(--adm-muted)] px-2 py-1 text-sm font-semibold">{item.eventName}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="break-words text-sm leading-relaxed">{item.message}</p>
                      <p className="mt-0.5 text-sm text-[var(--adm-fg)]/45">
                        {item.source === 'outbox' ? 'Очередь' : 'Диагностика'} · {item.status}
                        {item.code ? ` · код ${item.code}` : ''}
                        {item.attempts !== null ? ` · попыток ${item.attempts}` : ''}
                      </p>
                    </div>
                    <time className="text-sm text-[var(--adm-fg)]/45">{formatDate(item.createdAt)}</time>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-green-500/8 p-3 text-sm text-green-500">
                <CheckCircle2 className="h-4 w-4" /> В доступных таблицах нет записанных ошибок.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-muted)]/24 p-4">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--adm-primary)]" />
              <div>
                <h3 className="text-sm font-semibold">Как читать эту панель</h3>
                <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-[var(--adm-fg)]/58">
                  {data.limitations?.map((item, index) => <li key={index}>• {item}</li>)}
                </ul>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
