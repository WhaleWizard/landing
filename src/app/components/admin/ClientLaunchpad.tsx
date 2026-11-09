import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Plus,
  Rocket,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { notify } from './AdminFeedback';
import {
  CATEGORY_NAMES,
  TEMPLATES,
  type LaunchpadCategory,
  type LaunchpadItem,
  type LaunchpadPriority,
} from './AdminLaunchpad';

interface ClientLaunchpadProps {
  clientId: number;
  clientName: string;
}

export default function ClientLaunchpad({ clientId, clientName }: ClientLaunchpadProps) {
  const [activeTemplateId, setActiveTemplateId] = useState<string>('meta_leads');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [checkedMap, setCheckedMap] = useState<Record<string, Record<string, boolean>>>({});
  const [customItems, setCustomItems] = useState<Record<string, LaunchpadItem[]>>({});

  // Add custom item state
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState<LaunchpadCategory>('tracking');
  const [newPriority, setNewPriority] = useState<LaunchpadPriority>('important');

  // Load client checklist state from localStorage
  useEffect(() => {
    try {
      const savedChecked = localStorage.getItem(`ww_client_launchpad_${clientId}`);
      if (savedChecked) setCheckedMap(JSON.parse(savedChecked));
      const savedCustom = localStorage.getItem(`ww_client_launchpad_custom_${clientId}`);
      if (savedCustom) setCustomItems(JSON.parse(savedCustom));
    } catch {
      // ignore
    }
  }, [clientId]);

  // Toggle item status
  const toggleItem = useCallback((itemId: string) => {
    setCheckedMap((prev) => {
      const currentTemplateMap = prev[activeTemplateId] || {};
      const updated = {
        ...prev,
        [activeTemplateId]: {
          ...currentTemplateMap,
          [itemId]: !currentTemplateMap[itemId],
        },
      };
      try {
        localStorage.setItem(`ww_client_launchpad_${clientId}`, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, [activeTemplateId, clientId]);

  const currentTemplate = useMemo(() => {
    return TEMPLATES.find((t) => t.id === activeTemplateId) || TEMPLATES[0];
  }, [activeTemplateId]);

  const allItems = useMemo(() => {
    const base = currentTemplate.items;
    const customs = customItems[activeTemplateId] || [];
    return [...base, ...customs];
  }, [currentTemplate, customItems, activeTemplateId]);

  const activeChecked = useMemo(() => {
    return checkedMap[activeTemplateId] || {};
  }, [checkedMap, activeTemplateId]);

  const visibleItems = useMemo(() => {
    if (selectedCategory === 'all') return allItems;
    return allItems.filter((item) => item.category === selectedCategory);
  }, [allItems, selectedCategory]);

  const completedCount = useMemo(() => {
    return allItems.filter((item) => activeChecked[item.id]).length;
  }, [allItems, activeChecked]);

  const totalCount = allItems.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const criticalPending = useMemo(() => {
    return allItems.filter((item) => item.priority === 'critical' && !activeChecked[item.id]);
  }, [allItems, activeChecked]);

  // Copy launch preflight report
  const handleCopyReport = () => {
    const completedList = allItems.filter((item) => activeChecked[item.id]);
    const pendingList = allItems.filter((item) => !activeChecked[item.id]);

    let text = `🚀 Префлайт-отчёт запуска рекламы: ${clientName || `Клиент #${clientId}`}\n`;
    text += `Шаблон: ${currentTemplate.name}\n`;
    text += `Готовность: ${progressPercent}% (${completedCount} из ${totalCount})\n\n`;

    if (criticalPending.length > 0) {
      text += `🚨 КРИТИЧЕСКИЕ БЛОКИРАТОРЫ (${criticalPending.length}):\n`;
      criticalPending.forEach((item) => {
        text += `  ⚠️ [КРИТИЧНО] ${item.title}\n`;
      });
      text += `\n`;
    }

    if (pendingList.length > 0) {
      text += `⏳ В работе (${pendingList.length}):\n`;
      pendingList.forEach((item) => {
        const pLabel = item.priority === 'critical' ? 'Критично' : item.priority === 'important' ? 'Важно' : 'Рекомендуется';
        text += `  ◻️ [${pLabel}] ${item.title}\n`;
      });
      text += `\n`;
    }

    if (completedList.length > 0) {
      text += `✅ Выполнено (${completedList.length}):\n`;
      completedList.forEach((item) => {
        text += `  ✓ ${item.title}\n`;
      });
    }

    navigator.clipboard.writeText(text).then(() => {
      notify.success('Отчёт скопирован', 'Готов для отправки клиенту в Telegram/WhatsApp');
    }).catch(() => {
      notify.error('Не удалось скопировать в буфер обмена');
    });
  };

  const handleResetChecklist = () => {
    if (!window.confirm('Сбросить все отметки по текущему шаблону для этого клиента?')) return;
    setCheckedMap((prev) => {
      const updated = { ...prev, [activeTemplateId]: {} };
      try {
        localStorage.setItem(`ww_client_launchpad_${clientId}`, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    notify.success('Чек-лист сброшен');
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newItem: LaunchpadItem = {
      id: `custom_${Date.now()}`,
      title: newTitle.trim(),
      desc: newDesc.trim() || 'Индивидуальная задача клиента',
      category: newCategory,
      priority: newPriority,
      isCustom: true,
    };

    setCustomItems((prev) => {
      const currentList = prev[activeTemplateId] || [];
      const updated = { ...prev, [activeTemplateId]: [...currentList, newItem] };
      try {
        localStorage.setItem(`ww_client_launchpad_custom_${clientId}`, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setNewTitle('');
    setNewDesc('');
    setIsAdding(false);
    notify.success('Пункт добавлен в чек-лист клиента');
  };

  const handleDeleteCustomItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomItems((prev) => {
      const currentList = prev[activeTemplateId] || [];
      const updated = { ...prev, [activeTemplateId]: currentList.filter((i) => i.id !== id) };
      try {
        localStorage.setItem(`ww_client_launchpad_custom_${clientId}`, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    notify.success('Пункт удален');
  };

  return (
    <section className="admin-panel adm-card client-launchpad" aria-label="Чек-листы запуска рекламы">
      <header className="adm-card__head flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="admin-card-title flex items-center gap-2">
            <Rocket className="w-4 h-4 text-indigo-400" aria-hidden="true" />
            Чек-листы запуска рекламы
          </h3>
          <p className="admin-hint">
            Интерактивный контроль перед включением рекламных кампаний клиента.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="admin-button admin-button--compact admin-button--quiet"
            onClick={handleCopyReport}
            title="Скопировать префлайт-отчет для клиента"
          >
            <Copy className="w-3.5 h-3.5" aria-hidden="true" /> Отчёт для клиента
          </button>
          <button
            type="button"
            className="admin-button admin-button--compact admin-button--quiet"
            onClick={handleResetChecklist}
            title="Сбросить все отметки"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Выбор шаблона */}
      <div className="flex flex-wrap items-center gap-2 my-2" role="group" aria-label="Выбор шаблона кампании">
        {TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className={`admin-crm-chip ${activeTemplateId === tpl.id ? 'is-active is-primary' : ''}`}
            onClick={() => setActiveTemplateId(tpl.id)}
          >
            {tpl.name}
          </button>
        ))}
      </div>

      {/* Прогресс-бар готовности */}
      <div className="client-launchpad__progress-box">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-semibold text-[var(--adm-fg)]/90">
            Готовность к запуску: {completedCount} из {totalCount} ({progressPercent}%)
          </span>
          <span className={progressPercent === 100 ? 'text-emerald-400 font-bold' : 'text-indigo-400 font-bold'}>
            {progressPercent === 100 ? '✓ Полностью готов' : `${100 - progressPercent}% осталось`}
          </span>
        </div>
        <div className="client-launchpad__progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`client-launchpad__progress-fill ${progressPercent === 100 ? 'is-complete' : ''}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Критические блокираторы */}
      {criticalPending.length > 0 && (
        <div className="client-launchpad__blockers-alert" role="alert">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <div className="text-xs">
            <strong>{criticalPending.length} критических шага блокируют запуск!</strong>
            <p className="opacity-80">
              Включение кампании без их завершения приведёт к сливу бюджета или отклонению модерацией.
            </p>
          </div>
        </div>
      )}

      {/* Фильтр категорий */}
      <div className="flex flex-wrap items-center gap-1.5 my-2">
        <button
          type="button"
          className={`client-launchpad__cat-pill ${selectedCategory === 'all' ? 'is-active' : ''}`}
          onClick={() => setSelectedCategory('all')}
        >
          Все ({allItems.length})
        </button>
        {Object.entries(CATEGORY_NAMES).map(([catKey, catLabel]) => {
          const count = allItems.filter((i) => i.category === catKey).length;
          if (count === 0) return null;
          return (
            <button
              key={catKey}
              type="button"
              className={`client-launchpad__cat-pill ${selectedCategory === catKey ? 'is-active' : ''}`}
              onClick={() => setSelectedCategory(catKey)}
            >
              {catLabel} ({count})
            </button>
          );
        })}
      </div>

      {/* Список пунктов */}
      <div className="client-launchpad__items-list">
        {visibleItems.map((item) => {
          const isDone = Boolean(activeChecked[item.id]);
          return (
            <div
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className={`client-launchpad__item ${isDone ? 'is-done' : ''} ${item.priority === 'critical' && !isDone ? 'is-critical' : ''}`}
              role="checkbox"
              aria-checked={isDone}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  toggleItem(item.id);
                }
              }}
            >
              <div className="client-launchpad__item-check">
                {isDone ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Circle className="w-5 h-5 text-zinc-500" aria-hidden="true" />
                )}
              </div>

              <div className="client-launchpad__item-body">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`client-launchpad__item-title ${isDone ? 'line-through text-zinc-500' : 'text-[var(--adm-fg)]'}`}>
                    {item.title}
                  </span>
                  {item.priority === 'critical' && (
                    <span className="client-launchpad__badge is-critical">Критично</span>
                  )}
                  {item.priority === 'important' && (
                    <span className="client-launchpad__badge is-important">Важно</span>
                  )}
                  <span className="client-launchpad__badge is-cat">
                    {CATEGORY_NAMES[item.category] || item.category}
                  </span>
                </div>
                {item.desc && (
                  <p className="client-launchpad__item-desc text-xs text-zinc-400 mt-0.5">
                    {item.desc}
                  </p>
                )}
                {item.tip && !isDone && (
                  <div className="client-launchpad__item-tip text-[11px] text-indigo-300/90 mt-1">
                    💡 {item.tip}
                  </div>
                )}
              </div>

              <div className="client-launchpad__item-actions" onClick={(e) => e.stopPropagation()}>
                {item.checkUrl && (
                  <a
                    href={item.checkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="client-launchpad__action-btn"
                    title="Открыть инструмент проверки"
                    aria-label={`Открыть ${item.checkUrl}`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                )}
                {item.isCustom && (
                  <button
                    type="button"
                    className="client-launchpad__action-btn text-rose-400"
                    onClick={(e) => handleDeleteCustomItem(item.id, e)}
                    title="Удалить пункт"
                    aria-label="Удалить пункт"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Кнопка и форма добавления своего шага */}
      {!isAdding ? (
        <button
          type="button"
          className="admin-button admin-button--quiet admin-button--compact w-full justify-center mt-3"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Добавить индивидуальный пункт для клиента
        </button>
      ) : (
        <form onSubmit={handleAddCustomItem} className="client-launchpad__add-form mt-3 p-3 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface-subtle)] space-y-2">
          <input
            className="admin-input text-xs w-full"
            placeholder="Название шага (например: Проверить креатив с юристом клиента)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
          />
          <input
            className="admin-input text-xs w-full"
            placeholder="Пояснение или инструкция (необязательно)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <select
                className="admin-input text-xs py-1"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as LaunchpadCategory)}
              >
                {Object.entries(CATEGORY_NAMES).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
              <select
                className="admin-input text-xs py-1"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as LaunchpadPriority)}
              >
                <option value="critical">Критично</option>
                <option value="important">Важно</option>
                <option value="recommended">Рекомендуется</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="admin-button admin-button--quiet admin-button--compact text-xs"
                onClick={() => setIsAdding(false)}
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="admin-button admin-button--primary admin-button--compact text-xs"
              >
                Сохранить
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
