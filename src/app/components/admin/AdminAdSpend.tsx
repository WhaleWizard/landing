import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleDollarSign, FileUp, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react';
import { formatMoney } from './AttributionCharts';

interface SpendEntry {
  id: number;
  day: string;
  source: string;
  campaign: string;
  amount: number;
  currency: string;
  note: string;
}

interface SpendResponse {
  success?: boolean;
  error?: string;
  code?: string;
  migration?: string;
  entries?: SpendEntry[];
  totals?: Array<{ currency: string; amount: number }>;
  knownSources?: string[];
  saved?: number;
  skipped?: number;
}

const CURRENCIES = ['USD', 'EUR', 'RUB', 'KZT', 'AED', 'TRY'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDay(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? day
    : parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

/**
 * Ручной ввод рекламных расходов. Без него воронка не может показать цену
 * лида и окупаемость — эти числа неоткуда взять, и подставлять их нельзя.
 */
export default function AdminAdSpend({
  password,
  days,
  onSaved,
}: {
  password: string;
  days: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<SpendEntry[]>([]);
  const [totals, setTotals] = useState<Array<{ currency: string; amount: number }>>([]);
  const [knownSources, setKnownSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [migration, setMigration] = useState('');
  const [draft, setDraft] = useState({ day: today(), source: '', campaign: '', amount: '', currency: 'USD', note: '' });
  const [csvOpen, setCsvOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/ad-spend?days=${days}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as SpendResponse | null;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.migration || '');
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setMigration('');
      setEntries(payload.entries || []);
      setTotals(payload.totals || []);
      setKnownSources(payload.knownSources || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить расходы');
    } finally {
      setLoading(false);
    }
  }, [days, password]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const post = useCallback(async (body: Record<string, unknown>, success: (payload: SpendResponse) => string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/ad-spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ ...body, days }),
      });
      const payload = await response.json().catch(() => null) as SpendResponse | null;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.migration || '');
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setEntries(payload.entries || []);
      setNotice(success(payload));
      onSaved();
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить расход');
    } finally {
      setSaving(false);
    }
  }, [days, load, onSaved, password]);

  const submitDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.source.trim()) { setError('Укажите источник — он должен совпадать с utm_source заявок'); return; }
    if (!draft.amount.trim()) { setError('Укажите сумму расхода'); return; }
    await post({ action: 'upsert', entries: [draft] }, () => `Расход за ${formatDay(draft.day)} сохранён`);
    setDraft((current) => ({ ...current, amount: '', note: '' }));
  };

  const importCsv = async () => {
    if (!csv.trim()) { setError('Вставьте содержимое CSV или выберите файл'); return; }
    await post({ action: 'import_csv', csv }, (payload) => (
      `Загружено строк: ${payload.saved || 0}${payload.skipped ? `, пропущено: ${payload.skipped}` : ''}`
    ));
    setCsv('');
    setCsvOpen(false);
  };

  const readFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > 512 * 1024) { setError('Файл больше 512 КБ — загрузите выгрузку меньшего периода'); return; }
    setCsv(await file.text());
    setCsvOpen(true);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, SpendEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.day) || [];
      list.push(entry);
      map.set(entry.day, list);
    }
    return [...map.entries()];
  }, [entries]);

  return (
    <section className="admin-panel adm-spend" aria-label="Рекламные расходы">
      <div className="adm-spend__header">
        <div>
          <h3 className="admin-card-title"><Wallet aria-hidden="true" /> Рекламные расходы</h3>
          <p className="admin-hint">
            Единственные данные, которых нет в системе автоматически. Введи их — и воронка покажет цену лида, цену целевого лида и окупаемость.
          </p>
          {totals.length > 0 && (
            <p className="adm-spend__totals">
              За период: {totals.map((total) => formatMoney(total.amount, total.currency)).join(' · ')}
            </p>
          )}
        </div>
        <button type="button" className="admin-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <CircleDollarSign aria-hidden="true" /> {open ? 'Свернуть' : 'Ввести расходы'}
        </button>
      </div>

      {open && (
        <div className="adm-spend__body">
          {migration ? (
            <div className="admin-notice admin-notice--warning" role="status">
              Примените миграцию <code>{migration}</code> к production D1 — до неё расходы негде хранить.
            </div>
          ) : null}
          {error ? <div className="admin-notice admin-notice--danger" role="alert">{error}</div> : null}
          {notice ? <div className="admin-notice admin-notice--success" role="status">{notice}</div> : null}

          <form className="adm-spend__form" onSubmit={submitDraft}>
            <label className="admin-field">
              <span className="admin-label">Дата</span>
              <input type="date" value={draft.day} max={today()} required onChange={(event) => setDraft({ ...draft, day: event.target.value })} />
            </label>
            <label className="admin-field">
              <span className="admin-label">Источник</span>
              <input
                type="text"
                list="adm-spend-sources"
                placeholder="google, facebook…"
                value={draft.source}
                required
                onChange={(event) => setDraft({ ...draft, source: event.target.value })}
              />
              <datalist id="adm-spend-sources">
                {knownSources.map((source) => <option key={source} value={source} />)}
              </datalist>
            </label>
            <label className="admin-field">
              <span className="admin-label">Кампания</span>
              <input
                type="text"
                placeholder="необязательно"
                value={draft.campaign}
                onChange={(event) => setDraft({ ...draft, campaign: event.target.value })}
              />
            </label>
            <label className="admin-field adm-spend__amount">
              <span className="admin-label">Сумма</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={draft.amount}
                required
                onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">Валюта</span>
              <select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })}>
                {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </label>
            <div className="adm-spend__form-actions">
              <button type="submit" className="admin-button admin-button--primary" disabled={saving}>
                <Plus aria-hidden="true" /> {saving ? 'Сохраняю…' : 'Добавить'}
              </button>
              <button type="button" className="admin-button admin-button--quiet" onClick={() => setCsvOpen((value) => !value)}>
                <FileUp aria-hidden="true" /> Загрузить CSV
              </button>
            </div>
          </form>

          <p className="admin-hint">
            Повторный ввод той же даты, источника и кампании заменяет сумму — задвоения не будет.
          </p>

          {csvOpen && (
            <div className="adm-spend__csv">
              <p className="admin-hint">
                Нужны колонки с датой и суммой: <code>date</code>/<code>день</code> и <code>amount</code>/<code>сумма</code>.
                Необязательные: <code>source</code>, <code>campaign</code>, <code>currency</code>.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="adm-spend__file"
                aria-label="Файл CSV с расходами"
                onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ''; }}
              />
              <textarea
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                rows={6}
                spellCheck={false}
                placeholder={'date,source,campaign,amount,currency\n2026-07-01,facebook,retargeting,120.50,USD'}
                aria-label="Содержимое CSV"
              />
              <div className="adm-spend__form-actions">
                <button type="button" className="admin-button admin-button--primary" onClick={() => void importCsv()} disabled={saving}>
                  <FileUp aria-hidden="true" /> {saving ? 'Загружаю…' : 'Загрузить'}
                </button>
                <button type="button" className="admin-button admin-button--quiet" onClick={() => { setCsv(''); setCsvOpen(false); }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="adm-spend__list-head">
            <strong>Введено строк: {entries.length}</strong>
            <button type="button" className="admin-button admin-button--quiet" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Обновить
            </button>
          </div>

          {loading && !entries.length ? <p className="admin-muted" role="status">Загружаю расходы…</p> : null}
          {!loading && !entries.length && !migration ? (
            <div className="admin-empty">
              <div>
                <strong>Расходов пока нет</strong>
                <p>Добавь первую строку — воронка сразу пересчитает цену лида и окупаемость.</p>
              </div>
            </div>
          ) : null}

          {grouped.map(([day, rows]) => (
            <div className="adm-spend__day" key={day}>
              <h4>{formatDay(day)}</h4>
              <ul>
                {rows.map((row) => (
                  <li key={row.id}>
                    <span className="adm-spend__source">{row.source}{row.campaign ? ` / ${row.campaign}` : ''}</span>
                    <span className="adm-spend__value">{formatMoney(row.amount, row.currency)}</span>
                    {row.note ? <span className="adm-spend__note">{row.note}</span> : null}
                    <button
                      type="button"
                      className="admin-icon-button admin-icon-button--danger"
                      aria-label={`Удалить расход ${row.source} за ${formatDay(row.day)}`}
                      disabled={saving}
                      onClick={() => {
                        if (!confirm(`Удалить расход ${row.source} за ${formatDay(row.day)}?`)) return;
                        void post({ action: 'delete', id: row.id }, () => 'Строка удалена');
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
