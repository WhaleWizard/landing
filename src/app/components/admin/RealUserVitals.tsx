import { useCallback, useEffect, useState } from 'react';
import { Gauge, Info, RefreshCw, Smartphone } from 'lucide-react';
import { AdminBlank } from './AdminFeedback';
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
  notes?: string[];
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

/** Реальная скорость у посетителей — то, по чему Google оценивает страницы. */
export default function RealUserVitals({ password }: { password: string }) {
  const [data, setData] = useState<VitalsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/vitals?days=28', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      setData(await response.json().catch(() => null));
    } catch {
      setData({ success: false, error: 'Не удалось загрузить метрики посетителей' });
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) return null;

  if (data?.migration) {
    return (
      <section className="admin-panel adm-card">
        <div className="admin-notice admin-notice--warning" role="status">
          Примените миграцию <code>{data.migration}</code> — до неё реальная скорость посетителей не собирается.
        </div>
      </section>
    );
  }

  if (!data?.success) return null;

  const metrics = data.metrics || [];
  const hasData = metrics.some((metric) => metric.samples > 0);

  return (
    <section className="admin-panel adm-card vitals">
      <header className="adm-card__head adm-card__head--row">
        <div>
          <h3 className="admin-card-title"><Gauge aria-hidden="true" /> Скорость у реальных посетителей</h3>
          <p className="admin-hint">
            Данные настоящих визитов за {data.days || 28} дней — именно по ним Google оценивает страницы, а не по лабораторному замеру.
          </p>
        </div>
        <button type="button" className="admin-button admin-button--quiet admin-button--compact" aria-label="Обновить метрики посетителей" title="Обновить метрики посетителей" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </header>

      {!hasData ? (
        <AdminBlank
          inline
          title="Данные ещё собираются"
          text="Метрики приходят от посетителей сайта и появятся здесь в течение суток после первых визитов."
        />
      ) : (
        <>
          <div className="vitals__grid">
            {metrics.map((metric) => {
              const share = metric.goodShare ?? 0;
              const tone = share >= 75 ? 'is-good' : share >= 50 ? 'is-warn' : 'is-bad';
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

          {(data.devices || []).length > 0 && (
            <div className="vitals__devices">
              <p className="vitals__devices-title"><Smartphone aria-hidden="true" /> По устройствам, доля «хорошо»</p>
              <div className="vitals__devices-grid">
                {(data.devices || [])
                  .filter((row) => row.metric === 'LCP')
                  .map((row) => (
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
            Доля «хорошо» важнее среднего: одно медленное устройство легко утягивает среднее вниз. Отклик на действие считается приближённо — берётся самое долгое взаимодействие на странице.
          </p>
        </>
      )}
    </section>
  );
}
