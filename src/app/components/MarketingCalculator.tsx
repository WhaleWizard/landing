import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calculator,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  Globe2,
  Layers3,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  calculateFinancials,
  calculateForecast,
  calculateQuote,
  type BusinessModel,
  type CalculatorMode,
  type ForecastResult,
  type ScenarioId,
  type ServiceGoal,
} from '../calculator/engine';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

type MarketingCalculatorProps = {
  variant?: 'page' | 'dialog';
  initialMode?: CalculatorMode;
  onClose?: () => void;
};

type NumericInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
};

type CalculatorSelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
};

const modeOptions: Array<{
  id: CalculatorMode;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: 'forecast',
    label: 'Прогноз воронки',
    shortLabel: 'Прогноз',
    description: 'Три стресс-сценария по CPL или CPA и вашей экономике.',
  },
  {
    id: 'actual',
    label: 'Фактический ROMI',
    shortLabel: 'Факт',
    description: 'ROAS и полный ROMI с учётом всех маркетинговых расходов.',
  },
  {
    id: 'quote',
    label: 'Стоимость ведения',
    shortLabel: 'Ведение',
    description: 'Прозрачный ориентир по объёму площадок, рынков и аналитики.',
  },
];

const scenarioMeta: Record<ScenarioId, { label: string; tone: string }> = {
  conservative: { label: 'Осторожный', tone: 'border-amber-400/30 bg-amber-400/[0.06]' },
  base: { label: 'Базовый', tone: 'border-primary/40 bg-primary/[0.08]' },
  strong: { label: 'Сильный', tone: 'border-emerald-400/30 bg-emerald-400/[0.06]' },
};

const marketOptions = [
  { id: 'other', label: 'Выберите рынок / свои данные', currency: 'USD' },
  { id: 'kz', label: 'Казахстан', currency: 'KZT' },
  { id: 'uz', label: 'Узбекистан', currency: 'USD' },
  { id: 'kg', label: 'Кыргызстан', currency: 'USD' },
  { id: 'az', label: 'Азербайджан', currency: 'USD' },
  { id: 'am', label: 'Армения', currency: 'USD' },
  { id: 'ge', label: 'Грузия', currency: 'USD' },
  { id: 'ru', label: 'Россия', currency: 'RUB' },
];

const currencyOptions = ['USD', 'KZT', 'UZS', 'RUB', 'EUR', 'GEL', 'AMD', 'AZN', 'KGS'];

const parseNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const asNonNegative = (value: string) => Math.max(0, parseNumber(value) ?? 0);

function CalculatorSelect({
  id,
  label,
  value,
  onChange,
  options,
  className = '',
}: CalculatorSelectProps) {
  return (
    <div className={`block min-w-0 ${className}`}>
      <label id={`${id}-label`} htmlFor={id} className="mb-1.5 block text-xs font-medium leading-snug text-foreground/90">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          aria-labelledby={`${id}-label`}
          className="h-12 rounded-xl border-border/80 bg-background/70 px-3.5 text-sm font-medium text-foreground shadow-none transition hover:border-primary/40 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 data-[state=open]:border-primary data-[state=open]:ring-2 data-[state=open]:ring-primary/20"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          sideOffset={6}
          className="z-[1100] min-w-[var(--radix-select-trigger-width)] rounded-xl border-primary/25 bg-popover/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl"
        >
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="min-h-11 rounded-lg px-3 py-2 pr-9 text-sm font-medium text-foreground focus:bg-primary/15 focus:text-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumericInput({
  id,
  label,
  value,
  onChange,
  suffix,
  hint,
  min = 0,
  max,
  step = 'any',
  placeholder,
}: NumericInputProps) {
  const normalizeOnBlur = () => {
    if (!value.trim()) return;
    const parsed = parseNumber(value);
    if (parsed === null) {
      onChange('');
      return;
    }

    const clamped = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, parsed));
    const normalized = step === '1' ? String(Math.round(clamped)) : String(clamped);
    if (normalized !== value.replace(/\s/g, '').replace(',', '.')) onChange(normalized);
  };

  return (
    <label htmlFor={id} className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium leading-snug text-foreground/90">{label}</span>
      <span className="relative block">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={normalizeOnBlur}
          placeholder={placeholder}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-12 w-full rounded-xl border border-border/80 bg-background/70 px-3.5 pr-14 text-base tabular-nums outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </span>
      {hint && (
        <span id={`${id}-hint`} className="mt-1.5 block text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}

function FieldGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/35 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          {icon}
        </span>
        <h3 className="text-sm font-semibold sm:text-base">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  emphasis = false,
  positive,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
  positive?: boolean | null;
}) {
  const valueTone = positive === null || positive === undefined
    ? 'text-foreground'
    : positive
      ? 'text-emerald-400'
      : 'text-rose-400';

  return (
    <div className={`min-w-0 rounded-2xl border p-3.5 sm:p-4 ${
      emphasis
        ? 'border-primary/35 bg-gradient-to-br from-primary/15 via-primary/[0.05] to-accent/10'
        : 'border-border/70 bg-background/45'
    }`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words text-xl font-bold tabular-nums sm:text-2xl ${valueTone}`}>{value}</p>
      {note && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{note}</p>}
    </div>
  );
}

export default function MarketingCalculator({
  variant = 'page',
  initialMode = 'forecast',
  onClose,
}: MarketingCalculatorProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<CalculatorMode>(initialMode);
  const [businessModel, setBusinessModel] = useState<BusinessModel>('leadgen');
  const [scenarioId, setScenarioId] = useState<ScenarioId>('base');
  const [market, setMarket] = useState('other');
  const [currency, setCurrency] = useState('USD');
  const [periodDays, setPeriodDays] = useState('30');

  const [mediaSpend, setMediaSpend] = useState('1000');
  const [management, setManagement] = useState('600');
  const [creative, setCreative] = useState('200');
  const [tools, setTools] = useState('');
  const [feesAndTax, setFeesAndTax] = useState('');
  const [otherCosts, setOtherCosts] = useState('');
  const [costsConfirmed, setCostsConfirmed] = useState(false);

  const [acquisitionCost, setAcquisitionCost] = useState('');
  const [qualifiedRate, setQualifiedRate] = useState('');
  const [closeRate, setCloseRate] = useState('');
  const [averageOrderValue, setAverageOrderValue] = useState('');
  const [margin, setMargin] = useState('');

  const [actualRevenue, setActualRevenue] = useState('');
  const [actualOrders, setActualOrders] = useState('');

  const [googleSelected, setGoogleSelected] = useState(true);
  const [metaSelected, setMetaSelected] = useState(false);
  const [quoteMediaSpend, setQuoteMediaSpend] = useState('1000');
  const [goal, setGoal] = useState<ServiceGoal>('leads');
  const [marketCount, setMarketCount] = useState<1 | 2 | 3>(1);
  const [tracking, setTracking] = useState<'basic' | 'advanced'>('basic');
  const [creativeUnits, setCreativeUnits] = useState('4');
  const [firstMonth, setFirstMonth] = useState(true);

  const formatter = useMemo(() => {
    try {
      return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency,
        maximumFractionDigits: currency === 'UZS' ? 0 : 2,
      });
    } catch {
      return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
    }
  }, [currency]);

  const formatMoney = (value: number | null, forceCurrency?: string) => {
    if (value === null || !Number.isFinite(value)) return '—';
    if (forceCurrency) {
      return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: forceCurrency,
        maximumFractionDigits: 0,
      }).format(value);
    }
    return formatter.format(value);
  };
  const formatNumber = (value: number | null, digits = 0) => (
    value === null || !Number.isFinite(value)
      ? '—'
      : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value)
  );
  const formatRatio = (value: number | null) => (
    value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(2).replace('.', ',')}×`
  );
  const formatPercent = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return '—';
    const percent = value * 100;
    return `${percent > 0 ? '+' : ''}${percent.toFixed(1).replace('.', ',')}%`;
  };

  const sharedCosts = useMemo(() => ({
    mediaSpend: asNonNegative(mediaSpend),
    management: asNonNegative(management),
    creative: asNonNegative(creative),
    tools: asNonNegative(tools),
    feesAndTax: asNonNegative(feesAndTax),
    other: asNonNegative(otherCosts),
  }), [creative, feesAndTax, management, mediaSpend, otherCosts, tools]);

  const forecastIsReady = asNonNegative(mediaSpend) > 0
    && asNonNegative(acquisitionCost) > 0
    && asNonNegative(averageOrderValue) > 0
    && asNonNegative(margin) > 0
    && (businessModel === 'ecommerce'
      || (asNonNegative(qualifiedRate) > 0 && asNonNegative(closeRate) > 0));

  const forecasts = useMemo(() => (
    forecastIsReady
      ? calculateForecast({
          ...sharedCosts,
          businessModel,
          acquisitionCost: asNonNegative(acquisitionCost),
          qualifiedLeadRatePct: businessModel === 'leadgen' ? asNonNegative(qualifiedRate) : 100,
          closeRatePct: businessModel === 'leadgen' ? asNonNegative(closeRate) : 100,
          averageOrderValue: asNonNegative(averageOrderValue),
          contributionMarginPct: asNonNegative(margin),
        })
      : []
  ), [
    acquisitionCost,
    averageOrderValue,
    businessModel,
    closeRate,
    forecastIsReady,
    margin,
    qualifiedRate,
    sharedCosts,
  ]);

  const selectedForecast = forecasts.find((item) => item.id === scenarioId) ?? forecasts[1] ?? null;

  const ordersRevenue = asNonNegative(actualOrders) * asNonNegative(averageOrderValue);
  const enteredRevenue = parseNumber(actualRevenue);
  const revenueMismatch = enteredRevenue !== null
    && ordersRevenue > 0
    && Math.abs(enteredRevenue - ordersRevenue) / Math.max(enteredRevenue, ordersRevenue) > 0.02;
  const resolvedRevenue = enteredRevenue !== null ? Math.max(0, enteredRevenue) : ordersRevenue;
  const actualIsReady = sharedCosts.mediaSpend > 0
    && resolvedRevenue > 0
    && asNonNegative(margin) > 0
    && !revenueMismatch;

  const actualResult = useMemo(() => (
    actualIsReady
      ? calculateFinancials({
          ...sharedCosts,
          revenue: resolvedRevenue,
          contributionMarginPct: asNonNegative(margin),
          units: asNonNegative(actualOrders),
          averageOrderValue: asNonNegative(averageOrderValue),
        })
      : null
  ), [actualIsReady, actualOrders, averageOrderValue, margin, resolvedRevenue, sharedCosts]);

  const selectedPlatformCount = Number(googleSelected) + Number(metaSelected);
  const quoteIsReady = selectedPlatformCount > 0 && asNonNegative(quoteMediaSpend) > 0;
  const quoteResult = useMemo(() => (
    quoteIsReady
      ? calculateQuote({
          platformCount: selectedPlatformCount,
          monthlyAdBudget: asNonNegative(quoteMediaSpend),
          goal,
          marketCount,
          tracking,
          creativeUnits: asNonNegative(creativeUnits),
          firstMonth,
        })
      : null
  ), [
    creativeUnits,
    firstMonth,
    goal,
    marketCount,
    quoteMediaSpend,
    quoteIsReady,
    selectedPlatformCount,
    tracking,
  ]);

  const chooseMarket = (nextMarket: string) => {
    setMarket(nextMarket);
    const option = marketOptions.find((item) => item.id === nextMarket);
    if (option) setCurrency(option.currency);
  };

  const goToContact = () => {
    onClose?.();
    navigate('/');
    window.setTimeout(() => {
      document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
    }, 120);
  };

  const togglePlatform = (platform: 'google' | 'meta') => {
    if (platform === 'google') {
      if (googleSelected && !metaSelected) return;
      setGoogleSelected((selected) => !selected);
      return;
    }
    if (metaSelected && !googleSelected) return;
    setMetaSelected((selected) => !selected);
  };

  const renderCosts = () => (
    <details className="group rounded-2xl border border-border/70 bg-card/35" open={mode === 'actual'}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2.5 text-sm font-semibold sm:text-base">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Receipt className="h-4 w-4" />
          </span>
          Полная стоимость маркетинга
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="grid grid-cols-1 gap-3 border-t border-border/60 p-4 min-[440px]:grid-cols-2 sm:p-5">
        <NumericInput
          id={`${mode}-management`}
          label="Ведение"
          value={management}
          onChange={setManagement}
          suffix={currency}
        />
        <NumericInput
          id={`${mode}-creative`}
          label="Креативы и продакшн"
          value={creative}
          onChange={setCreative}
          suffix={currency}
        />
        <NumericInput
          id={`${mode}-tools`}
          label="Аналитика и сервисы"
          value={tools}
          onChange={setTools}
          suffix={currency}
          placeholder="неизвестно"
        />
        <NumericInput
          id={`${mode}-fees`}
          label="Невозмещаемые налоги и комиссии"
          value={feesAndTax}
          onChange={setFeesAndTax}
          suffix={currency}
          hint="Не добавляйте возмещаемый НДС как экономический расход."
          placeholder="неизвестно"
        />
        <div className="min-[440px]:col-span-2">
          <NumericInput
            id={`${mode}-other`}
            label="Прочие расходы периода"
            value={otherCosts}
            onChange={setOtherCosts}
            suffix={currency}
            placeholder="неизвестно"
          />
        </div>
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-background/45 p-3 min-[440px]:col-span-2">
          <input
            type="checkbox"
            checked={costsConfirmed}
            onChange={(event) => setCostsConfirmed(event.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-border accent-primary"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            Я включил все переменные расходы этого периода. Иначе ROMI будет помечен как предварительный.
          </span>
        </label>
      </div>
    </details>
  );

  const renderContext = () => (
    <FieldGroup title="Контекст расчёта" icon={<Globe2 className="h-4 w-4" />}>
      <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
        <CalculatorSelect
          id={`${mode}-market`}
          label="Основной рынок"
          value={market}
          onChange={chooseMarket}
          options={marketOptions.map((option) => ({ value: option.id, label: option.label }))}
        />
        <CalculatorSelect
          id={`${mode}-currency`}
          label="Валюта"
          value={currency}
          onChange={setCurrency}
          options={currencyOptions.map((option) => ({ value: option, label: option }))}
        />
        <CalculatorSelect
          id={`${mode}-period`}
          label="Период"
          value={periodDays}
          onChange={setPeriodDays}
          options={[
            { value: '30', label: '30 дней' },
            { value: '60', label: '60 дней' },
            { value: '90', label: '90 дней' },
          ]}
          className="min-[440px]:col-span-2"
        />
      </div>
      {market === 'ru' && (
        <div className="mt-3 flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-3 text-xs leading-relaxed text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          Для рекламодателей и таргетинга в России доступность Google Ads и Meta ограничена. Сначала проверьте юридическую и техническую возможность запуска — калькулятор её не подтверждает.
        </div>
      )}
    </FieldGroup>
  );

  const renderForecastForm = () => (
    <>
      {renderContext()}
      <FieldGroup title="Воронка и экономика" icon={<Layers3 className="h-4 w-4" />}>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {([
            ['leadgen', 'Заявки'],
            ['ecommerce', 'Продажи'],
          ] as Array<[BusinessModel, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setBusinessModel(id)}
              aria-pressed={businessModel === id}
              className={`min-h-11 rounded-xl border px-3 text-sm font-medium transition ${
                businessModel === id
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border/80 bg-background/45 text-muted-foreground hover:border-primary/40'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
          <NumericInput
            id="forecast-media"
            label={`Медиабюджет за ${periodDays} дней`}
            value={mediaSpend}
            onChange={setMediaSpend}
            suffix={currency}
            min={1}
          />
          <NumericInput
            id="forecast-acquisition"
            label={businessModel === 'leadgen' ? 'Базовый CPL' : 'Базовый CPA заказа'}
            value={acquisitionCost}
            onChange={setAcquisitionCost}
            suffix={currency}
            min={0.01}
            placeholder="по своим данным"
            hint="Осторожный и сильный сценарии проверят ±20% к этой цене."
          />
          {businessModel === 'leadgen' && (
            <>
              <NumericInput
                id="forecast-qualified"
                label="Квалифицированных лидов"
                value={qualifiedRate}
                onChange={setQualifiedRate}
                suffix="%"
                max={100}
                placeholder="например, 65"
              />
              <NumericInput
                id="forecast-close"
                label="Продажа из квалифицированного лида"
                value={closeRate}
                onChange={setCloseRate}
                suffix="%"
                max={100}
                placeholder="например, 20"
              />
            </>
          )}
          <NumericInput
            id="forecast-aov"
            label={businessModel === 'leadgen' ? 'Чистая выручка с клиента' : 'Чистый средний чек'}
            value={averageOrderValue}
            onChange={setAverageOrderValue}
            suffix={currency}
            placeholder="без косвенных налогов"
          />
          <NumericInput
            id="forecast-margin"
            label="Маржинальность до маркетинга"
            value={margin}
            onChange={setMargin}
            suffix="%"
            max={100}
            placeholder="не наценка"
          />
        </div>
      </FieldGroup>
      {renderCosts()}
    </>
  );

  const renderActualForm = () => (
    <>
      {renderContext()}
      <FieldGroup title="Факт за выбранный период" icon={<BarChart3 className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
          <NumericInput
            id="actual-media"
            label="Расход рекламных кабинетов"
            value={mediaSpend}
            onChange={setMediaSpend}
            suffix={currency}
            min={1}
          />
          <NumericInput
            id="actual-revenue"
            label="Атрибутированная чистая выручка"
            value={actualRevenue}
            onChange={setActualRevenue}
            suffix={currency}
            placeholder="или заказы × чек"
          />
          <NumericInput
            id="actual-orders"
            label="Оплаченных заказов"
            value={actualOrders}
            onChange={setActualOrders}
            step="1"
            placeholder="целое число"
          />
          <NumericInput
            id="actual-aov"
            label="Чистый средний чек"
            value={averageOrderValue}
            onChange={setAverageOrderValue}
            suffix={currency}
            hint="Нужен для расчёта через число заказов и точки безубыточности."
          />
          <div className="min-[440px]:col-span-2">
            <NumericInput
              id="actual-margin"
              label="Маржинальность до маркетинга"
              value={margin}
              onChange={setMargin}
              suffix="%"
              max={100}
              placeholder="выручка минус переменные затраты"
            />
          </div>
        </div>
        {revenueMismatch && (
          <div className="mt-3 flex gap-2 rounded-xl border border-rose-400/30 bg-rose-400/[0.07] p-3 text-xs leading-relaxed text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
            Выручка отличается от «заказы × средний чек» больше чем на 2%. Исправьте одно из значений, чтобы не считать по противоречивым данным.
          </div>
        )}
      </FieldGroup>
      {renderCosts()}
    </>
  );

  const renderQuoteForm = () => (
    <>
      <FieldGroup title="Площадки и бюджет" icon={<Wallet className="h-4 w-4" />}>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {([
            ['google', 'Google Ads', googleSelected],
            ['meta', 'Meta Ads', metaSelected],
          ] as const).map(([id, label, selected]) => (
            <button
              key={id}
              type="button"
              onClick={() => togglePlatform(id)}
              aria-pressed={selected}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition ${
                selected
                  ? 'border-primary bg-gradient-to-r from-primary/25 to-accent/20 text-white'
                  : 'border-border/80 bg-background/45 text-muted-foreground hover:border-primary/40'
              }`}
            >
              {selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
              {label}
            </button>
          ))}
        </div>
        <NumericInput
          id="quote-budget"
          label="Медиабюджет в месяц"
          value={quoteMediaSpend}
          onChange={setQuoteMediaSpend}
          suffix="USD"
          min={300}
          hint="Оплата рекламным площадкам не входит в стоимость ведения."
        />
      </FieldGroup>

      <FieldGroup title="Объём работы" icon={<Layers3 className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
          <CalculatorSelect
            id="quote-goal"
            label="Основная цель"
            value={goal}
            onChange={(nextValue) => setGoal(nextValue as ServiceGoal)}
            options={[
              { value: 'traffic', label: 'Трафик' },
              { value: 'leads', label: 'Заявки' },
              { value: 'sales', label: 'Продажи' },
            ]}
          />
          <CalculatorSelect
            id="quote-markets"
            label="Рынки или языки"
            value={String(marketCount)}
            onChange={(nextValue) => setMarketCount(Number(nextValue) as 1 | 2 | 3)}
            options={[
              { value: '1', label: 'Один' },
              { value: '2', label: 'Два' },
              { value: '3', label: 'Три и более' },
            ]}
          />
          <CalculatorSelect
            id="quote-tracking"
            label="Аналитика"
            value={tracking}
            onChange={(nextValue) => setTracking(nextValue as 'basic' | 'advanced')}
            options={[
              { value: 'basic', label: 'Базовая веб-аналитика' },
              { value: 'advanced', label: 'CRM / offline / CAPI / MMP' },
            ]}
          />
          <NumericInput
            id="quote-creatives"
            label="Креативных единиц в месяц"
            value={creativeUnits}
            onChange={setCreativeUnits}
            step="1"
            hint="До 4 ТЗ/адаптаций учтено в базе."
          />
        </div>
        <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-background/45 p-3">
          <input
            type="checkbox"
            checked={firstMonth}
            onChange={(event) => setFirstMonth(event.target.checked)}
            className="h-5 w-5 rounded border-border accent-primary"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            Первый месяц: аудит, структура, события и первичная сборка
          </span>
        </label>
      </FieldGroup>
    </>
  );

  const renderEmptyState = (copy: string) => (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/[0.04] p-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
        <Calculator className="h-7 w-7" />
      </span>
      <h3 className="mt-4 text-lg font-semibold">Заполните ключевые поля</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{copy}</p>
    </div>
  );

  const renderFinancialMetrics = (
    result: NonNullable<typeof actualResult> | ForecastResult,
    unitsLabel: string,
    units: number,
  ) => (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <MetricCard label="ROAS" value={formatRatio(result.roas)} emphasis note="выручка / медиабюджет" />
        <MetricCard
          label={costsConfirmed ? 'ROMI' : 'ROMI*'}
          value={formatPercent(result.romi)}
          emphasis
          positive={result.romi === null ? null : result.romi >= 0}
          note={costsConfirmed ? 'по полной инвестиции' : 'есть неподтверждённые расходы'}
        />
        <MetricCard label={unitsLabel} value={formatNumber(units, 1)} />
        <MetricCard label="Выручка" value={formatMoney(result.revenue)} />
      </div>
      <div className="mt-3 rounded-2xl border border-border/70 bg-background/45 p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div>
            <p className="text-muted-foreground">Вся инвестиция</p>
            <p className="mt-1 font-semibold tabular-nums">{formatMoney(result.marketingInvestment)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Вклад после маркетинга</p>
            <p className={`mt-1 font-semibold tabular-nums ${
              result.netContributionAfterMarketing >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {formatMoney(result.netContributionAfterMarketing)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Выручка безубыточности</p>
            <p className="mt-1 font-semibold tabular-nums">{formatMoney(result.breakEvenRevenue)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">ROAS безубыточности</p>
            <p className="mt-1 font-semibold tabular-nums">{formatRatio(result.breakEvenMediaRoas)}</p>
          </div>
        </div>
      </div>
      {!costsConfirmed && (
        <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3 text-[11px] leading-relaxed text-amber-100/85">
          * ROMI предварительный: пустые поля расходов считаются нулём. Подтвердите полноту расходов слева.
        </p>
      )}
    </>
  );

  const renderForecastResults = () => {
    if (!selectedForecast) {
      return renderEmptyState('Нужны бюджет, CPL/CPA, средний чек, маржинальность и — для заявок — квалификация с конверсией в продажу.');
    }

    return (
      <>
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Стресс-сценарии</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {forecasts.map((forecast) => (
              <button
                key={forecast.id}
                type="button"
                onClick={() => setScenarioId(forecast.id)}
                aria-pressed={scenarioId === forecast.id}
                className={`min-h-14 rounded-xl border px-2 py-2 text-left transition ${
                  scenarioId === forecast.id
                    ? scenarioMeta[forecast.id].tone
                    : 'border-border/70 bg-background/35 opacity-75 hover:opacity-100'
                }`}
              >
                <span className="block text-[10px] leading-tight text-muted-foreground">
                  {scenarioMeta[forecast.id].label}
                </span>
                <span className="mt-1 block text-xs font-semibold tabular-nums sm:text-sm">
                  {formatMoney(forecast.acquisitionCost)}
                </span>
              </button>
            ))}
          </div>
        </div>
        {renderFinancialMetrics(
          selectedForecast,
          businessModel === 'leadgen' ? 'Клиенты' : 'Заказы',
          selectedForecast.customers,
        )}
        {businessModel === 'leadgen' && (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <MetricCard label="Лиды" value={formatNumber(selectedForecast.leads, 1)} />
            <MetricCard
              label="Полный CAC"
              value={selectedForecast.customers > 0
                ? formatMoney(selectedForecast.marketingInvestment / selectedForecast.customers)
                : '—'}
            />
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Осторожный/сильный сценарии меняют цену привлечения на ±20%, а downstream-конверсии — на ±15%. Это стресс-тест, не доверительный интервал и не обещание результата.
        </p>
      </>
    );
  };

  const renderActualResults = () => {
    if (!actualResult) {
      return renderEmptyState('Нужны медиабюджет, чистая выручка или заказы × чек, а также маржинальность. Противоречивые значения нужно сверить.');
    }

    const actualUnits = asNonNegative(actualOrders);
    return (
      <>
        {renderFinancialMetrics(actualResult, 'Оплачено заказов', actualUnits)}
        {actualUnits > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <MetricCard
              label="Media CPA"
              value={formatMoney(actualResult.mediaSpend / actualUnits)}
            />
            <MetricCard
              label="Полный CAC"
              value={formatMoney(actualResult.marketingInvestment / actualUnits)}
            />
          </div>
        )}
      </>
    );
  };

  const renderQuoteResults = () => {
    if (!quoteResult) {
      return renderEmptyState('Выберите хотя бы одну площадку и укажите положительный рекламный бюджет.');
    }

    return (
      <>
        <div className="rounded-2xl border border-primary/35 bg-gradient-to-br from-primary/15 via-primary/[0.04] to-accent/10 p-5">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Ориентир за первый месяц
          </p>
          <p className="mt-2 text-4xl font-bold tabular-nums text-primary">
            {formatMoney(quoteResult.monthlyFee, 'USD')}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Медиабюджет оплачивается отдельно. Это оценка объёма, а не публичная оферта.
          </p>
        </div>
        <div className="mt-3 rounded-2xl border border-border/70 bg-background/45 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Из чего сложилось</p>
          <div className="space-y-2.5">
            {quoteResult.lineItems.map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-4 text-xs">
                <span className="leading-relaxed text-muted-foreground">{item.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{formatMoney(item.value, 'USD')}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-border/70 pt-4 text-sm">
            <span className="font-semibold">Ведение + медиабюджет</span>
            <span className="font-bold tabular-nums text-primary">
              {formatMoney(quoteResult.monthlyFee + asNonNegative(quoteMediaSpend), 'USD')}
            </span>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Надбавка за бюджет считается по частям диапазона, поэтому цена не скачет на порогах $5 000 и $10 000. Интеграции, съёмка и разработка оцениваются после аудита.
        </p>
      </>
    );
  };

  const currentMode = modeOptions.find((item) => item.id === mode) ?? modeOptions[0];

  return (
    <section
      id="calculator"
      className={`relative overflow-hidden ${
        variant === 'page' ? 'px-4 py-10 sm:px-6 md:py-16' : 'bg-background/20'
      }`}
    >
      {variant === 'page' && (
        <div className="pointer-events-none absolute left-1/2 top-48 h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-[120px]" />
      )}
      <div className="relative mx-auto max-w-7xl">
        {variant === 'page' && (
          <header className="mx-auto mb-7 max-w-3xl text-center md:mb-10">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary sm:text-sm">
              <Calculator className="h-4 w-4" />
              Медиаплан и экономика
            </div>
            <h1 className="text-balance text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
              Считайте не клики, а{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                деньги после маркетинга
              </span>
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              Прогноз воронки, фактические ROAS и ROMI, точка безубыточности и прозрачный ориентир по стоимости ведения — в одном расчёте.
            </p>
          </header>
        )}

        <div className={`overflow-hidden border border-primary/20 bg-card/55 shadow-2xl shadow-primary/[0.07] backdrop-blur-xl ${
          variant === 'page' ? 'rounded-3xl' : 'sm:rounded-2xl'
        }`}>
          <div className="border-b border-border/70 p-3 sm:p-4">
            <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-background/55 p-1.5">
              {modeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMode(option.id)}
                  aria-pressed={mode === option.id}
                  className={`min-h-12 rounded-xl px-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${
                    mode === option.id
                      ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/20'
                      : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground'
                  }`}
                >
                  <span className="sm:hidden">{option.shortLabel}</span>
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2.5 px-1 text-center text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
              {currentMode.description}
            </p>
          </div>

          <div className="grid items-start lg:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-3 border-border/70 p-3 sm:p-5 lg:border-r lg:p-6">
              {mode === 'forecast' && renderForecastForm()}
              {mode === 'actual' && renderActualForm()}
              {mode === 'quote' && renderQuoteForm()}
            </div>

            <aside className="border-t border-border/70 bg-background/20 p-3 sm:p-5 lg:sticky lg:top-20 lg:border-t-0 lg:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.09em] text-muted-foreground">
                    {mode === 'quote' ? 'Оценка работы' : `Результат за ${periodDays} дней`}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold sm:text-xl">
                    {mode === 'forecast' ? scenarioMeta[scenarioId].label : mode === 'actual' ? 'Фактическая экономика' : 'Предварительная смета'}
                  </h2>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                  {mode === 'quote' ? <CircleDollarSign className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
                </span>
              </div>
              <div aria-live="polite">
                {mode === 'forecast' && renderForecastResults()}
                {mode === 'actual' && renderActualResults()}
                {mode === 'quote' && renderQuoteResults()}
              </div>

              <button
                type="button"
                onClick={goToContact}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-4 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:opacity-90"
              >
                Обсудить расчёт
                <ArrowRight className="h-4 w-4" />
              </button>

              {variant === 'dialog' && (
                <button
                  type="button"
                  onClick={() => {
                    onClose?.();
                    navigate(mode === 'actual' ? '/roi-calculator' : '/calculator');
                  }}
                  className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/25 px-4 text-xs font-semibold text-primary hover:bg-primary/10"
                >
                  Открыть полный расчёт
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}
            </aside>
          </div>

          <div className="border-t border-border/70 bg-background/30 p-4 text-[11px] leading-relaxed text-muted-foreground sm:px-6">
            <div>
              <p>
                <strong className="text-foreground/85">Формулы:</strong> ROAS = выручка / медиабюджет. ROMI = (маржинальный доход − все расходы маркетинга) / все расходы маркетинга.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
