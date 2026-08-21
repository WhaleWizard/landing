import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  History,
  Lock,
  LockOpen,
  Mail,
  Settings2,
  TriangleAlert,
} from 'lucide-react';
import { AdminBlank, AdminSectionSkeleton, confirmAsk, notify } from './AdminFeedback';
import { AdminButton, AdminSectionHeading, AdminSelect } from './AdminUI';

/**
 * Раздел «Доступ к страницам».
 *
 * Закрытая страница отдаёт заглушку вместо содержимого — и посетителю, и
 * поиску, и рекламному роботу. Проверка живёт на сервере, поэтому обойти её
 * из браузера нельзя, а редактор страниц и его предпросмотр продолжают
 * работать как обычно.
 */

const TITLE_MAX = 80;
const MESSAGE_MAX = 260;

type Preset = 'development' | 'update' | 'soon' | 'custom';

interface RouteState {
  path: string;
  label: string;
  group: string;
  hasChildren?: boolean;
  warning?: string;
  locked: boolean;
  includeChildren: boolean;
  preset: Preset;
  title: string;
  message: string;
  eta: string;
  hideInNav: boolean;
  showSubscribe: boolean;
  ctaPaths: string[];
  lockedAt: string;
  updatedAt: string;
  weeklyViews: number;
  waiting: number;
}

interface LockEvent {
  path: string;
  action: string;
  createdAt: string;
}

interface Subscriber {
  id: number;
  path: string;
  email: string;
  phone: string;
  telegram: string;
  marketingConsent: boolean;
  createdAt: string;
  notifiedAt: string;
}

/** Какие поля контактов доступны: телефон и телеграм даёт миграция 0035. */
interface ContactFields {
  phone: boolean;
  telegram: boolean;
  marketing: boolean;
}

interface LocksResponse {
  success?: boolean;
  error?: string;
  migration?: string;
  routes?: RouteState[];
  presets?: Record<string, { title: string; message: string }>;
  events?: LockEvent[];
  subscribers?: Subscriber[];
  trafficDays?: number;
  listSource?: string;
  fields?: ContactFields;
}

type Draft = Pick<RouteState,
  'preset' | 'title' | 'message' | 'eta' | 'includeChildren' | 'hideInNav' | 'showSubscribe' | 'ctaPaths'>;

const CTA_SLOTS = [0, 1, 2];
const CTA_AUTO = 'auto';

const PRESET_OPTIONS = [
  { value: 'development', label: 'Страница в разработке' },
  { value: 'update', label: 'Страница обновляется' },
  { value: 'soon', label: 'Скоро откроется' },
  { value: 'custom', label: 'Свой текст' },
];

const ACTION_LABEL: Record<string, string> = {
  lock: 'закрыта',
  unlock: 'открыта',
  update: 'изменены тексты',
  preview: 'открыт предпросмотр',
};

function toDraft(route: RouteState): Draft {
  return {
    preset: route.preset,
    title: route.title,
    message: route.message,
    eta: route.eta,
    includeChildren: route.includeChildren,
    hideInNav: route.hideInNav,
    showSubscribe: route.showSubscribe,
    ctaPaths: [...(route.ctaPaths || [])],
  };
}

/** Контакт одной строкой: показываем то, что человек оставил. */
function subscriberContact(item: Subscriber): string {
  return [item.email, item.phone, item.telegram ? `@${item.telegram}` : ''].filter(Boolean).join(' · ');
}

/** «Закрыта 12 дней» — чтобы забытая блокировка бросалась в глаза. */
function lockedForDays(lockedAt: string): number {
  if (!lockedAt) return 0;
  const started = new Date(lockedAt.replace(' ', 'T') + (lockedAt.includes('Z') ? '' : 'Z')).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 86_400_000));
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatDateTime(value: string): string {
  if (!value) return '';
  const parsed = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminPageLocks({ password }: { password: string }) {
  const [data, setData] = useState<LocksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migration, setMigration] = useState('');
  const [openPath, setOpenPath] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savingPath, setSavingPath] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [showJournal, setShowJournal] = useState(false);
  const previewTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/page-locks', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as LocksResponse | null;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.migration || '');
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setMigration('');
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить список страниц');
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const routes = data?.routes || [];
  const locked = useMemo(() => routes.filter((route) => route.locked), [routes]);
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, RouteState[]>();
    for (const route of routes) {
      if (!byGroup.has(route.group)) {
        byGroup.set(route.group, []);
        order.push(route.group);
      }
      byGroup.get(route.group)!.push(route);
    }
    return order.map((name) => ({ name, items: byGroup.get(name) || [] }));
  }, [routes]);

  const activeRoute = routes.find((route) => route.path === openPath) || null;

  const post = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch('/api/admin/page-locks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as { success?: boolean; error?: string; migration?: string; url?: string; opened?: number } | null;
    if (!response.ok || !payload?.success) {
      setMigration(payload?.migration || '');
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }
    return payload;
  }, [password]);

  const saveRoute = useCallback(async (route: RouteState, patch: Partial<RouteState & Draft>) => {
    setSavingPath(route.path);
    try {
      await post({
        action: 'save',
        path: route.path,
        locked: patch.locked ?? route.locked,
        includeChildren: patch.includeChildren ?? route.includeChildren,
        preset: patch.preset ?? route.preset,
        title: patch.title ?? route.title,
        message: patch.message ?? route.message,
        eta: patch.eta ?? route.eta,
        hideInNav: patch.hideInNav ?? route.hideInNav,
        showSubscribe: patch.showSubscribe ?? route.showSubscribe,
        ctaPaths: patch.ctaPaths ?? route.ctaPaths,
      });
      await load();
      return true;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Не удалось сохранить';
      setError(message);
      notify.error('Изменение не сохранилось', message);
      return false;
    } finally {
      setSavingPath('');
    }
  }, [load, post]);

  const toggleLock = useCallback(async (route: RouteState) => {
    if (!route.locked) {
      const warnings: string[] = [];
      if (route.warning) warnings.push(route.warning);
      if (route.weeklyViews > 0) {
        warnings.push(`За ${data?.trafficDays || 7} дней на страницу зашли ${route.weeklyViews} ${plural(route.weeklyViews, 'раз', 'раза', 'раз')} — если на неё идёт реклама, объявления отклонят.`);
      }
      const confirmed = await confirmAsk({
        title: `Закрыть «${route.label}»?`,
        description: [
          'Посетители увидят заглушку вместо страницы. Вы сможете открывать её по ссылке предпросмотра и редактировать как обычно.',
          ...warnings,
        ].join(' '),
        confirmLabel: 'Закрыть страницу',
        tone: warnings.length ? 'danger' : 'default',
      });
      if (!confirmed) return;
    }

    const ok = await saveRoute(route, { locked: !route.locked });
    if (ok) {
      notify.success(
        route.locked ? `«${route.label}» открыта` : `«${route.label}» закрыта`,
        route.locked ? 'Страница снова доступна всем' : 'Полностью применится в течение минуты',
      );
    }
  }, [data?.trafficDays, saveRoute]);

  const openPreviewTab = useCallback(async (route: RouteState) => {
    // Вкладка открывается сразу по клику: если ждать ответа сервера, браузер
    // посчитает её всплывающим окном и заблокирует.
    const tab = window.open('', '_blank', 'noopener');
    try {
      const payload = await post({ action: 'preview_token', path: route.path });
      if (!payload.url) throw new Error('Сервер не вернул ссылку');
      if (tab) {
        tab.location.href = payload.url;
      } else {
        await navigator.clipboard?.writeText(payload.url).catch(() => undefined);
        notify.info('Ссылка скопирована', 'Вкладку заблокировал браузер — вставьте ссылку вручную');
      }
    } catch (previewError) {
      tab?.close();
      notify.error('Ссылка не создалась', previewError instanceof Error ? previewError.message : '');
    }
  }, [post]);

  const unlockAll = useCallback(async () => {
    const confirmed = await confirmAsk({
      title: 'Открыть все страницы?',
      description: `Сейчас закрыто ${locked.length} ${plural(locked.length, 'страница', 'страницы', 'страниц')}. Все они снова станут видны посетителям.`,
      confirmLabel: 'Открыть все',
    });
    if (!confirmed) return;
    try {
      await post({ action: 'unlock_all' });
      notify.success('Все страницы открыты');
      await load();
    } catch (unlockError) {
      notify.error('Не получилось', unlockError instanceof Error ? unlockError.message : '');
    }
  }, [load, locked.length, post]);

  const markNotified = useCallback(async (route: RouteState) => {
    try {
      await post({ action: 'mark_notified', path: route.path });
      notify.success('Отмечено', 'Записи помечены как обработанные');
      await load();
    } catch (markError) {
      notify.error('Не получилось', markError instanceof Error ? markError.message : '');
    }
  }, [load, post]);

  // Кадр предпросмотра перерисовывается с задержкой: иначе каждый набранный
  // символ уходил бы на сервер отдельным запросом.
  useEffect(() => {
    if (!activeRoute || !draft) {
      setPreviewHtml('');
      return;
    }
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('/api/admin/page-lock-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
            credentials: 'same-origin',
            body: JSON.stringify({ path: activeRoute.path, ...draft }),
          });
          const payload = await response.json().catch(() => null) as { success?: boolean; html?: string } | null;
          if (payload?.success && payload.html) setPreviewHtml(payload.html);
        } catch {
          // Предпросмотр — подсказка: без него настройки всё равно сохраняются.
        }
      })();
    }, 320);

    return () => {
      if (previewTimer.current) window.clearTimeout(previewTimer.current);
    };
  }, [activeRoute, draft, password]);

  // В кнопки предлагаем только открытые страницы: закрытая вела бы на вторую
  // заглушку подряд. Пустой слот означает «подберём сами по теме страницы».
  const ctaOptions = useMemo(() => ([
    { value: CTA_AUTO, label: 'Автоматически' },
    ...routes
      .filter((route) => route.path !== '/' && route.path !== openPath && !route.locked)
      .map((route) => ({ value: route.path, label: route.label })),
  ]), [openPath, routes]);

  if (loading && !data) return <AdminSectionSkeleton tiles={0} rows={6} />;

  if (migration) {
    return (
      <div className="admin-stack admin-stack--lg">
        <AdminSectionHeading title="Доступ к страницам" />
        <AdminBlank
          icon={<TriangleAlert size={40} />}
          title={`Примените миграцию ${migration}`}
          text="Раздел хранит состояние страниц в базе. Пока таблица не создана, закрывать страницы нельзя — сайт при этом работает как обычно."
        />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="admin-stack admin-stack--lg">
        <AdminSectionHeading title="Доступ к страницам" />
        <AdminBlank
          title="Список не загрузился"
          text={error}
          actions={<AdminButton tone="primary" onClick={() => void load()}>Повторить</AdminButton>}
        />
      </div>
    );
  }

  return (
    <div className="admin-stack admin-stack--lg plock">
      <AdminSectionHeading
        title="Доступ к страницам"
        description="Закрытая страница показывает заглушку вместо содержимого — посетителям, поиску и рекламным роботам. Редактор страниц и предпросмотр при этом работают как обычно."
        action={locked.length > 0 ? (
          <AdminButton tone="primary" onClick={() => void unlockAll()}>Открыть все</AdminButton>
        ) : null}
      />

      <div className={`plock-summary${locked.length ? ' is-active' : ''}`}>
        <span className="plock-summary__icon" aria-hidden="true">
          {locked.length ? <Lock size={18} /> : <LockOpen size={18} />}
        </span>
        <div className="plock-summary__body">
          <p className="plock-summary__title">
            {locked.length
              ? `Закрыто ${locked.length} ${plural(locked.length, 'страница', 'страницы', 'страниц')}`
              : 'Все страницы сайта открыты'}
          </p>
          <p className="admin-hint">
            {locked.length
              ? locked.map((route) => {
                const days = lockedForDays(route.lockedAt);
                return days > 0 ? `${route.label} — ${days} ${plural(days, 'день', 'дня', 'дней')}` : route.label;
              }).join(' · ')
              : 'Заглушку никто не видит. Изменения применяются в течение минуты после нажатия.'}
          </p>
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.name} className="admin-card plock-group">
          <h3 className="plock-group__title">{group.name}</h3>
          <ul className="plock-list">
            {group.items.map((route) => {
              const isOpen = openPath === route.path;
              const days = lockedForDays(route.lockedAt);
              return (
                <li key={route.path} className={`plock-row${route.locked ? ' is-locked' : ''}${isOpen ? ' is-open' : ''}`}>
                  <div className="plock-row__main">
                    <div className="plock-row__info">
                      <p className="plock-row__label">
                        {route.label}
                        {route.locked ? <span className="plock-tag">Закрыта</span> : null}
                        {route.locked && route.includeChildren ? <span className="plock-tag plock-tag--quiet">с вложенными</span> : null}
                      </p>
                      <p className="admin-hint plock-row__meta">
                        <code>{route.path}</code>
                        {route.locked && days > 0 ? ` · ${days} ${plural(days, 'день', 'дня', 'дней')}` : ''}
                        {!route.locked && route.weeklyViews > 0 ? ` · ${route.weeklyViews} ${plural(route.weeklyViews, 'визит', 'визита', 'визитов')} за ${data?.trafficDays || 7} дней` : ''}
                        {route.waiting > 0 ? ` · ждут открытия: ${route.waiting}` : ''}
                      </p>
                    </div>

                    <div className="plock-row__actions">
                      {route.locked ? (
                        <AdminButton compact onClick={() => void openPreviewTab(route)}>
                          <Eye size={15} aria-hidden="true" /> Посмотреть
                        </AdminButton>
                      ) : null}
                      <AdminButton
                        compact
                        aria-expanded={isOpen}
                        onClick={() => {
                          if (isOpen) {
                            setOpenPath('');
                            setDraft(null);
                            return;
                          }
                          setOpenPath(route.path);
                          setDraft(toDraft(route));
                        }}
                      >
                        <Settings2 size={15} aria-hidden="true" /> Настроить
                      </AdminButton>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={route.locked}
                        aria-label={route.locked ? `Открыть страницу «${route.label}»` : `Закрыть страницу «${route.label}»`}
                        className="plock-switch"
                        disabled={savingPath === route.path}
                        onClick={() => void toggleLock(route)}
                      >
                        <span className="plock-switch__thumb" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {isOpen && draft ? (
                    <div className="plock-editor">
                      <div className="plock-editor__fields">
                        <AdminSelect
                          label="Что написать"
                          value={draft.preset}
                          options={PRESET_OPTIONS}
                          onValueChange={(value) => setDraft({ ...draft, preset: value as Preset })}
                        />

                        <label className="admin-field">
                          <span className="admin-label">Заголовок</span>
                          <input
                            className="admin-input"
                            type="text"
                            maxLength={TITLE_MAX}
                            value={draft.title}
                            placeholder={data?.presets?.[draft.preset]?.title || 'Как в выбранном варианте'}
                            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                          />
                          <span className="admin-hint">Пусто — берётся из варианта выше</span>
                        </label>

                        <label className="admin-field admin-field--wide">
                          <span className="admin-label">Текст</span>
                          <textarea
                            className="admin-input"
                            maxLength={MESSAGE_MAX}
                            rows={3}
                            value={draft.message}
                            placeholder={data?.presets?.[draft.preset]?.message || 'Как в выбранном варианте'}
                            onChange={(event) => setDraft({ ...draft, message: event.target.value })}
                          />
                          <span className="admin-hint">{draft.message.length} из {MESSAGE_MAX} · только текст, без ссылок и разметки</span>
                        </label>

                        <label className="admin-field">
                          <span className="admin-label">Когда планируете открыть</span>
                          <input
                            className="admin-input"
                            type="date"
                            value={draft.eta}
                            onChange={(event) => setDraft({ ...draft, eta: event.target.value })}
                          />
                          <span className="admin-hint">Необязательно — покажем на заглушке</span>
                        </label>

                        {CTA_SLOTS.map((slot) => (
                          <AdminSelect
                            key={slot}
                            label={slot === 0 ? 'Кнопка 1 — куда зовём' : `Кнопка ${slot + 1}`}
                            value={draft.ctaPaths[slot] || CTA_AUTO}
                            options={ctaOptions}
                            hint={slot === 0 ? 'Пусто — подберём по теме страницы' : undefined}
                            onValueChange={(value) => {
                              const next = [...draft.ctaPaths];
                              if (value === CTA_AUTO) next.splice(slot, 1);
                              else next[slot] = value;
                              setDraft({
                                ...draft,
                                ctaPaths: next.filter((item, index) => item && next.indexOf(item) === index),
                              });
                            }}
                          />
                        ))}
                      </div>

                      <div className="plock-editor__switches">
                        {route.hasChildren ? (
                          <label className="plock-check">
                            <input
                              type="checkbox"
                              checked={draft.includeChildren}
                              onChange={(event) => setDraft({ ...draft, includeChildren: event.target.checked })}
                            />
                            <span>
                              Закрыть вместе с вложенными страницами
                              <span className="admin-hint">Иначе отдельные материалы раздела останутся доступны по прямой ссылке</span>
                            </span>
                          </label>
                        ) : null}

                        <label className="plock-check">
                          <input
                            type="checkbox"
                            checked={draft.hideInNav}
                            onChange={(event) => setDraft({ ...draft, hideInNav: event.target.checked })}
                          />
                          <span>
                            Убрать ссылки из меню и подвала
                            <span className="admin-hint">Пока страница закрыта, вести на неё с сайта незачем</span>
                          </span>
                        </label>

                        <label className="plock-check">
                          <input
                            type="checkbox"
                            checked={draft.showSubscribe}
                            onChange={(event) => setDraft({ ...draft, showSubscribe: event.target.checked })}
                          />
                          <span>
                            Спрашивать контакт «сообщить, когда откроется»
                            <span className="admin-hint">
                              {data?.fields?.phone
                                ? 'Почта, телефон и телеграм — хватит любого одного. В заявки и в воронку такие записи не попадают, приходят в Telegram.'
                                : 'Пока только почта: телефон и телеграм включит миграция 0035. В заявки и в воронку такие записи не попадают.'}
                            </span>
                          </span>
                        </label>
                      </div>

                      <div className="plock-editor__preview">
                        <p className="admin-label">Как увидит посетитель</p>
                        <div className="plock-frame">
                          <iframe
                            title={`Заглушка страницы «${route.label}»`}
                            className="plock-frame__view"
                            sandbox="allow-same-origin"
                            srcDoc={previewHtml}
                          />
                        </div>
                      </div>

                      <div className="plock-editor__actions">
                        <AdminButton
                          tone="primary"
                          disabled={savingPath === route.path}
                          onClick={() => void (async () => {
                            const ok = await saveRoute(route, draft);
                            if (ok) notify.success('Сохранено', route.locked ? 'Заглушка обновится в течение минуты' : 'Применится, когда закроете страницу');
                          })()}
                        >
                          {savingPath === route.path ? 'Сохраняем…' : 'Сохранить'}
                        </AdminButton>
                        <AdminButton tone="quiet" onClick={() => setDraft(toDraft(route))}>Вернуть как было</AdminButton>
                      </div>

                      {route.waiting > 0 ? (
                        <div className="plock-waiting">
                          <p className="plock-waiting__title">
                            <Mail size={15} aria-hidden="true" />
                            Ждут открытия: {route.waiting}
                          </p>
                          <ul className="plock-waiting__list">
                            {(data?.subscribers || [])
                              .filter((item) => item.path === route.path && !item.notifiedAt)
                              .slice(0, 12)
                              .map((item) => (
                                <li key={item.id}>
                                  <span>
                                    {subscriberContact(item)}
                                    {item.marketingConsent ? <span className="plock-tag plock-tag--quiet">согласие на маркетинг</span> : null}
                                  </span>
                                  <span className="admin-hint">{formatDateTime(item.createdAt)}</span>
                                </li>
                              ))}
                          </ul>
                          <AdminButton compact onClick={() => void markNotified(route)}>Я написал всем</AdminButton>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="admin-card plock-group">
        <button
          type="button"
          className="plock-journal__toggle"
          aria-expanded={showJournal}
          onClick={() => setShowJournal((value) => !value)}
        >
          <History size={16} aria-hidden="true" />
          История изменений доступа
        </button>
        {showJournal ? (
          (data?.events || []).length ? (
            <ul className="plock-journal">
              {(data?.events || []).map((event, index) => (
                <li key={`${event.createdAt}-${index}`}>
                  <span>{routes.find((route) => route.path === event.path)?.label || event.path}</span>
                  <span className="admin-hint">{ACTION_LABEL[event.action] || event.action} · {formatDateTime(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-hint plock-journal__empty">Доступ к страницам ещё не меняли.</p>
          )
        ) : null}
      </section>
    </div>
  );
}
