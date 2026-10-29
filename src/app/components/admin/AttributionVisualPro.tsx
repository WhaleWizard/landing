import { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  Flame,
  Globe,
  Layers,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { formatMoney, formatNumber, formatPercent } from './AttributionCharts';
import { notify } from './AdminFeedback';

export interface ChannelStat {
  id: string;
  name: string;
  icon: 'meta' | 'google' | 'telegram' | 'organic' | 'other';
  leads: number;
  qualified: number;
  won: number;
  revenue: number;
  spend: number | null;
  cpl: number | null;
  cpq: number | null;
  romi: number | null;
  qualificationRate: number | null;
  winRate: number | null;
  leadShare: number;
}

/**
 * Парсер и агрегатор каналов трафика по UTM-меткам и источникам
 */
export function aggregateChannels(
  rows: Array<{
    key: string;
    leads: number;
    qualified: number | null;
    won: number | null;
    revenue: number | null;
    spend: number | null;
  }>,
  totalLeads: number
): ChannelStat[] {
  const buckets: Record<string, {
    id: string;
    name: string;
    icon: 'meta' | 'google' | 'telegram' | 'organic' | 'other';
    leads: number;
    qualified: number;
    won: number;
    revenue: number;
    spend: number;
    hasSpend: boolean;
  }> = {
    meta: { id: 'meta', name: 'Meta Ads (Inst / FB)', icon: 'meta', leads: 0, qualified: 0, won: 0, revenue: 0, spend: 0, hasSpend: false },
    google: { id: 'google', name: 'Google Ads (Search/PMax)', icon: 'google', leads: 0, qualified: 0, won: 0, revenue: 0, spend: 0, hasSpend: false },
    telegram: { id: 'telegram', name: 'Telegram Ads & Посевы', icon: 'telegram', leads: 0, qualified: 0, won: 0, revenue: 0, spend: 0, hasSpend: false },
    organic: { id: 'organic', name: 'Органика & Прямой трафик', icon: 'organic', leads: 0, qualified: 0, won: 0, revenue: 0, spend: 0, hasSpend: false },
    other: { id: 'other', name: 'Прочие каналы', icon: 'other', leads: 0, qualified: 0, won: 0, revenue: 0, spend: 0, hasSpend: false },
  };

  for (const row of rows) {
    const k = row.key.toLowerCase();
    let target = 'other';
    if (/meta|facebook|fb|instagram|inst|ig\b/i.test(k)) {
      target = 'meta';
    } else if (/google|gads|adwords|cpc|pmax/i.test(k)) {
      target = 'google';
    } else if (/tg|telegram/i.test(k)) {
      target = 'telegram';
    } else if (/direct|\(direct\)|none|organic|yandex|seo|главная|поиск/i.test(k)) {
      target = 'organic';
    }

    const b = buckets[target];
    b.leads += row.leads || 0;
    b.qualified += row.qualified || 0;
    b.won += row.won || 0;
    b.revenue += row.revenue || 0;
    if (row.spend !== null && Number.isFinite(row.spend)) {
      b.spend += row.spend;
      b.hasSpend = true;
    }
  }

  const result: ChannelStat[] = Object.values(buckets)
    .filter((b) => b.leads > 0 || b.hasSpend)
    .map((b) => {
      const spend = b.hasSpend ? b.spend : null;
      const cpl = spend !== null && b.leads > 0 ? spend / b.leads : null;
      const cpq = spend !== null && b.qualified > 0 ? spend / b.qualified : null;
      const romi = spend !== null && spend > 0 ? ((b.revenue - spend) / spend) * 100 : null;
      const qualificationRate = b.leads > 0 ? (b.qualified / b.leads) * 100 : null;
      const winRate = b.leads > 0 ? (b.won / b.leads) * 100 : null;
      const leadShare = totalLeads > 0 ? (b.leads / totalLeads) * 100 : 0;

      return {
        id: b.id,
        name: b.name,
        icon: b.icon,
        leads: b.leads,
        qualified: b.qualified,
        won: b.won,
        revenue: b.revenue,
        spend,
        cpl,
        cpq,
        romi,
        qualificationRate,
        winRate,
        leadShare,
      };
    })
    .sort((a, b) => b.leads - a.leads);

  return result;
}

/**
 * Интерактивный каскад воронки с индикаторами отсева (Conversion Drop-off Waterfall)
 */
export function ConversionCascade({
  visitors,
  leads,
  qualified,
  won,
  revenue,
  currency,
}: {
  visitors: number | null;
  leads: number | null;
  qualified: number | null;
  won: number | null;
  revenue: number | null;
  currency: string | null;
}) {
  const cr1 = visitors && leads ? (leads / visitors) * 100 : null;
  const drop1 = visitors && leads ? visitors - leads : null;
  const drop1Pct = visitors && leads ? ((visitors - leads) / visitors) * 100 : null;

  const cr2 = leads && qualified ? (qualified / leads) * 100 : null;
  const drop2 = leads && qualified ? leads - qualified : null;
  const drop2Pct = leads && qualified ? ((leads - qualified) / leads) * 100 : null;

  const cr3 = qualified && won ? (won / qualified) * 100 : null;
  const drop3 = qualified && won ? qualified - won : null;
  const drop3Pct = qualified && won ? ((qualified - won) / qualified) * 100 : null;

  const overallWinRate = leads && won ? (won / leads) * 100 : null;

  // Поиск узкого места
  const drops = [
    { stage: 'Посещение → Заявка', pct: drop1Pct, reason: 'Посетители уходят с сайта без отправки формы' },
    { stage: 'Заявка → Целевой лид', pct: drop2Pct, reason: 'Большая доля нецелевых обращений или спама' },
    { stage: 'Целевой → Продажа', pct: drop3Pct, reason: 'Отсев на этапе переговоров и согласования КП' },
  ].filter((d) => d.pct !== null && Number.isFinite(d.pct));

  const bottleneck = drops.length ? drops.reduce((max, cur) => (cur.pct! > max.pct! ? cur : max)) : null;

  return (
    <section className="admin-panel adm-card" aria-label="Каскад воронки конверсий">
      <header className="adm-card__head">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="admin-card-title flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--adm-primary)]" aria-hidden="true" />
              Конверсионный каскад и отсев
            </h3>
            <p className="admin-hint">Пошаговая проходимость воронки и выявление точек потери бюджета</p>
          </div>
          {overallWinRate !== null && (
            <div className="adm-cascade-winrate" title="Итоговый процент дошедших до оплаты от всех заявок">
              <span className="text-xs text-[var(--adm-text-muted)] uppercase tracking-wider">Win Rate:</span>
              <strong className="text-sm font-bold text-[var(--adm-success)]">{formatPercent(overallWinRate)}</strong>
            </div>
          )}
        </div>
      </header>

      <div className="adm-cascade-grid">
        {/* Шаг 1: Посетители */}
        <div className="adm-cascade-step">
          <div className="adm-cascade-step__head">
            <span className="adm-cascade-step__num">1</span>
            <Users className="w-4 h-4 text-blue-400" aria-hidden="true" />
            <span className="adm-cascade-step__title">Посетители</span>
          </div>
          <div className="adm-cascade-step__val">{formatNumber(visitors)}</div>
          <p className="adm-cascade-step__desc">Уникальные визиты за период</p>
        </div>

        {/* Переход 1 -> 2 */}
        <div className="adm-cascade-connector">
          <div className="adm-cascade-badge is-cr" title="Конверсия из визита в заявку">
            CR {formatPercent(cr1)}
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--adm-text-muted)]" aria-hidden="true" />
          {drop1Pct !== null && (
            <div className="adm-cascade-dropoff" title={`Отсев: ${formatNumber(drop1)} посетителей`}>
              -{Math.round(drop1Pct)}% отсев
            </div>
          )}
        </div>

        {/* Шаг 2: Заявки */}
        <div className="adm-cascade-step">
          <div className="adm-cascade-step__head">
            <span className="adm-cascade-step__num">2</span>
            <Send className="w-4 h-4 text-indigo-400" aria-hidden="true" />
            <span className="adm-cascade-step__title">Заявки</span>
          </div>
          <div className="adm-cascade-step__val">{formatNumber(leads)}</div>
          <p className="adm-cascade-step__desc">Входящие контакты в CRM</p>
        </div>

        {/* Переход 2 -> 3 */}
        <div className="adm-cascade-connector">
          <div className="adm-cascade-badge is-cr" title="Доля целевых заявок">
            CR {formatPercent(cr2)}
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--adm-text-muted)]" aria-hidden="true" />
          {drop2Pct !== null && (
            <div className="adm-cascade-dropoff" title={`Отсев нецелевых: ${formatNumber(drop2)} заявок`}>
              -{Math.round(drop2Pct)}% отсев
            </div>
          )}
        </div>

        {/* Шаг 3: Целевые */}
        <div className="adm-cascade-step">
          <div className="adm-cascade-step__head">
            <span className="adm-cascade-step__num">3</span>
            <Target className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <span className="adm-cascade-step__title">Целевые лиды</span>
          </div>
          <div className="adm-cascade-step__val">{formatNumber(qualified)}</div>
          <p className="adm-cascade-step__desc">Квалифицированы в CRM</p>
        </div>

        {/* Переход 3 -> 4 */}
        <div className="adm-cascade-connector">
          <div className="adm-cascade-badge is-cr" title="Конверсия целевых в выигранные сделки">
            CR {formatPercent(cr3)}
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--adm-text-muted)]" aria-hidden="true" />
          {drop3Pct !== null && (
            <div className="adm-cascade-dropoff" title={`Не дошли до сделки: ${formatNumber(drop3)} целевых`}>
              -{Math.round(drop3Pct)}% отсев
            </div>
          )}
        </div>

        {/* Шаг 4: Выиграно */}
        <div className="adm-cascade-step is-highlight">
          <div className="adm-cascade-step__head">
            <span className="adm-cascade-step__num">4</span>
            <Trophy className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span className="adm-cascade-step__title">Сделки</span>
          </div>
          <div className="adm-cascade-step__val text-[var(--adm-success)]">{formatNumber(won)}</div>
          <p className="adm-cascade-step__desc">
            {revenue ? `Выручка: ${formatMoney(revenue, currency)}` : 'Выигранные контракты'}
          </p>
        </div>
      </div>

      {bottleneck && (
        <div className="adm-cascade-bottleneck" role="status">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-none" aria-hidden="true" />
          <div className="text-xs">
            <strong>Узкое горлышко воронки: {bottleneck.stage}</strong> ({Math.round(bottleneck.pct!)}% потерь). {bottleneck.reason}.
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Карточки эффективности каналов («Битва каналов»: Meta vs Google vs Organic)
 */
export function ChannelBattleCards({
  channels,
  currency,
}: {
  channels: ChannelStat[];
  currency: string | null;
}) {
  if (!channels.length) return null;

  // Лидеры по категориям
  const bestRomi = channels
    .filter((c) => c.romi !== null && c.romi > 0)
    .sort((a, b) => (b.romi || 0) - (a.romi || 0))[0]?.id;

  const lowestCpl = channels
    .filter((c) => c.cpl !== null && c.cpl > 0)
    .sort((a, b) => (a.cpl || 0) - (b.cpl || 0))[0]?.id;

  const topLeads = channels
    .slice()
    .sort((a, b) => b.leads - a.leads)[0]?.id;

  return (
    <section className="admin-panel adm-card" aria-label="Сравнение рекламных каналов">
      <header className="adm-card__head">
        <h3 className="admin-card-title flex items-center gap-2">
          <Coins className="w-4 h-4 text-[var(--adm-primary)]" aria-hidden="true" />
          Эффективность каналов привлечения
        </h3>
        <p className="admin-hint">Сравнение окупаемости, стоимости лида и конверсии между рекламными источниками</p>
      </header>

      <div className="adm-channel-grid">
        {channels.map((channel) => {
          const isTopRomi = channel.id === bestRomi;
          const isLowestCpl = channel.id === lowestCpl;
          const isTopLeads = channel.id === topLeads && channel.leads > 0;

          return (
            <div key={channel.id} className="adm-channel-card">
              <div className="adm-channel-card__head">
                <div className="flex items-center gap-2">
                  <div className={`adm-channel-icon is-${channel.icon}`}>
                    {channel.icon === 'meta' && <Sparkles className="w-4 h-4 text-pink-400" />}
                    {channel.icon === 'google' && <Globe className="w-4 h-4 text-blue-400" />}
                    {channel.icon === 'telegram' && <Send className="w-4 h-4 text-sky-400" />}
                    {channel.icon === 'organic' && <Users className="w-4 h-4 text-emerald-400" />}
                    {channel.icon === 'other' && <Layers className="w-4 h-4 text-zinc-400" />}
                  </div>
                  <div>
                    <h4 className="adm-channel-name">{channel.name}</h4>
                    <span className="adm-channel-share">{Math.round(channel.leadShare)}% всех заявок</span>
                  </div>
                </div>

                <div className="adm-channel-badges">
                  {isTopRomi && (
                    <span className="adm-channel-tag is-romi" title="Лучшая окупаемость среди каналов">
                      <Trophy className="w-3 h-3" /> Топ ROMI
                    </span>
                  )}
                  {isLowestCpl && (
                    <span className="adm-channel-tag is-cpl" title="Самая низкая стоимость привлечения">
                      <Coins className="w-3 h-3" /> Дешёвый лид
                    </span>
                  )}
                  {isTopLeads && (
                    <span className="adm-channel-tag is-volume" title="Основной объём заявок">
                      <Flame className="w-3 h-3" /> Главный объём
                    </span>
                  )}
                </div>
              </div>

              {/* Прогресс-бар доли */}
              <div className="adm-channel-track" role="progressbar" aria-valuenow={Math.round(channel.leadShare)} aria-valuemin={0} aria-valuemax={100}>
                <div className="adm-channel-track__fill" style={{ width: `${Math.max(channel.leadShare, 4)}%` }} />
              </div>

              <div className="adm-channel-metrics">
                <div className="adm-channel-metric">
                  <span className="adm-channel-metric__label">Лиды</span>
                  <strong className="adm-channel-metric__val">{formatNumber(channel.leads)}</strong>
                </div>

                <div className="adm-channel-metric">
                  <span className="adm-channel-metric__label">Целевые (CR)</span>
                  <strong className="adm-channel-metric__val text-amber-400">
                    {formatNumber(channel.qualified)} {channel.qualificationRate !== null && `(${formatPercent(channel.qualificationRate)})`}
                  </strong>
                </div>

                <div className="adm-channel-metric">
                  <span className="adm-channel-metric__label">Сделки</span>
                  <strong className="adm-channel-metric__val text-emerald-400">
                    {formatNumber(channel.won)} {channel.winRate !== null && `(${formatPercent(channel.winRate)})`}
                  </strong>
                </div>

                <div className="adm-channel-metric">
                  <span className="adm-channel-metric__label">Расход</span>
                  <strong className="adm-channel-metric__val">{formatMoney(channel.spend, currency)}</strong>
                </div>

                <div className="adm-channel-metric">
                  <span className="adm-channel-metric__label">Цена лида (CPL)</span>
                  <strong className="adm-channel-metric__val">{formatMoney(channel.cpl, currency)}</strong>
                </div>

                <div className="adm-channel-metric">
                  <span className="adm-channel-metric__label">Окупаемость</span>
                  <strong className={`adm-channel-metric__val ${channel.romi !== null && channel.romi >= 0 ? 'text-[var(--adm-success)]' : 'text-zinc-400'}`}>
                    {channel.romi !== null ? formatPercent(channel.romi) : '—'}
                  </strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Интерактивная тепловая когортная матрица (Cohort Heatmap Matrix)
 */
export function CohortHeatmapMatrix({
  cohorts,
}: {
  cohorts: Array<{
    week: string;
    leads: number;
    qualified: number | null;
    won: number | null;
    conversion: number | null;
  }>;
}) {
  if (!cohorts || cohorts.length < 2) return null;

  const maxLeads = Math.max(...cohorts.map((c) => c.leads), 1);
  const now = Date.now();

  return (
    <section className="admin-panel adm-card" aria-label="Когортный анализ">
      <header className="adm-card__head">
        <h3 className="admin-card-title flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[var(--adm-primary)]" aria-hidden="true" />
          Когортная матрица созревания сделок
        </h3>
        <p className="admin-hint">
          Анализ доходимости лидов по неделям прихода. Когорты старше 21 дня считаются зрелыми (сделки успели закрыться).
        </p>
      </header>

      <div className="adm-cohort-table-wrap">
        <table className="adm-cohort-table">
          <thead>
            <tr>
              <th scope="col">Неделя</th>
              <th scope="col">Статус</th>
              <th scope="col" className="text-right">Лиды</th>
              <th scope="col" className="text-right">Целевые</th>
              <th scope="col" className="text-right">Квалификация</th>
              <th scope="col" className="text-right">Сделки</th>
              <th scope="col" className="text-right">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => {
              const weekDate = new Date(`${cohort.week}T00:00:00Z`);
              const ageDays = Math.max(0, Math.floor((now - weekDate.getTime()) / 86_400_000));
              const isMature = ageDays >= 21;
              const qualRate = cohort.leads > 0 && cohort.qualified !== null ? (cohort.qualified / cohort.leads) * 100 : null;

              return (
                <tr key={cohort.week}>
                  <td className="font-semibold text-xs whitespace-nowrap">
                    {weekDate.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                  </td>
                  <td>
                    {isMature ? (
                      <span className="adm-cohort-badge is-mature" title="Когорта зрелая: цикл сделки завершён">
                        <CheckCircle2 className="w-3 h-3" /> Созрела
                      </span>
                    ) : (
                      <span className="adm-cohort-badge is-progress" title="Свежая когорта: сделки ещё в работе">
                        В работе ({ageDays}д)
                      </span>
                    )}
                  </td>
                  <td className="text-right font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <span>{formatNumber(cohort.leads)}</span>
                      <span className="adm-cohort-bar">
                        <span style={{ width: `${(cohort.leads / maxLeads) * 100}%` }} />
                      </span>
                    </div>
                  </td>
                  <td className="text-right text-amber-400 font-medium">{formatNumber(cohort.qualified)}</td>
                  <td className="text-right">
                    <span className={`adm-cohort-rate ${qualRate !== null && qualRate >= 50 ? 'is-high' : ''}`}>
                      {formatPercent(qualRate)}
                    </span>
                  </td>
                  <td className="text-right text-emerald-400 font-bold">{formatNumber(cohort.won)}</td>
                  <td className="text-right">
                    <span className={`adm-cohort-rate ${cohort.conversion && cohort.conversion > 0 ? 'is-win' : ''}`}>
                      {formatPercent(cohort.conversion)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Кнопка быстрого копирования строки UTM
 */
export function CopyUtmCell({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      notify.success('Скопировано в буфер', text);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  };

  return (
    <div className="adm-utm-cell flex items-center justify-between gap-1 group">
      <span className="truncate" title={text}>{text}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="adm-utm-copy-btn opacity-0 group-hover:opacity-100 focus:opacity-100"
        title="Скопировать значение"
        aria-label={`Скопировать ${text}`}
      >
        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}
