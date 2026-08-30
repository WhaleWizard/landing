import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Briefcase, Info, X } from 'lucide-react';
import { AdminButton } from './AdminUI';
import { useDialogFocus, useDialogScrollLock } from '../hooks/useDialogFocus';
import {
  buildCaseFromMonths,
  toCaseData,
  toCaseOutline,
  type CaseBuildResult,
  type CaseDataDraft,
  type ClientMonthInput,
} from './caseFromClient';

/**
 * Окно сборки кейса из помесячных результатов клиента.
 *
 * Показывает ровно то, что посчиталось, и ровно так, как это попадёт на сайт.
 * Ненайденный показатель рисуется прочерком, а не нулём: ноль на витрине
 * читается как результат работы, а прочерк — как «не вводили».
 *
 * Имя клиента сюда не попадает и в кейс не подставляется. Кейс публичный, а
 * согласия клиента на упоминание у нас нет; если оно есть — владелец впишет имя
 * сам в редакторе.
 */

interface Props {
  clientNiche: string;
  months: ClientMonthInput[];
  onClose: () => void;
  onCreate: (payload: { caseData: CaseDataDraft; outline: string; title: string }) => void;
}

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

function money(value: number | null, currency: string): string {
  if (value === null) return '—';
  return `${nf.format(Math.round(value))} ${currency === 'USD' ? '$' : currency}`;
}

function count(value: number | null): string {
  return value === null ? '—' : nf.format(value);
}

function percent(value: number | null): string {
  if (value === null) return '—';
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${nf.format(rounded)}%`;
}

/** Плитка сводки. Прочерк объясняет себя подсказкой, а не молчит. */
function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  const unknown = value === '—';
  return (
    <div className={`case-tile${unknown ? ' case-tile--unknown' : ''}${tone && !unknown ? ` case-tile--${tone}` : ''}`}>
      <span className="case-tile__value">{value}</span>
      <span className="case-tile__label">{label}</span>
      {unknown && hint ? <span className="case-tile__hint">{hint}</span> : null}
    </div>
  );
}

export default function CaseBuilderDialog({ clientNiche, months, onClose, onCreate }: Props) {
  const [niche, setNiche] = useState(clientNiche);
  const [title, setTitle] = useState('');
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onClose);
  useDialogScrollLock(true);

  const result: CaseBuildResult = useMemo(() => buildCaseFromMonths(months), [months]);

  const { totals, currency } = result;

  const create = () => {
    onCreate({
      caseData: toCaseData(result, { niche: niche.trim() }),
      outline: toCaseOutline(result, { niche: niche.trim() }),
      title: title.trim() || (niche.trim() ? `Кейс: ${niche.trim()}` : 'Новый кейс'),
    });
  };

  return (
    <div className="case-builder__overlay" role="dialog" aria-modal="true" aria-label="Сборка кейса из результатов клиента">
      <div ref={dialogRef} tabIndex={-1} className="case-builder">
        <header className="case-builder__head">
          <div className="min-w-0">
            <h2 className="case-builder__title">Кейс из результатов по месяцам</h2>
            <p className="case-builder__sub">
              Считается только то, что вы вводили. Прочерк означает «нет данных», а не ноль.
            </p>
          </div>
          <button type="button" className="case-builder__close" onClick={onClose} aria-label="Закрыть">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="case-builder__body">
          {!result.ok ? (
            <div className="case-builder__problem">
              <AlertTriangle aria-hidden="true" />
              <div>
                <strong>Собрать кейс не из чего</strong>
                <p>{result.problem}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="case-builder__period">
                <span className="case-builder__period-label">Период</span>
                <strong>{result.period}</strong>
                <span className="case-builder__period-count">
                  {result.months.length} {result.months.length === 1 ? 'месяц' : result.months.length < 5 ? 'месяца' : 'месяцев'} с данными
                </span>
              </div>

              <div className="case-tiles">
                <Tile label="Расход" value={money(totals.spend, currency)} hint="Не вводили расход ни в одном месяце" />
                <Tile label="Заявок" value={count(totals.leads)} hint="Не вводили заявки" />
                <Tile label="Цена заявки" value={money(totals.cpl, currency)} hint="Нужны и расход, и заявки" />
                <Tile label="Продаж" value={count(totals.sales)} hint="Не вводили продажи" />
                <Tile label="Выручка" value={money(totals.revenue, currency)} hint="Не вводили выручку" />
                <Tile
                  label="ROMI"
                  value={percent(totals.romi)}
                  hint="Нужны и расход, и выручка"
                  tone={totals.romi !== null && totals.romi >= 0 ? 'good' : 'bad'}
                />
              </div>

              {result.cplTrend ? (
                <div className={`case-trend case-trend--${result.cplTrend.changePercent < 0 ? 'good' : 'bad'}`}>
                  <span className="case-trend__label">Цена заявки за период</span>
                  <span className="case-trend__flow">
                    <strong>{money(result.cplTrend.from, currency)}</strong>
                    <ArrowRight aria-hidden="true" />
                    <strong>{money(result.cplTrend.to, currency)}</strong>
                    <em>{percent(result.cplTrend.changePercent)}</em>
                  </span>
                </div>
              ) : null}

              <div className="case-builder__table-wrap">
                <table className="case-table">
                  <caption className="sr-only">Результаты по месяцам</caption>
                  <thead>
                    <tr>
                      <th scope="col">Месяц</th>
                      <th scope="col">Расход</th>
                      <th scope="col">Заявки</th>
                      <th scope="col">Цена заявки</th>
                      <th scope="col">Продажи</th>
                      <th scope="col">Выручка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.months.map((row) => (
                      <tr key={row.month}>
                        <th scope="row">{row.label}</th>
                        <td>{money(row.spend, currency)}</td>
                        <td>{count(row.leads)}</td>
                        <td>{money(row.cpl, currency)}</td>
                        <td>{count(row.sales)}</td>
                        <td>{money(row.revenue, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Итого</th>
                      <td>{money(totals.spend, currency)}</td>
                      <td>{count(totals.leads)}</td>
                      <td>{money(totals.cpl, currency)}</td>
                      <td>{count(totals.sales)}</td>
                      <td>{money(totals.revenue, currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {result.skipped.length ? (
                <p className="case-builder__skipped">
                  <Info aria-hidden="true" />
                  Пропущено без цифр: {result.skipped.join(', ')}. Эти месяцы не считаются нулями и в кейс не попадут.
                </p>
              ) : null}

              <div className="case-builder__fields">
                <label>
                  <span>Ниша</span>
                  <input
                    type="text"
                    value={niche}
                    onChange={(event) => setNiche(event.target.value)}
                    placeholder="Например, стоматология"
                  />
                </label>
                <label>
                  <span>Заголовок кейса</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={niche.trim() ? `Кейс: ${niche.trim()}` : 'Новый кейс'}
                  />
                </label>
              </div>

              <p className="case-builder__privacy">
                <Info aria-hidden="true" />
                Имя клиента в кейс не подставляется: он публичный, а согласия на упоминание у нас нет.
                Если согласие есть — впишете имя сами в редакторе.
              </p>
            </>
          )}
        </div>

        <footer className="case-builder__foot">
          <AdminButton tone="quiet" onClick={onClose}>Отмена</AdminButton>
          <AdminButton tone="primary" onClick={create} disabled={!result.ok}>
            <Briefcase aria-hidden="true" /> Создать черновик кейса
          </AdminButton>
        </footer>
      </div>
    </div>
  );
}
