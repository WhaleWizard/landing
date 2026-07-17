import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Monitor,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Smartphone,
} from 'lucide-react';
import { pageConfigs, type ServiceType } from '../../pages/ServiceLandingPage';
import { mergeContent } from '../../hooks/useServiceContent';
import AdminFaqControl from './AdminFaqControl';

type EditableContent = {
  hero: {
    badge: string;
    titlePrefix: string;
    titleAccent: string;
    titleLines: Array<{ text: string; tone?: 'accent' | 'supporting' }>;
    paragraphs: string[];
    primaryButton: string;
    secondaryButton: string;
    stats: Array<{ value: string; label: string }>;
  };
  services: {
    badge: string;
    titlePrefix: string;
    titleAccent: string;
    description: string;
    cards: Array<{ title: string; description: string; features: string[] }>;
  };
  cases: { badge: string; titlePrefix: string; titleAccent: string; description: string };
  cta: { badge: string; title: string; description: string; button: string };
  contact: { badge: string; titlePrefix: string; titleAccent: string; description: string; bullets: string[] };
};

type SectionPayload = {
  key: string;
  pagePath: string;
  label: string;
  draft: Partial<EditableContent>;
  published: Partial<EditableContent>;
  status: 'draft' | 'published';
  version: number;
  updatedAt?: string;
  publishedAt?: string;
};

type VersionRow = { id: number; source: 'draft' | 'published'; created_at: string };

const SERVICES: Array<{ value: ServiceType; label: string; path: string }> = [
  { value: 'meta-ads', label: 'Meta Ads', path: '/meta-ads' },
  { value: 'google-ads', label: 'Google Ads', path: '/google-ads' },
  { value: 'meta-apps', label: 'Meta Apps', path: '/meta-apps' },
  { value: 'consult', label: 'Консультация', path: '/consult' },
];

function editableDefaults(service: ServiceType): EditableContent {
  const source = pageConfigs[service];
  return {
    hero: {
      badge: source.hero.badge || '',
      titlePrefix: String(source.hero.titlePrefix || ''),
      titleAccent: String(source.hero.titleAccent || ''),
      titleLines: (source.hero.titleLines || []).map((line) => ({
        text: line.text,
        tone: line.tone === 'accent' || line.tone === 'supporting' ? line.tone : undefined,
      })),
      paragraphs: (source.hero.paragraphs || []).map((paragraph) => String(paragraph)),
      primaryButton: source.hero.primaryButton || '',
      secondaryButton: source.hero.secondaryButton || '',
      stats: (source.hero.stats || []).map((item) => ({ value: item.value, label: item.label })),
    },
    services: {
      badge: source.services.badge,
      titlePrefix: source.services.titlePrefix,
      titleAccent: source.services.titleAccent,
      description: source.services.description,
      cards: source.services.cards.map((card) => ({
        title: card.title,
        description: card.description,
        features: [...card.features],
      })),
    },
    cases: {
      badge: source.cases.badge,
      titlePrefix: source.cases.titlePrefix,
      titleAccent: source.cases.titleAccent,
      description: source.cases.description,
    },
    cta: {
      badge: source.cta.badge,
      title: source.cta.title,
      description: source.cta.description,
      button: source.cta.button,
    },
    contact: {
      badge: source.contact.badge,
      titlePrefix: source.contact.titlePrefix,
      titleAccent: source.contact.titleAccent,
      description: source.contact.description,
      bullets: [...source.contact.bullets],
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setAtPath(content: EditableContent, path: Array<string | number>, value: unknown): EditableContent {
  const next = clone(content) as unknown as Record<string | number, unknown>;
  let cursor = next;
  path.slice(0, -1).forEach((segment) => {
    cursor = cursor[segment] as Record<string | number, unknown>;
  });
  cursor[path[path.length - 1]] = value;
  return next as unknown as EditableContent;
}

function Field({ id, label, value, onChange, multiline = false, hint, maxLength }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  hint?: string;
  maxLength?: number;
}) {
  const className = 'admin-input';
  return (
    <label className="admin-field" htmlFor={id}>
      <span className="admin-label">{label}</span>
      {multiline ? (
        <textarea id={id} rows={4} className={className} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} className={className} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint && <span className="admin-hint">{hint}</span>}
    </label>
  );
}

function TextListField({ id, label, value, onChange, hint, maxItems, maxItemLength }: {
  id: string;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
  maxItems: number;
  maxItemLength: number;
}) {
  // Пустую последнюю строку сохраняем во время ввода, иначе Enter сразу
  // исчезает и второй пункт невозможно добавить. Сервер нормализует список при сохранении.
  return (
    <Field
      id={id}
      label={label}
      value={value.join('\n')}
      multiline
      maxLength={maxItems * maxItemLength + Math.max(0, maxItems - 1)}
      hint={hint || `Один пункт на строку, максимум ${maxItems}`}
      onChange={(text) => onChange(text.split('\n').slice(0, maxItems).map((item) => item.slice(0, maxItemLength)))}
    />
  );
}

export default function AdminContentControl({ password }: { password: string }) {
  const [service, setService] = useState<ServiceType>('meta-apps');
  const [content, setContent] = useState<EditableContent>(() => editableDefaults('meta-apps'));
  const [section, setSection] = useState<SectionPayload | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [activeSection, setActiveSection] = useState<'hero' | 'services' | 'cases' | 'cta' | 'contact'>('hero');
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [publishArmed, setPublishArmed] = useState(false);
  const [contentMode, setContentMode] = useState<'landings' | 'faq'>('landings');
  const loadSequence = useRef(0);
  const contentRef = useRef(content);
  contentRef.current = content;

  const serviceMeta = useMemo(() => SERVICES.find((item) => item.value === service) || SERVICES[0], [service]);
  const key = `service:${service}`;

  const load = useCallback(async (preserveNotice = false): Promise<boolean> => {
    const requestId = ++loadSequence.current;
    const contentAtRequest = JSON.stringify(contentRef.current);
    setLoading(true);
    if (!preserveNotice) setNotice('');
    try {
      const response = await fetch(`/api/admin/site-sections?key=${encodeURIComponent(key)}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string; section?: SectionPayload | null; versions?: VersionRow[] } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      if (requestId !== loadSequence.current) return false;
      if (JSON.stringify(contentRef.current) !== contentAtRequest) {
        setNotice('Данные получены, но не применены: пока шёл запрос, в редакторе появились новые несохранённые изменения.');
        return false;
      }
      const defaults = editableDefaults(service);
      setSection(payload.section || null);
      setVersions(payload.versions || []);
      setContent(payload.section?.draft ? mergeContent(defaults, payload.section.draft) : defaults);
      return true;
    } catch (error) {
      if (requestId !== loadSequence.current) return false;
      setNotice(error instanceof Error ? error.message : 'Не удалось загрузить тексты');
      return false;
    } finally {
      if (requestId === loadSequence.current) setLoading(false);
    }
  }, [key, password, service]);

  useEffect(() => { void load(); }, [load]);

  const switchService = (nextService: ServiceType) => {
    if (nextService === service) return;
    // Медленный ответ предыдущей страницы не должен попадать в новый редактор.
    loadSequence.current += 1;
    setService(nextService);
    setContent(editableDefaults(nextService));
    setSection(null);
    setVersions([]);
    setNotice('');
    setPublishArmed(false);
  };

  const update = (path: Array<string | number>, value: unknown) => {
    setContent((current) => setAtPath(current, path, value));
    setPublishArmed(false);
  };

  const save = async (action: 'save' | 'publish') => {
    const savedContent = clone(content);
    setLoading(true);
    setNotice(action === 'publish' ? 'Публикую…' : 'Сохраняю черновик…');
    try {
      const response = await fetch('/api/admin/site-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ action, key, pagePath: serviceMeta.path, label: serviceMeta.label, content: savedContent }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      setPublishArmed(false);
      if (JSON.stringify(contentRef.current) !== JSON.stringify(savedContent)) {
        setNotice(action === 'publish'
          ? 'Версия на момент нажатия опубликована. Более новые изменения остались в редакторе и ещё не сохранены.'
          : 'Версия на момент нажатия сохранена. Более новые изменения остались в редакторе и ещё не сохранены.');
      } else {
        const refreshed = await load(true);
        if (refreshed) {
          setNotice(action === 'publish'
            ? 'Опубликовано. Новая загрузка страницы получит текст из D1; обновление промежуточного кэша может занять несколько минут.'
            : 'Черновик сохранён.');
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сохранить');
    } finally {
      setLoading(false);
    }
  };

  const restore = async (versionId: number) => {
    const contentBeforeRestore = JSON.stringify(contentRef.current);
    setLoading(true);
    setNotice('Восстанавливаю версию в черновик…');
    try {
      const response = await fetch('/api/admin/site-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'restore', key, versionId }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      if (JSON.stringify(contentRef.current) !== contentBeforeRestore) {
        setNotice('Версия восстановлена в D1, но изменения, сделанные во время запроса, оставлены в редакторе. Нажмите «Обновить», когда будете готовы загрузить восстановленный черновик.');
      } else {
        const refreshed = await load(true);
        if (refreshed) setNotice('Версия восстановлена в черновик. Проверьте её перед публикацией.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось восстановить версию');
    } finally {
      setLoading(false);
    }
  };

  const sections = [
    ['hero', 'Хиро'],
    ['services', 'Услуги и офферы'],
    ['cases', 'Вводный блок кейсов'],
    ['cta', 'CTA'],
    ['contact', 'Форма и контакт'],
  ] as const;

  const contentModeSwitch = (
    <div className="admin-segmented" role="group" aria-label="Тип контента">
      <button type="button" aria-pressed={contentMode === 'landings'} onClick={() => setContentMode('landings')}>Лендинги</button>
      <button type="button" aria-pressed={contentMode === 'faq'} onClick={() => setContentMode('faq')}>FAQ</button>
    </div>
  );

  if (contentMode === 'faq') {
    return <div className="admin-stack admin-stack--lg">{contentModeSwitch}<AdminFaqControl password={password} /></div>;
  }

  return (
    <div className="admin-stack admin-stack--lg">
      {contentModeSwitch}
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Контент сайта</p>
          <h2 className="admin-title">Тексты и офферы</h2>
          <p className="admin-subtitle">Меняйте только типизированные текстовые поля. Вёрстка, иконки и трекинг остаются защищёнными кодом.</p>
        </div>
        <a className="admin-button admin-button--secondary" href={serviceMeta.path} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden="true" /> Открыть страницу
        </a>
      </div>

      <div className="admin-toolbar">
        <label className="admin-field admin-field--inline" htmlFor="content-service">
          <span className="admin-label">Страница</span>
          <select id="content-service" className="admin-input" value={service} disabled={loading} onChange={(event) => switchService(event.target.value as ServiceType)}>
            {SERVICES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <span className={section?.status === 'published' ? 'admin-state admin-state--success' : 'admin-state admin-state--warning'}>
          {section?.status === 'published' ? <Check aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
          {section?.status === 'published'
            ? `Опубликовано · v${section.version}`
            : section
              ? `Черновик · опубликованная версия остаётся на сайте · v${section.version}`
              : 'Статический текст'}
        </span>
        <button className="admin-button admin-button--secondary" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Обновить
        </button>
      </div>

      {notice && <div className="admin-notice" role="status" aria-live="polite">{notice}</div>}

      <div className="admin-content-layout">
        <section className="admin-card admin-content-editor">
          <div className="admin-segmented" role="group" aria-label="Раздел текста">
            {sections.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={activeSection === value} onClick={() => setActiveSection(value)}>{label}</button>
            ))}
          </div>

          {activeSection === 'hero' && (
            <div className="admin-form-grid">
              <Field id="hero-badge" label="Бейдж" value={content.hero.badge} maxLength={120} onChange={(value) => update(['hero', 'badge'], value)} />
              {content.hero.titleLines.length === 0 && (
                <>
                  <Field id="hero-prefix" label="Основная часть заголовка" value={content.hero.titlePrefix} maxLength={180} onChange={(value) => update(['hero', 'titlePrefix'], value)} />
                  <Field id="hero-accent" label="Выделенная часть заголовка" value={content.hero.titleAccent} maxLength={240} onChange={(value) => update(['hero', 'titleAccent'], value)} />
                </>
              )}
              <TextListField id="hero-paragraphs" label="Абзацы" value={content.hero.paragraphs} maxItems={3} maxItemLength={900} onChange={(value) => update(['hero', 'paragraphs'], value)} />
              <Field id="hero-primary" label="Основная кнопка" value={content.hero.primaryButton} maxLength={80} onChange={(value) => update(['hero', 'primaryButton'], value)} />
              <Field id="hero-secondary" label="Вторая кнопка" value={content.hero.secondaryButton} maxLength={80} onChange={(value) => update(['hero', 'secondaryButton'], value)} />
              {content.hero.titleLines.length > 0 && (
                <div className="admin-field admin-field--wide">
                  <span className="admin-label">Строки заголовка и выделение</span>
                  <div className="admin-stack">
                    {content.hero.titleLines.map((line, index) => (
                      <div className="admin-inline-fields" key={index}>
                        <input className="admin-input" aria-label={`Строка заголовка ${index + 1}`} maxLength={260} value={line.text} onChange={(event) => update(['hero', 'titleLines', index, 'text'], event.target.value)} />
                        <select className="admin-input" aria-label={`Стиль строки ${index + 1}`} value={line.tone || ''} onChange={(event) => update(['hero', 'titleLines', index, 'tone'], event.target.value || undefined)}>
                          <option value="">Обычная</option>
                          <option value="accent">Акцент</option>
                          <option value="supporting">Поддерживающая</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {content.hero.stats.length > 0 && (
                <div className="admin-field admin-field--wide">
                  <span className="admin-label">Подтверждённые цифры в хиро</span>
                  <div className="admin-stack">
                    {content.hero.stats.map((stat, index) => (
                      <div className="admin-stat-fields" key={index}>
                        <input
                          className="admin-input"
                          aria-label={`Значение показателя ${index + 1}`}
                          maxLength={40}
                          value={stat.value}
                          onChange={(event) => update(['hero', 'stats', index, 'value'], event.target.value)}
                        />
                        <input
                          className="admin-input"
                          aria-label={`Подпись показателя ${index + 1}`}
                          maxLength={100}
                          value={stat.label}
                          onChange={(event) => update(['hero', 'stats', index, 'label'], event.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <span className="admin-hint">Публикуйте только цифры, которые можно подтвердить кейсом, отчётом или данными рекламного кабинета.</span>
                </div>
              )}
            </div>
          )}

          {activeSection === 'services' && (
            <div className="admin-stack admin-stack--lg">
              <div className="admin-form-grid">
                <Field id="services-badge" label="Бейдж" value={content.services.badge} maxLength={120} onChange={(value) => update(['services', 'badge'], value)} />
                <Field id="services-prefix" label="Заголовок" value={content.services.titlePrefix} maxLength={180} onChange={(value) => update(['services', 'titlePrefix'], value)} />
                <Field id="services-accent" label="Акцент заголовка" value={content.services.titleAccent} maxLength={240} onChange={(value) => update(['services', 'titleAccent'], value)} />
                <Field id="services-description" label="Описание блока" value={content.services.description} multiline maxLength={900} onChange={(value) => update(['services', 'description'], value)} />
              </div>
              {content.services.cards.map((card, index) => (
                <details className="admin-disclosure" key={index} defaultOpen={index === 0}>
                  <summary><span>{index + 1}. {card.title || 'Карточка услуги'}</span><ChevronRight aria-hidden="true" /></summary>
                  <div className="admin-form-grid">
                    <Field id={`service-card-${index}-title`} label="Название" value={card.title} maxLength={160} onChange={(value) => update(['services', 'cards', index, 'title'], value)} />
                    <Field id={`service-card-${index}-description`} label="Описание" value={card.description} multiline maxLength={700} onChange={(value) => update(['services', 'cards', index, 'description'], value)} />
                    <TextListField id={`service-card-${index}-features`} label="Что входит" value={card.features} maxItems={8} maxItemLength={120} onChange={(value) => update(['services', 'cards', index, 'features'], value)} />
                  </div>
                </details>
              ))}
            </div>
          )}

          {activeSection === 'cases' && (
            <div className="admin-form-grid">
              <Field id="cases-badge" label="Бейдж" value={content.cases.badge} maxLength={120} onChange={(value) => update(['cases', 'badge'], value)} />
              <Field id="cases-prefix" label="Заголовок" value={content.cases.titlePrefix} maxLength={180} onChange={(value) => update(['cases', 'titlePrefix'], value)} />
              <Field id="cases-accent" label="Акцент заголовка" value={content.cases.titleAccent} maxLength={240} onChange={(value) => update(['cases', 'titleAccent'], value)} />
              <Field id="cases-description" label="Описание" value={content.cases.description} multiline maxLength={900} onChange={(value) => update(['cases', 'description'], value)} />
            </div>
          )}

          {activeSection === 'cta' && (
            <div className="admin-form-grid">
              <Field id="cta-badge" label="Бейдж" value={content.cta.badge} maxLength={120} onChange={(value) => update(['cta', 'badge'], value)} />
              <Field id="cta-title" label="Заголовок" value={content.cta.title} maxLength={260} onChange={(value) => update(['cta', 'title'], value)} />
              <Field id="cta-description" label="Описание" value={content.cta.description} multiline maxLength={900} onChange={(value) => update(['cta', 'description'], value)} />
              <Field id="cta-button" label="Кнопка" value={content.cta.button} maxLength={80} onChange={(value) => update(['cta', 'button'], value)} />
            </div>
          )}

          {activeSection === 'contact' && (
            <div className="admin-form-grid">
              <Field id="contact-badge" label="Бейдж" value={content.contact.badge} maxLength={120} onChange={(value) => update(['contact', 'badge'], value)} />
              <Field id="contact-prefix" label="Заголовок" value={content.contact.titlePrefix} maxLength={180} onChange={(value) => update(['contact', 'titlePrefix'], value)} />
              <Field id="contact-accent" label="Акцент заголовка" value={content.contact.titleAccent} maxLength={220} onChange={(value) => update(['contact', 'titleAccent'], value)} />
              <Field id="contact-description" label="Описание" value={content.contact.description} multiline maxLength={900} onChange={(value) => update(['contact', 'description'], value)} />
              <TextListField id="contact-bullets" label="Что обсудим" value={content.contact.bullets} maxItems={8} maxItemLength={180} onChange={(value) => update(['contact', 'bullets'], value)} />
            </div>
          )}

          <div className="admin-sticky-actions">
            <button type="button" className="admin-button admin-button--secondary" disabled={loading} onClick={() => void save('save')}><Save aria-hidden="true" /> Сохранить черновик</button>
            {!publishArmed ? (
              <button type="button" className="admin-button admin-button--primary" disabled={loading} onClick={() => setPublishArmed(true)}><Send aria-hidden="true" /> Опубликовать</button>
            ) : (
              <div className="admin-confirm-inline" role="alert">
                <span>Опубликовать этот текст на {serviceMeta.path}?</span>
                <button type="button" className="admin-button admin-button--primary" disabled={loading} onClick={() => void save('publish')}>Да, опубликовать</button>
                <button type="button" className="admin-button admin-button--ghost" disabled={loading} onClick={() => setPublishArmed(false)}>Отмена</button>
              </div>
            )}
          </div>
        </section>

        <aside className="admin-stack">
          <section className="admin-card admin-preview-card">
            <div className="admin-section-header admin-section-header--compact">
              <div><p className="admin-eyebrow">Предпросмотр текста</p><h3 className="admin-card-title">Хиро</h3></div>
              <div className="admin-icon-toggle" role="group" aria-label="Размер предпросмотра">
                <button type="button" aria-pressed={preview === 'desktop'} onClick={() => setPreview('desktop')}><Monitor aria-hidden="true" /><span className="sr-only">ПК</span></button>
                <button type="button" aria-pressed={preview === 'mobile'} onClick={() => setPreview('mobile')}><Smartphone aria-hidden="true" /><span className="sr-only">Мобильный</span></button>
              </div>
            </div>
            <div className={`admin-copy-preview admin-copy-preview--${preview}`}>
              <span className="admin-copy-preview__badge break-words">{content.hero.badge}</span>
              <h3 className="break-words">
                {content.hero.titleLines.length
                  ? content.hero.titleLines.map((line, index) => <em className={line.tone ? `is-${line.tone}` : ''} key={`${line.text}-${index}`}>{line.text}</em>)
                  : <>{content.hero.titlePrefix} <em className="is-accent">{content.hero.titleAccent}</em></>}
              </h3>
              {content.hero.paragraphs.map((paragraph, index) => <p className="break-words" key={`${index}-${paragraph}`}>{paragraph}</p>)}
              {content.hero.stats.length > 0 && (
                <dl className="admin-copy-preview__stats">
                  {content.hero.stats.map((stat, index) => (
                    <div key={`${stat.value}-${index}`}>
                      <dt>{stat.value || '—'}</dt>
                      <dd>{stat.label || 'Без подписи'}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <span className="admin-copy-preview__button" aria-hidden="true">{content.hero.primaryButton}</span>
            </div>
            <p className="admin-hint">Это проверка длины, иерархии и переносов. Точный дизайн страницы остаётся в её текущей вёрстке.</p>
          </section>

          <section className="admin-card">
            <div className="admin-section-header admin-section-header--compact">
              <div><p className="admin-eyebrow">История</p><h3 className="admin-card-title">Последние версии</h3></div>
            </div>
            {versions.length === 0 ? <p className="admin-muted">Версии появятся после первого сохранения.</p> : (
              <div className="admin-version-list">
                {versions.map((version) => (
                  <div key={version.id}>
                    <div><strong>{version.source === 'published' ? 'Публикация' : 'Черновик'}</strong><span>{new Date(`${version.created_at.replace(' ', 'T')}Z`).toLocaleString('ru-RU')}</span></div>
                    <button type="button" className="admin-icon-button" title="Восстановить в черновик" aria-label="Восстановить эту версию в черновик" disabled={loading} onClick={() => void restore(version.id)}><RotateCcw aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="admin-notice admin-notice--warning">
            Публикация меняет текст для посетителей через D1. Статическая SEO-копия обновится при следующей production-сборке — админка показывает это отдельно, чтобы не создавать ложное ощущение синхронизации.
          </div>
        </aside>
      </div>
    </div>
  );
}
