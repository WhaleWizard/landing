import { useId } from 'react';
import { AdminDecimalInput } from './admin/AdminUI';
import type { CaseData, CaseMetric } from './hooks/useArticlesApi';

// Редактор структурированных полей кейса в админке.
// Показывается только для статей категории «Кейсы».
//
// Здесь остались только те поля, которые реально выводятся на сайте.
// Раньше форма просила ещё «Срок работы», «Бейдж тренда», «До → после» и
// «Точки графика»: их сохраняли в базу, но ни витрина /cases, ни страница
// кейса их не показывали — данные заполнялись впустую. Сами значения в базе
// не тронуты, поэтому вернуть поля можно в любой момент.
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

const inputCls = 'admin-control w-full px-3 py-2 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] text-[var(--adm-fg)] text-sm placeholder:text-[var(--adm-fg)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--adm-primary)]/50 transition-all';
const labelCls = 'block text-xs font-semibold mb-1 text-[var(--adm-fg)]/70';

export default function CaseFieldsEditor({ value, niches, onChange }: Props) {
  const data = value || {};
  const nicheListId = useId();

  const set = (patch: Partial<CaseData>) => onChange({ ...data, ...patch });

  const metrics: CaseMetric[] = [0, 1, 2].map((i) => data.metrics?.[i] || { value: '', label: '' });
  const setMetric = (index: number, patch: Partial<CaseMetric>) => {
    const next = metrics.map((m, i) => (i === index ? { ...m, ...patch } : m));
    set({ metrics: next.filter((m) => m.value.trim() || m.label.trim()) });
  };

  const toggleSource = (key: string) => {
    const current = new Set(data.sources || []);
    if (current.has(key)) current.delete(key); else current.add(key);
    set({ sources: current.size ? Array.from(current) : undefined });
  };

  return (
    <div className="admin-case-fields rounded-2xl border p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="inline-grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--adm-primary)] to-[#38bdf8] text-xs font-bold text-white">К</span>
        <div>
          <h4 className="text-base font-bold text-[var(--adm-fg)]">Карточка кейса для страницы /cases</h4>
          <p className="admin-meta">Все поля ниже видны посетителю: в фильтрах витрины, на карточке и в шапке кейса.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Ниша (выбери или впиши новую)</label>
          <input
            type="text"
            aria-label="Ниша кейса"
            list={nicheListId}
            value={data.niche || ''}
            onChange={(e) => set({ niche: e.target.value || undefined })}
            placeholder="E-commerce, Инфобизнес, Приложения…"
            className={inputCls}
          />
          <datalist id={nicheListId}>
            {niches.map((n) => <option key={n} value={n} />)}
          </datalist>
          <p className="admin-meta mt-1">Фильтр «Ниша» на витрине и подпись на карточке.</p>
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
          <p className="admin-meta mt-1">Фильтр «Канал» и цветные метки на карточке.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Бюджет (подпись)</label>
          <input aria-label="Бюджет, подпись" type="text" value={data.budgetLabel || ''} onChange={(e) => set({ budgetLabel: e.target.value || undefined })} placeholder="$1 млн+" className={inputCls} />
          <p className="admin-meta mt-1">Показатель «макс. бюджет» в шапке витрины.</p>
        </div>
        <div>
          <label className={labelCls}>Бюджет числом, $</label>
          <AdminDecimalInput aria-label="Бюджет числом в долларах" value={data.budgetValue ?? null} onValueChange={(value) => set({ budgetValue: value ?? undefined })} placeholder="1000000" className={inputCls} />
          <p className="admin-meta mt-1">Сортировка «Сначала крупный бюджет».</p>
        </div>
        <div>
          <label className={labelCls}>ROI числом, %</label>
          <AdminDecimalInput aria-label="ROI числом в процентах" value={data.roiValue ?? null} onValueChange={(value) => set({ roiValue: value ?? undefined })} placeholder="210" className={inputCls} />
          <p className="admin-meta mt-1">Сортировка «Сначала высокий ROI».</p>
        </div>
        <div>
          <label className={labelCls}>Лиды/покупки числом</label>
          <AdminDecimalInput aria-label="Количество лидов или покупок" value={data.leadsValue ?? null} onValueChange={(value) => set({ leadsValue: value ?? undefined })} placeholder="65000" className={inputCls} />
          <p className="admin-meta mt-1">Показатель «лидов / покупок» в шапке витрины.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Крупная цифра</label>
          <input aria-label="Крупная цифра карточки" type="text" value={data.headline || ''} onChange={(e) => set({ headline: e.target.value || undefined })} placeholder="65к+" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Подпись к цифре</label>
          <input aria-label="Подпись к крупной цифре" type="text" value={data.headlineLabel || ''} onChange={(e) => set({ headlineLabel: e.target.value || undefined })} placeholder="лидов за 4 года" className={inputCls} />
        </div>
      </div>
      <p className="admin-meta -mt-2">Пара выводится справа на карточке кейса. Пусто — возьмётся первая метрика ниже.</p>

      <div>
        <label className={labelCls}>Три метрики карточки (значение + подпись)</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {metrics.map((m, i) => (
            <div key={i} className="flex gap-1.5">
              <input aria-label={`Значение метрики ${i + 1}`} type="text" value={m.value} onChange={(e) => setMetric(i, { value: e.target.value })} placeholder={i === 0 ? '$1 млн+' : i === 1 ? '65к+' : '4 года'} className={inputCls} />
              <input aria-label={`Подпись метрики ${i + 1}`} type="text" value={m.label} onChange={(e) => setMetric(i, { label: e.target.value })} placeholder={i === 0 ? 'бюджет' : i === 1 ? 'лидов' : 'срок'} className={inputCls} />
            </div>
          ))}
        </div>
        <p className="admin-meta mt-1">Показываются на карточке в списке и блоком под заголовком самого кейса.</p>
      </div>

      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--adm-fg)]/85">
        <input
          type="checkbox"
          checked={data.featured === true}
          onChange={(e) => set({ featured: e.target.checked ? true : undefined })}
          className="h-4 w-4 accent-[var(--adm-primary)]"
        />
        Флагман — широкая карточка с меткой «Топ-кейс» и тремя метриками сразу
      </label>
    </div>
  );
}
