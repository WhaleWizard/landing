import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Copy,
  DollarSign,
  HelpCircle,
  Percent,
  RotateCcw,
  Sliders,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { notify } from './AdminFeedback';
import { calculateAdminUnitEconomics } from '../../utils/adminUnitEconomics';

export interface UnitEconPreset {
  id: string;
  name: string;
  badge: string;
  targetRevenue: number;
  averageCheck: number;
  marginPercent: number;
  leadToDealPercent: number;
  siteConvPercent: number;
  cpc: number;
  repeatPurchases: number;
}

const PRESETS: UnitEconPreset[] = [
  {
    id: 'b2b_service',
    name: 'B2B услуги и маркетинг',
    badge: 'Высокий LTV',
    targetRevenue: 10000,
    averageCheck: 1200,
    marginPercent: 65,
    leadToDealPercent: 18,
    siteConvPercent: 4.0,
    cpc: 1.2,
    repeatPurchases: 5.5,
  },
  {
    id: 'ecom',
    name: 'E-commerce магазин',
    badge: 'Товарка / D2C',
    targetRevenue: 15000,
    averageCheck: 65,
    marginPercent: 35,
    leadToDealPercent: 75,
    siteConvPercent: 2.8,
    cpc: 0.45,
    repeatPurchases: 2.4,
  },
  {
    id: 'local_clinic',
    name: 'Клиника / Стоматология',
    badge: 'Локальный бизнес',
    targetRevenue: 12000,
    averageCheck: 380,
    marginPercent: 50,
    leadToDealPercent: 32,
    siteConvPercent: 5.5,
    cpc: 1.1,
    repeatPurchases: 3.2,
  },
  {
    id: 'real_estate',
    name: 'Недвижимость / Агентство',
    badge: 'Сверхвысокий чек',
    targetRevenue: 25000,
    averageCheck: 4500,
    marginPercent: 80,
    leadToDealPercent: 4.5,
    siteConvPercent: 1.8,
    cpc: 2.4,
    repeatPurchases: 1.2,
  },
  {
    id: 'edtech',
    name: 'EdTech / Онлайн-курсы',
    badge: 'Инфобизнес',
    targetRevenue: 18000,
    averageCheck: 280,
    marginPercent: 75,
    leadToDealPercent: 14,
    siteConvPercent: 3.2,
    cpc: 0.85,
    repeatPurchases: 1.6,
  },
];

function readSavedScenario(): Record<string, unknown> {
  try {
    const saved = JSON.parse(localStorage.getItem('ww_unit_economics_state') || 'null');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function scenarioNumber(saved: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof saved === 'number' && Number.isFinite(saved) && saved >= min && saved <= max ? saved : fallback;
}

/**
 * Числа по-русски (CL-15): «$10 000» и «140,4», а не «$10,000» и «140.4» —
 * в русском тексте запятая означает дробь, и «10,000» читается как «десять».
 */
function num(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toLocaleString('ru-RU', { maximumFractionDigits: digits }) : '—';
}

export default function AdminUnitEconomics() {
  const [saved] = useState(readSavedScenario);
  const defaults = PRESETS[0];
  const [targetRevenue, setTargetRevenue] = useState(() => scenarioNumber(saved.targetRevenue, defaults.targetRevenue));
  const [averageCheck, setAverageCheck] = useState(() => scenarioNumber(saved.averageCheck, defaults.averageCheck));
  const [marginPercent, setMarginPercent] = useState(() => scenarioNumber(saved.marginPercent, defaults.marginPercent, 5, 95));
  const [leadToDealPercent, setLeadToDealPercent] = useState(() => scenarioNumber(saved.leadToDealPercent, defaults.leadToDealPercent, 1, 90));
  const [siteConvPercent, setSiteConvPercent] = useState(() => scenarioNumber(saved.siteConvPercent, defaults.siteConvPercent, 0.5, 20));
  const [cpc, setCpc] = useState(() => scenarioNumber(saved.cpc, defaults.cpc));
  const [repeatPurchases, setRepeatPurchases] = useState(() => scenarioNumber(saved.repeatPurchases, defaults.repeatPurchases, 1, 15));
  const [activePreset, setActivePreset] = useState(() => PRESETS.find((preset) => preset.id === saved.activePreset)?.id ?? defaults.id);
  const [scenarioName, setScenarioName] = useState(() => typeof saved.scenarioName === 'string' ? saved.scenarioName : 'Базовый план');

  // Save state on changes
  const saveState = useCallback(() => {
    try {
      const state = {
        targetRevenue,
        averageCheck,
        marginPercent,
        leadToDealPercent,
        siteConvPercent,
        cpc,
        repeatPurchases,
        activePreset,
        scenarioName,
      };
      localStorage.setItem('ww_unit_economics_state', JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [
    targetRevenue,
    averageCheck,
    marginPercent,
    leadToDealPercent,
    siteConvPercent,
    cpc,
    repeatPurchases,
    activePreset,
    scenarioName,
  ]);

  useEffect(() => {
    saveState();
  }, [saveState]);

  // Apply Preset
  const handleApplyPreset = (preset: UnitEconPreset) => {
    setActivePreset(preset.id);
    setTargetRevenue(preset.targetRevenue);
    setAverageCheck(preset.averageCheck);
    setMarginPercent(preset.marginPercent);
    setLeadToDealPercent(preset.leadToDealPercent);
    setSiteConvPercent(preset.siteConvPercent);
    setCpc(preset.cpc);
    setRepeatPurchases(preset.repeatPurchases);
    setScenarioName(preset.name);
    notify.success(`Применен пресет: ${preset.name}`);
  };

  const calculations = useMemo(() => calculateAdminUnitEconomics({
    targetRevenue, averageCheck, marginPercent, leadToDealPercent,
    siteConvPercent, cpc, repeatPurchases,
  }), [targetRevenue, averageCheck, marginPercent, leadToDealPercent, siteConvPercent, cpc, repeatPurchases]);
  const [manualReport, setManualReport] = useState<{ calculation: NonNullable<typeof calculations>; text: string } | null>(null);

  // Copy proposal summary
  const handleCopySummary = async () => {
    if (!calculations) return;
    let report = `📊 МЕДИАПЛАН И РАСЧЕТ ЮНИТ-ЭКОНОМИКИ (${scenarioName})\nРасчёт по введённым параметрам.\n`;
    report += `--------------------------------------------------\n`;
    report += `🎯 Целевая выручка: $${num(targetRevenue)}\n`;
    report += `📦 Средний чек: $${num(averageCheck)} | Маржинальность: ${num(marginPercent)}%\n`;
    report += `🤝 Конверсия лида в сделку: ${num(leadToDealPercent)}%\n`;
    report += `🌐 Конверсия сайта: ${num(siteConvPercent)}% | Средний CPC: $${num(cpc)}\n\n`;

    report += `📈 ВОРОНКА И НЕОБХОДИМЫЕ РЕСУРСЫ:\n`;
    report += `• Продаж необходимо: ${num(calculations.dealsNeeded)} шт.\n`;
    report += `• Лидов необходимо: ${num(calculations.leadsNeeded)} шт.\n`;
    report += `• Переходов на сайт: ${num(calculations.clicksNeeded)} кликов\n`;
    report += `• Рекомендуемый рекламный бюджет: $${num(calculations.estimatedBudget)}\n\n`;

    report += `💰 ЭКОНОМИКА И ОКУПАЕМОСТЬ:\n`;
    report += `• Прогнозируемый CPL (цена лида): $${num(calculations.calculatedCpl)}\n`;
    report += `• Предельный CPL безубыточности: $${num(calculations.breakEvenCpl)}\n`;
    report += `• Стоимость привлечения клиента (CAC): $${num(calculations.calculatedCac)}\n`;
    report += `• Валовая прибыль: $${num(calculations.grossProfit)}\n`;
    report += `• Прибыль после рекламы (до остальных расходов и налогов): $${num(calculations.netProfit)}\n`;
    report += `• Ожидаемый ROMI: ${num(calculations.romi)}%\n`;
    report += `• LTV / CAC соотношение: ${num(calculations.ltvCacRatio)}x (LTV = $${num(calculations.ltv)})\n\n`;

    report += `💡 ВЫВОД: ${
      !calculations.isLoss && calculations.hasLtvHeadroom
        ? 'Модель устойчива и масштабируема. Экономика сходится с запасом.'
        : 'Внимание: высокий риск при масштабировании. Рекомендуется поднять конверсию отдела продаж или средний чек.'
    }\n`;

    try {
      await navigator.clipboard.writeText(report);
      setManualReport(null);
      notify.success('Медиаплан скопирован в буфер обмена');
    } catch {
      setManualReport({ calculation: calculations, text: report });
    }
  };

  // Reset to default
  const handleReset = () => {
    handleApplyPreset(PRESETS[0]);
  };

  return (
    <div className="admin-unit-econ-container">
      {/* Header */}
      <div className="admin-unit-econ-header">
        <div className="admin-unit-econ-title-group">
          <div className="admin-unit-econ-icon-wrap">
            <Calculator className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <div className="admin-unit-econ-badge-row">
              <span className="admin-unit-econ-badge-sub">Медиапланирование</span>
            </div>
            <h2 className="admin-unit-econ-heading">Калькулятор юнит-экономики и CPL</h2>
          </div>
        </div>

        <div className="admin-unit-econ-actions">
          <button
            type="button"
            className="admin-button"
            onClick={handleCopySummary}
            disabled={!calculations}
            title="Скопировать готовый медиаплан для КП или отчета"
          >
            <Copy className="h-4 w-4 mr-1.5" />
            Копировать план
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={handleReset}
            title="Сбросить к базовому сценарию"
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Сброс
          </button>
        </div>
      </div>

      {manualReport && manualReport.calculation === calculations && (
        <label className="admin-field">
          <span className="admin-label">Скопируйте медиаплан вручную</span>
          <textarea className="admin-input" rows={8} readOnly value={manualReport.text} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}

      {/* Preset Buttons */}
      <div className="admin-unit-econ-presets">
        <span className="admin-unit-econ-preset-label">Быстрые сценарии:</span>
        <div className="admin-unit-econ-preset-list">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`admin-unit-econ-preset-chip ${
                activePreset === p.id ? 'active' : ''
              }`}
              aria-pressed={activePreset === p.id}
              onClick={() => handleApplyPreset(p)}
            >
              <span>{p.name}</span>
              <span className="admin-unit-econ-preset-badge">{p.badge}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Parameters on Left, Output Metrics on Right */}
      <div className="admin-unit-econ-main-grid">
        {/* Left Column: Input Sliders & Fields */}
        <div className="admin-unit-econ-card">
          <div className="admin-unit-econ-card-header">
            <Sliders className="h-4 w-4 text-blue-400 mr-2" />
            <h3 className="admin-unit-econ-card-title">Параметры экономики и&nbsp;воронки</h3>
          </div>

          <div className="admin-unit-econ-inputs">
            {/* Target Revenue */}
            <div className="admin-unit-econ-field">
              <div className="admin-unit-econ-field-top">
                <label className="admin-unit-econ-label" htmlFor="unit-target-revenue">
                  Целевая выручка в месяц ($)
                </label>
                <input
                  id="unit-target-revenue"
                  type="number"
                  min={0}
                  step={0.01}
                  className="admin-unit-econ-num-input"
                  value={targetRevenue}
                  onChange={(e) => setTargetRevenue(Number(e.target.value) || 0)}
                />
              </div>
              <input
                aria-label="Ползунок: Целевая выручка в месяц ($)"
                type="range"
                min={0}
                max={Math.max(100000, targetRevenue || 0)}
                step={0.01}
                className="admin-unit-econ-slider"
                value={targetRevenue}
                onChange={(e) => setTargetRevenue(Number(e.target.value))}
              />
            </div>

            {/* Average Check */}
            <div className="admin-unit-econ-field">
              <div className="admin-unit-econ-field-top">
                <label className="admin-unit-econ-label" htmlFor="unit-average-check">
                  Средний чек одной покупки ($)
                </label>
                <input
                  id="unit-average-check"
                  type="number"
                  min={0}
                  step={0.01}
                  className="admin-unit-econ-num-input"
                  value={averageCheck}
                  onChange={(e) => setAverageCheck(Number(e.target.value) || 0)}
                />
              </div>
              <input
                aria-label="Ползунок: Средний чек одной покупки ($)"
                type="range"
                min={0}
                max={Math.max(10000, averageCheck || 0)}
                step={0.01}
                className="admin-unit-econ-slider"
                value={averageCheck}
                onChange={(e) => setAverageCheck(Number(e.target.value))}
              />
            </div>

            {/* Margin Percent */}
            <div className="admin-unit-econ-field">
              <div className="admin-unit-econ-field-top">
                <label className="admin-unit-econ-label" htmlFor="unit-margin">
                  Маржинальность бизнеса (%)
                </label>
                <div className="admin-unit-econ-inline-val">{marginPercent}%</div>
              </div>
              <input
                  id="unit-margin"
                type="range"
                min={5}
                max={95}
                step={1}
                className="admin-unit-econ-slider"
                value={marginPercent}
                onChange={(e) => setMarginPercent(Number(e.target.value))}
              />
            </div>

            {/* Lead to Deal Conv % */}
            <div className="admin-unit-econ-field">
              <div className="admin-unit-econ-field-top">
                <label className="admin-unit-econ-label" htmlFor="unit-lead-conversion">
                  Конверсия лида в продажу (%)
                </label>
                <div className="admin-unit-econ-inline-val">{leadToDealPercent}%</div>
              </div>
              <input
                  id="unit-lead-conversion"
                type="range"
                min={1}
                max={90}
                step={0.5}
                className="admin-unit-econ-slider"
                value={leadToDealPercent}
                onChange={(e) => setLeadToDealPercent(Number(e.target.value))}
              />
              <span className="admin-unit-econ-hint">
                Эффективность отдела продаж: сколько лидов закрываются в оплату
              </span>
            </div>

            {/* Site Conversion % */}
            <div className="admin-unit-econ-field">
              <div className="admin-unit-econ-field-top">
                <label className="admin-unit-econ-label" htmlFor="unit-site-conversion">
                  Конверсия посадочной страницы (%)
                </label>
                <div className="admin-unit-econ-inline-val">{siteConvPercent}%</div>
              </div>
              <input
                  id="unit-site-conversion"
                type="range"
                min={0.5}
                max={20}
                step={0.1}
                className="admin-unit-econ-slider"
                value={siteConvPercent}
                onChange={(e) => setSiteConvPercent(Number(e.target.value))}
              />
              <span className="admin-unit-econ-hint">
                Доля посетителей с рекламы, оставивших заявку (Click → Lead)
              </span>
            </div>

            {/* CPC */}
            <div className="admin-unit-econ-field">
              <div className="admin-unit-econ-field-top">
                <label className="admin-unit-econ-label" htmlFor="unit-cpc">
                  Ожидаемая цена клика CPC ($)
                </label>
                <input
                  id="unit-cpc"
                  type="number"
                  min={0}
                  step={0.01}
                  className="admin-unit-econ-num-input"
                  value={cpc}
                  onChange={(e) => setCpc(Number(e.target.value) || 0)}
                />
              </div>
              <input
                aria-label="Ползунок: Ожидаемая цена клика CPC ($)"
                type="range"
                min={0}
                max={Math.max(50, cpc || 0)}
                step={0.01}
                className="admin-unit-econ-slider"
                value={cpc}
                onChange={(e) => setCpc(Number(e.target.value))}
              />
            </div>

            {/* Repeat Purchases (LTV multiplier) */}
            <div className="admin-unit-econ-field">
              <div className="admin-unit-econ-field-top">
                <label className="admin-unit-econ-label" htmlFor="unit-repeat-purchases">
                  Повторные покупки за жизненный цикл (LTV)
                </label>
                <div className="admin-unit-econ-inline-val">{repeatPurchases}x</div>
              </div>
              <input
                  id="unit-repeat-purchases"
                type="range"
                min={1}
                max={15}
                step={0.1}
                className="admin-unit-econ-slider"
                value={repeatPurchases}
                onChange={(e) => setRepeatPurchases(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Calculated Funnel & Economics */}
        {calculations ? <div className="admin-unit-econ-results">
          {/* KPI Dashboard Grid */}
          <div className="admin-unit-econ-kpi-grid">
            {/* Target Budget */}
            <div className="admin-unit-econ-kpi-card highlight">
              <div className="admin-unit-econ-kpi-top">
                <span className="admin-unit-econ-kpi-label">Бюджет рекламы</span>
                <DollarSign className="h-4 w-4 text-blue-400" />
              </div>
              <div className="admin-unit-econ-kpi-val text-blue-400">
                ${num(calculations.estimatedBudget)}
              </div>
              <span className="admin-unit-econ-kpi-sub">
                для достижения ${num(targetRevenue)}
              </span>
            </div>

            {/* Calculated CPL */}
            <div className="admin-unit-econ-kpi-card">
              <div className="admin-unit-econ-kpi-top">
                <span className="admin-unit-econ-kpi-label">Цена лида (CPL)</span>
                <Zap className="h-4 w-4 text-amber-400" />
              </div>
              <div className="admin-unit-econ-kpi-val text-amber-300">
                ${num(calculations.calculatedCpl)}
              </div>
              <span className="admin-unit-econ-kpi-sub">
                порог нуля: ${num(calculations.breakEvenCpl)}
              </span>
            </div>

            {/* Contribution after media spend */}
            <div className="admin-unit-econ-kpi-card">
              <div className="admin-unit-econ-kpi-top">
                <span className="admin-unit-econ-kpi-label">Прибыль после рекламы</span>
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              </div>
              <div
                className={`admin-unit-econ-kpi-val ${
                  calculations.isLoss ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                ${num(calculations.netProfit)}
              </div>
              <span className="admin-unit-econ-kpi-sub">
                ROMI: {calculations.romi}% (ROAS {calculations.roas}x) · до остальных расходов и налогов
              </span>
            </div>

            {/* LTV / CAC */}
            <div className="admin-unit-econ-kpi-card">
              <div className="admin-unit-econ-kpi-top">
                <span className="admin-unit-econ-kpi-label">LTV / CAC</span>
                <Percent className="h-4 w-4 text-purple-400" />
              </div>
              <div
                className={`admin-unit-econ-kpi-val ${
                  calculations.hasLtvHeadroom
                    ? 'text-purple-400'
                    : calculations.ltvCacRatio >= 1.5
                    ? 'text-amber-400'
                    : 'text-red-400'
                }`}
              >
                {calculations.ltvCacRatio}x
              </div>
              <span className="admin-unit-econ-kpi-sub">
                LTV: ${num(calculations.ltv)} | CAC: ${num(calculations.calculatedCac)}
              </span>
            </div>
          </div>

          {/* Funnel Cascade Steps */}
          <div className="admin-unit-econ-funnel-card">
            <h4 className="admin-unit-econ-funnel-title">
              Каскад воронки для плана ${num(targetRevenue)}
            </h4>

            <div className="admin-unit-econ-funnel-steps">
              <div className="admin-unit-econ-step">
                <div className="admin-unit-econ-step-badge">1. Клики</div>
                <div className="admin-unit-econ-step-val">
                  {num(calculations.clicksNeeded)}
                </div>
                <div className="admin-unit-econ-step-desc">по ${num(cpc)} за переход</div>
              </div>

              <div className="admin-unit-econ-step-arrow">
                <ArrowRight className="h-4 w-4 text-slate-500" />
                <span className="admin-unit-econ-conv-badge">{siteConvPercent}%</span>
              </div>

              <div className="admin-unit-econ-step">
                <div className="admin-unit-econ-step-badge">2. Лиды</div>
                <div className="admin-unit-econ-step-val text-amber-300">
                  {num(calculations.leadsNeeded)}
                </div>
                <div className="admin-unit-econ-step-desc">по ${num(calculations.calculatedCpl)}</div>
              </div>

              <div className="admin-unit-econ-step-arrow">
                <ArrowRight className="h-4 w-4 text-slate-500" />
                <span className="admin-unit-econ-conv-badge">{leadToDealPercent}%</span>
              </div>

              <div className="admin-unit-econ-step">
                <div className="admin-unit-econ-step-badge">3. Продажи</div>
                <div className="admin-unit-econ-step-val text-emerald-400">
                  {calculations.dealsNeeded}
                </div>
                <div className="admin-unit-econ-step-desc">по ${num(averageCheck)} чек</div>
              </div>
            </div>
          </div>

          {/* Diagnostic & Viability Advice */}
          <div
            className={`admin-unit-econ-advice-box ${
              calculations.isLoss
                ? 'danger'
                : !calculations.hasLtvHeadroom
                ? 'warning'
                : 'success'
            }`}
          >
            <div className="admin-unit-econ-advice-header">
              {calculations.isLoss ? (
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              ) : !calculations.hasLtvHeadroom ? (
                <HelpCircle className="h-5 w-5 text-amber-400 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              )}
              <div className="admin-unit-econ-advice-title">
                {calculations.isLoss
                  ? 'Экономика убыточна при текущих ставках'
                  : !calculations.hasLtvHeadroom
                  ? 'Пограничная зона эффективности'
                  : 'Отличная юнит-экономика для масштабирования'}
              </div>
            </div>

            <p className="admin-unit-econ-advice-desc">
              {calculations.isLoss ? (
                <>
                  В этом плане расходы на рекламу превышают валовую прибыль с первых покупок.
                  Порог безубыточности первой покупки — CPC ${num(calculations.breakEvenCpc)}.
                  Для запаса снижайте цену клика ниже этого порога или улучшайте конверсию и маржу.
                </>
              ) : !calculations.hasLtvHeadroom ? (
                <>
                  Кампания окупается, но соотношение LTV/CAC ({calculations.ltvCacRatio}x) не оставляет
                  запаса на колебания рекламных аукционов. Рекомендуется работать над повторными продажами
                  (Retention) или апсейлами.
                </>
              ) : (
                <>
                  Каждый вложенный в рекламу $1 приносит ${num(calculations.roas, 2)} выручки
                  и LTV клиента покрывает затраты на привлечение в {calculations.ltvCacRatio} раза.
                  Целевой ориентир для таргетолога в Ads Manager: CPL не выше ${num(calculations.targetCplForRomi150)} для ROMI 150%. Прогноз при текущих параметрах — ${num(calculations.calculatedCpl)}.
                </>
              )}
            </p>
          </div>
        </div> : <div className="admin-panel adm-card" role="status">
          <h3 className="admin-card-title">Укажите параметры для расчёта</h3>
          <p className="admin-subtitle">Выручка, средний чек и CPC должны быть положительными, проценты — больше 0 и не более 100, число покупок — не меньше 1. Расчёт появится после корректного ввода.</p>
        </div>}
      </div>
    </div>
  );
}
