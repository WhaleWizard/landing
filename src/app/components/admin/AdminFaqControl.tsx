import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Plus, RefreshCw, RotateCcw, Save, Send, Trash2 } from 'lucide-react';
import { faqs, type FaqItem } from '../../pages/FAQPage';

type VersionRow = { id: number; source: 'draft' | 'published'; created_at: string };
const CATEGORIES: FaqItem['category'][] = ['Старт', 'Бюджет', 'Результат', 'Аналитика', 'Процесс', 'Приложения', 'Консультация'];

function cloneItems(items: FaqItem[]): FaqItem[] {
  return items.map((item) => ({ ...item, details: [...item.details] }));
}

export default function AdminFaqControl({ password }: { password: string }) {
  const [items, setItems] = useState<FaqItem[]>(() => cloneItems(faqs));
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [status, setStatus] = useState<'static' | 'draft' | 'published'>('static');
  const [hasPublishedVersion, setHasPublishedVersion] = useState(false);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [publishArmed, setPublishArmed] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(async (preserveNotice = false): Promise<boolean> => {
    const itemsAtRequest = JSON.stringify(itemsRef.current);
    setLoading(true);
    if (!preserveNotice) setNotice('');
    try {
      const response = await fetch('/api/admin/site-sections?key=site%3Afaq', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        error?: string;
        section?: { draft?: { items?: FaqItem[] }; published?: { items?: FaqItem[] }; status?: 'draft' | 'published'; version?: number } | null;
        versions?: VersionRow[];
      } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      if (JSON.stringify(itemsRef.current) !== itemsAtRequest) {
        setNotice('Данные получены, но не применены: пока шёл запрос, появились новые несохранённые изменения.');
        return false;
      }
      setItems(payload.section?.draft?.items?.length ? cloneItems(payload.section.draft.items) : cloneItems(faqs));
      setStatus(payload.section?.status || 'static');
      setHasPublishedVersion(Boolean(payload.section?.published?.items?.length));
      setVersion(Number(payload.section?.version || 0));
      setVersions(payload.versions || []);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось загрузить FAQ');
      return false;
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const indexedItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.map((item, index) => ({ item, index })).filter(({ item }) => (
      !normalized || `${item.question} ${item.answer} ${item.category}`.toLowerCase().includes(normalized)
    ));
  }, [items, query]);

  const updateItem = (index: number, patch: Partial<FaqItem>) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
    setPublishArmed(false);
  };

  const addItem = () => {
    if (items.length >= 100) {
      setNotice('Можно опубликовать не более 100 вопросов. Удалите лишний вопрос перед добавлением нового.');
      return;
    }
    const newIndex = items.length;
    setQuery('');
    setItems((current) => [...current, { category: 'Старт', question: 'Новый вопрос', answer: 'Короткий ответ', details: ['Первое уточнение'] }]);
    setPublishArmed(false);
    window.setTimeout(() => document.getElementById(`faq-${newIndex}-question`)?.focus(), 0);
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setPublishArmed(false);
  };

  const save = async (action: 'save' | 'publish') => {
    if (items.length === 0) {
      setNotice('Добавьте хотя бы один вопрос перед сохранением.');
      return;
    }
    const invalidIndex = items.findIndex((item) => !item.question.trim() || !item.answer.trim() || !CATEGORIES.includes(item.category));
    if (invalidIndex >= 0) {
      setQuery('');
      setNotice(`Заполните вопрос и короткий ответ в карточке №${invalidIndex + 1}. Неполная карточка не будет опубликована.`);
      window.setTimeout(() => {
        const field = document.getElementById(`faq-${invalidIndex}-question`);
        field?.closest('details')?.setAttribute('open', '');
        field?.focus();
      }, 0);
      return;
    }
    const savedItems = cloneItems(items);
    setLoading(true);
    setNotice(action === 'publish' ? 'Публикую FAQ…' : 'Сохраняю черновик…');
    try {
      const response = await fetch('/api/admin/site-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ action, key: 'site:faq', pagePath: '/faq', label: 'FAQ', content: { items: savedItems } }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      setPublishArmed(false);
      if (JSON.stringify(itemsRef.current) !== JSON.stringify(savedItems)) {
        setNotice(action === 'publish'
          ? 'Версия на момент нажатия опубликована. Более новые изменения остались в редакторе и ещё не сохранены.'
          : 'Версия на момент нажатия сохранена. Более новые изменения остались в редакторе и ещё не сохранены.');
      } else {
        const refreshed = await load(true);
        if (refreshed) {
          setNotice(action === 'publish'
            ? 'FAQ опубликован. Новая загрузка страницы получит данные из D1; промежуточный кэш может обновляться несколько минут.'
            : 'Черновик FAQ сохранён.');
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сохранить FAQ');
    } finally {
      setLoading(false);
    }
  };

  const restore = async (versionId: number) => {
    const itemsBeforeRestore = JSON.stringify(itemsRef.current);
    setLoading(true);
    try {
      const response = await fetch('/api/admin/site-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'restore', key: 'site:faq', versionId }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      if (JSON.stringify(itemsRef.current) !== itemsBeforeRestore) {
        setNotice('Версия восстановлена в D1, но изменения, сделанные во время запроса, оставлены в редакторе. Нажмите «Обновить», когда будете готовы загрузить восстановленный черновик.');
      } else {
        const refreshed = await load(true);
        if (refreshed) setNotice('Версия восстановлена в черновик. Проверьте вопросы перед публикацией.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось восстановить версию');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-stack admin-stack--lg">
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Контент сайта</p>
          <h2 className="admin-title">FAQ</h2>
          <p className="admin-subtitle">Вопрос, короткий ответ и детали остаются структурированными — без HTML и риска сломать страницу.</p>
        </div>
        <a className="admin-button admin-button--secondary" href="/faq" target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> Открыть FAQ</a>
      </div>

      <div className="admin-toolbar">
        <label className="admin-field admin-field--inline" htmlFor="faq-search">
          <span className="admin-label">Поиск</span>
          <input id="faq-search" className="admin-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Вопрос или категория" />
        </label>
        <span className={status === 'published' ? 'admin-state admin-state--success' : 'admin-state admin-state--warning'}>
          {status === 'published'
            ? `Опубликовано · v${version}`
            : status === 'draft'
              ? `Черновик · v${version} · ${hasPublishedVersion ? 'на сайте предыдущая версия' : 'на сайте статический FAQ'}`
              : 'Статический FAQ'}
        </span>
        <button type="button" className="admin-button admin-button--secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Обновить</button>
        <button type="button" className="admin-button admin-button--secondary" disabled={loading || items.length >= 100} onClick={addItem}><Plus aria-hidden="true" /> Добавить вопрос</button>
      </div>

      {notice && <div className="admin-notice" role="status" aria-live="polite">{notice}</div>}

      <div className="admin-content-layout">
        <section className="admin-card admin-content-editor">
          <div className="admin-stack">
            {indexedItems.map(({ item, index }) => (
              <details className="admin-disclosure" key={index} defaultOpen={indexedItems.length <= 3 || (index === items.length - 1 && item.question === 'Новый вопрос')}>
                <summary><span>{index + 1}. {item.question}</span><span className="admin-meta">{item.category}</span></summary>
                <div className="admin-form-grid">
                  <label className="admin-field" htmlFor={`faq-${index}-category`}><span className="admin-label">Категория</span><select id={`faq-${index}-category`} className="admin-input" value={item.category} onChange={(event) => updateItem(index, { category: event.target.value as FaqItem['category'] })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
                  <label className="admin-field" htmlFor={`faq-${index}-question`}><span className="admin-label">Вопрос</span><input id={`faq-${index}-question`} className="admin-input" maxLength={240} value={item.question} onChange={(event) => updateItem(index, { question: event.target.value })} /></label>
                  <label className="admin-field admin-field--wide" htmlFor={`faq-${index}-answer`}><span className="admin-label">Короткий ответ</span><textarea id={`faq-${index}-answer`} className="admin-input" rows={3} maxLength={1200} value={item.answer} onChange={(event) => updateItem(index, { answer: event.target.value })} /></label>
                  <label className="admin-field admin-field--wide" htmlFor={`faq-${index}-details`}><span className="admin-label">Подробности — один пункт на строку, максимум 10 пунктов</span><textarea id={`faq-${index}-details`} className="admin-input" rows={5} value={item.details.join('\n')} onChange={(event) => updateItem(index, { details: event.target.value.split('\n').slice(0, 10).map((line) => line.slice(0, 700)) })} /></label>
                  <div className="admin-field admin-field--wide"><button type="button" className="admin-button admin-button--danger" disabled={loading} onClick={() => removeItem(index)}><Trash2 aria-hidden="true" /> Убрать из черновика</button></div>
                </div>
              </details>
            ))}
            {indexedItems.length === 0 && <div className="admin-empty"><div><strong>Ничего не найдено</strong><p>Измените запрос поиска.</p></div></div>}
          </div>

          <div className="admin-sticky-actions">
            <button type="button" className="admin-button admin-button--secondary" disabled={loading || items.length === 0} onClick={() => void save('save')}><Save aria-hidden="true" /> Сохранить черновик</button>
            {!publishArmed ? <button type="button" className="admin-button admin-button--primary" disabled={loading || items.length === 0} onClick={() => setPublishArmed(true)}><Send aria-hidden="true" /> Опубликовать</button> : (
              <div className="admin-confirm-inline" role="alert"><span>Опубликовать {items.length} вопросов?</span><button type="button" className="admin-button admin-button--primary" disabled={loading} onClick={() => void save('publish')}>Да, опубликовать</button><button type="button" className="admin-button admin-button--ghost" disabled={loading} onClick={() => setPublishArmed(false)}>Отмена</button></div>
            )}
          </div>
        </section>

        <aside className="admin-stack">
          <section className="admin-card p-4 sm:p-5">
            <p className="admin-eyebrow">Сводка</p><h3 className="admin-card-title">{items.length} вопросов</h3>
            <div className="mt-4 admin-stack">{CATEGORIES.map((category) => <div className="flex justify-between gap-3" key={category}><span>{category}</span><strong className="tabular-nums">{items.filter((item) => item.category === category).length}</strong></div>)}</div>
          </section>
          <section className="admin-card p-4 sm:p-5">
            <p className="admin-eyebrow">История</p><h3 className="admin-card-title">Последние версии</h3>
            <div className="admin-version-list mt-3">{versions.map((row) => <div key={row.id}><div><strong>{row.source === 'published' ? 'Публикация' : 'Черновик'}</strong><span>{new Date(`${row.created_at.replace(' ', 'T')}Z`).toLocaleString('ru-RU')}</span></div><button type="button" className="admin-icon-button" aria-label="Восстановить версию FAQ" disabled={loading} onClick={() => void restore(row.id)}><RotateCcw aria-hidden="true" /></button></div>)}</div>
            {versions.length === 0 && <p className="admin-muted mt-3">Версии появятся после сохранения.</p>}
          </section>
          <div className="admin-notice admin-notice--warning">Видимый FAQ получает опубликованные вопросы из D1. Статический HTML для поисковых роботов синхронизируется при следующем деплое.</div>
        </aside>
      </div>
    </div>
  );
}
