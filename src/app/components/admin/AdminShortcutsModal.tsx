import { useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Keyboard, X } from 'lucide-react';

export interface ShortcutItem {
  keys: string[];
  description: string;
  context?: string;
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

export const ADMIN_SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Навигация и управление',
    items: [
      { keys: ['Ctrl', 'K'], description: 'Командная палитра и глобальный поиск' },
      { keys: ['Ctrl', '['], description: 'Свернуть или развернуть боковое меню' },
      { keys: ['?'], description: 'Справка по всем горячим клавишам' },
      { keys: ['Esc'], description: 'Закрыть любое модальное окно или сбросить выбор' },
    ],
  },
  {
    title: 'Редактор публикаций',
    items: [
      { keys: ['Alt', 'Shift', '↑ / ↓'], description: 'Переместить выбранный блок выше или ниже' },
      { keys: ['Ctrl', 'Enter'], description: 'Быстрая вставка нового блока в конец статьи' },
      { keys: ['Ctrl', 'Z'], description: 'Отменить последнее изменение' },
      { keys: ['Ctrl', 'Y'], description: 'Повторить отменённое действие' },
    ],
  },
  {
    title: 'CRM и работа со сделками',
    items: [
      { keys: ['Esc'], description: 'Закрыть панель деталей сделки / снять отметки' },
    ],
  },
];

export function useAdminKeyboardShortcuts(onToggleShortcuts: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Игнорируем ввод внутри текстовых полей, редактора и выпадающих списков
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Открытие справки по знаку вопроса (?)
      if ((event.key === '?' || (event.code === 'Slash' && event.shiftKey)) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        onToggleShortcuts();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleShortcuts]);
}

interface AdminShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AdminShortcutsModal({ open, onOpenChange }: AdminShortcutsModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="admin-cmdk__overlay" />
        <Dialog.Content className="admin-shortcuts-modal__content" aria-describedby={undefined}>
          <div className="admin-shortcuts-modal__header">
            <div className="flex items-center gap-2.5">
              <div className="admin-shortcuts-modal__icon">
                <Keyboard className="w-5 h-5 text-[var(--adm-primary)]" aria-hidden="true" />
              </div>
              <div>
                <Dialog.Title className="admin-shortcuts-modal__title">Горячие клавиши</Dialog.Title>
                <p className="admin-shortcuts-modal__subtitle">Быстрые команды для комфортной работы в админке</p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="admin-shortcuts-modal__close" aria-label="Закрыть">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <div className="admin-shortcuts-modal__body">
            {ADMIN_SHORTCUT_GROUPS.map((group) => (
              <div key={group.title} className="admin-shortcuts-group">
                <h4 className="admin-shortcuts-group__title">{group.title}</h4>
                <div className="admin-shortcuts-group__list">
                  {group.items.map((item, idx) => (
                    <div key={idx} className="admin-shortcuts-row">
                      <span className="admin-shortcuts-row__desc">{item.description}</span>
                      <div className="admin-shortcuts-row__keys">
                        {item.keys.map((k, kIdx) => (
                          <kbd key={kIdx} className="admin-shortcuts-kbd">{k}</kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="admin-shortcuts-modal__footer">
            <span className="admin-shortcuts-modal__tip">
              Нажмите <kbd className="admin-shortcuts-kbd text-xs">Esc</kbd> чтобы закрыть это окно
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
