import { useMemo, useState } from 'react';
import type { Article } from '../hooks/useArticlesApi';
import { AdminButton, AdminSelect } from './AdminUI';
import { notify, useConfirm } from './AdminFeedback';
import { ownerTomorrow, planSchedule, type ScheduledItem } from '../../utils/publishSchedule';
import { plural, withPlural } from '../../utils/plural';

/**
 * Расписание публикаций.
 *
 * Владелец пишет статьи пачкой и хочет, чтобы они выходили сами: несколько
 * в день, в случайное время рабочего дня. Панель берёт черновики (и уже
 * запланированные — их можно перераспределить), раскладывает их по дням и
 * сохраняет одним запросом. Сохраняется только статус и дата выхода, текст
 * статей не трогается. До даты выхода статья на сайте не видна, после —
 * появляется сама, без пересборки.
 *
 * Время — по Ташкенту. Ритм по умолчанию — две статьи в день: всплеск из
 * десятков материалов за день на молодом сайте выглядит как массовая
 * генерация.
 */
const PROTECTED_ARTICLE_SLUG = 'kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh';
const HOURS = Array.from({ length: 25 }, (_, hour) => ({ value: String(hour), label: `${String(hour).padStart(2, '0')}:00` }));

function isSchedulable(article: Article, nowIso: string): boolean {
  if (article.slug === PROTECTED_ARTICLE_SLUG) return false;
  return article.status === 'draft' || Boolean(article.publishedAt && article.publishedAt > nowIso);
}

function formatLocal(item: ScheduledItem): string {
  const [year, month, day] = item.localDate.split('-');
  return `${day}.${month}.${year} ${item.localTime}`;
}

function describeState(article: Article): string {
  if (article.status === 'draft') return 'черновик';
  const at = article.publishedAt ? new Date(article.publishedAt) : null;
  return at
    ? `запланирована на ${at.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
    : 'запланирована';
}

export default function PublishSchedulePanel({
  articles,
  onSchedule,
}: {
  articles: Article[];
  onSchedule: (items: Array<{ slug: string; publishedAt: string }>) => Promise<{ scheduled: string[]; skipped: string[] }>;
}) {
  const confirmDialog = useConfirm();
  const nowIso = useMemo(() => new Date().toISOString(), [articles]);
  const candidates = useMemo(
    () => articles.filter((article) => isSchedulable(article, nowIso)),
    [articles, nowIso],
  );
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set());
  const [startDate, setStartDate] = useState(() => ownerTomorrow());
  const [days, setDays] = useState(21);
  const [perDay, setPerDay] = useState(2);
  const [fromHour, setFromHour] = useState(9);
  const [toHour, setToHour] = useState(21);
  const [shuffle, setShuffle] = useState(true);
  const [plan, setPlan] = useState<ScheduledItem[] | null>(null);
  const [overflow, setOverflow] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const selected = candidates.filter((article) => !unchecked.has(article.slug));
  const titleBySlug = useMemo(() => new Map(articles.map((article) => [article.slug, article.title])), [articles]);

  const resetPlan = () => { setPlan(null); setOverflow([]); };
  const toggle = (slug: string) => {
    setUnchecked((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
    resetPlan();
  };

  const buildPlan = () => {
    const result = planSchedule(selected.map((article) => article.slug), { startDate, days, perDay, fromHour, toHour, shuffle });
    if (result.error) {
      notify.error('Расписание не собрать', result.error);
      resetPlan();
      return;
    }
    setPlan(result.items);
    setOverflow(result.overflow);
  };

  const savePlan = async () => {
    if (!plan || plan.length === 0) return;
    const first = plan.reduce((a, b) => (a.publishedAt < b.publishedAt ? a : b));
    const last = plan.reduce((a, b) => (a.publishedAt > b.publishedAt ? a : b));
    const confirmed = await confirmDialog({
      title: `Запланировать ${withPlural(plan.length, ['статью', 'статьи', 'статей'])}?`,
      description: `Первая выйдет ${formatLocal(first)}, последняя — ${formatLocal(last)} (время ташкентское). До своей даты статья на сайте не видна. Текст статей не меняется.`,
      confirmLabel: 'Запланировать',
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      const scheduled: string[] = [];
      const skipped: string[] = [];
      // Сервер принимает до двухсот за раз — больше за одну раскладку обычно не бывает.
      for (let offset = 0; offset < plan.length; offset += 200) {
        const result = await onSchedule(plan.slice(offset, offset + 200).map(({ slug, publishedAt }) => ({ slug, publishedAt })));
        scheduled.push(...result.scheduled);
        skipped.push(...result.skipped);
      }
      if (skipped.length > 0) {
        notify.error(
          `Запланировано: ${scheduled.length}, пропущено: ${skipped.length}`,
          'Пропущены уже вышедшие статьи: их дату публикации не сдвигают.',
        );
      } else {
        notify.success(`Запланировано: ${withPlural(scheduled.length, ['статья', 'статьи', 'статей'])}`, 'Выйдут сами в назначенное время.');
      }
      resetPlan();
    } catch (error) {
      notify.error('Расписание не сохранилось', error instanceof Error ? error.message : 'Неизвестная ошибка');
    } finally {
      setSaving(false);
    }
  };

  if (candidates.length === 0) {
    return (
      <p className="admin-meta">
        Планировать нечего: черновиков нет. Сохраните статьи черновиками — они появятся здесь, и их можно будет разложить по дням.
      </p>
    );
  }

  const byDay = plan
    ? [...plan].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    : [];

  return (
    <div className="space-y-3">
      <p className="admin-meta">
        Выберите статьи и ритм — панель разложит их по дням в случайное время. Время ташкентское.
      </p>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span>Выбрано {selected.length} из {candidates.length}</span>
        <span className="flex gap-3">
          <button type="button" className="text-[var(--adm-primary)]" onClick={() => { setUnchecked(new Set()); resetPlan(); }}>Все</button>
          <button type="button" className="text-[var(--adm-primary)]" onClick={() => { setUnchecked(new Set(candidates.map((a) => a.slug))); resetPlan(); }}>Ни одной</button>
        </span>
      </div>
      <div className="max-h-48 space-y-1 overflow-y-auto scrollbar-brand">
        {candidates.map((article) => (
          <label key={article.slug} className="admin-field admin-field--check">
            <input type="checkbox" checked={!unchecked.has(article.slug)} onChange={() => toggle(article.slug)} />
            <span className="min-w-0">
              <span className="block truncate">{article.title || article.slug}</span>
              <span className="admin-meta">{describeState(article)}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="admin-form-grid">
        <label className="admin-field">
          <span className="admin-label">Начать с</span>
          <input className="admin-input" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); resetPlan(); }} />
        </label>
        <label className="admin-field">
          <span className="admin-label">Дней</span>
          <input className="admin-input" type="number" min={1} max={366} value={days} onChange={(event) => { setDays(Number(event.target.value) || 0); resetPlan(); }} />
        </label>
        <label className="admin-field">
          <span className="admin-label">Статей в день</span>
          <input className="admin-input" type="number" min={1} max={12} value={perDay} onChange={(event) => { setPerDay(Number(event.target.value) || 0); resetPlan(); }} />
        </label>
        <AdminSelect label="С" value={String(fromHour)} options={HOURS.slice(0, 24)} onValueChange={(value) => { setFromHour(Number(value)); resetPlan(); }} />
        <AdminSelect label="До" value={String(toHour)} options={HOURS.slice(1)} onValueChange={(value) => { setToHour(Number(value)); resetPlan(); }} />
        <label className="admin-field admin-field--check">
          <input type="checkbox" checked={shuffle} onChange={(event) => { setShuffle(event.target.checked); resetPlan(); }} />
          <span>Случайный порядок статей</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <AdminButton onClick={buildPlan} disabled={selected.length === 0 || saving}>Разложить</AdminButton>
        {plan && plan.length > 0 && (
          <AdminButton tone="primary" onClick={() => void savePlan()} disabled={saving}>
            {saving ? 'Сохраняю…' : `Сохранить расписание (${plan.length})`}
          </AdminButton>
        )}
      </div>

      {plan && (
        <div className="space-y-2">
          {overflow.length > 0 && (
            <p className="admin-meta text-[var(--adm-danger)]">
              Не {plural(overflow.length, ['поместилась', 'поместились', 'поместились'])} {withPlural(overflow.length, ['статья', 'статьи', 'статей'])}: увеличьте число дней или статей в день.
            </p>
          )}
          <ol className="max-h-64 space-y-1 overflow-y-auto scrollbar-brand text-xs">
            {byDay.map((item) => (
              <li key={item.slug} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-[var(--adm-fg)]/60">{formatLocal(item)}</span>
                <span className="min-w-0 truncate">{titleBySlug.get(item.slug) || item.slug}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
