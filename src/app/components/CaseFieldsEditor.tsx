import { useId } from 'react';
import type { CaseData, CaseMetric } from './hooks/useArticlesApi';

// Редактор структурированных полей кейса в админке.
// Показывается только для статей категории «Кейсы».
type Props = {
  value?: CaseData;
  niches: string[];
  onChange: (next: CaseData) => void;
};

const SOURCE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'meta', label: 'Meta Ads' },
  { key: 'google', label: 'Google Ads' },
  { key: 'tiktok', label: 'TikTok' },
];

const inputCls = 'w-full px-3 py-2 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] text-sm placeholder:text-[var(--adm-fg)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all';
const labelCls = 'block text-xs font-medium mb-1 text-[var(--adm-fg)]/70';

function parsePoints(raw: string): number[] | undefined {
  const points = raw
    .split(/[,;\s]+/)
    .map((p) => Number(p.replace(',', '.')))
    .filter((n) => Number.isFinite(n))
    .slice(0, 24);
  return points.length >= 2 ? points : undefined;
}

function parseOptionalNumber(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const n = Number(raw.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export default function CaseFieldsEditor({ value, niches, onChange }: Props) {
  const data = value || {};
  const nicheListId = useId();

  const set = (patch: Partial<CaseData>) => onChange({ ...data, ...patch });

  const metrics: CaseMetric[] = [0, 1, 2].map((i) => data.metrics?.[i] || { value: '', label: '' });
  const setMetric = (index: number, patch: Partial<CaseMetric>) => {
    const next = metrics.map((m, i) => (i === index ? { ...m, ...patch } : m));
    set({ metrics: next.filter((m) => m.value.trim() || m.label.trim()) });
  };

  const ba = data.beforeAfter || { label: '', from: '', to: '', delta: '' };
  const setBa = (patch: Partial<typeof ba>) => {
    const next = { ...ba, ...patch };
    if (!next.label.trim() && !next.from.trim() && !next.to.trim()) {
      set({ beforeAfter: undefined });
    } else {
      set({ beforeAfter: next });
    }
  };

  const toggleSource = (key: string) => {
    const current = new Set(data.sources || []);
    if (current.has(key)) current.delete(key); else current.add(key);
    set({ sources: current.size ? Array.from(current) : undefined });
  };

  return (
    <div className="rounded-2xl border border-[var(--adm-primary)]/30 bg-[var(--adm-primary)]/5 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="inline-grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-[var(--adm-primary)] to-[#38bdf8] text-[11px] font-extrabold text-white">К</span>
        <h4 className="text-sm font-bold text-[var(--adm-fg)]">Карточка кейса для страницы /cases</h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Ниша (выбери или впиши новую)</label>
          <input
            type="text"
            list={nicheListId}
            value={data.niche || ''}
            onChange={(e) => set({ niche: e.target.value || undefined })}
            placeholder="E-commerce, Инфобизнес, Приложения…"
            className={inputCls}
          />
          <datalist id={nicheListId}>
            {niches.map((n) => <option key={n} value={n} />)}
          </datalist>
        </div>
        <div>
          <label className={labelCls}>Источники трафика</label>
          <div className="flex flex-wrap gap-2 pt-1">
            {SOURCE_OPTIONS.map((s) => (
              <label key={s.key} className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-[var(--adm-fg)]/85">
                <input
                  type="checkbox"
                  checked={(data.sources || []).includes(s.key)}
                  onChange={() => toggleSource(s.key)}
                  className="h-4 w-4 accent-[var(--adm-primary)]"
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Срок работы</label>
          <input type="text" value={data.period || ''} onChange={(e) => set({ period: e.target.value || undefined })} placeholder="4 года" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Бюджет (подпись)</label>
          <input type="text" value={data.budgetLabel || ''} onChange={(e) => set({ budgetLabel: e.target.value || undefined })} placeholder="$1 Млн+" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Бюджет числом, $</label>
          <input type="text" inputMode="numeric" value={data.budgetValue ?? ''} onChange={(e) => set({ budgetValue: parseOptionalNumber(e.target.value) })} placeholder="1000000" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>ROI числом, %</label>
          <input type="text" inputMode="numeric" value={data.roiValue ?? ''} onChange={(e) => set({ roiValue: parseOptionalNumber(e.target.value) })} placeholder="210" className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Лиды/покупки числом</label>
          <input type="text" inputMode="numeric" value={data.leadsValue ?? ''} onChange={(e) => set({ leadsValue: parseOptionalNumber(e.target.value) })} placeholder="65000" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Крупная цифра</label>
          <input type="text" value={data.headline || ''} onChange={(e) => set({ headline: e.target.value || undefined })} placeholder="65к+" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Подпись к цифре</label>
          <input type="text" value={data.headlineLabel || ''} onChange={(e) => set({ headlineLabel: e.target.value || undefined })} placeholder="лидов за 4 года" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Бейдж тренда</label>
          <input type="text" value={data.trend || ''} onChange={(e) => set({ trend: e.target.value || undefined })} placeholder="▲ +120% к году" className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Три метрики карточки (значение + подпись)</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {metrics.map((m, i) => (
            <div key={i} className="flex gap-1.5">
              <input type="text" value={m.value} onChange={(e) => setMetric(i, { value: e.target.value })} placeholder={i === 0 ? '$1 Млн+' : i === 1 ? '65к+' : '4 года'} className={inputCls} />
              <input type="text" value={m.label} onChange={(e) => setMetric(i, { label: e.target.value })} placeholder={i === 0 ? 'бюджет' : i === 1 ? 'лидов' : 'срок'} className={inputCls} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>До → после (метрика, было, стало, дельта — необязательно)</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input type="text" value={ba.label} onChange={(e) => setBa({ label: e.target.value })} placeholder="CPL" className={inputCls} />
          <input type="text" value={ba.from} onChange={(e) => setBa({ from: e.target.value })} placeholder="$12" className={inputCls} />
          <input type="text" value={ba.to} onChange={(e) => setBa({ to: e.target.value })} placeholder="$5" className={inputCls} />
          <input type="text" value={ba.delta || ''} onChange={(e) => setBa({ delta: e.target.value })} placeholder="−58%" className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <label className={labelCls}>Точки графика (числа через запятую; минимум 2, максимум 24)</label>
          <input
            type="text"
            defaultValue={(data.chartPoints || []).join(', ')}
            onBlur={(e) => set({ chartPoints: parsePoints(e.target.value) })}
            placeholder="18, 22, 21, 28, 31, 38, 45, 52"
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-[var(--adm-fg)]/50">Например, лиды по месяцам. Пусто — карточка будет без графика, только цифры.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 pb-5 text-sm text-[var(--adm-fg)]/85">
          <input
            type="checkbox"
            checked={data.featured === true}
            onChange={(e) => set({ featured: e.target.checked ? true : undefined })}
            className="h-4 w-4 accent-[var(--adm-primary)]"
          />
          Флагман (широкая карточка)
        </label>
      </div>
    </div>
  );
}
