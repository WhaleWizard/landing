import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, GripVertical, Copy, Undo2, Redo2, Upload, List, ListOrdered } from 'lucide-react';
import { useDrag, useDrop } from 'react-dnd';
import { sanitizeHtml } from '../utils/sanitizeHtml';

type BlockType = 'heading' | 'paragraph' | 'accent' | 'list' | 'card' | 'quote' | 'code' | 'image' | 'separator' | 'spacer' | 'rawHtml' | 'video' | 'gallery' | 'downloadButton';
type HeadingLevel = 2 | 3;
type HeadingTone = 'default' | 'accent';
type ListStyle = 'bulleted' | 'numbered';
// Тон карточки. Сайт всегда тёмный, поэтому «белый» вариант обязан прописывать
// тёмный цвет текста инлайном прямо на <p> — иначе текст унаследует почти белый
// --blog-text из blog-readable.css и станет невидимым на белом фоне.
type CardTone = 'dark' | 'light' | 'accent';

interface MediaItem {
  url: string;
  alt: string;
}

interface ContentBlock {
  id: string;
  type: BlockType;
  text?: string;
  level?: HeadingLevel;
  headingTone?: HeadingTone;
  listStyle?: ListStyle;
  tone?: CardTone;
  imageUrl?: string;
  imageAlt?: string;
  items?: MediaItem[];
  videoUrl?: string;
  videoTitle?: string;
  html?: string;
  space?: number;
  downloadUrl?: string;
  downloadLabel?: string;
}

interface ArticleEditorProps {
  content: string;
  onChange: (html: string) => void;
  onUpload?: (file: File) => Promise<string | null>;
  readOnly?: boolean;
}

const DRAG_TYPE = 'WW_BLOCK';
const MAX_HISTORY = 80;

const BLOCK_LABELS: Record<Exclude<BlockType, 'list' | 'separator'>, string> = {
  heading: 'Заголовок',
  paragraph: 'Абзац',
  accent: 'Акцентный абзац',
  card: 'Полупрозрачная карточка',
  quote: 'Цитата',
  code: 'Код',
  image: 'Изображение',
  video: 'Видео',
  gallery: 'Галерея изображений',
  downloadButton: 'Кнопка скачивания',
  spacer: 'Отступ',
  rawHtml: 'HTML (fallback)',
};

const BLOCK_TYPES: BlockType[] = ['heading', 'paragraph', 'accent', 'list', 'card', 'quote', 'code', 'image', 'video', 'gallery', 'downloadButton', 'separator', 'spacer', 'rawHtml'];

function getBlockLabel(type: BlockType): string {
  if (type === 'list') return 'Список';
  if (type === 'separator') return 'Разделитель';
  return BLOCK_LABELS[type];
}

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

function textToHtml(value = ''): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br />');
}

function textFromHtml(element: Element): string {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith('\n'));
  return copy.textContent?.trim() || '';
}

function listItems(value = ''): string[] {
  return value.split(/\r?\n/).map((item) => item.replace(/^\s*(?:[-–—•*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
}

function blockToHtml(block: ContentBlock): string {
  switch (block.type) {
    case 'heading': {
      const level = block.level === 3 ? 3 : 2;
      const tag = level === 3 ? 'h3' : 'h2';
      const accentStyle = block.headingTone === 'accent' ? 'color:#b58cff;text-shadow:0 0 24px rgba(139,92,246,.28);' : '';
      return `<${tag} data-ww-block="heading" data-ww-tone="${block.headingTone === 'accent' ? 'accent' : 'default'}" style="margin:1.2em 0 0.55em;font-weight:800;line-height:1.2;font-size:${level === 3 ? '1.45rem' : '1.95rem'};letter-spacing:-0.01em;${accentStyle}">${escapeHtml(block.text || '')}</${tag}>`;
    }
    case 'paragraph':
      return `<p data-ww-block="paragraph" style="margin:0 0 1.1em;line-height:1.85;font-size:1.04rem;">${textToHtml(block.text || '')}</p>`;
    case 'accent':
      return `<div data-ww-block="accent" style="margin:1.1em 0;padding:0.9em 1.1em;border-left:3px solid rgba(139,92,246,.9);background:rgba(139,92,246,.08);border-radius:0.7rem;"><p style="margin:0;line-height:1.8;">${textToHtml(block.text || '')}</p></div>`;
    case 'list': {
      const tag = block.listStyle === 'numbered' ? 'ol' : 'ul';
      return `<${tag} data-ww-block="list" data-ww-tone="${block.listStyle || 'bulleted'}" style="margin:1.1em 0;padding-left:1.35em;line-height:1.85;">${listItems(block.text).map((item) => `<li style="margin:.38em 0;">${escapeHtml(item)}</li>`).join('')}</${tag}>`;
    }
    case 'card': {
      const tone: CardTone = block.tone === 'light' || block.tone === 'accent' ? block.tone : 'dark';
      if (tone === 'light') {
        return `<div data-ww-block="card" data-ww-tone="light" style="margin:1.1em 0;padding:1em 1.15em;background:#f7f8fb;border:1px solid rgba(10,12,20,.1);border-radius:0.95rem;"><p style="margin:0;line-height:1.8;color:#141824;">${textToHtml(block.text || '')}</p></div>`;
      }
      if (tone === 'accent') {
        return `<div data-ww-block="card" data-ww-tone="accent" style="margin:1.1em 0;padding:1em 1.15em;background:rgba(139,92,246,.12);border:1px solid rgba(139,92,246,.28);border-radius:0.95rem;"><p style="margin:0;line-height:1.8;">${textToHtml(block.text || '')}</p></div>`;
      }
      return `<div data-ww-block="card" style="margin:1.1em 0;padding:1em 1.15em;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(6px);border-radius:0.95rem;"><p style="margin:0;line-height:1.8;">${textToHtml(block.text || '')}</p></div>`;
    }
    case 'quote':
      return `<blockquote data-ww-block="quote" style="margin:1.2em 0;padding:0.8em 1em;border-left:3px solid rgba(255,255,255,.35);font-style:italic;opacity:.95;">${textToHtml(block.text || '')}</blockquote>`;
    case 'code': {
      // Код экранируется целиком: <, > и & превращаются в текст, поэтому
      // санитайзер ничего не вырежет (например, пример пикселя со <script>).
      const codeText = String(block.text || '').replace(/\r\n/g, '\n');
      if (!codeText.trim()) return '';
      return `<pre data-ww-block="code" style="margin:1.2em 0;padding:1em 1.15em;background:#0f1014;border:1px solid rgba(255,255,255,.14);border-radius:0.9rem;overflow-x:auto;"><code style="display:block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace;font-size:0.88rem;line-height:1.7;color:#e7e9f2;white-space:pre;background:transparent;border:none;">${escapeHtml(codeText)}</code></pre>`;
    }
    case 'image': {
      const src = String(block.imageUrl || '').trim();
      if (!src) return '';
      const alt = escapeHtml(block.imageAlt || '');
      return `<figure data-ww-block="image" style="margin:1.25em 0;"><img src="${escapeHtml(src)}" alt="${alt}" loading="lazy" style="width:100%;height:auto;border-radius:1rem;border:1px solid rgba(255,255,255,.14);" />${alt ? `<figcaption style="margin-top:.55rem;opacity:.75;font-size:.9rem;line-height:1.5;">${alt}</figcaption>` : ''}</figure>`;
    }
    case 'video': {
      const url = String(block.videoUrl || '').trim();
      if (!url) return '';
      const embedUrl = url.replace('watch?v=', 'embed/').split('&')[0];
      return `<div data-ww-block="video" style="margin:1.25em 0;position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:1rem;border:1px solid rgba(255,255,255,.14);"><iframe src="${escapeHtml(embedUrl)}" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allowfullscreen></iframe></div>`;
    }
    case 'gallery': {
      const items = block.items || [];
      if (items.length === 0) return '';
      return `<div data-ww-block="gallery" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin:1.25em 0;">${items.map((item) => `<figure style="margin:0;"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt)}" loading="lazy" style="width:100%;height:auto;border-radius:1rem;border:1px solid rgba(255,255,255,.14);" /></figure>`).join('')}</div>`;
    }
    case 'downloadButton': {
  const label = block.downloadLabel || 'Скачать';
  const url = block.downloadUrl || '#';
  return `<div data-ww-block="downloadButton" style="text-align:center;margin:1.5em 0;"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="blog-touch-target group relative inline-flex items-center justify-center gap-3 px-10 md:px-14 py-2.5 md:py-3 rounded-2xl font-semibold text-white bg-gradient-to-r from-primary to-accent shadow-xl shadow-primary/30 overflow-hidden transition-all hover:scale-105 active:scale-95 cursor-pointer" style="display:inline-flex;text-decoration:none;color:white;min-width:260px;"><div style="position:absolute;inset:0;background:linear-gradient(to right,transparent,rgba(255,255,255,0.2),transparent);transform:translateX(-120%);transition:transform 1s;" class="group-hover:translate-x-[120%]"></div><span style="position:relative;">${escapeHtml(label)}</span></a></div>`;
}
    case 'spacer': {
      const value = Math.min(120, Math.max(8, Number(block.space || 24)));
      return `<div data-ww-block="spacer" style="height:${value}px;"></div>`;
    }
    case 'separator':
      return '<hr data-ww-block="separator" style="border:0;height:1px;margin:2.1em 0;background:linear-gradient(90deg,transparent,rgba(139,92,246,.72),rgba(236,72,153,.65),transparent);" />';
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

  if (wwType === 'code' || tag === 'pre') {
    // Текст кода берём как есть (без trim по строкам), убираем только крайние переводы строк
    const codeEl = node.querySelector('code');
    const codeText = (codeEl ?? node).textContent ?? '';
    return { id: uid(), type: 'code', text: codeText.replace(/^\n+|\n+$/g, '') };
  }
  if (wwType === 'accent') return { id: uid(), type: 'accent', text: textFromHtml(node) };
  if (wwType === 'list' || tag === 'ul' || tag === 'ol') {
    return { id: uid(), type: 'list', listStyle: tag === 'ol' || node.getAttribute('data-ww-tone') === 'numbered' ? 'numbered' : 'bulleted', text: Array.from(node.querySelectorAll(':scope > li')).map((item) => item.textContent?.trim() || '').join('\n') };
  }
  if (wwType === 'card') {
    const rawTone = node.getAttribute('data-ww-tone');
    const tone: CardTone = rawTone === 'light' || rawTone === 'accent' ? rawTone : 'dark';
    return { id: uid(), type: 'card', tone, text: textFromHtml(node) };
  }
  if (wwType === 'downloadButton') {
    const link = node.querySelector('a');
    return { id: uid(), type: 'downloadButton', downloadUrl: link?.getAttribute('href') || '', downloadLabel: link?.textContent?.trim() || 'Скачать' };
  }
  if (wwType === 'video') {
    const iframe = node.querySelector('iframe');
    const src = iframe?.getAttribute('src') || '';
    return { id: uid(), type: 'video', videoUrl: src };
  }
  if (wwType === 'gallery') {
    const images = Array.from(node.querySelectorAll('img')).map(img => ({ url: img.getAttribute('src') || '', alt: img.getAttribute('alt') || '' }));
    return { id: uid(), type: 'gallery', items: images };
  }
  if (wwType === 'spacer') {
    const height = Number.parseInt(node.style.height || '24', 10);
    return { id: uid(), type: 'spacer', space: Number.isFinite(height) ? height : 24 };
  }
  if (wwType === 'separator' || tag === 'hr') return { id: uid(), type: 'separator' };
  if (wwType === 'image' || tag === 'img' || (tag === 'figure' && node.querySelector('img'))) {
    const img = tag === 'img' ? node : node.querySelector('img');
    const caption = tag === 'figure' ? node.querySelector('figcaption') : null;
    return { id: uid(), type: 'image', imageUrl: img?.getAttribute('src') || '', imageAlt: img?.getAttribute('alt') || caption?.textContent?.trim() || '' };
  }
  if (tag === 'h2' || tag === 'h3') return { id: uid(), type: 'heading', level: tag === 'h3' ? 3 : 2, headingTone: node.getAttribute('data-ww-tone') === 'accent' ? 'accent' : 'default', text: node.textContent?.trim() || '' };
  if (tag === 'p') return { id: uid(), type: 'paragraph', text: textFromHtml(node) };
  if (tag === 'blockquote') return { id: uid(), type: 'quote', text: textFromHtml(node) };
  if (tag === 'div' && node.style.height && !node.textContent?.trim()) {
    const height = Number.parseInt(node.style.height, 10);
    if (Number.isFinite(height)) return { id: uid(), type: 'spacer', space: height };
  }
  return { id: uid(), type: 'rawHtml', html: node.outerHTML };
}

function parseHtmlToBlocks(html: string): ContentBlock[] {
  const source = String(html || '').trim();
  if (!source) return [{ id: uid(), type: 'paragraph', text: '' }];
  const container = document.createElement('div');
  container.innerHTML = source;
  const blocks = Array.from(container.childNodes)
    .map(parseNodeToBlock)
    .filter((block): block is ContentBlock => block != null);
  return blocks.length > 0 ? blocks : [{ id: uid(), type: 'rawHtml', html: source }];
}

function createBlock(type: BlockType): ContentBlock {
  switch (type) {
    case 'heading': return { id: uid(), type, level: 2, headingTone: 'default', text: '' };
    case 'list': return { id: uid(), type, listStyle: 'bulleted', text: '' };
    case 'image': return { id: uid(), type, imageUrl: '', imageAlt: '' };
    case 'video': return { id: uid(), type, videoUrl: '' };
    case 'gallery': return { id: uid(), type, items: [] };
    case 'downloadButton': return { id: uid(), type, downloadUrl: '', downloadLabel: 'Скачать файл' };
    case 'spacer': return { id: uid(), type, space: 24 };
    case 'rawHtml': return { id: uid(), type, html: '<p>Новый HTML блок</p>' };
    default: return { id: uid(), type, text: '' };
  }
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

function markdownToBlocks(md: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const lines = md.split('\n');
  let buffer = '';
  let codeLines: string[] | null = null; // не null — внутри ```-блока
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (codeLines === null) {
        if (buffer.trim()) { blocks.push({ id: uid(), type: 'paragraph', text: buffer.trim() }); buffer = ''; }
        codeLines = [];
      } else {
        blocks.push({ id: uid(), type: 'code', text: codeLines.join('\n') });
        codeLines = null;
      }
      continue;
    }
    if (codeLines !== null) { codeLines.push(line); continue; }
    if (/^###\s/.test(line)) {
      if (buffer.trim()) { blocks.push({ id: uid(), type: 'paragraph', text: buffer.trim() }); buffer = ''; }
      blocks.push({ id: uid(), type: 'heading', level: 3, text: line.replace(/^###\s/, '') });
    } else if (/^##\s/.test(line)) {
      if (buffer.trim()) { blocks.push({ id: uid(), type: 'paragraph', text: buffer.trim() }); buffer = ''; }
      blocks.push({ id: uid(), type: 'heading', level: 2, text: line.replace(/^##\s/, '') });
    } else if (/^>\s/.test(line)) {
      if (buffer.trim()) { blocks.push({ id: uid(), type: 'paragraph', text: buffer.trim() }); buffer = ''; }
      blocks.push({ id: uid(), type: 'quote', text: line.replace(/^>\s/, '') });
    } else if (line.trim() === '---') {
      if (buffer.trim()) { blocks.push({ id: uid(), type: 'paragraph', text: buffer.trim() }); buffer = ''; }
      blocks.push({ id: uid(), type: 'spacer', space: 24 });
    } else {
      buffer += line + '\n';
    }
  }
  if (codeLines !== null && codeLines.length > 0) blocks.push({ id: uid(), type: 'code', text: codeLines.join('\n') });
  if (buffer.trim()) blocks.push({ id: uid(), type: 'paragraph', text: buffer.trim() });
  return blocks.length > 0 ? blocks : [{ id: uid(), type: 'paragraph', text: '' }];
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
  onInsertAfter: (id: string, type?: BlockType) => void;
  onUpdate: (id: string, patch: Partial<ContentBlock>) => void;
  onUpload?: (file: File) => Promise<string | null>;
}

const DraggableBlockItem = memo(function DraggableBlockItem({
  block, index, selected, onSelect, onMove, onDuplicate, onDelete, onMoveArrow, onInsertAfter, onUpdate, onUpload,
}: DraggableBlockItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isDragging }, drag] = useDrag(() => ({
    type: DRAG_TYPE, item: { index },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [index]);

  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: DRAG_TYPE,
    hover: (dragged: { index: number }, monitor) => {
      if (!ref.current || dragged.index === index) return;
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
    collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }), canDrop: monitor.canDrop() }),
  }), [index, onMove]);

  drag(drop(ref));

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');
    if (html) {
      const container = document.createElement('div');
      container.innerHTML = html;
      const img = container.querySelector('img');
      if (img) {
        onUpdate(block.id, { imageUrl: img.getAttribute('src') || '', imageAlt: img.getAttribute('alt') || '' });
        return;
      }
      const pastedBlocks = parseHtmlToBlocks(html);
      if (pastedBlocks.length === 1 && pastedBlocks[0].type === 'image') {
        onUpdate(block.id, { type: 'image', imageUrl: pastedBlocks[0].imageUrl, imageAlt: pastedBlocks[0].imageAlt });
      } else {
        onUpdate(block.id, { text: (block.text || '') + plain });
      }
    } else {
      onUpdate(block.id, { text: (block.text || '') + plain });
    }
  }, [block.id, onUpdate, block.text]);

  return (
    <div
      ref={ref}
      onClick={() => onSelect(block.id)}
      className={`admin-editor-block rounded-xl border bg-[var(--adm-card)] p-3 sm:p-4 space-y-3 transition ${selected ? 'border-[var(--adm-primary)]/70 ring-1 ring-[var(--adm-primary)]/40' : 'border-[var(--adm-border)]'} ${isOver && canDrop ? 'border-[var(--adm-primary)]/80' : ''}`}
      style={{ opacity: isDragging ? 0.45 : 1 }}
    >
      <div className="admin-block-head flex flex-wrap items-center justify-between gap-2">
        <div className="admin-block-head__type inline-flex min-w-0 flex-1 items-center gap-2">
          <button type="button" className="rounded-md p-1.5 text-[var(--adm-fg)]/60 hover:bg-[var(--adm-primary)]/10 cursor-grab active:cursor-grabbing" title="Перетащить" aria-label="Перетащить блок">
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-xs uppercase tracking-wide text-[var(--adm-fg)]/60">Блок #{index + 1}</span>
          <select
            value={block.type}
            onChange={(e) => onUpdate(block.id, { type: e.target.value as BlockType, ...(e.target.value === 'heading' ? { level: 2 } : {}) })}
            className="min-w-0 flex-1 rounded-md border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-2 py-1 text-sm"
            aria-label={`Тип блока ${index + 1}`}
          >
            {BLOCK_TYPES.map((type) => (
              <option key={type} value={type}>{getBlockLabel(type)}</option>
            ))}
          </select>
        </div>
        <div className="inline-flex items-center gap-1">
          <button type="button" onClick={() => onInsertAfter(block.id)} className="rounded-md p-1.5 text-[var(--adm-primary)] hover:bg-[var(--adm-primary)]/10" title="Добавить абзац сразу после этого блока" aria-label="Добавить абзац после блока"><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={() => onMoveArrow(index, -1)} className="rounded-md p-1.5 hover:bg-[var(--adm-primary)]/10" title="Вверх" aria-label="Переместить блок вверх"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" onClick={() => onMoveArrow(index, 1)} className="rounded-md p-1.5 hover:bg-[var(--adm-primary)]/10" title="Вниз" aria-label="Переместить блок вниз"><ArrowDown className="h-4 w-4" /></button>
          <button type="button" onClick={() => onDuplicate(block.id)} className="rounded-md p-1.5 hover:bg-[var(--adm-primary)]/10" title="Дублировать" aria-label="Дублировать блок"><Copy className="h-4 w-4" /></button>
          <button type="button" onClick={() => onDelete(block.id)} className="rounded-md p-1.5 text-[var(--adm-danger)] hover:bg-[var(--adm-danger)]/10" title="Удалить" aria-label="Удалить блок"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      {block.type === 'heading' && (
        <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
          <select aria-label="Уровень заголовка" value={block.level || 2} onChange={(e) => onUpdate(block.id, { level: Number(e.target.value) as HeadingLevel })} className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-sm">
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
          <input aria-label="Текст заголовка" type="text" value={block.text || ''} onChange={(e) => onUpdate(block.id, { text: e.target.value })} placeholder="Текст заголовка" className="w-full rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-sm" />
          <select aria-label="Цвет заголовка" value={block.headingTone || 'default'} onChange={(e) => onUpdate(block.id, { headingTone: e.target.value as HeadingTone })} className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-sm">
            <option value="default">Основной цвет</option>
            <option value="accent">Фиолетовый акцент</option>
          </select>
        </div>
      )}

      {block.type === 'card' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--adm-fg)]/60">Фон карточки</span>
          <select
            aria-label="Фон карточки"
            value={block.tone || 'dark'}
            onChange={(e) => onUpdate(block.id, { tone: e.target.value as CardTone })}
            className="rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-1.5 text-sm text-[var(--adm-fg)]"
          >
            <option value="dark">Тёмный (стекло)</option>
            <option value="light">Белый</option>
            <option value="accent">Фиолетовый акцент</option>
          </select>
        </div>
      )}

      {(block.type === 'paragraph' || block.type === 'accent' || block.type === 'card' || block.type === 'quote' || block.type === 'list') && (
        <>
        {block.type === 'list' && (
          <div className="flex items-center gap-2 text-xs text-[var(--adm-fg)]/65">
            <span>Вид списка</span>
            <button type="button" onClick={() => onUpdate(block.id, { listStyle: 'bulleted' })} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 ${block.listStyle !== 'numbered' ? 'border-[var(--adm-primary)] bg-[var(--adm-primary)]/10' : 'border-[var(--adm-border)]'}`}><List className="h-3.5 w-3.5" />Маркер</button>
            <button type="button" onClick={() => onUpdate(block.id, { listStyle: 'numbered' })} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 ${block.listStyle === 'numbered' ? 'border-[var(--adm-primary)] bg-[var(--adm-primary)]/10' : 'border-[var(--adm-border)]'}`}><ListOrdered className="h-3.5 w-3.5" />Номер</button>
          </div>
        )}
        <textarea
          data-block-input={block.id}
          aria-label={`Содержимое блока ${getBlockLabel(block.type)}`}
          value={block.text || ''}
          onChange={(e) => onUpdate(block.id, { text: e.target.value })}
          onPaste={handlePaste}
          rows={block.type === 'quote' ? 3 : 5}
          placeholder={block.type === 'list' ? 'Каждый пункт — с новой строки' : 'Введите текст. Enter создаёт новую строку.'}
          className="w-full rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-sm text-[var(--adm-fg)] resize-y"
        />
        </>
      )}

      {block.type === 'code' && (
        <textarea
          aria-label="Код"
          value={block.text || ''}
          onChange={(e) => onUpdate(block.id, { text: e.target.value })}
          rows={8}
          spellCheck={false}
          placeholder={'Вставьте код: пример пикселя, событие CAPI, фрагмент настройки…'}
          className="w-full rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-xs font-mono text-[var(--adm-fg)] resize-y whitespace-pre"
        />
      )}

      {block.type === 'image' && (
        <div className="space-y-2">
          <input aria-label="URL изображения" type="url" value={block.imageUrl || ''} onChange={(e) => onUpdate(block.id, { imageUrl: e.target.value })} placeholder="https://i.ibb.co/.../image.jpg" className="w-full rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-sm" />
          <input aria-label="Альтернативный текст изображения" type="text" value={block.imageAlt || ''} onChange={(e) => onUpdate(block.id, { imageAlt: e.target.value })} placeholder="Alt текст изображения" className="w-full rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-sm" />
          {onUpload && (
            <div className="admin-mobile-stack flex gap-2 items-end">
              <label className="cursor-pointer px-3 py-2 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] hover:bg-[var(--adm-primary)]/10 transition flex items-center gap-1">
                <Upload className="w-4 h-4" />
                <input type="file" accept="image/*" className="hidden" aria-label="Загрузить изображение" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = await onUpload(file);
                  if (url) onUpdate(block.id, { imageUrl: url });
                }} />
              </label>
            </div>
          )}
        </div>
      )}

      {block.type === 'video' && (
        <div className="space-y-2">
          <input aria-label="URL видео" type="url" value={block.videoUrl || ''} onChange={(e) => onUpdate(block.id, { videoUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=..." className="w-full rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-sm" />
          <input aria-label="Название видео" type="text" value={block.videoTitle || ''} onChange={(e) => onUpdate(block.id, { videoTitle: e.target.value })} placeholder="Название видео (необязательно)" className="w-full rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-sm" />
        </div>
      )}

      {block.type === 'gallery' && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--adm-fg)]/60">Каждый URL с новой строки</p>
          <textarea
            aria-label="URL изображений галереи"
            value={(block.items || []).map((item) => item.url).join('\n')}
            onChange={(e) => {
              const urls = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
              const items = urls.map((url) => ({ url, alt: '' }));
              onUpdate(block.id, { items });
            }}
            rows={5}
            placeholder={"https://i.ibb.co/.../image1.jpg\nhttps://i.ibb.co/.../image2.jpg"}
            className="w-full rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-sm resize-y"
          />
          {onUpload && (
            <div className="admin-mobile-stack flex gap-2 items-end">
              <label className="cursor-pointer px-3 py-2 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] hover:bg-[var(--adm-primary)]/10 transition flex items-center gap-1">
                <Upload className="w-4 h-4" />
                <input type="file" accept="image/*" multiple className="hidden" aria-label="Загрузить изображения галереи" onChange={async (e) => {
                  const files = e.target.files;
                  if (!files?.length) return;
                  const newItems: MediaItem[] = [];
                  for (let i = 0; i < files.length; i++) {
                    const url = await onUpload(files[i]);
                    if (url) newItems.push({ url, alt: '' });
                  }
                  if (newItems.length > 0) {
                    onUpdate(block.id, { items: [...(block.items || []), ...newItems] });
                  }
                }} />
              </label>
            </div>
          )}
        </div>
      )}

      {block.type === 'downloadButton' && (
        <div className="space-y-2">
          <input aria-label="Текст кнопки скачивания" type="text" value={block.downloadLabel || ''} onChange={(e) => onUpdate(block.id, { downloadLabel: e.target.value })} placeholder="Текст кнопки" className="w-full rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-sm" />
          <div className="admin-mobile-stack flex gap-2">
            <input aria-label="Ссылка на файл" type="url" value={block.downloadUrl || ''} onChange={(e) => onUpdate(block.id, { downloadUrl: e.target.value })} placeholder="Ссылка на файл" className="flex-1 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-sm" />
            {onUpload && (
              <label className="cursor-pointer px-3 py-2 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] hover:bg-[var(--adm-primary)]/10 transition flex items-center gap-1">
                <Upload className="w-4 h-4" />
                <input type="file" className="hidden" aria-label="Загрузить файл" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = await onUpload(file);
                  if (url) onUpdate(block.id, { downloadUrl: url });
                }} />
              </label>
            )}
          </div>
        </div>
      )}

      {block.type === 'spacer' && (
        <div className="flex items-center gap-3">
          <input aria-label="Размер отступа" type="range" min={8} max={120} value={block.space || 24} onChange={(e) => onUpdate(block.id, { space: Number(e.target.value) })} className="w-full" />
          <input aria-label="Размер отступа в пикселях" type="number" min={8} max={120} value={block.space || 24} onChange={(e) => onUpdate(block.id, { space: Number(e.target.value) })} className="w-20 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-2 py-1 text-sm" />
          <span className="text-xs text-[var(--adm-fg)]/60">px</span>
        </div>
      )}

      {block.type === 'rawHtml' && (
        <textarea
          aria-label="HTML блока"
          value={block.html || ''}
          onChange={(e) => onUpdate(block.id, { html: e.target.value })}
          rows={7}
          placeholder="<div>Ваш HTML...</div>"
          className="w-full rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-xs font-mono resize-y"
        />
      )}
    </div>
  );
});

export default function ArticleEditor({ content, onChange, onUpload, readOnly = false }: ArticleEditorProps) {
  const [blocks, setBlocks] = useState<ContentBlock[]>(() => parseHtmlToBlocks(content));
  const [history, setHistory] = useState<{ past: ContentBlock[][]; future: ContentBlock[][] }>({ past: [], future: [] });
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [markdownMode, setMarkdownMode] = useState(false);
  const [mdText, setMdText] = useState('');
  const isLocalSyncRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (isLocalSyncRef.current) { isLocalSyncRef.current = false; return; }
    setBlocks(parseHtmlToBlocks(content));
    setHistory({ past: [], future: [] });
  }, [content]);

  useEffect(() => {
    if (!selectedBlockId) return;
    const frame = window.requestAnimationFrame(() => {
      const input = document.querySelector<HTMLTextAreaElement>(`[data-block-input="${selectedBlockId}"]`);
      input?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedBlockId]);

  const htmlOutput = useMemo(() => sanitizeHtml(blocks.map(blockToHtml).join('\n')), [blocks]);

  useEffect(() => {
    if (readOnly) return;
    if (htmlOutput === content) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      isLocalSyncRef.current = true;
      onChange(htmlOutput);
    }, 220);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [htmlOutput, content, onChange, readOnly]);

  const toggleMarkdown = useCallback(() => {
    if (markdownMode) {
      const newBlocks = markdownToBlocks(mdText);
      setBlocks(newBlocks);
      setMarkdownMode(false);
    } else {
      const md = blocks.map(block => {
        if (block.type === 'heading') return `${'#'.repeat(block.level || 2)} ${block.text}`;
        if (block.type === 'quote') return `> ${block.text}`;
        if (block.type === 'code') return '```\n' + (block.text || '') + '\n```';
        if (block.type === 'spacer') return '---';
        return block.text || '';
      }).join('\n\n');
      setMdText(md);
      setMarkdownMode(true);
    }
  }, [markdownMode, mdText, blocks]);

  const setBlocksWithHistory = useCallback((updater: ContentBlock[] | ((prev: ContentBlock[]) => ContentBlock[]), keepHistory = true) => {
    setBlocks((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (keepHistory && JSON.stringify(next) !== JSON.stringify(prev)) {
        setHistory((current) => ({
          past: [...current.past, prev].slice(-MAX_HISTORY),
          future: [],
        }));
      }
      return next;
    });
  }, []);

  const addBlock = useCallback((type: BlockType) => {
    const newBlock = createBlock(type);
    setBlocksWithHistory((prev) => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
  }, [setBlocksWithHistory]);

  const insertBlockAfter = useCallback((id: string, type: BlockType = 'paragraph') => {
    const newBlock = createBlock(type);
    setBlocksWithHistory((prev) => {
      const index = prev.findIndex((block) => block.id === id);
      if (index < 0) return [...prev, newBlock];
      const next = [...prev];
      next.splice(index + 1, 0, newBlock);
      return next;
    });
    setSelectedBlockId(newBlock.id);
  }, [setBlocksWithHistory]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!event.ctrlKey || event.key !== 'Enter' || !target?.closest('.admin-article-editor')) return;
      const current = blocks.find((block) => block.id === selectedBlockId);
      if (!current) return;
      event.preventDefault();
      insertBlockAfter(current.id, current.type);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [blocks, insertBlockAfter, selectedBlockId]);

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
      setBlocks(() => previous);
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
      setBlocks(() => next);
      return {
        past: [...current.past, blocks].slice(-MAX_HISTORY),
        future: current.future.slice(1),
      };
    });
  }, [blocks]);

  if (readOnly) {
    return (
      <div className="admin-panel p-4">
        <div className="mb-3 text-sm font-medium text-[var(--adm-fg)]">Просмотр статьи</div>
        {/* data-blog-ui даёт реальные тёмные стили блога независимо от темы админки */}
        <div data-blog-ui="true" className="rounded-xl p-4 sm:p-6">
          <div className="blog-article-content max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
        </div>
      </div>
    );
  }

  return (
      <div className="admin-article-editor space-y-4">
        <div className="admin-panel p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm text-[var(--adm-fg)]/60">Добавить блок</span>
            <div className="inline-flex items-center gap-1">
              <button type="button" onClick={undo} disabled={history.past.length === 0} className="rounded-md p-1.5 hover:bg-[var(--adm-primary)]/10 disabled:opacity-40" title="Undo (Ctrl/Cmd+Z)" aria-label="Отменить изменение"><Undo2 className="h-4 w-4" /></button>
              <button type="button" onClick={redo} disabled={history.future.length === 0} className="rounded-md p-1.5 hover:bg-[var(--adm-primary)]/10 disabled:opacity-40" title="Redo (Ctrl/Cmd+Y)" aria-label="Повторить изменение"><Redo2 className="h-4 w-4" /></button>
              <button type="button" onClick={toggleMarkdown} className="rounded-md p-1.5 text-xs border border-[var(--adm-border)] ml-2 px-2 hover:bg-[var(--adm-primary)]/10">
                {markdownMode ? 'Визуальный' : 'Markdown'}
              </button>
            </div>
          </div>
          <div className="admin-block-palette flex flex-wrap gap-2">
            {BLOCK_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => addBlock(type)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--adm-border)] px-3 py-1.5 text-sm hover:border-[var(--adm-primary)]/50 hover:bg-[var(--adm-primary)]/10 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                {getBlockLabel(type)}
              </button>
            ))}
          </div>
          <p className="admin-meta mt-2">
            Горячие клавиши: Alt+Shift+↑/↓, Ctrl+Enter (новый блок), Ctrl+Z/Y. Markdown: нажмите кнопку для переключения.
          </p>
        </div>

        {markdownMode ? (
          <div className="admin-panel p-4">
            <textarea
              aria-label="Markdown-разметка статьи"
              value={mdText}
              onChange={(e) => setMdText(e.target.value)}
              className="w-full h-64 rounded-lg border border-[var(--adm-border)] bg-[var(--adm-input-bg)] px-3 py-2 text-sm font-mono resize-y"
              placeholder="# Заголовок..."
            />
            <button type="button" onClick={toggleMarkdown} className="admin-button admin-button--primary mt-2">Применить разметку</button>
          </div>
        ) : (
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
                onInsertAfter={insertBlockAfter}
                onUpdate={updateBlock}
                onUpload={onUpload}
              />
            ))}
          </div>
        )}

        <div className="admin-panel p-4">
          <div className="mb-3 text-sm font-medium text-[var(--adm-fg)]">Предпросмотр (как будет выглядеть статья на сайте)</div>
          {/* data-blog-ui даёт реальные тёмные стили блога независимо от темы админки */}
          <div data-blog-ui="true" className="rounded-xl p-4 sm:p-6">
            <div className="blog-article-content max-w-none" dangerouslySetInnerHTML={{ __html: htmlOutput }} />
          </div>
        </div>
      </div>
  );
}
