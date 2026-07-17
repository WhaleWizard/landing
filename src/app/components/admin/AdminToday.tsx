import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  RefreshCw,
} from 'lucide-react';
import AdminDashboard from './AdminDashboard';

type Destination = 'leads' | 'articles' | 'health' | 'meta' | 'content';
type Level = 'critical' | 'attention' | 'info';

type TodayItem = {
  id: string;
  title: string;
  detail: string;
  count: number;
  level: Level;
  destination: Destination;
};

type TodayResponse = {
  success?: boolean;
  error?: string;
  localOnly?: boolean;
  generatedAt?: string;
  items?: TodayItem[];
};

const levelUi = {
  critical: {
    icon: AlertTriangle,
    label: 'Критично',
    className: 'admin-state admin-state--danger',
  },
  attention: {
    icon: Clock3,
    label: 'Требует внимания',
    className: 'admin-state admin-state--warning',
  },
  info: {
    icon: CircleDot,
    label: 'К сведению',
    className: 'admin-state admin-state--info',
  },
} as const;

export default function AdminToday({
  password,
  onNavigate,
}: {
  password: string;
  onNavigate: (destination: Destination) => void;
}) {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/today', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as TodayResponse | null;
      if (!payload) throw new Error(`HTTP ${response.status}`);
      setData(payload);
    } catch (error) {
      setData({ success: false, error: error instanceof Error ? error.message : 'Не удалось загрузить сводку' });
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const items = data?.items || [];

  return (
    <div className="admin-stack admin-stack--lg">
      <section className="admin-card admin-card--hero" aria-labelledby="admin-today-title">
        <div className="admin-section-header">
          <div>
            <p className="admin-eyebrow">Центр управления</p>
            <h2 id="admin-today-title" className="admin-title">Сегодня</h2>
            <p className="admin-subtitle">Только действия, которые требуют решения — без лишнего информационного шума.</p>
          </div>
          <button type="button" className="admin-button admin-button--secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            {loading ? 'Обновляю' : 'Обновить'}
          </button>
        </div>

        {data?.success && items.length === 0 && (
          <div className="admin-empty admin-empty--success">
            <CheckCircle2 aria-hidden="true" />
            <div>
              <strong>По доступным данным срочных действий нет</strong>
              <p>Сводка не нашла задач, требующих решения прямо сейчас.</p>
            </div>
          </div>
        )}

        {!data?.success && !loading && (
          <div className="admin-empty">
            <CircleDot aria-hidden="true" />
            <div>
              <strong>{data?.localOnly ? 'Рабочая сводка доступна на production' : 'Не удалось загрузить рабочую сводку'}</strong>
              <p>{data?.error || 'Для этого экрана требуется подключённая Cloudflare D1.'}</p>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="admin-action-grid">
            {items.map((item) => {
              const ui = levelUi[item.level];
              const Icon = ui.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="admin-action-card"
                  onClick={() => onNavigate(item.destination)}
                >
                  <div className="admin-action-card__top">
                    <span className={ui.className}><Icon aria-hidden="true" />{ui.label}</span>
                    <span className="admin-action-card__count">{item.count}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <span className="admin-action-card__link">Открыть <ArrowRight aria-hidden="true" /></span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {!loading && !data?.localOnly && <AdminDashboard password={password} />}
    </div>
  );
}
