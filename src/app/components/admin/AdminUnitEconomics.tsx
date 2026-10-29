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

export default function AdminUnitEconomics() {
  // Model parameters
  const [targetRevenue, setTargetRevenue] = useState<number>(10000);
  const [averageCheck, setAverageCheck] = useState<number>(1200);
  const [marginPercent, setMarginPercent] = useState<number>(65);
  const [leadToDealPercent, setLeadToDealPercent] = useState<number>(18);
  const [siteConvPercent, setSiteConvPercent] = useState<number>(4.0);
  const [cpc, setCpc] = useState<number>(1.2);
  const [repeatPurchases, setRepeatPurchases] = useState<number>(5.5);

  // Scenario management
  const [activePreset, setActivePreset] = useState<string>('b2b_service');
  const [scenarioName, setScenarioName] = useState<string>('Базовый план');

  // Load saved state
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ww_unit_economics_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.targetRevenue) setTargetRevenue(parsed.targetRevenue);
        if (parsed.averageCheck) setAverageCheck(parsed.averageCheck);
        if (parsed.marginPercent) setMarginPercent(parsed.marginPercent);
        if (parsed.leadToDealPercent) setLeadToDealPercent(parsed.leadToDealPercent);
        if (parsed.siteConvPercent) setSiteConvPercent(parsed.siteConvPercent);
        if (parsed.cpc) setCpc(parsed.cpc);
        if (parsed.repeatPurchases) setRepeatPurchases(parsed.repeatPurchases);
        if (parsed.activePreset) setActivePreset(parsed.activePreset);
        if (parsed.scenarioName) setScenarioName(parsed.scenarioName);
      }
    } catch {
      // ignore
    }
  }, []);

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

  // Calculations
  const calculations = useMemo(() => {
    const safeCheck = Math.max(averageCheck, 1);
    const safeMargin = Math.max(marginPercent, 1) / 100;
    const safeLeadDealRate = Math.max(leadToDealPercent, 0.1) / 100;
    const safeSiteConv = Math.max(siteConvPercent, 0.1) / 100;
    const safeCpc = Math.max(cpc, 0.01);
    const safeRepeats = Math.max(repeatPurchases, 1);

    // 1. Sales required
    const dealsNeeded = Math.ceil(targetRevenue / safeCheck);

    // 2. Leads required
    const leadsNeeded = Math.ceil(dealsNeeded / safeLeadDealRate);

    // 3. Traffic required
    const clicksNeeded = Math.ceil(leadsNeeded / safeSiteConv);

    // 4. Advertising budget
    const estimatedBudget = Math.round(clicksNeeded * safeCpc);

    // 5. CPL & CAC
    const calculatedCpl = Number((safeCpc / safeSiteConv).toFixed(2));
    const calculatedCac = Number((calculatedCpl / safeLeadDealRate).toFixed(2));

    // 6. Revenue & Gross Profit
    const actualRevenue = dealsNeeded * safeCheck;
    const grossProfit = Math.round(actualRevenue * safeMargin);

    // 7. Net Profit & ROMI
    const netProfit = grossProfit - estimatedBudget;
    const romi = estimatedBudget > 0 ? Math.round(((netProfit) / estimatedBudget) * 100) : 0;
    const roas = estimatedBudget > 0 ? Number((actualRevenue / estimatedBudget).toFixed(2)) : 0;

    // 8. Unit Economics & LTV
    const grossProfitPerDeal = safeCheck * safeMargin;
    const ltv = Math.round(grossProfitPerDeal * safeRepeats);
    const ltvCacRatio = calculatedCac > 0 ? Number((ltv / calculatedCac).toFixed(1)) : 0;

    // 9. Break-even thresholds
    // Break-even CAC: gross profit per single purchase
    const breakEvenCac = Math.round(grossProfitPerDeal);
    const breakEvenCpl = Number((breakEvenCac * safeLeadDealRate).toFixed(2));
    // Target CPL at ROMI 150%
    const targetCplForRomi150 = Number((breakEvenCpl / 2.5).toFixed(2));

    return {
      dealsNeeded,
      leadsNeeded,
      clicksNeeded,
      estimatedBudget,
      calculatedCpl,
      calculatedCac,
      actualRevenue,
      grossProfit,
      netProfit,
      romi,
      roas,
      ltv,
      ltvCacRatio,
      breakEvenCac,
      breakEvenCpl,
      targetCplForRomi150,
    };
  }, [
    targetRevenue,
    averageCheck,
    marginPercent,
    leadToDealPercent,
    siteConvPercent,
    cpc,
    repeatPurchases,
  ]);

  // Copy proposal summary
  const handleCopySummary = async () => {
    let report = `📊 МЕДИАПЛАН И РАСЧЕТ ЮНИТ-ЭКОНОМИКИ (${scenarioName})\n`;
    report += `--------------------------------------------------\n`;
    report += `🎯 Целевая выручка: $${targetRevenue.toLocaleString('en-US')}\n`;
    report += `📦 Средний чек: $${averageCheck} | Маржинальность: ${marginPercent}%\n`;
    report += `🤝 Конверсия лида в сделку: ${leadToDealPercent}%\n`;
    report += `🌐 Конверсия сайта: ${siteConvPercent}% | Средний CPC: $${cpc}\n\n`;

    report += `📈 ВОРОНКА И НЕОБХОДИМЫЕ РЕСУРСЫ:\n`;
    report += `• Продаж необходимо: ${calculations.dealsNeeded} шт.\n`;
    report += `• Лидов необходимо: ${calculations.leadsNeeded} шт.\n`;
    report += `• Переходов на сайт: ${calculations.clicksNeeded.toLocaleString('en-US')} кликов\n`;
    report += `• Рекомендуемый рекламный бюджет: $${calculations.estimatedBudget.toLocaleString('en-US')}\n\n`;

    report += `💰 ЭКОНОМИКА И ОКУПАЕМОСТЬ:\n`;
    report += `• Прогнозируемый CPL (цена лида): $${calculations.calculatedCpl}\n`;
    report += `• Предельный CPL безубыточности: $${calculations.breakEvenCpl}\n`;
    report += `• Стоимость привлечения клиента (CAC): $${calculations.calculatedCac}\n`;
    report += `• Валовая прибыль: $${calculations.grossProfit.toLocaleString('en-US')}\n`;
    report += `• Чистая прибыль с учетом рекламы: $${calculations.netProfit.toLocaleString('en-US')}\n`;
    report += `• Ожидаемый ROMI: ${calculations.romi}%\n`;
    report += `• LTV / CAC соотношение: ${calculations.ltvCacRatio}x (LTV = $${calculations.ltv})\n\n`;

    report += `💡 ВЫВОД: ${
      calculations.ltvCacRatio >= 3.0
        ? 'Модель устойчива и масштабируема. Экономика сходится с запасом.'
        : 'Внимание: высокий риск при масштабировании. Рекомендуется поднять конверсию отдела продаж или средний чек.'
    }\n`;

    try {
      await navigator.clipboard.writeText(report);
      notify.success('Медиаплан скопирован в буфер обмена');
    } catch {
      notify.error('Не удалось скопировать медиаплан');
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
              <span className="admin-unit-econ-pill">Unit Economics Pro</span>
              <span className="admin-unit-econ-badge-sub">Медиапланирование & Воронка</span>
            </div>
            <h2 className="admin-unit-econ-heading">Калькулятор юнит-экономики и CPL</h2>
          </div>
        </div>

        <div className="admin-unit-econ-actions">
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={handleCopySummary}
            title="Скопировать готовый медиаплан для КП или отчета"
          >
            <Copy className="h-4 w-4 mr-1.5" />
            Копировать план
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={handleReset}
            title="Сбросить к базовому сценарию"
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Сброс
          </button>
        </div>
      </div>

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
            <h3 className="admin-unit-econ-card-title">Параметры экономики и воронки</h3>
          </div>

          <div className="admin-unit-econ-inputs">
            {/* Target Revenue */}
            <div className="admin-unit-econ-field">
              <div className="admin-unit-econ-field-top">
                <label className="admin-unit-econ-label">
                  Целевая выручка в месяц ($)
                </label>
                <input
                  type="number"
                  min={500}
                  step={500}
                  className="admin-unit-econ-num-input"
                  value={targetRevenue}
                  onChange={(e) => setTargetRevenue(Number(e.target.value) || 0)}
                />
              </div>
              <input
                type="range"
                min={1000}
                max={100000}
                step={1000}
                className="admin-unit-econ-slider"
                value={targetRevenue}
                onChange={(e) => setTargetRevenue(Number(e.target.value))}
              />
            </div>

            {/* Average Check */}
            <div className="admin-unit-econ-field">
              <div className="admin-unit-econ-field-top">
                <label className="admin-unit-econ-label">
                  Средний чек одной покупки ($)
                </label>
                <input
                  type="number"
                  min={10}
                  step={10}
                  className="admin-unit-econ-num-input"
                  value={averageCheck}
                  onChange={(e) => setAverageCheck(Number(e.target.value) || 0)}
                />
              </div>
              <input
                type="range"
                min={20}
                max={10000}
                step={50}
                className="admin-unit-econ-slider"
                value={averageCheck}
                onChange={(e) => setAverageCheck(Number(e.target.value))}
              />
            </div>

            {/* Margin Percent */}
            <div className="admin-unit-econ-field">
              <div className="admin-unit-econ-field-top">
                <label className="admin-unit-econ-label">
                  Маржинальность бизнеса (%)
                </label>
                <div className="admin-unit-econ-inline-val">{marginPercent}%</div>
              </div>
              <input
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
                <label className="admin-unit-econ-label">
                  Конверсия лида в продажу (%)
                </label>
                <div className="admin-unit-econ-inline-val">{leadToDealPercent}%</div>
              </div>
              <input
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
                <label className="admin-unit-econ-label">
                  Конверсия посадочной страницы (%)
                </label>
                <div className="admin-unit-econ-inline-val">{siteConvPercent}%</div>
              </div>
              <input
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
                <label className="admin-unit-econ-label">
                  Ожидаемая цена клика CPC ($)
                </label>
                <input
                  type="number"
                  min={0.05}
                  max={50}
                  step={0.05}
                  className="admin-unit-econ-num-input"
                  value={cpc}
                  onChange={(e) => setCpc(Number(e.target.value) || 0)}
                />
              </div>
              <input
                type="range"
                min={0.1}
                max={10}
                step={0.05}
                className="admin-unit-econ-slider"
                value={cpc}
                onChange={(e) => setCpc(Number(e.target.value))}
              />
            </div>

            {/* Repeat Purchases (LTV multiplier) */}
            <div className="admin-unit-econ-field">
              <div className="admin-unit-econ-field-top">
                <label className="admin-unit-econ-label">
                  Повторные покупки за жизненный цикл (LTV)
                </label>
                <div className="admin-unit-econ-inline-val">{repeatPurchases}x</div>
              </div>
              <input
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
        <div className="admin-unit-econ-results">
          {/* KPI Dashboard Grid */}
          <div className="admin-unit-econ-kpi-grid">
            {/* Target Budget */}
            <div className="admin-unit-econ-kpi-card highlight">
              <div className="admin-unit-econ-kpi-top">
                <span className="admin-unit-econ-kpi-label">Бюджет рекламы</span>
                <DollarSign className="h-4 w-4 text-blue-400" />
              </div>
              <div className="admin-unit-econ-kpi-val text-blue-400">
                ${calculations.estimatedBudget.toLocaleString('en-US')}
              </div>
              <span className="admin-unit-econ-kpi-sub">
                для достижения ${targetRevenue.toLocaleString('en-US')}
              </span>
            </div>

            {/* Calculated CPL */}
            <div className="admin-unit-econ-kpi-card">
              <div className="admin-unit-econ-kpi-top">
                <span className="admin-unit-econ-kpi-label">Цена лида (CPL)</span>
                <Zap className="h-4 w-4 text-amber-400" />
              </div>
              <div className="admin-unit-econ-kpi-val text-amber-300">
                ${calculations.calculatedCpl}
              </div>
              <span className="admin-unit-econ-kpi-sub">
                порог нуля: ${calculations.breakEvenCpl}
              </span>
            </div>

            {/* Net Profit */}
            <div className="admin-unit-econ-kpi-card">
              <div className="admin-unit-econ-kpi-top">
                <span className="admin-unit-econ-kpi-label">Чистая прибыль</span>
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              </div>
              <div
                className={`admin-unit-econ-kpi-val ${
                  calculations.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                ${calculations.netProfit.toLocaleString('en-US')}
              </div>
              <span className="admin-unit-econ-kpi-sub">
                ROMI: {calculations.romi}% (ROAS {calculations.roas}x)
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
                  calculations.ltvCacRatio >= 3.0
                    ? 'text-purple-400'
                    : calculations.ltvCacRatio >= 1.5
                    ? 'text-amber-400'
                    : 'text-red-400'
                }`}
              >
                {calculations.ltvCacRatio}x
              </div>
              <span className="admin-unit-econ-kpi-sub">
                LTV: ${calculations.ltv} | CAC: ${calculations.calculatedCac}
              </span>
            </div>
          </div>

          {/* Funnel Cascade Steps */}
          <div className="admin-unit-econ-funnel-card">
            <h4 className="admin-unit-econ-funnel-title">
              Каскад воронки для плана ${targetRevenue.toLocaleString('en-US')}
            </h4>

            <div className="admin-unit-econ-funnel-steps">
              <div className="admin-unit-econ-step">
                <div className="admin-unit-econ-step-badge">1. Клики</div>
                <div className="admin-unit-econ-step-val">
                  {calculations.clicksNeeded.toLocaleString('en-US')}
                </div>
                <div className="admin-unit-econ-step-desc">по ${cpc} за переход</div>
              </div>

              <div className="admin-unit-econ-step-arrow">
                <ArrowRight className="h-4 w-4 text-slate-500" />
                <span className="admin-unit-econ-conv-badge">{siteConvPercent}%</span>
              </div>

              <div className="admin-unit-econ-step">
                <div className="admin-unit-econ-step-badge">2. Лиды</div>
                <div className="admin-unit-econ-step-val text-amber-300">
                  {calculations.leadsNeeded.toLocaleString('en-US')}
                </div>
                <div className="admin-unit-econ-step-desc">по ${calculations.calculatedCpl}</div>
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
                <div className="admin-unit-econ-step-desc">по ${averageCheck} чек</div>
              </div>
            </div>
          </div>

          {/* Diagnostic & Viability Advice */}
          <div
            className={`admin-unit-econ-advice-box ${
              calculations.netProfit < 0
                ? 'danger'
                : calculations.ltvCacRatio < 2.0
                ? 'warning'
                : 'success'
            }`}
          >
            <div className="admin-unit-econ-advice-header">
              {calculations.netProfit < 0 ? (
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              ) : calculations.ltvCacRatio < 2.0 ? (
                <HelpCircle className="h-5 w-5 text-amber-400 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              )}
              <div className="admin-unit-econ-advice-title">
                {calculations.netProfit < 0
                  ? 'Экономика убыточна при текущих ставках'
                  : calculations.ltvCacRatio < 2.0
                  ? 'Пограничная зона эффективности'
                  : 'Отличная юнит-экономика для масштабирования'}
              </div>
            </div>

            <p className="admin-unit-econ-advice-desc">
              {calculations.netProfit < 0 ? (
                <>
                  При цене клика ${cpc} стоимость привлечения продажи (${calculations.calculatedCac})
                  превышает валовую прибыль (${Math.round(averageCheck * (marginPercent / 100))}).
                  Чтобы выйти в плюс: снизьте CPC до ${ (cpc * 0.7).toFixed(2) }, поднимите конверсию
                  сайта до { (siteConvPercent * 1.5).toFixed(1) }% или увеличьте конверсию отдела продаж.
                </>
              ) : calculations.ltvCacRatio < 2.0 ? (
                <>
                  Кампания окупается, но соотношение LTV/CAC ({calculations.ltvCacRatio}x) не оставляет
                  запаса на колебания рекламных аукционов. Рекомендуется работать над повторными продажами
                  (Retention) или апсейлами.
                </>
              ) : (
                <>
                  Каждый вложенный в рекламу $1 приносит ${(calculations.actualRevenue / calculations.estimatedBudget).toFixed(2)} выручки
                  и LTV клиента покрывает затраты на привлечение в {calculations.ltvCacRatio} раза.
                  Целевой ориентир для таргетолога в Ads Manager: удерживать CPL в пределах ${calculations.targetCplForRomi150} - ${calculations.calculatedCpl}.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
