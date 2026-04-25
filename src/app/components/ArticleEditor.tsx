import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, GripVertical, Copy, Undo2, Redo2 } from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { sanitizeHtml } from '../utils/sanitizeHtml';

type BlockType = 'heading' | 'paragraph' | 'accent' | 'card' | 'quote' | 'image' | 'spacer' | 'rawHtml';

type HeadingLevel = 2 | 3;

interface ContentBlock {
  id: string;
  type: BlockType;
  text?: string;
  level?: HeadingLevel;
  imageUrl?: string;
  imageAlt?: string;
  html?: string;
  space?: number;
}

interface ArticleEditorProps {
  content: string;
  onChange: (html: string) => void;
}

type HistoryState = {
  past: ContentBlock[][];
  future: ContentBlock[][];
};

const DRAG_TYPE = 'WW_BLOCK';
const MAX_HISTORY = 80;

const BLOCK_LABELS: Record<BlockType, string> = {
  heading: 'Заголовок',
  paragraph: 'Абзац',
  accent: 'Акцентный абзац',
  card: 'Полупрозрачная карточка',
  quote: 'Цитата',
  image: 'Изображение',
  spacer: 'Отступ',
  rawHtml: 'HTML (fallback)',
};

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value = ''): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function blockToHtml(block: ContentBlock): string {
  switch (block.type) {
    case 'heading': {
      const level = block.level === 3 ? 3 : 2;
      const tag = level === 3 ? 'h3' : 'h2';
      const size = level === 3 ? '1.45rem' : '1.95rem';
      return `<${tag} data-ww-block="heading" style="margin:1.2em 0 0.55em;font-weight:800;line-height:1.2;font-size:${size};letter-spacing:-0.01em;">${escapeHtml(block.text || '')}</${tag}>`;
    }
    case 'paragraph':
      return `<p data-ww-block="paragraph" style="margin:0 0 1.1em;line-height:1.85;font-size:1.04rem;">${escapeHtml(block.text || '')}</p>`;
    case 'accent':
      return `<div data-ww-block="accent" style="margin:1.1em 0;padding:0.9em 1.1em;border-left:3px solid rgba(139,92,246,.9);background:rgba(139,92,246,.08);border-radius:0.7rem;"><p style="margin:0;line-height:1.8;">${escapeHtml(block.text || '')}</p></div>`;
    case 'card':
      return `<div data-ww-block="card" style="margin:1.1em 0;padding:1em 1.15em;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(6px);border-radius:0.95rem;"><p style="margin:0;line-height:1.8;">${escapeHtml(block.text || '')}</p></div>`;
    case 'quote':
      return `<blockquote data-ww-block="quote" style="margin:1.2em 0;padding:0.8em 1em;border-left:3px solid rgba(255,255,255,.35);font-style:italic;opacity:.95;">${escapeHtml(block.text || '')}</blockquote>`;
    case 'image': {
      const src = String(block.imageUrl || '').trim();
      if (!src) return '';
      const alt = escapeHtml(block.imageAlt || '');
      return `<figure data-ww-block="image" style="margin:1.25em 0;"><img src="${escapeHtml(src)}" alt="${alt}" loading="lazy" style="width:100%;height:auto;border-radius:1rem;border:1px solid rgba(255,255,255,.14);" />${alt ? `<figcaption style="margin-top:.55rem;opacity:.75;font-size:.9rem;line-height:1.5;">${alt}</figcaption>` : ''}</figure>`;
    }
    case 'spacer': {
      const value = Math.min(120, Math.max(8, Number(block.space || 24)));
      return `<div data-ww-block="spacer" style="height:${value}px;"></div>`;
    }
    case 'rawHtml':
      return block.html || '';
    default:
      return '';
  }
}

function parseNodeToBlock(node: ChildNode): ContentBlock | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim() || '';
    if (!text) return null;
    return { id: uid(), type: 'paragraph', text };
  }

  if (!(node instanceof HTMLElement)) return null;

  const tag = node.tagName.toLowerCase();
  const wwType = node.getAttribute('data-ww-block');

  if (wwType === 'accent') {
    return { id: uid(), type: 'accent', text: node.textContent?.trim() || '' };
  }

  if (wwType === 'card') {
    return { id: uid(), type: 'card', text: node.textContent?.trim() || '' };
  }

  if (wwType === 'spacer') {
    const height = Number.parseInt(node.style.height || '24', 10);
    return { id: uid(), type: 'spacer', space: Number.isFinite(height) ? height : 24 };
  }

  if (wwType === 'image' || tag === 'img' || (tag === 'figure' && node.querySelector('img'))) {
    const image = tag === 'img' ? node : node.querySelector('img');
    const caption = tag === 'figure' ? node.querySelector('figcaption') : null;
    const imageUrl = image?.getAttribute('src') || '';
    const imageAlt = image?.getAttribute('alt') || caption?.textContent?.trim() || '';
    return { id: uid(), type: 'image', imageUrl, imageAlt };
  }

  if (tag === 'h2' || tag === 'h3') {
    return { id: uid(), type: 'heading', level: tag === 'h3' ? 3 : 2, text: node.textContent?.trim() || '' };
  }

  if (tag === 'p') {
    return { id: uid(), type: 'paragraph', text: node.textContent?.trim() || '' };
  }

  if (tag === 'blockquote') {
    return { id: uid(), type: 'quote', text: node.textContent?.trim() || '' };
  }

  if (tag === 'div' && node.style.height && !node.textContent?.trim()) {
    const height = Number.parseInt(node.style.height, 10);
    if (Number.isFinite(height)) return { id: uid(), type: 'spacer', space: height };
  }

  return { id: uid(), type: 'rawHtml', html: node.outerHTML };
}

function parseHtmlToBlocks(html: string): ContentBlock[] {
  const source = sanitizeHtml(String(html || '').trim());
  if (!source) {
    return [{ id: uid(), type: 'paragraph', text: '' }];
  }

  const container = document.createElement('div');
  container.innerHTML = source;

  const blocks = Array.from(container.childNodes)
    .map(parseNodeToBlock)
    .filter((block): block is ContentBlock => Boolean(block));

  return blocks.length > 0 ? blocks : [{ id: uid(), type: 'rawHtml', html: source }];
}

function createBlock(type: BlockType): ContentBlock {
  if (type === 'heading') return { id: uid(), type, level: 2, text: '' };
  if (type === 'image') return { id: uid(), type, imageUrl: '', imageAlt: '' };
  if (type === 'spacer') return { id: uid(), type, space: 24 };
  if (type === 'rawHtml') return { id: uid(), type, html: '<p>Новый HTML блок</p>' };
  return { id: uid(), type, text: '' };
}

function createBlockDraft(type: BlockType): Omit<ContentBlock, 'id'> {
  if (type === 'heading') return { type, level: 2, text: '' };
  if (type === 'image') return { type, imageUrl: '', imageAlt: '' };
  if (type === 'spacer') return { type, space: 24 };
  if (type === 'rawHtml') return { type, html: '<p>Новый HTML блок</p>' };
  return { type, text: '' };
}

function duplicateBlock(block: ContentBlock): ContentBlock {
  return { ...block, id: uid() };
}

function moveArrayItem<T>(array: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return array;
  const copy = [...array];
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);
  return copy;
}

interface DraggableBlockItemProps {
  block: ContentBlock;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveArrow: (index: number, direction: -1 | 1) => void;
  onUpdate: (id: string, patch: Partial<ContentBlock>) => void;
}

const DraggableBlockItem = memo(function DraggableBlockItem({
  block,
  index,
  selected,
  onSelect,
  onMove,
  onDuplicate,
  onDelete,
  onMoveArrow,
  onUpdate,
}: DraggableBlockItemProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: DRAG_TYPE,
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [index]);

  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: DRAG_TYPE,
    hover: (dragged: { index: number }, monitor) => {
      if (!ref.current) return;
      if (dragged.index === index) return;

      const rect = ref.current.getBoundingClientRect();
      const middleY = (rect.bottom - rect.top) / 2;
      const offset = monitor.getClientOffset();
      if (!offset) return;

      const hoverY = offset.y - rect.top;

      if (dragged.index < index && hoverY < middleY) return;
      if (dragged.index > index && hoverY > middleY) return;

      onMove(dragged.index, index);
      dragged.index = index;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  }), [index, onMove]);

  drag(drop(ref));

  return (
    <div
      ref={ref}
      onClick={() => onSelect(block.id)}
      className={`rounded-xl border bg-card/30 p-3 space-y-3 transition ${selected ? 'border-primary/70 ring-1 ring-primary/40' : 'border-border'} ${isOver && canDrop ? 'border-primary/80' : ''}`}
      style={{ opacity: isDragging ? 0.45 : 1 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 cursor-grab active:cursor-grabbing"
            title="Перетащить"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Блок #{index + 1}</span>
          <select
            value={block.type}
            onChange={(e) => onUpdate(block.id, createBlockDraft(e.target.value as BlockType))}
            className="rounded-md border border-border bg-background/60 px-2 py-1 text-sm"
          >
            {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
              <option key={type} value={type}>{BLOCK_LABELS[type]}</option>
            ))}
          </select>
        </div>

        <div className="inline-flex items-center gap-1">
          <button type="button" onClick={() => onMoveArrow(index, -1)} className="rounded-md p-1.5 hover:bg-primary/10" title="Вверх">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onMoveArrow(index, 1)} className="rounded-md p-1.5 hover:bg-primary/10" title="Вниз">
            <ArrowDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onDuplicate(block.id)} className="rounded-md p-1.5 hover:bg-primary/10" title="Дублировать">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onDelete(block.id)} className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10" title="Удалить">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {block.type === 'heading' && (
        <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
          <select
            value={block.level || 2}
            onChange={(e) => onUpdate(block.id, { level: Number(e.target.value) as HeadingLevel })}
            className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
          >
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
          <input
            type="text"
            value={block.text || ''}
            onChange={(e) => onUpdate(block.id, { text: e.target.value })}
            placeholder="Текст заголовка"
            className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
          />
        </div>
      )}

      {(block.type === 'paragraph' || block.type === 'accent' || block.type === 'card' || block.type === 'quote') && (
        <textarea
          value={block.text || ''}
          onChange={(e) => onUpdate(block.id, { text: e.target.value })}
          rows={block.type === 'quote' ? 3 : 5}
          placeholder="Введите текст блока"
          className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm resize-y"
        />
      )}

      {block.type === 'image' && (
        <div className="space-y-2">
          <input
            type="url"
            value={block.imageUrl || ''}
            onChange={(e) => onUpdate(block.id, { imageUrl: e.target.value })}
            placeholder="https://i.ibb.co/.../image.jpg"
            className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={block.imageAlt || ''}
            onChange={(e) => onUpdate(block.id, { imageAlt: e.target.value })}
            placeholder="Alt текст изображения"
            className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Для imgbb вставляйте прямую ссылку на изображение (обычно домен i.ibb.co).
          </p>
        </div>
      )}

      {block.type === 'spacer' && (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={8}
            max={120}
            value={block.space || 24}
            onChange={(e) => onUpdate(block.id, { space: Number(e.target.value) })}
            className="w-full"
          />
          <input
            type="number"
            min={8}
            max={120}
            value={block.space || 24}
            onChange={(e) => onUpdate(block.id, { space: Number(e.target.value) })}
            className="w-20 rounded-lg border border-border bg-background/60 px-2 py-1 text-sm"
          />
          <span className="text-xs text-muted-foreground">px</span>
        </div>
      )}

      {block.type === 'rawHtml' && (
        <textarea
          value={block.html || ''}
          onChange={(e) => onUpdate(block.id, { html: e.target.value })}
          rows={7}
          placeholder="<div>Ваш HTML...</div>"
          className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-mono resize-y"
        />
      )}
    </div>
  );
});

export default function ArticleEditor({ content, onChange }: ArticleEditorProps) {
  const [blocks, setBlocks] = useState<ContentBlock[]>(() => parseHtmlToBlocks(content));
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const isLocalSyncRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  const setBlocksWithHistory = useCallback((updater: ContentBlock[] | ((prev: ContentBlock[]) => ContentBlock[]), keepHistory = true) => {
    setBlocks((prev) => {
      const next = typeof updater === 'function' ? (updater as (prev: ContentBlock[]) => ContentBlock[])(prev) : updater;
      if (keepHistory && JSON.stringify(next) !== JSON.stringify(prev)) {
        setHistory((current) => ({
          past: [...current.past, prev].slice(-MAX_HISTORY),
          future: [],
        }));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (isLocalSyncRef.current) {
      isLocalSyncRef.current = false;
      return;
    }

    setBlocks(parseHtmlToBlocks(content));
    setHistory({ past: [], future: [] });
  }, [content]);

  const htmlOutput = useMemo(() => sanitizeHtml(blocks.map(blockToHtml).join('\n')), [blocks]);

  useEffect(() => {
    if (htmlOutput === content) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      isLocalSyncRef.current = true;
      onChange(htmlOutput);
      saveTimerRef.current = null;
    }, 220);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [htmlOutput, content, onChange]);

  const addBlock = useCallback((type: BlockType) => {
    const newBlock = createBlock(type);
    setBlocksWithHistory((prev) => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
  }, [setBlocksWithHistory]);

  const updateBlock = useCallback((id: string, patch: Partial<ContentBlock>) => {
    setBlocksWithHistory((prev) => prev.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  }, [setBlocksWithHistory]);

  const removeBlock = useCallback((id: string) => {
    setBlocksWithHistory((prev) => {
      const next = prev.filter((block) => block.id !== id);
      return next.length > 0 ? next : [{ id: uid(), type: 'paragraph', text: '' }];
    });
    setSelectedBlockId((prev) => (prev === id ? null : prev));
  }, [setBlocksWithHistory]);

  const moveBlock = useCallback((fromIndex: number, toIndex: number) => {
    setBlocksWithHistory((prev) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev;
      return moveArrayItem(prev, fromIndex, toIndex);
    });
  }, [setBlocksWithHistory]);

  const moveBlockByArrow = useCallback((index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= blocks.length) return;
    setBlocksWithHistory((prev) => moveArrayItem(prev, index, nextIndex));
  }, [blocks.length, setBlocksWithHistory]);

  const duplicateById = useCallback((id: string) => {
    setBlocksWithHistory((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index < 0) return prev;
      const copy = duplicateBlock(prev[index]);
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      setSelectedBlockId(copy.id);
      return next;
    });
  }, [setBlocksWithHistory]);

  const undo = useCallback(() => {
    setHistory((current) => {
      if (current.past.length === 0) return current;
      const previous = current.past[current.past.length - 1];
      setBlocks((active) => previous);
      return {
        past: current.past.slice(0, -1),
        future: [blocks, ...current.future].slice(0, MAX_HISTORY),
      };
    });
  }, [blocks]);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (current.future.length === 0) return current;
      const next = current.future[0];
      setBlocks((active) => next);
      return {
        past: [...current.past, blocks].slice(-MAX_HISTORY),
        future: current.future.slice(1),
      };
    });
  }, [blocks]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if ((mod && event.key.toLowerCase() === 'y') || (mod && event.shiftKey && event.key.toLowerCase() === 'z')) {
        event.preventDefault();
        redo();
        return;
      }

      if (!event.altKey || !event.shiftKey || !selectedBlockId) return;
      const index = blocks.findIndex((block) => block.id === selectedBlockId);
      if (index < 0) return;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveBlockByArrow(index, -1);
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveBlockByArrow(index, 1);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [blocks, moveBlockByArrow, redo, selectedBlockId, undo]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card/40 backdrop-blur-sm p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Добавить блок</span>
            <div className="inline-flex items-center gap-1">
              <button type="button" onClick={undo} disabled={history.past.length === 0} className="rounded-md p-1.5 hover:bg-primary/10 disabled:opacity-40" title="Undo (Ctrl/Cmd+Z)">
                <Undo2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={redo} disabled={history.future.length === 0} className="rounded-md p-1.5 hover:bg-primary/10 disabled:opacity-40" title="Redo (Ctrl/Cmd+Y)">
                <Redo2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => addBlock(type)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary/50 hover:bg-primary/10 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                {BLOCK_LABELS[type]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Перетаскивание: возьмите блок за иконку ⋮⋮. Горячие клавиши: Alt+Shift+↑/↓, Undo/Redo: Ctrl/Cmd+Z, Ctrl/Cmd+Y.
          </p>
        </div>

        <div className="space-y-3">
          {blocks.map((block, index) => (
            <DraggableBlockItem
              key={block.id}
              block={block}
              index={index}
              selected={selectedBlockId === block.id}
              onSelect={setSelectedBlockId}
              onMove={moveBlock}
              onDuplicate={duplicateById}
              onDelete={removeBlock}
              onMoveArrow={moveBlockByArrow}
              onUpdate={updateBlock}
            />
          ))}
        </div>

        <div className="rounded-xl border border-primary/20 bg-card/20 p-4">
          <div className="mb-3 text-sm font-medium">Предпросмотр (как будет выглядеть статья)</div>
          <div
            className="prose prose-invert prose-lg prose-headings:text-foreground prose-a:text-primary prose-strong:text-primary max-w-none"
            dangerouslySetInnerHTML={{ __html: htmlOutput }}
          />
        </div>
      </div>
    </DndProvider>
  );
}
