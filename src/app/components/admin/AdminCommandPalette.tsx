import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';

/**
 * Командная палитра админки: одно окно вместо блужданий по сайдбару.
 * Открывается по Ctrl+K (Cmd+K на маке) из любого раздела.
 *
 * Горячая клавиша ловится по `event.code`, а не по `event.key`: на русской
 * раскладке Ctrl+K даёт «л», и проверка по букве просто не срабатывала бы.
 */

export interface AdminCommand {
  /** Ключ для React, в поиске не участвует. */
  id: string;
  label: string;
  /** Что реально ищется. По умолчанию — сам заголовок. */
  searchText?: string;
  /** Синонимы: «лиды» находят «Заявки». */
  keywords?: string[];
  hint?: string;
  icon?: ReactNode;
  run: () => void;
}

export interface AdminCommandGroup {
  heading: string;
  items: AdminCommand[];
}

interface AdminCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: AdminCommandGroup[];
}

export default function AdminCommandPalette({ open, onOpenChange, groups }: AdminCommandPaletteProps) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyK' || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      event.preventDefault();
      onOpenChange(!open);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open]);

  // Запрос не должен переживать закрытие: иначе палитра открывается с чужим
  // текстом и пустым списком.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const visibleGroups = groups.filter((group) => group.items.length > 0);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="admin-cmdk__overlay" />
        <Dialog.Content className="admin-cmdk__content" aria-describedby={undefined}>
          <Dialog.Title className="admin-cmdk__srtitle">Командная палитра</Dialog.Title>
          <Command label="Командная палитра" loop className="admin-cmdk">
            <div className="admin-cmdk__search">
              <Search aria-hidden="true" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Куда перейти или что сделать?"
              />
            </div>
            <Command.List className="admin-cmdk__list">
              <Command.Empty className="admin-cmdk__empty">
                Ничего не нашлось. Попробуйте другое слово — например «заявки» или «скорость».
              </Command.Empty>
              {visibleGroups.map((group) => (
                <Command.Group key={group.heading} heading={group.heading} className="admin-cmdk__group">
                  {group.items.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={item.searchText || item.label}
                      keywords={item.keywords}
                      className="admin-cmdk__item"
                      onSelect={() => {
                        onOpenChange(false);
                        item.run();
                      }}
                    >
                      {item.icon ? <span className="admin-cmdk__icon" aria-hidden="true">{item.icon}</span> : null}
                      <span className="admin-cmdk__label">{item.label}</span>
                      {item.hint ? <span className="admin-cmdk__hint">{item.hint}</span> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
            <footer className="admin-cmdk__foot">
              <span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span>
              <span><kbd>Enter</kbd> открыть</span>
              <span><kbd>Esc</kbd> закрыть</span>
            </footer>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
