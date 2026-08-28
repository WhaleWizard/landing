import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Send } from 'lucide-react';
import { loadConsent } from '../../consent/consent';
import { AdminSectionSkeleton } from './AdminFeedback';
import { plural } from '../../utils/plural';

interface HealthCheck {
  id: string;
  title: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

const STATUS_UI = {
  ok: { icon: CheckCircle2, label: 'ок' },
  warn: { icon: AlertTriangle, label: 'внимание' },
  fail: { icon: XCircle, label: 'ошибка' },
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

/**
 * «7 в норме · 1 требует внимания · 2 ошибки» — состояние группы одной строкой.
 *
 * Подписи склоняются: раньше строка читалась как «2 ошибка» и «3 внимание».
 */
function groupScore(list: HealthCheck[]): Array<{ status: HealthCheck['status']; count: number; label: string }> {
  const counters: Array<{ status: HealthCheck['status']; forms: [string, string, string] }> = [
    { status: 'ok', forms: ['в норме', 'в норме', 'в норме'] },
    { status: 'warn', forms: ['требует внимания', 'требуют внимания', 'требуют внимания'] },
    { status: 'fail', forms: ['ошибка', 'ошибки', 'ошибок'] },
  ];
  return counters
    .map(({ status, forms }) => {
      const count = list.filter((check) => check.status === status).length;
      return { status, count, label: plural(count, forms) };
    })
    .filter((item) => item.count > 0);
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

  /**
   * Светофор считается только по серверным проверкам. Блок «пиксели в этом
   * браузере» в него не входит намеренно: на /admin пиксели не загружаются
   * специально, и его «внимание» — норма, а не поломка сайта.
   */
  const verdict = useMemo(() => {
    const list = checks || [];
    const failed = list.filter((item) => item.status === 'fail');
    const warned = list.filter((item) => item.status === 'warn');
    const status: HealthCheck['status'] = failed.length ? 'fail' : warned.length ? 'warn' : 'ok';
    const title = status === 'fail'
      ? 'Нужно вмешаться'
      : status === 'warn'
        ? 'Работает, но есть что посмотреть'
        : 'Всё работает';
    const text = status === 'fail'
      ? `Проверок: ${list.length}. Сломано: ${failed.length}${warned.length ? `, требует внимания: ${warned.length}` : ''}.`
      : status === 'warn'
        ? `Проверок: ${list.length}. Требует внимания: ${warned.length}. Ничего не сломано.`
        : `Проверок пройдено: ${list.length}. Сервер, база, хранилище и доставка событий отвечают.`;
    return { status, title, text, problems: [...failed, ...warned] };
  }, [checks]);

  /**
   * Строка проверки. Цвет несёт не только рамка: у каждого состояния свой
   * значок и своя подпись — состояние читается и без различения цветов.
   * Индекс уезжает в CSS, чтобы строки появлялись по очереди, а не разом.
   */
  const renderCheck = (item: HealthCheck, index: number) => {
    const ui = STATUS_UI[item.status];
    const Icon = ui.icon;
    return (
      <li
        key={item.id}
        className="health-row"
        data-status={item.status}
        style={{ '--health-row-index': index } as CSSProperties}
      >
        <span className="health-row__lamp" aria-hidden="true"><Icon /></span>
        <div className="health-row__body">
          <p className="health-row__title">
            <span>{item.title}</span>
            <span className="health-row__chip">{ui.label}</span>
          </p>
          <p className="health-row__detail">{item.detail}</p>
        </div>
      </li>
    );
  };

  const renderGroup = (title: string, list: HealthCheck[], note?: string) => (
    <section className="admin-card health-group" aria-label={title}>
      <div className="health-group__head">
        <h3>{title}</h3>
        <div className="health-group__score">
          {groupScore(list).map((item) => (
            <span key={item.status} data-status={item.status}>{item.count} {item.label}</span>
          ))}
        </div>
      </div>
      {/* Ключ по времени проверки: после «Запустить проверку» строки
          проигрывают появление заново — видно, что данные свежие. */}
      <ul className="health-list" key={checkedAt || 'initial'}>
        {list.map(renderCheck)}
      </ul>
      {note ? <p className="health-group__note">{note}</p> : null}
    </section>
  );

  return (
    <div className="admin-stack admin-stack--lg">
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Система</p>
          <h2 className="admin-title">Проверка сайта</h2>
          <p className="admin-subtitle">
            {checkedAt
              ? `Последняя проверка: ${new Date(checkedAt).toLocaleString('ru-RU')}`
              : 'Сервер, база, хранилище, приём заявок и доставка событий — одним прогоном.'}
          </p>
        </div>
        <div className="admin-section-header__actions">
          <button type="button" className="admin-button admin-button--secondary" onClick={() => void telegramTest()}>
            <Send aria-hidden="true" /> Тест Telegram
          </button>
          <button type="button" className="admin-button admin-button--primary" disabled={loading} onClick={() => void run()}>
            <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            {loading ? 'Проверяю…' : 'Запустить проверку'}
          </button>
        </div>
      </div>

      {tgStatus ? <div className="admin-notice" role="status" aria-live="polite">{tgStatus}</div> : null}

      {error && (
        <section className="admin-card health-error">
          <p className="admin-subtitle">{error}</p>
          <p className="admin-muted">Проверка работает на продакшене (нужны Cloudflare-функции). В локальной разработке — заглушка.</p>
        </section>
      )}

      {/* До первого ответа раздел был просто пустым: скелетон показывает, что
          проверка идёт, а не что проверять нечего. */}
      {!checks && !error && loading ? <AdminSectionSkeleton tiles={0} rows={6} /> : null}

      {checks && (
        <section className="health-verdict" data-status={verdict.status} aria-label="Итог проверки">
          <span className="health-verdict__lamp" aria-hidden="true">
            {(() => {
              const Icon = STATUS_UI[verdict.status].icon;
              return <Icon />;
            })()}
          </span>
          <div className="health-verdict__body">
            <p className="health-verdict__title">{verdict.title}</p>
            <p className="health-verdict__text">{verdict.text}</p>
            {verdict.problems.length > 0 && (
              <ul className="health-verdict__list">
                {verdict.problems.map((item) => (
                  <li key={item.id} data-status={item.status}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {checks && renderGroup('Сервер и интеграции', checks)}

      {browserChecks.length > 0 && renderGroup(
        'Пиксели в этом браузере',
        browserChecks,
        'На /admin пиксели намеренно не загружаются, чтобы визиты администратора не попадали в статистику рекламы. Эта проверка показывает согласие на cookie в текущем браузере; работу самих пикселей смотрите на публичных страницах сайта.',
      )}
    </div>
  );
}
