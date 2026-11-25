export async function readWonPeriod(
  db: D1Database,
  columns: Set<string>,
  activeCond: string,
  localModifier: string,
  from: string,
  to: string,
  currency: string,
): Promise<{ won: number | null; revenue: number | null; otherCurrency: number }> {
  if (!columns.has('pipeline_stage')) return { won: null, revenue: null, otherCurrency: 0 };
  const hasRevenue = columns.has('deal_value') && columns.has('deal_currency');
  const closedColumn = columns.has('closed_at') ? 'COALESCE(closed_at, updated_at)' : 'updated_at';
  // Выручка — сумма сделок в валюте отчёта. Неизвестна, если в этой валюте
  // есть сделка без суммы или все выигрыши — в другой валюте (DA-06): раньше
  // выигрыш 1 200 EUR в отчёте в USD давал выручку 0 и ROMI −100 %.
  const revenue = hasRevenue ? `CASE
    WHEN COUNT(CASE WHEN deal_currency = ? AND deal_value IS NULL THEN 1 END) > 0 THEN NULL
    WHEN COUNT(*) > 0 AND COUNT(CASE WHEN deal_currency = ? THEN 1 END) = 0 THEN NULL
    ELSE COALESCE(SUM(CASE WHEN deal_currency = ? THEN deal_value ELSE 0 END), 0)
  END` : 'NULL';
  // Выигрыши с суммой в другой валюте: прибыль и ROMI без них были бы
  // занижены, а сложить нельзя — курсов нет.
  const otherCurrency = hasRevenue ? 'COUNT(CASE WHEN deal_value IS NOT NULL AND deal_currency IS NOT ? THEN 1 END)' : '0';
  const statement = db.prepare(`
    SELECT COUNT(*) AS won, ${revenue} AS revenue, ${otherCurrency} AS other_currency
    FROM leads
    WHERE pipeline_stage = 'won' AND ${activeCond} AND date(${closedColumn}, ?) BETWEEN date(?) AND date(?)
  `);
  const bound = hasRevenue
    ? statement.bind(currency, currency, currency, currency, localModifier, from, to)
    : statement.bind(localModifier, from, to);
  const row = await bound.first<{ won: number; revenue: number | null; other_currency: number }>();
  return {
    won: row?.won ?? 0,
    revenue: row?.revenue == null ? null : Math.round(row.revenue * 100) / 100,
    otherCurrency: Number(row?.other_currency || 0),
  };
}
