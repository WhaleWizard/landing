import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Send } from 'lucide-react';
import { loadConsent } from '../../consent/consent';

interface HealthCheck {
  id: string;
  title: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

const STATUS_UI = {
  ok: { icon: CheckCircle2, className: 'text-green-500', chip: 'bg-green-500/10 text-green-500', label: 'ок' },
  warn: { icon: AlertTriangle, className: 'text-yellow-500', chip: 'bg-yellow-500/10 text-yellow-500', label: 'внимание' },
  fail: { icon: XCircle, className: 'text-[var(--adm-danger)]', chip: 'bg-[var(--adm-danger)]/10 text-[var(--adm-danger)]', label: 'ошибка' },
} as const;

// Клиентские проверки. Важно: на /admin пиксели НАМЕРЕННО не загружаются
// (админский трафик не должен попадать в рекламную статистику), поэтому
// «скрипт отсутствует» здесь не поломка. Проверяем согласие в этом браузере
// и честно объясняем, где смотреть фактическую загрузку.
function runBrowserChecks(): HealthCheck[] {
  const w = window as unknown as Record<string, unknown>;
  const consent = loadConsent();
  const consentGivenAt = consent ? new Date(consent.timestamp).toLocaleDateString('ru-RU') : '';

  const make = (id: string, title: string, loaded: boolean, allowed: boolean, category: string): HealthCheck => {
    if (loaded) return { id, title, status: 'ok', detail: 'Загружен в этом браузере' };
    if (allowed) {
      return {
        id,
        title,
        status: 'ok',
        detail: `Согласие («${category}») в этом браузере дано${consentGivenAt ? ` ${consentGivenAt}` : ''}. На /admin пиксели намеренно не загружаются — фактическую загрузку проверяйте на любой публичной странице сайта`,
      };
    }
    return {
      id,
      title,
      status: 'warn',
      detail: consent
        ? `Не загружен: в этом браузере согласие «${category}» отклонено`
        : 'Не загружен: в этом браузере согласие на cookie ещё не давалось',
    };
  };

  return [
    make('px-gtm', 'Google Tag Manager (dataLayer)', Array.isArray(w.dataLayer), Boolean(consent?.categories.analytics), 'аналитика'),
    make('px-meta', 'Meta Pixel (fbq)', typeof w.fbq === 'function', Boolean(consent?.categories.marketing), 'маркетинг'),
    make('px-ym', 'Яндекс Метрика (ym)', typeof w.ym === 'function', Boolean(consent?.categories.analytics), 'аналитика'),
  ];
}

export default function AdminHealth({ password }: { password: string }) {
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [browserChecks, setBrowserChecks] = useState<HealthCheck[]>([]);
  const [checkedAt, setCheckedAt] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tgStatus, setTgStatus] = useState('');

  const run = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/health', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null) as { success?: boolean; error?: string; checks?: HealthCheck[]; checkedAt?: string } | null;
      if (!res.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${res.status}`);
      setChecks(payload.checks || []);
      setCheckedAt(payload.checkedAt || '');
      setBrowserChecks(runBrowserChecks());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Проверка не удалась');
      setChecks(null);
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void run(); }, [run]);

  const telegramTest = async () => {
    setTgStatus('Отправляю…');
    try {
      const res = await fetch('/api/admin/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'telegram-test' }),
      });
      const payload = await res.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!res.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${res.status}`);
      setTgStatus('✓ Отправлено — проверьте чат в Telegram');
    } catch (err) {
      setTgStatus('Не удалось: ' + (err instanceof Error ? err.message : 'ошибка'));
    }
    window.setTimeout(() => setTgStatus(''), 8000);
  };

  const renderCheck = (item: HealthCheck) => {
    const ui = STATUS_UI[item.status];
    const Icon = ui.icon;
    return (
      <div key={item.id} className="flex items-start gap-3 border-t border-[var(--adm-border)]/50 py-3 first:border-t-0">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ui.className}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{item.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ui.chip}`}>{ui.label}</span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--adm-fg)]/60">{item.detail}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--adm-fg)]/90">Проверка сайта</h2>
          {checkedAt && <p className="text-xs text-[var(--adm-fg)]/50">Последняя проверка: {new Date(checkedAt).toLocaleString('ru-RU')}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void telegramTest()} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--adm-border)] px-3 py-1.5 text-xs text-[var(--adm-fg)]/80 hover:bg-[var(--adm-primary)]/10">
            <Send className="h-3.5 w-3.5" /> Тест Telegram
          </button>
          <button onClick={() => void run()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--adm-primary)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Проверяю…' : 'Запустить проверку'}
          </button>
        </div>
      </div>

      {tgStatus && (
        <div className="rounded-xl border border-[var(--adm-primary)]/30 bg-[var(--adm-primary)]/10 px-4 py-2.5 text-sm">{tgStatus}</div>
      )}

      {error && (
        <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-6 space-y-2">
          <p className="text-sm text-[var(--adm-fg)]/75">{error}</p>
          <p className="text-xs text-[var(--adm-fg)]/55">Проверка работает на продакшене (нужны Cloudflare-функции). В локальной разработке — заглушка.</p>
        </div>
      )}

      {checks && (
        <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] px-4 py-1">
          <h3 className="pt-3 text-xs font-semibold uppercase tracking-wider text-[var(--adm-fg)]/55">Сервер и интеграции</h3>
          {checks.map(renderCheck)}
        </div>
      )}

      {browserChecks.length > 0 && (
        <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] px-4 py-1">
          <h3 className="pt-3 text-xs font-semibold uppercase tracking-wider text-[var(--adm-fg)]/55">Пиксели в этом браузере</h3>
          {browserChecks.map(renderCheck)}
          <p className="pb-3 pt-1 text-[11px] text-[var(--adm-fg)]/45">На /admin пиксели намеренно не загружаются, чтобы визиты администратора не попадали в статистику рекламы. Эта проверка показывает согласие на cookie в текущем браузере; работу самих пикселей смотрите на публичных страницах сайта.</p>
        </div>
      )}
    </div>
  );
}
