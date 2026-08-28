import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check, Copy, FileText, MessageSquare, PhoneCall, Plus, Send, Trash2, Zap,
} from 'lucide-react';
import { confirmAsk, notify } from './AdminFeedback';

export type QuickStage = 'new' | 'contacted' | 'discovery' | 'proposal' | 'won' | 'lost' | 'archived';

export interface QuickActionPlan {
  note: string;
  stage: QuickStage | null;
  nextInDays: number;
  nextText: string;
  success: string;
}

interface Template {
  id: number;
  title: string;
  body: string;
}

/**
 * Одно касание клиента — один клик. Раньше «позвонил» означало: открыть
 * заметку, написать текст, сохранить, поменять этап, поставить дату
 * следующего шага. Пять действий на каждое касание — поэтому CRM и не велась.
 */
const QUICK_ACTIONS: Array<{
  id: string;
  label: string;
  icon: typeof PhoneCall;
  plan: QuickActionPlan;
}> = [
  {
    id: 'called',
    label: 'Позвонил',
    icon: PhoneCall,
    plan: {
      note: 'Позвонил клиенту.',
      stage: 'contacted',
      nextInDays: 2,
      nextText: 'Вернуться после звонка',
      success: 'Звонок записан, следующий шаг через 2 дня',
    },
  },
  {
    id: 'messaged',
    label: 'Написал',
    icon: MessageSquare,
    plan: {
      note: 'Написал клиенту в мессенджер.',
      stage: 'contacted',
      nextInDays: 1,
      nextText: 'Дождаться ответа на сообщение',
      success: 'Сообщение записано, напоминание на завтра',
    },
  },
  {
    id: 'proposal',
    label: 'Отправил КП',
    icon: FileText,
    plan: {
      note: 'Отправил коммерческое предложение.',
      stage: 'proposal',
      nextInDays: 3,
      nextText: 'Спросить решение по предложению',
      success: 'Предложение записано, напоминание через 3 дня',
    },
  },
  {
    id: 'waiting',
    label: 'Ждёт ответа',
    icon: Send,
    plan: {
      note: 'Клиент взял паузу на подумать.',
      stage: null,
      nextInDays: 5,
      nextText: 'Мягко напомнить о себе',
      success: 'Напоминание поставлено через 5 дней',
    },
  },
];

function fillTemplate(body: string, lead: { name?: string; service?: string; budget?: string }): string {
  return body
    .replace(/\{имя\}/gi, String(lead.name || '').trim() || 'Здравствуйте')
    .replace(/\{услуга\}/gi, String(lead.service || '').trim() || 'реклама')
    .replace(/\{бюджет\}/gi, String(lead.budget || '').trim() || 'бюджет');
}

export default function CrmQuickActions({
  password,
  lead,
  disabled,
  onRun,
}: {
  password: string;
  lead: { id: number; name?: string; service?: string; budget?: string };
  disabled: boolean;
  onRun: (plan: QuickActionPlan) => Promise<void>;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(0);
  const [migration, setMigration] = useState('');
  const [draft, setDraft] = useState<{ id: number; title: string; body: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/crm-templates', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; templates?: Template[]; migration?: string } | null;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.migration || '');
        return;
      }
      setMigration('');
      setTemplates(payload.templates || []);
    } catch {
      // Шаблоны — вспомогательная вещь: без них карточка работает как раньше.
    }
  }, [password]);

  useEffect(() => { if (open) void load(); }, [load, open]);

  const post = async (body: Record<string, unknown>): Promise<boolean> => {
    try {
      const response = await fetch('/api/admin/crm-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string; templates?: Template[]; migration?: string } | null;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.migration || '');
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setTemplates(payload.templates || []);
      return true;
    } catch (error) {
      notify.error('Шаблон не сохранился', error instanceof Error ? error.message : undefined);
      return false;
    }
  };

  const copy = async (template: Template) => {
    const text = fillTemplate(template.body, lead);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(template.id);
      window.setTimeout(() => setCopied(0), 1600);
      notify.success('Текст скопирован', 'Имя и услуга уже подставлены');
    } catch {
      notify.error('Не удалось скопировать', 'Скопируйте текст вручную из поля ниже');
    }
  };

  const preview = useMemo(
    () => (draft ? fillTemplate(draft.body, lead) : ''),
    [draft, lead],
  );

  return (
    <div className="crm-quick">
      <div className="crm-quick__row" role="group" aria-label="Быстрые действия по сделке">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="crm-quick__button"
            disabled={disabled || Boolean(busy)}
            title={`${action.plan.note} Следующий шаг — через ${action.plan.nextInDays} дн.`}
            onClick={async () => {
              setBusy(action.id);
              try {
                await onRun(action.plan);
              } finally {
                setBusy('');
              }
            }}
          >
            <action.icon aria-hidden="true" />
            {busy === action.id ? 'Записываю…' : action.label}
          </button>
        ))}
        <button
          type="button"
          className="crm-quick__button crm-quick__button--ghost"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Zap aria-hidden="true" /> Шаблоны
        </button>
      </div>

      {open && (
        <div className="crm-quick__templates">
          {migration ? (
            <div className="admin-notice admin-notice--warning" role="status">
              Примените миграцию <code>{migration}</code> — до неё шаблоны негде хранить.
            </div>
          ) : null}

          {!migration && templates.length === 0 && (
            <div className="crm-quick__empty">
              <p>Готовых ответов пока нет. Можно начать с четырёх стандартных — приветствие, запрос вводных, отправка предложения и напоминание.</p>
              <button type="button" className="admin-button admin-button--primary" onClick={() => void post({ action: 'seed' })}>
                Создать стандартные
              </button>
            </div>
          )}

          {templates.map((template) => (
            <div className="crm-quick__template" key={template.id}>
              <div className="crm-quick__template-head">
                <strong>{template.title}</strong>
                <div>
                  <button type="button" className="admin-button admin-button--compact" onClick={() => void copy(template)}>
                    {copied === template.id ? <><Check aria-hidden="true" /> Скопировано</> : <><Copy aria-hidden="true" /> Копировать</>}
                  </button>
                  <button
                    type="button"
                    className="admin-button admin-button--compact"
                    onClick={() => setDraft({ id: template.id, title: template.title, body: template.body })}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className="admin-icon-button admin-icon-button--danger"
                    aria-label={`Удалить шаблон «${template.title}»`}
                    onClick={async () => {
                      // Шаблон удаляется из базы насовсем — корзины для них нет,
                      // а текст написан руками. Остальная админка спрашивает
                      // перед таким же действием, здесь спросить забыли.
                      const confirmed = await confirmAsk({
                        title: `Удалить шаблон «${template.title}»?`,
                        description: 'Текст пропадёт совсем — вернуть его будет неоткуда.',
                        confirmLabel: 'Удалить',
                        tone: 'danger',
                      });
                      if (confirmed) void post({ action: 'delete', id: template.id });
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p>{fillTemplate(template.body, lead)}</p>
            </div>
          ))}

          {!migration && (
            <button
              type="button"
              className="admin-button"
              onClick={() => setDraft({ id: 0, title: '', body: '' })}
            >
              <Plus aria-hidden="true" /> Новый шаблон
            </button>
          )}

          {draft && (
            <form
              className="crm-quick__form"
              onSubmit={async (event) => {
                event.preventDefault();
                const ok = await post({ action: 'save', id: draft.id || undefined, title: draft.title, body: draft.body });
                if (ok) {
                  notify.success('Шаблон сохранён');
                  setDraft(null);
                }
              }}
            >
              <label className="admin-field">
                <span className="admin-label">Название</span>
                <input value={draft.title} maxLength={80} required onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label className="admin-field">
                <span className="admin-label">Текст · подстановки {'{имя}'}, {'{услуга}'}, {'{бюджет}'}</span>
                <textarea rows={5} value={draft.body} maxLength={2000} required onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
              </label>
              {preview ? <p className="crm-quick__preview"><span>Как увидит клиент:</span> {preview}</p> : null}
              <div className="crm-quick__form-actions">
                <button type="submit" className="admin-button admin-button--primary">Сохранить</button>
                <button type="button" className="admin-button admin-button--quiet" onClick={() => setDraft(null)}>Отмена</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
