import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp, CheckCircle2, Copy,
  ExternalLink, Globe, Info, Key,
  Lightbulb, RefreshCw, Search, ShieldAlert, Sparkles, X,
} from 'lucide-react';
import { AdminSelect } from './AdminUI';
import { AdminSectionSkeleton, notify } from './AdminFeedback';
import type {
  SearchConsoleResponse,
  GscDailyPoint,
} from '../../../../functions/api/admin/search-console';

interface AdminSearchConsoleProps {
  password: string;
}

type TabKey = 'queries' | 'pages' | 'growth' | 'setup';
type PositionFilter = 'all' | 'top3' | 'top10' | 'top20';
type SortField = 'clicks' | 'impressions' | 'ctr' | 'position';

export default function AdminSearchConsole({ password }: AdminSearchConsoleProps) {
  const [data, setData] = useState<SearchConsoleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(28);
  const [activeTab, setActiveTab] = useState<TabKey>('queries');

  // Фильтры и сортировка поисковых запросов
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
  const [sortField, setSortField] = useState<SortField>('clicks');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Для графика
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [metricView, setMetricView] = useState<'both' | 'clicks' | 'impressions'>('both');

  const requestSequence = useRef(0);

  const loadData = useCallback(async (selectedDays: number) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/admin/search-console?days=${selectedDays}`, {
        headers: {
          'X-Admin-Password': password,
        },
      });

      const json = await res.json() as SearchConsoleResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Не удалось загрузить данные Search Console (${res.status})`);
      }
      if (requestId === requestSequence.current) setData(json);
    } catch (err) {
      if (requestId === requestSequence.current) {
        setError(err instanceof Error ? err.message : 'Ошибка соединения с API');
      }
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    void loadData(days);
    return () => { requestSequence.current += 1; };
  }, [days, loadData]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify.success(`${label} скопирован в буфер`);
    } catch {
      notify.error('Не удалось скопировать текст');
    }
  };

  // Фильтрация и сортировка запросов
  const filteredQueries = useMemo(() => {
    if (!data?.queries) return [];
    let list = [...data.queries];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => item.query.toLowerCase().includes(q));
    }

    if (positionFilter === 'top3') {
      list = list.filter((item) => item.position <= 3.0);
    } else if (positionFilter === 'top10') {
      list = list.filter((item) => item.position > 3.0 && item.position <= 10.0);
    } else if (positionFilter === 'top20') {
      list = list.filter((item) => item.position > 10.0 && item.position <= 20.0);
    }

    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortField === 'position') {
        // Для позиций меньше = лучше (Топ-1 вверху при desc)
        return sortDirection === 'desc' ? valA - valB : valB - valA;
      }
      return sortDirection === 'desc' ? valB - valA : valA - valB;
    });

    return list;
  }, [data?.queries, searchQuery, positionFilter, sortField, sortDirection]);

  // Максимумы для относительных мини-баров
  const maxQueryImpressions = useMemo(() => {
    if (!data?.queries?.length) return 1;
    return Math.max(...data.queries.map((q) => q.impressions), 1);
  }, [data?.queries]);

  const maxPageImpressions = useMemo(() => {
    if (!data?.pages?.length) return 1;
    return Math.max(...data.pages.map((p) => p.impressions), 1);
  }, [data?.pages]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const summary = data?.summary;

  return (
    <div className="admin-gsc-container">
      {/* Шапка раздела */}
      <div className="admin-gsc-header">
        <div className="admin-gsc-title-block">
          <div className="admin-gsc-title-row">
            <h2 className="admin-gsc-title">
              <Globe className="admin-gsc-title-icon" aria-hidden="true" />
              <span>Google&nbsp;Search&nbsp;Console &amp;&nbsp;SEO</span>
            </h2>
            {data && (data.configured ? (
              <span className="admin-gsc-status-pill admin-gsc-status-pill--active">
                <CheckCircle2 size={13} aria-hidden="true" />
                Данные Google получены
              </span>
            ) : (
              <span className="admin-gsc-status-pill admin-gsc-status-pill--demo">
                <Info size={13} aria-hidden="true" />
                Требуется подключение
              </span>
            ))}
          </div>
          <p className="admin-gsc-subtitle">
            Клики, показы и средние позиции в поиске Google. Данные поступают из Search Console.
          </p>
        </div>

        <div className="admin-gsc-actions">
          <div className="admin-gsc-period-select">
            <AdminSelect
              value={String(days)}
              ariaLabel="Период Search Console"
              options={[
                { value: '7', label: '7 дней' },
                { value: '28', label: '28 дней' },
                { value: '90', label: '90 дней' },
              ]}
              onValueChange={(val) => setDays(Number(val))}
            />
          </div>
          <button
            type="button"
            onClick={() => void loadData(days)}
            disabled={loading}
            className="admin-button"
            title="Обновить данные"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} size={15} aria-hidden="true" />
            <span>{loading ? 'Синхронизация…' : 'Обновить'}</span>
          </button>
        </div>
      </div>

      {loading && !data && <AdminSectionSkeleton tiles={4} rows={4} />}

      {error && (
        <div className="admin-notice admin-notice--warning" role="alert">
          <strong>Ошибка получения данных</strong>
          <p>{error}</p>
        </div>
      )}

      {data?.configured && (
        <p className="admin-gsc-card-subtitle">
          Период {data.startDate} — {data.endDate}. Только финальные данные веб-поиска Google.
          В таблицах — верхние строки, возвращённые API. Редкие запросы могут быть скрыты Google.
        </p>
      )}
      {data?.configured && !summary && <p className="admin-gsc-card-subtitle">За этот период Google не вернул показов.</p>}
      {data && summary && (
        <>
          {/* KPI-сводка: 4 ключевые метрики */}
          <div className="admin-gsc-kpi-grid">
            <div className="admin-gsc-kpi-card">
              <div className="admin-gsc-kpi-label">Клики из Google</div>
              <div className="admin-gsc-kpi-value">{summary.clicks.toLocaleString('ru-RU')}</div>
              {summary.prevClicks !== undefined && summary.prevClicks > 0 && (
                <div className="admin-gsc-kpi-subtext">
                  {new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' })
                    .format((summary.clicks - summary.prevClicks) / summary.prevClicks)} к пред. периоду
                </div>
              )}
            </div>

            <div className="admin-gsc-kpi-card">
              <div className="admin-gsc-kpi-label">Показы в выдаче</div>
              <div className="admin-gsc-kpi-value">{summary.impressions.toLocaleString('ru-RU')}</div>
              {summary.prevImpressions !== undefined && summary.prevImpressions > 0 && (
                <div className="admin-gsc-kpi-subtext">
                  {new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' })
                    .format((summary.impressions - summary.prevImpressions) / summary.prevImpressions)} к пред. периоду
                </div>
              )}
            </div>

            <div className="admin-gsc-kpi-card">
              <div className="admin-gsc-kpi-label">Средний CTR</div>
              <div className="admin-gsc-kpi-value">{summary.ctr.toFixed(1)}%</div>
              <div className="admin-gsc-kpi-subtext">Кликабельность сниппетов сайта</div>
            </div>

            <div className="admin-gsc-kpi-card">
              <div className="admin-gsc-kpi-label">Средняя позиция</div>
              <div className="admin-gsc-kpi-value">#{summary.position.toFixed(1)}</div>
            </div>
          </div>

          {/* Векторный интерактивный график динамики */}
          {data.daily?.length > 1 && (
            <div className="admin-card admin-gsc-chart-card">
              <div className="admin-gsc-chart-header">
                <div>
                  <h3 className="admin-gsc-card-title">Динамика поискового спроса</h3>
                  <p className="admin-gsc-card-subtitle">
                    Ежедневные клики и показы страниц сайта в органической выдаче Google.
                  </p>
                </div>
                <div className="admin-gsc-chart-controls">
                  <button
                    type="button"
                    className={`admin-pill ${metricView === 'both' ? 'admin-pill--active' : ''}`}
                    onClick={() => setMetricView('both')}
                  >
                    Клики и Показы
                  </button>
                  <button
                    type="button"
                    className={`admin-pill ${metricView === 'clicks' ? 'admin-pill--active' : ''}`}
                    onClick={() => setMetricView('clicks')}
                  >
                    Только клики
                  </button>
                  <button
                    type="button"
                    className={`admin-pill ${metricView === 'impressions' ? 'admin-pill--active' : ''}`}
                    onClick={() => setMetricView('impressions')}
                  >
                    Только показы
                  </button>
                </div>
              </div>

              <div className="admin-gsc-chart-wrapper">
                <GscSvgChart
                  points={data.daily}
                  view={metricView}
                  hoveredIndex={hoveredPointIndex}
                  onHoverPoint={setHoveredPointIndex}
                />
              </div>
            </div>
          )}

          {/* Вкладки разделов */}
          <div className="admin-gsc-tabs-bar">
            <button
              type="button"
              className={`admin-gsc-tab-btn ${activeTab === 'queries' ? 'admin-gsc-tab-btn--active' : ''}`}
              onClick={() => setActiveTab('queries')}
            >
              <span>Поисковые запросы</span>
              <span className="admin-gsc-tab-counter">{data.queries.length}</span>
            </button>
            <button
              type="button"
              className={`admin-gsc-tab-btn ${activeTab === 'pages' ? 'admin-gsc-tab-btn--active' : ''}`}
              onClick={() => setActiveTab('pages')}
            >
              <span>Посадочные страницы</span>
              <span className="admin-gsc-tab-counter">{data.pages.length}</span>
            </button>
            <button
              type="button"
              className={`admin-gsc-tab-btn ${activeTab === 'growth' ? 'admin-gsc-tab-btn--active' : ''}`}
              onClick={() => setActiveTab('growth')}
            >
              <Sparkles size={14} className="text-amber-400" aria-hidden="true" />
              <span>Точки роста и Каннибализация</span>
              <span className="admin-gsc-tab-counter">{data.opportunities.length + data.cannibalization.length}</span>
            </button>
            <button
              type="button"
              className={`admin-gsc-tab-btn ${activeTab === 'setup' ? 'admin-gsc-tab-btn--active' : ''}`}
              onClick={() => setActiveTab('setup')}
            >
              <Key size={14} aria-hidden="true" />
              <span>Подключение API</span>
            </button>
          </div>

          {/* Контент активной вкладки */}
          {activeTab === 'queries' && (
            <div className="admin-card admin-gsc-table-card">
              {/* Панель фильтров и поиска */}
              <div className="admin-gsc-filter-row">
                <div className="admin-gsc-search-box">
                  <Search size={15} className="admin-gsc-search-icon" aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Фильтр по ключевой фразе…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="admin-input admin-gsc-search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="admin-gsc-search-clear"
                      title="Очистить"
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="admin-gsc-filter-chips">
                  <button
                    type="button"
                    className={`admin-pill ${positionFilter === 'all' ? 'admin-pill--active' : ''}`}
                    onClick={() => setPositionFilter('all')}
                  >
                    Все запросы ({data.queries.length})
                  </button>
                  <button
                    type="button"
                    className={`admin-pill ${positionFilter === 'top3' ? 'admin-pill--active' : ''}`}
                    onClick={() => setPositionFilter('top3')}
                  >
                    Топ-3 ({data.queries.filter((q) => q.position <= 3).length})
                  </button>
                  <button
                    type="button"
                    className={`admin-pill ${positionFilter === 'top10' ? 'admin-pill--active' : ''}`}
                    onClick={() => setPositionFilter('top10')}
                  >
                    4–10 (1-я страница) ({data.queries.filter((q) => q.position > 3 && q.position <= 10).length})
                  </button>
                  <button
                    type="button"
                    className={`admin-pill ${positionFilter === 'top20' ? 'admin-pill--active' : ''}`}
                    onClick={() => setPositionFilter('top20')}
                  >
                    11–20 ({data.queries.filter((q) => q.position > 10 && q.position <= 20).length})
                  </button>
                </div>
              </div>

              {/* Таблица запросов */}
              <div className="admin-gsc-table-scroll">
                <table className="admin-table admin-gsc-table">
                  <thead>
                    <tr>
                      <th className="admin-gsc-th-query">Поисковый запрос</th>
                      <th
                        className="admin-gsc-th-sortable"
                        onClick={() => toggleSort('position')}
                      >
                        <div className="admin-gsc-th-content">
                          <span>Позиция</span>
                          <ArrowDownUp size={12} aria-hidden="true" />
                        </div>
                      </th>
                      <th
                        className="admin-gsc-th-sortable"
                        onClick={() => toggleSort('clicks')}
                      >
                        <div className="admin-gsc-th-content">
                          <span>Клики</span>
                          <ArrowDownUp size={12} aria-hidden="true" />
                        </div>
                      </th>
                      <th
                        className="admin-gsc-th-sortable"
                        onClick={() => toggleSort('impressions')}
                      >
                        <div className="admin-gsc-th-content">
                          <span>Показы</span>
                          <ArrowDownUp size={12} aria-hidden="true" />
                        </div>
                      </th>
                      <th
                        className="admin-gsc-th-sortable"
                        onClick={() => toggleSort('ctr')}
                      >
                        <div className="admin-gsc-th-content">
                          <span>CTR</span>
                          <ArrowDownUp size={12} aria-hidden="true" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQueries.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="admin-gsc-empty-cell">
                          Запросы не найдены по текущим критериям
                        </td>
                      </tr>
                    ) : (
                      filteredQueries.map((item) => (
                        <tr key={item.query}>
                          <td className="admin-gsc-td-query">
                            <div className="admin-gsc-query-text-row">
                              <span className="admin-gsc-query-text">{item.query}</span>
                              <button
                                type="button"
                                onClick={() => void copyToClipboard(item.query, 'Запрос')}
                                className="admin-gsc-copy-btn"
                                title="Скопировать поисковый запрос"
                              >
                                <Copy size={12} aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                          <td>
                            <div className="admin-gsc-pos-cell">
                              <span className={`admin-gsc-pos-badge ${getPositionClass(item.position)}`}>
                                #{item.position.toFixed(1)}
                              </span>
                            </div>
                          </td>
                          <td className="admin-gsc-td-num">
                            <strong>{item.clicks}</strong>
                          </td>
                          <td className="admin-gsc-td-num">
                            <div className="admin-gsc-bar-cell">
                              <span>{item.impressions.toLocaleString('ru-RU')}</span>
                              <div
                                className="admin-gsc-mini-bar"
                                style={{
                                  width: `${Math.max(6, Math.round((item.impressions / maxQueryImpressions) * 100))}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td className="admin-gsc-td-num">
                            <span className="admin-gsc-ctr-tag">{item.ctr.toFixed(1)}%</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'pages' && (
            <div className="admin-card admin-gsc-table-card">
              <div className="admin-gsc-table-scroll">
                <table className="admin-table admin-gsc-table">
                  <thead>
                    <tr>
                      <th>Страница сайта</th>
                      <th>Клики</th>
                      <th>Показы</th>
                      <th>CTR</th>
                      <th>Средняя позиция</th>
                      <th>Ключевые запросы страницы</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pages.map((row) => (
                      <tr key={row.page}>
                        <td className="admin-gsc-td-page">
                          <a
                            href={row.page}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="admin-gsc-page-link"
                          >
                            <span>{row.page}</span>
                            <ExternalLink size={12} aria-hidden="true" />
                          </a>
                        </td>
                        <td className="admin-gsc-td-num">
                          <strong>{row.clicks}</strong>
                        </td>
                        <td className="admin-gsc-td-num">
                          <div className="admin-gsc-bar-cell">
                            <span>{row.impressions.toLocaleString('ru-RU')}</span>
                            <div
                              className="admin-gsc-mini-bar"
                              style={{
                                width: `${Math.max(6, Math.round((row.impressions / maxPageImpressions) * 100))}%`,
                              }}
                            />
                          </div>
                        </td>
                        <td className="admin-gsc-td-num">
                          <span className="admin-gsc-ctr-tag">{row.ctr.toFixed(1)}%</span>
                        </td>
                        <td>
                          <span className={`admin-gsc-pos-badge ${getPositionClass(row.position)}`}>
                            #{row.position.toFixed(1)}
                          </span>
                        </td>
                        <td className="admin-gsc-td-queries">
                          <div className="admin-gsc-chip-list">
                            {row.topQueries.map((q) => (
                              <span key={q} className="admin-gsc-query-chip">
                                {q}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'growth' && (
            <div className="admin-gsc-growth-layout">
              {/* Блок 1: Точки роста (Low-hanging fruits) */}
              <div className="admin-card admin-gsc-growth-section">
                <div className="admin-gsc-section-title-row">
                  <Lightbulb className="text-amber-400" size={18} aria-hidden="true" />
                  <div>
                    <h3 className="admin-gsc-card-title">Запросы для проверки</h3>
                    <p className="admin-gsc-card-subtitle">
                      Пары «запрос — страница» со средней позицией 4–15 и от 20 показов за выбранный период.
                    </p>
                  </div>
                </div>

                <div className="admin-gsc-cards-stack">
                  {data.opportunities.length === 0 && <p className="admin-gsc-card-subtitle">За этот период подходящих пар нет.</p>}
                  {data.opportunities.map((opp) => (
                    <div key={opp.query + opp.page} className="admin-gsc-opp-card">
                      <div className="admin-gsc-opp-header">
                        <div className="admin-gsc-opp-query-block">
                          <span className="admin-gsc-opp-query">{opp.query}</span>
                          <span className="admin-gsc-opp-page-tag">
                            Страница: <code>{opp.page}</code>
                          </span>
                        </div>
                        <div className="admin-gsc-opp-metrics">
                          <div className="admin-gsc-opp-badge">
                            Текущая позиция: <strong>#{opp.currentPosition.toFixed(1)}</strong>
                          </div>
                          <div className="admin-gsc-opp-badge admin-gsc-opp-badge--gain">
                            Показы: <strong>{opp.impressions}</strong> · CTR: <strong>{opp.ctr.toFixed(1)}%</strong>
                          </div>
                        </div>
                      </div>
                      <div className="admin-gsc-opp-advice">
                        <Sparkles size={14} className="text-amber-400 shrink-0" aria-hidden="true" />
                        <span>{opp.advice}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Блок 2: Детектор каннибализации */}
              <div className="admin-card admin-gsc-growth-section">
                <div className="admin-gsc-section-title-row">
                  <ShieldAlert className="text-rose-400" size={18} aria-hidden="true" />
                  <div>
                    <h3 className="admin-gsc-card-title">Запросы с несколькими страницами</h3>
                    <p className="admin-gsc-card-subtitle">
                      У каждого показанного URL от 10 показов по одному запросу. Сверьте назначение страниц, прежде чем менять их.
                    </p>
                  </div>
                </div>

                <div className="admin-gsc-cards-stack">
                  {data.cannibalization.length === 0 && <p className="admin-gsc-card-subtitle">За этот период подходящих запросов нет.</p>}
                  {data.cannibalization.map((can) => (
                    <div key={can.query} className="admin-gsc-cann-card">
                      <div className="admin-gsc-cann-query-row">
                        <span className="admin-gsc-cann-query">{can.query}</span>
                        <span className="admin-gsc-cann-warning">Страниц с показами: {can.pages.length}</span>
                      </div>
                      <div className="admin-gsc-cann-pages-list">
                        {can.pages.map((p) => (
                          <div key={p.page} className="admin-gsc-cann-page-row">
                            <span className="admin-gsc-cann-url">{p.page}</span>
                            <div className="admin-gsc-cann-page-stats">
                              <span>Позиция: <strong>#{p.position.toFixed(1)}</strong></span>
                              <span>Клики: <strong>{p.clicks}</strong></span>
                              <span>Показы: <strong>{p.impressions}</strong></span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="admin-gsc-cann-recommendation">
                        Проверьте, какую задачу решает каждый URL. Если страницы отвечают на одну задачу, уточните основную посадочную и внутренние ссылки.
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </>
      )}

      {((data && (!data.configured || activeTab === 'setup')) || error) && (
        <div className="admin-card admin-gsc-setup-card">
          <div className="admin-gsc-setup-header">
            <Key size={20} className="text-blue-400" aria-hidden="true" />
            <div>
              <h3 className="admin-gsc-card-title">Подключение Google&nbsp;Search&nbsp;Console</h3>
              <p className="admin-gsc-card-subtitle">Интеграция читает отчёты ресурса {data?.propertyName || 'sc-domain:whalewzrd.com'}.</p>
            </div>
          </div>
          <ol className="admin-gsc-setup-steps list-decimal pl-5">
            <li>В Google Cloud включите Google Search Console API, создайте сервисный аккаунт и его JSON-ключ.</li>
            <li>В Search Console добавьте email аккаунта к ресурсу в разделе «Настройки → Пользователи и разрешения».</li>
            <li>В Cloudflare Pages добавьте секрет <code>GSC_SERVICE_ACCOUNT_JSON</code> с содержимым JSON и выполните новую production-выкладку.</li>
            <li>Если используется ресурс с префиксом URL, укажите его точный адрес в переменной <code>GSC_PROPERTY</code>. Затем нажмите «Обновить».</li>
          </ol>
          <a className="admin-gsc-page-link" href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer">
            Открыть Search Console <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}

function getPositionClass(position: number): string {
  if (position <= 3.0) return 'admin-gsc-pos-badge--top3';
  if (position <= 10.0) return 'admin-gsc-pos-badge--top10';
  return 'admin-gsc-pos-badge--other';
}

/**
 * Интерактивный векторный график поискового спроса (SVG)
 */
function GscSvgChart({
  points,
  view,
  hoveredIndex,
  onHoverPoint,
}: {
  points: GscDailyPoint[];
  view: 'both' | 'clicks' | 'impressions';
  hoveredIndex: number | null;
  onHoverPoint: (index: number | null) => void;
}) {
  const width = 800;
  const height = 240;
  const padding = { top: 20, right: 30, bottom: 35, left: 45 };

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxClicks = Math.max(...points.map((p) => p.clicks), 1);
  const maxImpressions = Math.max(...points.map((p) => p.impressions), 1);

  const getX = (index: number) => padding.left + (index / (points.length - 1)) * chartW;
  const getClickY = (val: number) => padding.top + chartH - (val / maxClicks) * chartH;
  const getImpY = (val: number) => padding.top + chartH - (val / maxImpressions) * chartH;

  // Построение полилиний
  const clicksPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getClickY(p.clicks).toFixed(1)}`)
    .join(' ');

  const impressionsPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getImpY(p.impressions).toFixed(1)}`)
    .join(' ');

  const clicksArea = `${clicksPath} L ${getX(points.length - 1).toFixed(1)} ${(padding.top + chartH).toFixed(1)} L ${getX(0).toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`;
  const impressionsArea = `${impressionsPath} L ${getX(points.length - 1).toFixed(1)} ${(padding.top + chartH).toFixed(1)} L ${getX(0).toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`;

  const hoveredPoint = hoveredIndex !== null && points[hoveredIndex] ? points[hoveredIndex] : null;

  return (
    <div className="admin-gsc-svg-chart-box">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="admin-gsc-svg-chart"
        preserveAspectRatio="none"
        onMouseLeave={() => onHoverPoint(null)}
      >
        <defs>
          <linearGradient id="gscClicksGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="gscImpGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Сетка */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + chartH * ratio;
          return (
            <line
              key={ratio}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="rgba(255, 255, 255, 0.06)"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Показы */}
        {(view === 'both' || view === 'impressions') && (
          <>
            <path d={impressionsArea} fill="url(#gscImpGrad)" />
            <path d={impressionsPath} fill="none" stroke="#a855f7" strokeWidth="2.5" />
          </>
        )}

        {/* Клики */}
        {(view === 'both' || view === 'clicks') && (
          <>
            <path d={clicksArea} fill="url(#gscClicksGrad)" />
            <path d={clicksPath} fill="none" stroke="#3b82f6" strokeWidth="2.5" />
          </>
        )}

        {/* Интерактивные вертикальные зоны для hover */}
        {points.map((pt, i) => {
          const x = getX(i);
          return (
            <rect
              key={pt.date}
              x={x - chartW / (points.length * 2)}
              y={padding.top}
              width={chartW / points.length}
              height={chartH}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHoverPoint(i)}
            />
          );
        })}

        {/* Подсветка точки при hover */}
        {hoveredIndex !== null && (
          <>
            <line
              x1={getX(hoveredIndex)}
              y1={padding.top}
              x2={getX(hoveredIndex)}
              y2={padding.top + chartH}
              stroke="rgba(255, 255, 255, 0.3)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {(view === 'both' || view === 'clicks') && (
              <circle
                cx={getX(hoveredIndex)}
                cy={getClickY(points[hoveredIndex].clicks)}
                r="4.5"
                fill="#3b82f6"
                stroke="#fff"
                strokeWidth="2"
              />
            )}
            {(view === 'both' || view === 'impressions') && (
              <circle
                cx={getX(hoveredIndex)}
                cy={getImpY(points[hoveredIndex].impressions)}
                r="4.5"
                fill="#a855f7"
                stroke="#fff"
                strokeWidth="2"
              />
            )}
          </>
        )}

        {/* Подписи дат */}
        {points.map((pt, i) => {
          if (i % Math.ceil(points.length / 7) !== 0 && i !== points.length - 1) return null;
          const x = getX(i);
          const shortDate = pt.date.slice(5); // MM-DD
          return (
            <text
              key={pt.date}
              x={x}
              y={height - 10}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="11"
              fontFamily="var(--font-mono, monospace)"
            >
              {shortDate}
            </text>
          );
        })}
      </svg>

      {/* Тултип точки */}
      {hoveredPoint && hoveredIndex !== null && (
        <div
          className="admin-gsc-chart-tooltip"
          style={{
            left: `${Math.min(85, Math.max(15, (getX(hoveredIndex) / width) * 100))}%`,
          }}
        >
          <div className="admin-gsc-tooltip-date">{hoveredPoint.date}</div>
          <div className="admin-gsc-tooltip-row text-blue-400">
            <span>Клики:</span>
            <strong>{hoveredPoint.clicks}</strong>
          </div>
          <div className="admin-gsc-tooltip-row text-purple-400">
            <span>Показы:</span>
            <strong>{hoveredPoint.impressions}</strong>
          </div>
          <div className="admin-gsc-tooltip-row text-slate-300">
            <span>CTR:</span>
            <strong>{hoveredPoint.ctr}%</strong>
          </div>
          <div className="admin-gsc-tooltip-row text-emerald-400">
            <span>Позиция:</span>
            <strong>#{hoveredPoint.position.toFixed(1)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
