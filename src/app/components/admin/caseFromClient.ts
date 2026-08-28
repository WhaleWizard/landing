/**
 * Сборка кейса из помесячных результатов клиента.
 *
 * В разделе «Клиенты» владелец помесячно ведёт расход, заявки, продажи и
 * выручку. Из этих же чисел собирается публичный кейс — раньше их приходилось
 * переписывать в редактор руками, а руками они переписываются с ошибками.
 *
 * Здесь только расчёт, без интерфейса: это единственное место в сборке кейса,
 * где можно ошибиться молча, и его проверяет `npm run test:case-from-client`.
 *
 * Три правила, ради которых модуль устроен именно так:
 *
 * 1. Не выдумывать. Месяц без цифр не считается нулём — он пропускается, и
 *    результат честно говорит, сколько месяцев осталось за бортом.
 * 2. Не складывать разные валюты. Курсов в системе нет, а придуманный курс
 *    превращает кейс в фантазию. Расхождение валют — отказ, а не сумма.
 * 3. Не делить на ноль. Нет заявок — нет цены заявки, а не «0» и не «∞».
 */

export interface ClientMonthInput {
  month: string;
  spend: number | null;
  spend_currency?: string | null;
  leads: number | null;
  sales: number | null;
  revenue: number | null;
}

export interface CaseMonthRow {
  month: string;
  /** Человеческая подпись: «март 2026». */
  label: string;
  spend: number | null;
  leads: number | null;
  sales: number | null;
  revenue: number | null;
  /** Расход ÷ заявки. null, если делить не на что. */
  cpl: number | null;
}

export interface CaseDraftTotals {
  spend: number | null;
  leads: number | null;
  sales: number | null;
  revenue: number | null;
  cpl: number | null;
  /** (выручка − расход) ÷ расход, в процентах. */
  romi: number | null;
  /** Продажи ÷ заявки, в процентах. */
  conversion: number | null;
}

export interface CaseBuildResult {
  ok: boolean;
  /** Почему собрать нельзя. Пусто, когда ok. */
  problem: string;
  /** Месяцы, попавшие в расчёт, от раннего к позднему. */
  months: CaseMonthRow[];
  /** Месяцы, пропущенные из-за отсутствия чисел. */
  skipped: string[];
  totals: CaseDraftTotals;
  currency: string;
  /** «январь — апрель 2026». */
  period: string;
  /** Цена заявки в первом и последнем месяце, если считается в обоих. */
  cplTrend: { from: number; to: number; changePercent: number } | null;
}

const MONTH_NAMES = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

/** «2026-03» → «март 2026». Непонятный формат возвращается как есть. */
export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || '').trim());
  if (!match) return String(month || '');
  const index = Number(match[2]) - 1;
  if (index < 0 || index > 11) return month;
  return `${MONTH_NAMES[index]} ${match[1]}`;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Месяц участвует в расчёте, если в нём есть хоть одно введённое число. */
function hasAnyNumber(month: ClientMonthInput): boolean {
  return isNumber(month.spend) || isNumber(month.leads) || isNumber(month.sales) || isNumber(month.revenue);
}

/** Сумма по колонке. null, если её не заполнили ни в одном месяце. */
function sum(months: ClientMonthInput[], pick: (month: ClientMonthInput) => number | null): number | null {
  const values = months.map(pick).filter(isNumber);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

/** Деление, которое отказывается вместо того, чтобы вернуть бесконечность. */
function divide(top: number | null, bottom: number | null): number | null {
  if (!isNumber(top) || !isNumber(bottom) || bottom === 0) return null;
  const result = top / bottom;
  return Number.isFinite(result) ? result : null;
}

export function buildCaseFromMonths(input: ClientMonthInput[]): CaseBuildResult {
  const empty: CaseBuildResult = {
    ok: false,
    problem: '',
    months: [],
    skipped: [],
    totals: { spend: null, leads: null, sales: null, revenue: null, cpl: null, romi: null, conversion: null },
    currency: '',
    period: '',
    cplTrend: null,
  };

  const all = [...(input || [])].sort((left, right) => left.month.localeCompare(right.month));
  const used = all.filter(hasAnyNumber);
  const skipped = all.filter((month) => !hasAnyNumber(month)).map((month) => monthLabel(month.month));

  if (!used.length) {
    return { ...empty, skipped, problem: 'Ни в одном месяце нет цифр. Заполните расход, заявки, продажи или выручку — и кейс соберётся из них.' };
  }

  // Валюта проверяется до любых сумм: сложить доллары с чем-то ещё нельзя, а
  // курсов в системе нет. Пустая валюта считается той же, что у остальных, —
  // это старые записи, сделанные до перехода на доллары.
  const currencies = [...new Set(used.map((month) => String(month.spend_currency || '').trim().toUpperCase()).filter(Boolean))];
  if (currencies.length > 1) {
    return {
      ...empty,
      skipped,
      problem: `В месяцах разные валюты: ${currencies.join(', ')}. Сложить их нельзя — курсов в системе нет, а придуманный курс превратит кейс в выдумку. Приведите месяцы к одной валюте.`,
    };
  }

  const months: CaseMonthRow[] = used.map((month) => ({
    month: month.month,
    label: monthLabel(month.month),
    spend: isNumber(month.spend) ? month.spend : null,
    leads: isNumber(month.leads) ? month.leads : null,
    sales: isNumber(month.sales) ? month.sales : null,
    revenue: isNumber(month.revenue) ? month.revenue : null,
    cpl: divide(isNumber(month.spend) ? month.spend : null, isNumber(month.leads) ? month.leads : null),
  }));

  const spend = sum(used, (month) => month.spend);
  const leads = sum(used, (month) => month.leads);
  const sales = sum(used, (month) => month.sales);
  const revenue = sum(used, (month) => month.revenue);

  // ROMI считается только когда известны обе стороны. Выручка без расхода
  // говорит лишь о том, что деньги были, но не о том, окупились ли они.
  const profitShare = divide(isNumber(spend) && isNumber(revenue) ? revenue - spend : null, spend);
  const salesShare = divide(sales, leads);

  const totals: CaseDraftTotals = {
    spend,
    leads,
    sales,
    revenue,
    cpl: divide(spend, leads),
    romi: profitShare === null ? null : profitShare * 100,
    conversion: salesShare === null ? null : salesShare * 100,
  };

  const first = months[0];
  const last = months[months.length - 1];
  const period = months.length === 1
    ? first.label
    : `${first.label} — ${last.label}`;

  // Тренд цены заявки — только если она считается в обоих крайних месяцах.
  // Сравнивать посчитанное с непосчитанным нельзя.
  const cplTrend = months.length > 1 && isNumber(first.cpl) && isNumber(last.cpl) && first.cpl !== 0
    ? { from: first.cpl, to: last.cpl, changePercent: ((last.cpl - first.cpl) / first.cpl) * 100 }
    : null;

  return {
    ok: true,
    problem: '',
    months,
    skipped,
    totals,
    currency: currencies[0] || 'USD',
    period,
    cplTrend,
  };
}

/* ------------------------------------------------------------------------ */
/* Превращение расчёта в поля кейса                                          */
/* ------------------------------------------------------------------------ */

export interface CaseMetricDraft { value: string; label: string }

export interface CaseDataDraft {
  niche?: string;
  period?: string;
  budgetLabel?: string;
  budgetValue?: number;
  leadsValue?: number;
  roiValue?: number;
  headline?: string;
  headlineLabel?: string;
  trend?: string;
  metrics?: CaseMetricDraft[];
  beforeAfter?: { label: string; from: string; to: string; delta?: string };
  chartPoints?: number[];
}

const money = (value: number, currency: string): string => {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString('ru-RU')} ${currency === 'USD' ? '$' : currency}`;
};

const percent = (value: number): string => {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('ru-RU')}%`;
};

/**
 * Собирает поля кейса из расчёта. Показатель, который не посчитался, в кейс не
 * попадает вовсе — пустая строка на витрине выглядит как недоделка, а ноль
 * читается как настоящий результат.
 */
export function toCaseData(result: CaseBuildResult, options: { niche?: string } = {}): CaseDataDraft {
  if (!result.ok) return {};
  const { totals, currency } = result;
  const draft: CaseDataDraft = { period: result.period };

  if (options.niche) draft.niche = options.niche;
  if (totals.spend !== null) {
    draft.budgetValue = Math.round(totals.spend);
    draft.budgetLabel = money(totals.spend, currency);
  }
  if (totals.leads !== null) draft.leadsValue = Math.round(totals.leads);
  if (totals.romi !== null) draft.roiValue = Math.round(totals.romi);

  const metrics: CaseMetricDraft[] = [];
  if (totals.leads !== null) metrics.push({ value: totals.leads.toLocaleString('ru-RU'), label: 'заявок' });
  if (totals.cpl !== null) metrics.push({ value: money(totals.cpl, currency), label: 'цена заявки' });
  if (totals.sales !== null) metrics.push({ value: totals.sales.toLocaleString('ru-RU'), label: 'продаж' });
  if (totals.conversion !== null) metrics.push({ value: `${Math.round(totals.conversion)}%`, label: 'из заявки в продажу' });
  if (totals.romi !== null) metrics.push({ value: percent(totals.romi), label: 'ROMI' });
  if (metrics.length) draft.metrics = metrics;

  // Заголовок берёт самый сильный посчитанный показатель, а не первый попавшийся.
  if (totals.romi !== null) {
    draft.headline = percent(totals.romi);
    draft.headlineLabel = 'ROMI за период';
  } else if (totals.leads !== null) {
    draft.headline = totals.leads.toLocaleString('ru-RU');
    draft.headlineLabel = 'заявок за период';
  }

  if (result.cplTrend) {
    const { from, to, changePercent } = result.cplTrend;
    draft.beforeAfter = {
      label: 'Цена заявки',
      from: money(from, currency),
      to: money(to, currency),
      delta: percent(changePercent),
    };
    draft.trend = changePercent < 0 ? 'Цена заявки снижалась' : 'Цена заявки росла';
  }

  // График строится по заявкам: это единственный показатель, который заполняют
  // почти всегда. Месяцы без заявок в график не попадают, чтобы провал в
  // данных не выглядел провалом в результатах.
  const points = result.months.map((month) => month.leads).filter((value): value is number => value !== null);
  if (points.length > 1) draft.chartPoints = points;

  return draft;
}

/** Заготовка текста кейса: скелет, который владелец дописывает своими словами. */
export function toCaseOutline(result: CaseBuildResult, options: { niche?: string } = {}): string {
  if (!result.ok) return '';
  const { totals, currency } = result;
  const lines: string[] = [];

  lines.push('<h2>Задача</h2>');
  lines.push(`<p>${options.niche ? `Ниша: ${options.niche}. ` : ''}Опишите, с чем клиент пришёл и что считалось результатом.</p>`);

  lines.push('<h2>Что сделали</h2>');
  lines.push('<p>Опишите работу по шагам: что настроили, что тестировали, что изменилось по ходу.</p>');

  lines.push('<h2>Результат</h2>');
  const facts: string[] = [`период: ${result.period}`];
  if (totals.spend !== null) facts.push(`расход: ${money(totals.spend, currency)}`);
  if (totals.leads !== null) facts.push(`заявок: ${totals.leads.toLocaleString('ru-RU')}`);
  if (totals.cpl !== null) facts.push(`цена заявки: ${money(totals.cpl, currency)}`);
  if (totals.sales !== null) facts.push(`продаж: ${totals.sales.toLocaleString('ru-RU')}`);
  if (totals.revenue !== null) facts.push(`выручка: ${money(totals.revenue, currency)}`);
  if (totals.romi !== null) facts.push(`ROMI: ${percent(totals.romi)}`);
  lines.push(`<p>${facts.join(', ')}.</p>`);

  if (result.months.length > 1) {
    lines.push('<h2>По месяцам</h2>');
    lines.push('<table><thead><tr><th>Месяц</th><th>Расход</th><th>Заявки</th><th>Цена заявки</th></tr></thead><tbody>');
    for (const month of result.months) {
      lines.push(`<tr><td>${month.label}</td><td>${month.spend !== null ? money(month.spend, currency) : '—'}</td><td>${month.leads !== null ? month.leads.toLocaleString('ru-RU') : '—'}</td><td>${month.cpl !== null ? money(month.cpl, currency) : '—'}</td></tr>`);
    }
    lines.push('</tbody></table>');
  }

  return lines.join('\n');
}
