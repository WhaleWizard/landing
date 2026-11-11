import { useCallback, useEffect, useRef, useState } from 'react';
import { Gauge, Info, RefreshCw, Smartphone } from 'lucide-react';
import { AdminBlank, AdminSectionSkeleton } from './AdminFeedback';
import { formatNumber } from './AttributionCharts';

interface MetricRow {
  metric: string;
  label: string;
  hint: string;
  unit: 'ms' | 'score';
  samples: number;
  average: number | null;
  goodShare: number | null;
  good: number;
  needsImprovement: number;
  poor: number;
}

interface VitalsResponse {
  success?: boolean;
  error?: string;
  migration?: string;
  days?: number;
  metrics?: MetricRow[];
  devices?: Array<{ metric: string; device: string; samples: number; goodShare: number | null }>;
  slowestPages?: Array<{ path: string; samples: number; average: number; poor: number }>;
}

const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Телефон',
  tablet: 'Планшет',
  desktop: 'Компьютер',
};

function formatValue(row: MetricRow): string {
  if (row.average === null) return '—';
  if (row.unit === 'score') return row.average.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
  return row.average >= 1000
    ? `${(row.average / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} с`
    : `${Math.round(row.average)} мс`;
}

export default function RealUserVitals({ password }: { password: string }) {
  const [data, setData] = useState<VitalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<{ error: string; migration?: string } | null>(null);
  const activeRequest = useRef(null as AbortController | null);

  const load = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch('/api/admin/vitals?days=28', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as VitalsResponse | null;
      if (controller.signal.aborted) return;
      if (!response.ok || !payload?.success) {
        setFailure({
          error: payload?.error || 'Не удалось загрузить метрики посетителей.',
          migration: payload?.migration,
        });
        return;
      }
      setData(payload);
    } catch {
      if (!controller.signal.aborted) setFailure({ error: 'Не удалось загрузить метрики посетителей.' });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    void load();
    return () => activeRequest.current?.abort();
  }, [load]);

  const metrics = data?.metrics || [];
  const devices = data?.devices?.filter((row) => row.metric === 'LCP') || [];
  const hasData = metrics.some((metric) => metric.samples > 0);

  return (
    <section className="admin-panel adm-card vitals" aria-label="Скорость у реальных посетителей" aria-busy={loading}>
      <header className="adm-card__head adm-card__head--row">
        <div>
          <h3 className="admin-card-title"><Gauge aria-hidden="true" /> Скорость у реальных посетителей</h3>
          <p className="admin-hint">
            Измерения сайта за {data?.days ?? 28} дней по UTC. Полевые данные Google CrUX показаны в проверках PageSpeed ниже.
          </p>
        </div>
        <button type="button" className="admin-button admin-button--quiet admin-button--compact" aria-label="Обновить метрики посетителей" title="Обновить метрики посетителей" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </header>

      {failure && (
        <div className={`admin-notice admin-notice--${failure.migration ? 'warning' : 'danger'}`} role={failure.migration ? 'status' : 'alert'}>
          {failure.migration
            ? <>Примените миграцию <code>{failure.migration}</code>, чтобы собирать метрики посетителей.</>
            : failure.error}
          {data ? ' Показаны последние загруженные данные.' : ''}
        </div>
      )}
      {loading && !data && <AdminSectionSkeleton tiles={0} rows={2} />}
      {data && (!hasData ? (
        <AdminBlank
          inline
          title="Данные ещё собираются"
          text="За этот период сайт ещё не получил измерений от посетителей."
        />
      ) : (
        <>
          <div className="vitals__grid">
            {metrics.map((metric) => {
              const share = metric.goodShare;
              const tone = share === null ? '' : share >= 75 ? 'is-good' : share >= 50 ? 'is-warn' : 'is-bad';
              return (
                <div className={`vitals__card ${tone}`} key={metric.metric} title={metric.hint}>
                  <span className="vitals__label">{metric.label}</span>
                  <span className="vitals__value">{formatValue(metric)}</span>
                  <span className="vitals__share">{metric.goodShare === null ? '—' : `${metric.goodShare}%`} хорошо</span>
                  <span className="vitals__bar" aria-hidden="true">
                    <i className="is-good" style={{ width: `${(metric.good / Math.max(metric.samples, 1)) * 100}%` }} />
                    <i className="is-warn" style={{ width: `${(metric.needsImprovement / Math.max(metric.samples, 1)) * 100}%` }} />
                    <i className="is-bad" style={{ width: `${(metric.poor / Math.max(metric.samples, 1)) * 100}%` }} />
                  </span>
                  <span className="vitals__samples">{formatNumber(metric.samples)} измерений</span>
                </div>
              );
            })}
          </div>

          {devices.length > 0 && (
            <div className="vitals__devices">
              <p className="vitals__devices-title"><Smartphone aria-hidden="true" /> LCP по устройствам, доля «хорошо»</p>
              <div className="vitals__devices-grid">
                {devices.map((row) => (
                    <span key={`${row.metric}-${row.device}`}>
                      {DEVICE_LABELS[row.device] || row.device}: <strong>{row.goodShare === null ? '—' : `${row.goodShare}%`}</strong>
                      <em>{formatNumber(row.samples)} измерений</em>
                    </span>
                  ))}
              </div>
            </div>
          )}

          {(data.slowestPages || []).length > 0 && (
            <div className="vitals__pages">
              <p className="vitals__devices-title">Самые медленные страницы по загрузке главного блока</p>
              <ul>
                {(data.slowestPages || []).map((page) => (
                  <li key={page.path}>
                    <span title={page.path}>{page.path === '/' ? 'Главная' : page.path}</span>
                    <strong>{page.average >= 1000 ? `${(page.average / 1000).toFixed(2)} с` : `${page.average} мс`}</strong>
                    <em>{formatNumber(page.samples)} измерений</em>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="content-perf__note">
            <Info aria-hidden="true" />
            Отклик на действие — приблизительная оценка по самому долгому взаимодействию на странице.
          </p>
        </>
      ))}
    </section>
  );
}
