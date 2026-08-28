import { useMemo, useState } from 'react';
import { Check, Copy, Search, ShieldCheck, Megaphone } from 'lucide-react';
import { DATALAYER_EVENTS, type DataLayerEventDoc } from '../../data/dataLayerEvents';
import { AdminBlank, notify } from './AdminFeedback';
import { AdminButton, AdminPanel, AdminSectionHeading, AdminSelect } from './AdminUI';

/**
 * Справочник событий dataLayer.
 *
 * Данные берутся из кода сайта, а не из базы: событий одиннадцать, они меняются
 * раз в полгода, и хранить их в D1 значило бы завести ещё одну таблицу и ещё
 * одну миграцию ради статического списка. Поэтому раздел работает без сети и
 * без базы — и, в отличие от остальных, не может «не загрузиться».
 */

type ConsentFilter = 'all' | 'analytics' | 'marketing';
type MetaFilter = 'all' | 'meta' | 'no-meta';

const CONSENT_LABEL: Record<DataLayerEventDoc['consent'], string> = {
  analytics: 'Аналитика',
  marketing: 'Аналитика + маркетинг',
};

const CONSENT_HINT: Record<DataLayerEventDoc['consent'], string> = {
  analytics: 'Достаточно согласия на аналитику: без него не загружается сам Google Tag Manager.',
  marketing: 'Нужны оба согласия: на аналитику — чтобы работал GTM, и на маркетинг — чтобы событие вообще отправилось.',
};

function EventCard({ event }: { event: DataLayerEventDoc }) {
  const [copied, setCopied] = useState(false);

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(event.event);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      notify.error('Не удалось скопировать', 'Браузер не дал доступ к буферу обмена');
    }
  };

  return (
    <AdminPanel className="admin-dl-card">
      {/* Шапка в две строки, а не в две колонки: у событий заголовки разной
          длины, и при колонках метка согласия прыгала бы по вертикали от
          карточки к карточке. */}
      <header className="admin-dl-card__head">
        <h3 className="admin-dl-card__title">{event.title}</h3>
        <div className="admin-dl-card__name">
          <code>{event.event}</code>
          <AdminButton
            tone="quiet"
            compact
            onClick={copyName}
            aria-label={`Скопировать имя события ${event.event}`}
            title="Скопировать имя для триггера GTM"
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            <span className="admin-dl-card__copy-label">{copied ? 'Скопировано' : 'Копировать'}</span>
          </AdminButton>
        </div>
        {/* Метка согласия всегда отдельной строкой: «Аналитика» и
            «Аналитика + маркетинг» разной ширины, и в общей строке с именем
            события длинная переносилась бы, а короткая нет — у соседних
            карточек текст начинался бы на разной высоте. */}
        <span
          className={`admin-badge admin-dl-consent admin-dl-consent--${event.consent}`}
          title={CONSENT_HINT[event.consent]}
        >
          {event.consent === 'marketing' ? <Megaphone aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          {CONSENT_LABEL[event.consent]}
        </span>
      </header>

      <p className="admin-dl-card__meaning">{event.meaning}</p>

      <div className="admin-dl-block">
        <h4 className="admin-dl-block__title">Когда срабатывает</h4>
        <p className="admin-dl-text">{event.firesWhen}</p>
      </div>

      <div className="admin-dl-block">
        <h4 className="admin-dl-block__title">Какое согласие нужно</h4>
        <p className="admin-dl-text">{CONSENT_HINT[event.consent]}</p>
      </div>

      {/* Блоки идут в одном и том же порядке во всех карточках и ни один не
          пропускается: пустой блок пишет «нет», а не исчезает. Иначе соседние
          карточки разъезжаются по высоте разделов и список выглядит рваным. */}
      <div className="admin-dl-block">
        <h4 className="admin-dl-block__title">Параметры</h4>
        {event.params.length ? (
          <ul className="admin-dl-params">
            {event.params.map((param) => (
              <li key={param.name}>
                <code>{param.name}</code>
                <span>{param.description}</span>
                {param.optional ? <em className="admin-dl-optional">не всегда</em> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-dl-text admin-dl-text--empty">Нет — событие несёт только своё имя.</p>
        )}
      </div>

      <div className="admin-dl-block">
        <h4 className="admin-dl-block__title">Куда ещё уходит</h4>
        {event.metaPixel || event.ga4 || event.metrika ? (
          <ul className="admin-dl-targets">
            {event.metaPixel ? (
              <li>
                <span className="admin-chip">Meta Pixel</span>
                <code>{event.metaPixel}</code>
                {event.metaServer ? <span className="admin-dl-targets__note">+ серверный CAPI</span> : null}
              </li>
            ) : null}
            {event.ga4 ? (
              <li>
                <span className="admin-chip">GA4</span>
                <code>{event.ga4}</code>
              </li>
            ) : null}
            {event.metrika ? (
              <li>
                <span className="admin-chip">Метрика</span>
                <code>{event.metrika}</code>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="admin-dl-text admin-dl-text--empty">Никуда — дальше решает GTM.</p>
        )}
      </div>

      {event.note ? <p className="admin-dl-note">{event.note}</p> : null}

      {/* Подвал прижат к низу карточки: у карточек в одной строке разное
          количество параметров, и без этого «где в коде» болталось бы на
          разной высоте у соседей. */}
      <p className="admin-dl-where">
        <span>Где в коде:</span>
        {event.where.map((file) => <code key={file}>{file}</code>)}
      </p>
    </AdminPanel>
  );
}

/** Справочник событий, которые сайт отправляет в Google Tag Manager. */
export default function AdminDataLayer() {
  const [query, setQuery] = useState('');
  const [consent, setConsent] = useState<ConsentFilter>('all');
  const [meta, setMeta] = useState<MetaFilter>('all');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return DATALAYER_EVENTS.filter((event) => {
      if (consent !== 'all' && event.consent !== consent) return false;
      if (meta === 'meta' && !event.metaPixel) return false;
      if (meta === 'no-meta' && event.metaPixel) return false;
      if (!needle) return true;
      const haystack = [
        event.event,
        event.title,
        event.meaning,
        event.firesWhen,
        event.metaPixel || '',
        event.ga4 || '',
        event.metrika || '',
        ...event.params.map((param) => `${param.name} ${param.description}`),
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, consent, meta]);

  const marketingCount = DATALAYER_EVENTS.filter((event) => event.consent === 'marketing').length;
  const metaCount = DATALAYER_EVENTS.filter((event) => event.metaPixel).length;

  return (
    <div className="admin-dl">
      <AdminSectionHeading
        title="События"
        description="Что сайт отправляет в Google Tag Manager. Имя события из карточки — это то, что вписывается в триггер GTM."
      />

      <div className="admin-dl-summary">
        <AdminPanel className="admin-dl-stat">
          <span className="admin-dl-stat__value">{DATALAYER_EVENTS.length}</span>
          <span className="admin-dl-stat__label">событий отправляет сайт</span>
        </AdminPanel>
        <AdminPanel className="admin-dl-stat">
          <span className="admin-dl-stat__value">{marketingCount}</span>
          <span className="admin-dl-stat__label">из них требуют согласия на маркетинг</span>
        </AdminPanel>
        <AdminPanel className="admin-dl-stat">
          <span className="admin-dl-stat__value">{metaCount}</span>
          <span className="admin-dl-stat__label">дублируются событием в Meta</span>
        </AdminPanel>
      </div>

      <AdminPanel className="admin-dl-filters">
        <label className="admin-dl-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(input) => setQuery(input.target.value)}
            placeholder="Найти событие или параметр"
            aria-label="Поиск по событиям"
          />
        </label>
        <AdminSelect
          value={consent}
          onValueChange={(value) => setConsent(value as ConsentFilter)}
          ariaLabel="Фильтр по согласию"
          compact
          options={[
            { value: 'all', label: 'Любое согласие' },
            { value: 'analytics', label: 'Хватает аналитики' },
            { value: 'marketing', label: 'Нужен маркетинг' },
          ]}
        />
        <AdminSelect
          value={meta}
          onValueChange={(value) => setMeta(value as MetaFilter)}
          ariaLabel="Фильтр по Meta"
          compact
          options={[
            { value: 'all', label: 'С Meta и без' },
            { value: 'meta', label: 'Есть в Meta' },
            { value: 'no-meta', label: 'Только в GTM' },
          ]}
        />
      </AdminPanel>

      {visible.length ? (
        <div className="admin-dl-list">
          {visible.map((event) => <EventCard key={event.event} event={event} />)}
        </div>
      ) : (
        <AdminBlank
          icon={<Search />}
          title="Ничего не нашлось"
          text="Попробуйте другое слово или снимите фильтры."
        />
      )}
    </div>
  );
}
