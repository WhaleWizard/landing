import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  BarChart3,
  Copy,
  Download,
  MousePointerClick,
  Plus,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { formatMoney, formatNumber, formatPercent } from './AttributionCharts';
import { AdminBlank, AdminSectionSkeleton, notify } from './AdminFeedback';

export interface CampaignAggregate {
  key: string;
  utm_source: string;
  utm_campaign: string;
  utm_medium: string;
  channel: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  spend: number;
  currency: string;
  cpc: number | null;
  leads: number;
  cpl: number | null;
  qualified: number;
  cpq: number | null;
  won: number;
  cac: number | null;
  revenue: number;
  romi: number | null;
}

export interface CampaignRecord {
  id: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  channel: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  currency: string;
  notes: string;
}

interface CampaignStatsResponse {
  success: boolean;
  error?: string;
  configured: boolean;
  migrationRequired?: string | null;
  days: number;
  campaigns: CampaignAggregate[];
  records: CampaignRecord[];
  summary: {
    impressions: number;
    clicks: number;
    ctr: number | null;
    spend: number;
    currency: string;
    cpc: number | null;
    leads: number;
    cpl: number | null;
    qualified: number;
    cpq: number | null;
    won: number;
    cac: number | null;
    revenue: number;
    romi: number | null;
  };
}

type SortField = 'spend' | 'leads' | 'cpl' | 'qualified' | 'won' | 'revenue' | 'romi' | 'clicks' | 'ctr';
type SortDir = 'asc' | 'desc';

function defuseFormula(value: string): string {
  if (!value) return value;
  const first = value[0];
  if (first === '-' && /^-?[\d\s.,]+%?$/.test(value)) return value;
  return '=+-@\t\r'.includes(first) ? `'${value}` : value;
}

export default function AdminCampaignStats({ password }: { password: string }) {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<CampaignStatsResponse | null>(null);

  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('spend');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Modal for adding / editing a record
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formSource, setFormSource] = useState('fb');
  const [formCampaign, setFormCampaign] = useState('');
  const [formMedium, setFormMedium] = useState('cpc');
  const [formChannel, setFormChannel] = useState('meta');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formImpressions, setFormImpressions] = useState('');
  const [formClicks, setFormClicks] = useState('');
  const [formSpend, setFormSpend] = useState('');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formNotes, setFormNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/campaign-stats?days=${days}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null) as CampaignStatsResponse | null;
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить сквозную аналитику кампаний');
    } finally {
      setLoading(false);
    }
  }, [days, password]);

  useEffect(() => {
    void load();
  }, [load]);

  // Handle record creation
  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSource.trim() || !formCampaign.trim() || !formDate.trim()) {
      notify.error('Заполните обязательные поля: источник, кампания и дата');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/campaign-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'save_record',
          utm_source: formSource.trim(),
          utm_campaign: formCampaign.trim(),
          utm_medium: formMedium.trim(),
          channel: formChannel,
          date: formDate,
          impressions: Number(formImpressions || 0),
          clicks: Number(formClicks || 0),
          spend: Number(formSpend || 0),
          currency: formCurrency,
          notes: formNotes.trim(),
        }),
      });

      const payload = await res.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      notify.success('Статистика кампании сохранена');
      setModalOpen(false);
      setFormCampaign('');
      setFormImpressions('');
      setFormClicks('');
      setFormSpend('');
      setFormNotes('');
      await load();
    } catch (err) {
      notify.error('Ошибка сохранения', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered & sorted campaigns
  const filteredCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    let list = data.campaigns;

    if (channelFilter !== 'all') {
      list = list.filter((c) => c.channel === channelFilter);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        `${c.utm_source} ${c.utm_campaign} ${c.channel}`.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1;
      const vA = a[sortField];
      const vB = b[sortField];
      const nA = vA !== null && vA !== undefined ? Number(vA) : -999999;
      const nB = vB !== null && vB !== undefined ? Number(vB) : -999999;
      return (nA - nB) * mult;
    });
  }, [data?.campaigns, channelFilter, searchQuery, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handleExportCsv = () => {
    if (!filteredCampaigns.length) return;
    const headers = [
      'Канал', 'Источник (utm_source)', 'Кампания (utm_campaign)', 'Показы', 'Клики', 'CTR %',
      'Расход', 'Валюта', 'CPC', 'Лиды', 'CPL', 'Целевые', 'CPQ', 'Выиграно', 'Выручка', 'ROMI %',
    ];

    const rows = filteredCampaigns.map((c) => [
      defuseFormula(c.channel),
      defuseFormula(c.utm_source),
      defuseFormula(c.utm_campaign),
      c.impressions,
      c.clicks,
      c.ctr !== null ? `${c.ctr}%` : '',
      c.spend,
      c.currency,
      c.cpc !== null && c.cpc !== undefined ? c.cpc : '',
      c.leads,
      c.cpl !== null && c.cpl !== undefined ? c.cpl : '',
      c.qualified,
      c.cpq !== null && c.cpq !== undefined ? c.cpq : '',
      c.won,
      c.revenue,
      c.romi !== null ? `${c.romi}%` : '',
    ]);

    const csv = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign_stats_${days}d.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const summary = data?.summary;
  const currency = summary?.currency || 'USD';

  return (
    <div className="admin-campaign-stats space-y-4" aria-label="Сквозная аналитика UTM-кампаний">
      <header className="adm-card__head flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="admin-card-title flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            Сквозная аналитика UTM-кампаний
          </h3>
          <p className="admin-hint">
            Связка показов, кликов и расходов Meta / Google Ads с реальными заявками, целевыми лидами и закрытыми сделками.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1" role="group" aria-label="Период аналитики">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                className={`admin-crm-chip ${days === d ? 'is-active is-primary' : ''}`}
                onClick={() => setDays(d)}
              >
                {d}д
              </button>
            ))}
          </div>

          <button
            type="button"
            className="admin-button admin-button--primary admin-button--compact"
            onClick={() => setModalOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Внести статистику
          </button>

          <button
            type="button"
            className="admin-button admin-button--compact"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      {error && (
        <div className="admin-notice admin-notice--danger" role="alert">
          {error}
        </div>
      )}

      {/* Предупреждение о миграции если таблица не создана */}
      {data?.migrationRequired && (
        <div className="admin-notice admin-notice--info" role="status">
          <strong>Таблица campaign_stats пока не создана в D1</strong>
          <p>
            Лиды и выручка рассчитываются по таблице leads. Чтобы вести учет кликов, показов и расходов по дням,
            примените миграцию <code>0046_campaign_stats.sql</code> в разделе «Миграции».
          </p>
        </div>
      )}

      {loading && !data && <AdminSectionSkeleton tiles={5} rows={3} />}

      {summary && (
        <>
          {/* Сводные KPI-плитки */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface-subtle)] space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                <MousePointerClick className="w-3 h-3 text-blue-400" /> Клики / Показы
              </span>
              <div className="text-lg font-bold text-[var(--adm-fg)]">
                {formatNumber(summary.clicks)}
              </div>
              <span className="text-[11px] text-zinc-400">
                CTR: {formatPercent(summary.ctr)}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface-subtle)] space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                <Wallet className="w-3 h-3 text-amber-400" /> Рекламный расход
              </span>
              <div className="text-lg font-bold text-amber-300">
                {formatMoney(summary.spend, currency)}
              </div>
              <span className="text-[11px] text-zinc-400">
                CPC: {formatMoney(summary.cpc, currency)}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface-subtle)] space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                <Users className="w-3 h-3 text-indigo-400" /> Заявки (Лиды)
              </span>
              <div className="text-lg font-bold text-[var(--adm-fg)]">
                {formatNumber(summary.leads)}
              </div>
              <span className="text-[11px] text-indigo-300 font-semibold">
                CPL: {formatMoney(summary.cpl, currency)}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface-subtle)] space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                <Target className="w-3 h-3 text-emerald-400" /> Целевые лиды
              </span>
              <div className="text-lg font-bold text-emerald-300">
                {formatNumber(summary.qualified)}
              </div>
              <span className="text-[11px] text-zinc-400">
                CPQ: {formatMoney(summary.cpq, currency)}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface-subtle)] space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                <Trophy className="w-3 h-3 text-yellow-400" /> Сделки (Won)
              </span>
              <div className="text-lg font-bold text-yellow-300">
                {formatNumber(summary.won)}
              </div>
              <span className="text-[11px] text-zinc-400">
                CAC: {formatMoney(summary.cac, currency)}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface-subtle)] space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-400" /> Выручка / ROMI
              </span>
              <div className="text-lg font-bold text-emerald-400">
                {formatMoney(summary.revenue, currency)}
              </div>
              <span className={`text-[11px] font-bold ${summary.romi !== null && summary.romi >= 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                ROMI: {formatPercent(summary.romi)}
              </span>
            </div>
          </div>

          {/* Фильтры и тулбар таблицы */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Каналы">
              {[
                { id: 'all', label: 'Все каналы' },
                { id: 'meta', label: 'Meta Ads' },
                { id: 'google', label: 'Google Ads' },
                { id: 'telegram', label: 'Telegram' },
                { id: 'organic', label: 'Органика' },
              ].map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  className={`admin-crm-chip ${channelFilter === ch.id ? 'is-active is-primary' : ''}`}
                  onClick={() => setChannelFilter(ch.id)}
                >
                  {ch.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label className="adm-table-search">
                <Search aria-hidden="true" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по источнику или кампании"
                  aria-label="Поиск кампаний"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} aria-label="Сбросить">
                    <X aria-hidden="true" />
                  </button>
                )}
              </label>

              <button
                type="button"
                className="admin-button admin-button--quiet admin-button--compact"
                onClick={handleExportCsv}
                disabled={!filteredCampaigns.length}
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" /> CSV
              </button>
            </div>
          </div>

          {/* Таблица кампаний */}
          <div className="adm-table-scroll" role="region" aria-label="Таблица UTM-кампаний" tabIndex={0}>
            <table className="adm-data-table">
              <thead>
                <tr>
                  <th scope="col">Канал / Источник</th>
                  <th scope="col">Кампания (utm_campaign)</th>
                  <th scope="col" className="is-numeric">
                    <button type="button" onClick={() => toggleSort('clicks')}>
                      Клики / Показы
                      <ArrowDownUp className={`w-3 h-3 ${sortField === 'clicks' ? 'text-indigo-400' : ''}`} />
                    </button>
                  </th>
                  <th scope="col" className="is-numeric">
                    <button type="button" onClick={() => toggleSort('spend')}>
                      Расход
                      <ArrowDownUp className={`w-3 h-3 ${sortField === 'spend' ? 'text-indigo-400' : ''}`} />
                    </button>
                  </th>
                  <th scope="col" className="is-numeric">
                    <button type="button" onClick={() => toggleSort('leads')}>
                      Лиды
                      <ArrowDownUp className={`w-3 h-3 ${sortField === 'leads' ? 'text-indigo-400' : ''}`} />
                    </button>
                  </th>
                  <th scope="col" className="is-numeric">
                    <button type="button" onClick={() => toggleSort('cpl')}>
                      Цена лида (CPL)
                      <ArrowDownUp className={`w-3 h-3 ${sortField === 'cpl' ? 'text-indigo-400' : ''}`} />
                    </button>
                  </th>
                  <th scope="col" className="is-numeric">
                    <button type="button" onClick={() => toggleSort('qualified')}>
                      Целевые
                      <ArrowDownUp className={`w-3 h-3 ${sortField === 'qualified' ? 'text-indigo-400' : ''}`} />
                    </button>
                  </th>
                  <th scope="col" className="is-numeric">
                    <button type="button" onClick={() => toggleSort('won')}>
                      Сделки
                      <ArrowDownUp className={`w-3 h-3 ${sortField === 'won' ? 'text-indigo-400' : ''}`} />
                    </button>
                  </th>
                  <th scope="col" className="is-numeric">
                    <button type="button" onClick={() => toggleSort('revenue')}>
                      Выручка
                      <ArrowDownUp className={`w-3 h-3 ${sortField === 'revenue' ? 'text-indigo-400' : ''}`} />
                    </button>
                  </th>
                  <th scope="col" className="is-numeric">
                    <button type="button" onClick={() => toggleSort('romi')}>
                      ROMI
                      <ArrowDownUp className={`w-3 h-3 ${sortField === 'romi' ? 'text-indigo-400' : ''}`} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((c) => (
                  <tr key={c.key}>
                    <td className="is-key">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${c.channel === 'meta' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' : c.channel === 'google' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : c.channel === 'telegram' ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/30'}`}>
                          {c.utm_source}
                        </span>
                        {c.utm_medium && <span className="text-zinc-500 text-[11px] font-mono">/{c.utm_medium}</span>}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center justify-between gap-1 group">
                        <span className="font-mono text-xs text-[var(--adm-fg)] truncate" title={c.utm_campaign}>
                          {c.utm_campaign}
                        </span>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-200"
                          onClick={() => {
                            navigator.clipboard.writeText(c.utm_campaign);
                            notify.success('Скопировано', c.utm_campaign);
                          }}
                          title="Скопировать название кампании"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="is-numeric text-xs">
                      {formatNumber(c.clicks)}
                      {c.impressions > 0 && <span className="text-zinc-500 block text-[11px]">{formatNumber(c.impressions)} показов ({formatPercent(c.ctr)})</span>}
                    </td>
                    <td className="is-numeric font-semibold text-amber-300">
                      {formatMoney(c.spend, c.currency)}
                    </td>
                    <td className="is-numeric font-bold text-[var(--adm-fg)]">
                      {formatNumber(c.leads)}
                    </td>
                    <td className="is-numeric font-medium text-indigo-300">
                      {formatMoney(c.cpl, c.currency)}
                    </td>
                    <td className="is-numeric text-emerald-400 font-semibold">
                      {formatNumber(c.qualified)}
                    </td>
                    <td className="is-numeric text-yellow-300 font-bold">
                      {formatNumber(c.won)}
                    </td>
                    <td className="is-numeric text-emerald-300 font-bold">
                      {formatMoney(c.revenue, c.currency)}
                    </td>
                    <td className={`is-numeric font-bold ${c.romi !== null && c.romi >= 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                      {formatPercent(c.romi)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredCampaigns.length === 0 && (
              <AdminBlank
                inline
                title={searchQuery ? 'Ничего не нашлось' : 'За период кампаний не зафиксировано'}
                text={searchQuery ? 'Попробуйте другой запрос или сбросьте фильтр.' : 'Внесите статистику или запустите кампанию с UTM-метками.'}
              />
            )}
          </div>
        </>
      )}

      {/* Модальное окно внесения статистики */}
      {modalOpen && (
        <div className="admin-overlay is-open" onClick={() => setModalOpen(false)}>
          <div
            className="admin-dialog-content max-w-lg p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Внести статистику кампании"
          >
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] pb-3">
              <h4 className="text-base font-bold text-[var(--adm-fg)]">Внести расход и статистику кампании</h4>
              <button
                type="button"
                className="admin-icon-button"
                onClick={() => setModalOpen(false)}
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="admin-label">Дата (YYYY-MM-DD) <span className="text-rose-400">*</span></label>
                  <input
                    type="date"
                    className="admin-input text-xs w-full"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="admin-label">Рекламный канал</label>
                  <select
                    className="admin-input text-xs w-full"
                    value={formChannel}
                    onChange={(e) => setFormChannel(e.target.value)}
                  >
                    <option value="meta">Meta Ads (Instagram / FB)</option>
                    <option value="google">Google Ads (Search/PMax)</option>
                    <option value="telegram">Telegram Ads & Каналы</option>
                    <option value="other">Прочие каналы</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="admin-label">utm_source <span className="text-rose-400">*</span></label>
                  <input
                    className="admin-input text-xs w-full font-mono"
                    placeholder="fb, google, tg"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="admin-label">utm_medium</label>
                  <input
                    className="admin-input text-xs w-full font-mono"
                    placeholder="cpc, post"
                    value={formMedium}
                    onChange={(e) => setFormMedium(e.target.value)}
                  />
                </div>
                <div>
                  <label className="admin-label">utm_campaign <span className="text-rose-400">*</span></label>
                  <input
                    className="admin-input text-xs w-full font-mono"
                    placeholder="retargeting, search"
                    value={formCampaign}
                    onChange={(e) => setFormCampaign(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="admin-label">Расход за день</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="admin-input text-xs w-full font-mono"
                    placeholder="150"
                    value={formSpend}
                    onChange={(e) => setFormSpend(e.target.value)}
                  />
                </div>
                <div>
                  <label className="admin-label">Валюта</label>
                  <select
                    className="admin-input text-xs w-full"
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value)}
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="UZS">UZS (сум)</option>
                    <option value="RUB">RUB (₽)</option>
                  </select>
                </div>
                <div>
                  <label className="admin-label">Клики</label>
                  <input
                    type="number"
                    min="0"
                    className="admin-input text-xs w-full font-mono"
                    placeholder="120"
                    value={formClicks}
                    onChange={(e) => setFormClicks(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="admin-label">Показы (Impressions)</label>
                <input
                  type="number"
                  min="0"
                  className="admin-input text-xs w-full font-mono"
                  placeholder="8500"
                  value={formImpressions}
                  onChange={(e) => setFormImpressions(e.target.value)}
                />
              </div>

              <div>
                <label className="admin-label">Заметка / Примечание</label>
                <input
                  className="admin-input text-xs w-full"
                  placeholder="Тест связки Reels + лид-магнит"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--adm-border)]">
                <button
                  type="button"
                  className="admin-button admin-button--quiet text-xs"
                  onClick={() => setModalOpen(false)}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="admin-button admin-button--primary text-xs"
                >
                  {submitting ? 'Сохранение…' : 'Сохранить запись'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
