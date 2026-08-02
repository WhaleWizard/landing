import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, BellRing, CircleAlert, RefreshCw, Send, X } from 'lucide-react';
import { notify } from './AdminFeedback';

type Severity = 'critical' | 'attention' | 'info';

interface AlertRow {
  id: number;
  kind: string;
  severity: Severity;
  title: string;
  detail: string;
  destination: string;
  created_at: string;
}

interface AlertsResponse {
  success?: boolean;
  error?: string;
  migration?: string;
  alerts?: AlertRow[];
  telegramConfigured?: boolean;
  sent?: number;
  notifyError?: string;
}

const SEVERITY_UI: Record<Severity, { icon: typeof AlertTriangle; label: string }> = {
  critical: { icon: AlertTriangle, label: 'Срочно' },
  attention: { icon: CircleAlert, label: 'Внимание' },
  info: { icon: BellRing, label: 'К сведению' },
};

function since(raw: string): string {
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const time = new Date(normalized).getTime();
  if (Number.isNaN(time)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} ч назад`;
  return `${Math.round(minutes / (60 * 24))} дн назад`;
}

/**
 * Центр уведомлений: поводы, которые иначе замечаются поздно. Список
 * пересобирается сервером при каждом открытии, поэтому исчезнувшая проблема
 * пропадает сама — вручную разгребать неактуальное не нужно.
 */
export default function AdminAlerts({
  password,
  onNavigate,
}: {
  password: string;
  onNavigate: (destination: string) => void;
}) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [telegram, setTelegram] = useState(false);
  const [migration, setMigration] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/alerts', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as AlertsResponse | null;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.migration || '');
        setAlerts([]);
        return;
      }
      setMigration('');
      setAlerts(payload.alerts || []);
      setTelegram(Boolean(payload.telegramConfigured));
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, unknown>): Promise<AlertsResponse | null> => {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null) as AlertsResponse | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      setAlerts(payload.alerts || []);
      return payload;
    } catch (error) {
      notify.error('Не получилось', error instanceof Error ? error.message : undefined);
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (loading && !alerts.length && !migration) return null;

  if (migration) {
    return (
      <section className="admin-panel adm-card">
        <div className="admin-notice admin-notice--warning" role="status">
          Примените миграцию <code>{migration}</code> — до неё уведомления негде хранить.
        </div>
      </section>
    );
  }

  if (!alerts.length) return null;

  const critical = alerts.filter((alert) => alert.severity === 'critical').length;

  return (
    <section className={`admin-panel adm-card alerts${critical ? ' has-critical' : ''}`} aria-label="Требует внимания">
      <header className="adm-card__head adm-card__head--row">
        <div>
          <h3 className="admin-card-title"><BellRing aria-hidden="true" /> Требует внимания</h3>
          <p className="admin-hint">
            {critical
              ? `${critical} из ${alerts.length} — срочные. Список обновляется сам: решённое исчезает.`
              : 'Список обновляется сам: как только проблема решена, она исчезает отсюда.'}
          </p>
        </div>
        <div className="alerts__actions">
          <button type="button" className="admin-button admin-button--quiet admin-button--compact" onClick={() => void load()} disabled={loading || busy}>
            <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
          {telegram && (
            <button
              type="button"
              className="admin-button admin-button--compact"
              disabled={busy}
              title="Отправить непоказанные поводы в Telegram"
              onClick={async () => {
                const payload = await post({ action: 'notify' });
                if (!payload) return;
                if (payload.notifyError) notify.error('Telegram не принял сообщение', payload.notifyError);
                else if (payload.sent) notify.success(`Отправлено в Telegram: ${payload.sent}`);
                else notify.info('Всё уже отправлено раньше');
              }}
            >
              <Send aria-hidden="true" /> В Telegram
            </button>
          )}
        </div>
      </header>

      <ul className="alerts__list">
        {alerts.map((alert) => {
          const ui = SEVERITY_UI[alert.severity] || SEVERITY_UI.info;
          const Icon = ui.icon;
          return (
            <li key={alert.id} className={`is-${alert.severity}`}>
              <span className="alerts__icon" aria-hidden="true"><Icon /></span>
              <div className="alerts__body">
                <strong>{alert.title}</strong>
                <span>{alert.detail}</span>
              </div>
              <span className="alerts__meta">{since(alert.created_at)}</span>
              {alert.destination ? (
                <button
                  type="button"
                  className="admin-button admin-button--compact"
                  onClick={() => onNavigate(alert.destination)}
                >
                  Открыть <ArrowRight aria-hidden="true" />
                </button>
              ) : null}
              <button
                type="button"
                className="admin-icon-button"
                aria-label={`Скрыть: ${alert.title}`}
                title="Скрыть. Повод вернётся, если ситуация повторится"
                disabled={busy}
                onClick={() => void post({ action: 'dismiss', id: alert.id })}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
