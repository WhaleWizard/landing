export async function readWonPeriod(
  db: D1Database,
  columns: Set<string>,
  activeCond: string,
  localModifier: string,
  from: string,
  to: string,
  currency: string,
): Promise<{ won: number | null; revenue: number | null }> {
  if (!columns.has('pipeline_stage')) return { won: null, revenue: null };
  const hasRevenue = columns.has('deal_value') && columns.has('deal_currency');
  const closedColumn = columns.has('closed_at') ? 'COALESCE(closed_at, updated_at)' : 'updated_at';
  const revenue = hasRevenue ? `CASE
    WHEN COUNT(CASE WHEN deal_currency = ? AND deal_value IS NULL THEN 1 END) > 0 THEN NULL
    ELSE COALESCE(SUM(CASE WHEN deal_currency = ? THEN deal_value ELSE 0 END), 0)
  END` : 'NULL';
  const statement = db.prepare(`
    SELECT COUNT(*) AS won, ${revenue} AS revenue
    FROM leads
    WHERE pipeline_stage = 'won' AND ${activeCond} AND date(${closedColumn}, ?) BETWEEN date(?) AND date(?)
  `);
  const bound = hasRevenue
    ? statement.bind(currency, currency, localModifier, from, to)
    : statement.bind(localModifier, from, to);
  const row = await bound.first<{ won: number; revenue: number | null }>();
  return { won: row?.won ?? 0, revenue: row?.revenue == null ? null : Math.round(row.revenue * 100) / 100 };
}
