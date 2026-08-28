import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Clock, Copy, Database, RefreshCw } from 'lucide-react';
import { AdminBlank, AdminSectionSkeleton, notify } from './AdminFeedback';
import { AdminButton, AdminPanel, AdminSectionHeading } from './AdminUI';

/**
 * Раздел «Миграции»: что применено в базе, а что ещё ждёт.
 *
 * Раннера миграций в проекте нет — владелец применяет их вручную в консоли D1.
 * До этого раздела узнать состояние базы можно было только косвенно: открыть
 * раздел админки и посмотреть, не ругается ли он на отсутствующую таблицу.
 */

type MigrationState = 'applied' | 'pending' | 'partial';

interface MigrationRow {
  file: string;
  number: string;
  state: MigrationState;
  unlocks: string;
  missing: string[];
  checked: number;
  found: number;
}

interface MigrationsResponse {
  success?: boolean;
  error?: string;
  code?: string;
  total?: number;
  applied?: number;
  pending?: number;
  partial?: number;
  next?: string | null;
  migrations?: MigrationRow[];
}

const STATE_LABEL: Record<MigrationState, string> = {
  applied: 'Применена',
  pending: 'Ждёт',
  partial: 'Применена частично',
};

function StateIcon({ state }: { state: MigrationState }) {
  if (state === 'applied') return <CheckCircle2 aria-hidden="true" />;
  if (state === 'partial') return <AlertTriangle aria-hidden="true" />;
  return <Clock aria-hidden="true" />;
}

function MigrationCard({ row, password, isNext }: { row: MigrationRow; password: string; isNext: boolean }) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const copySql = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/migrations?sql=${encodeURIComponent(row.file)}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null) as { sql?: string } | null;
      if (!data?.sql) throw new Error('пустой ответ');
      await navigator.clipboard.writeText(data.sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error('Не удалось скопировать', 'Откройте файл миграции в репозитории вручную');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminPanel className={`admin-mig-card admin-mig-card--${row.state}${isNext ? ' admin-mig-card--next' : ''}`}>
      <div className="admin-mig-card__head">
        <span className="admin-mig-card__number">{row.number}</span>
        <span className={`admin-badge admin-mig-state admin-mig-state--${row.state}`}>
          <StateIcon state={row.state} />
          {STATE_LABEL[row.state]}
        </span>
      </div>

      <p className="admin-mig-card__unlocks">{row.unlocks}</p>

      <p className="admin-mig-card__file"><code>{row.file}</code></p>

      {row.state === 'applied' ? (
        <p className="admin-mig-card__note admin-mig-card__note--quiet">
          Все {row.checked} изменений схемы на месте.
        </p>
      ) : (
        <div className="admin-mig-card__missing">
          <p className="admin-mig-card__note">
            {row.state === 'partial'
              ? `Выполнена не до конца: на месте ${row.found} из ${row.checked}. Применить можно повторно — команды написаны так, чтобы это было безопасно.`
              : `Не применена: ни одного из ${row.checked} изменений схемы нет.`}
          </p>
          <ul>
            {row.missing.slice(0, 6).map((item) => <li key={item}>{item}</li>)}
            {row.missing.length > 6 ? <li className="admin-mig-more">и ещё {row.missing.length - 6}</li> : null}
          </ul>
        </div>
      )}

      <div className="admin-mig-card__actions">
        <AdminButton tone={isNext ? 'primary' : 'quiet'} compact onClick={copySql} disabled={loading}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Скопировано' : loading ? 'Читаю…' : 'Скопировать SQL'}
        </AdminButton>
      </div>
    </AdminPanel>
  );
}

/** Состояние миграций базы: что применено, что ждёт и что применять следующим. */
export default function AdminMigrations({ password }: { password: string }) {
  const [data, setData] = useState<MigrationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyPending, setOnlyPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/migrations', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      setData(await response.json().catch(() => null));
    } catch {
      setData({ success: false, error: 'Не удалось прочитать состояние базы' });
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const all = data?.migrations || [];
    // Свежие сверху: неприменённые почти всегда последние по номеру, и листать
    // до них снизу пришлось бы каждый раз.
    const ordered = [...all].reverse();
    return onlyPending ? ordered.filter((row) => row.state !== 'applied') : ordered;
  }, [data, onlyPending]);

  if (loading && !data) return <AdminSectionSkeleton tiles={3} rows={6} />;

  if (!data?.success) {
    return (
      <div className="admin-mig">
        <AdminSectionHeading title="Миграции" description="Что применено в базе, а что ещё ждёт." />
        <AdminBlank
          icon={<Database />}
          title={data?.code === 'D1_NOT_BOUND' ? 'Локально состояние не читается' : 'Не удалось прочитать состояние'}
          text={data?.error || 'Состояние миграций читается из базы и доступно на production.'}
          actions={<AdminButton onClick={() => void load()}><RefreshCw aria-hidden="true" /> Обновить</AdminButton>}
        />
      </div>
    );
  }

  const pendingTotal = (data.pending || 0) + (data.partial || 0);

  return (
    <div className="admin-mig">
      <AdminSectionHeading
        title="Миграции"
        description="Что уже применено в базе, а что ещё ждёт. Состояние читается из самой схемы, а не из записей о ней."
        action={(
          <AdminButton compact onClick={() => void load()} disabled={loading}>
            <RefreshCw aria-hidden="true" /> Обновить
          </AdminButton>
        )}
      />

      <div className="admin-mig-summary">
        <AdminPanel className="admin-mig-stat">
          <span className="admin-mig-stat__value">{data.applied}</span>
          <span className="admin-mig-stat__label">из {data.total} применено</span>
        </AdminPanel>
        <AdminPanel className="admin-mig-stat">
          <span className="admin-mig-stat__value">{data.pending}</span>
          <span className="admin-mig-stat__label">ждут применения</span>
        </AdminPanel>
        <AdminPanel className="admin-mig-stat">
          <span className="admin-mig-stat__value">{data.partial}</span>
          <span className="admin-mig-stat__label">выполнены не до конца</span>
        </AdminPanel>
      </div>

      {pendingTotal === 0 ? (
        <AdminPanel className="admin-mig-banner admin-mig-banner--ok">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <strong>База в актуальном состоянии</strong>
            <p>Все {data.total} миграций применены. Применять нечего.</p>
          </div>
        </AdminPanel>
      ) : (
        <AdminPanel className="admin-mig-banner admin-mig-banner--todo">
          <Clock aria-hidden="true" />
          <div>
            <strong>Следующая по порядку — {data.next?.slice(0, 4)}</strong>
            <p>
              Применять строго по возрастанию номера: поздние миграции опираются на таблицы ранних.
              Скопируйте SQL кнопкой и выполните в консоли D1, затем обновите этот раздел.
            </p>
          </div>
        </AdminPanel>
      )}

      <AdminPanel className="admin-mig-filter">
        <label>
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(input) => setOnlyPending(input.target.checked)}
          />
          Показывать только неприменённые
        </label>
      </AdminPanel>

      {rows.length ? (
        <div className="admin-mig-list">
          {rows.map((row) => (
            <MigrationCard key={row.file} row={row} password={password} isNext={row.file === data.next} />
          ))}
        </div>
      ) : (
        <AdminBlank
          icon={<CheckCircle2 />}
          title="Неприменённых нет"
          text="Все миграции на месте — снимите галочку, чтобы увидеть список целиком."
        />
      )}
    </div>
  );
}
