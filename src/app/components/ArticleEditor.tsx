import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

type BlockType = 'heading' | 'paragraph' | 'accent' | 'card' | 'quote' | 'spacer' | 'rawHtml';

type HeadingLevel = 2 | 3;

interface ContentBlock {
  id: string;
  type: BlockType;
  text?: string;
  level?: HeadingLevel;
  html?: string;
  space?: number;
}

interface ArticleEditorProps {
  content: string;
  onChange: (html: string) => void;
}

const BLOCK_LABELS: Record<BlockType, string> = {
  heading: 'Заголовок',
  paragraph: 'Абзац',
  accent: 'Акцентный абзац',
  card: 'Полупрозрачная карточка',
  quote: 'Цитата',
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
  const source = String(html || '').trim();
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
  if (type === 'spacer') return { id: uid(), type, space: 24 };
  if (type === 'rawHtml') return { id: uid(), type, html: '<p>Новый HTML блок</p>' };
  return { id: uid(), type, text: '' };
}

function createBlockDraft(type: BlockType): Omit<ContentBlock, 'id'> {
  if (type === 'heading') return { type, level: 2, text: '' };
  if (type === 'spacer') return { type, space: 24 };
  if (type === 'rawHtml') return { type, html: '<p>Новый HTML блок</p>' };
  return { type, text: '' };
}

export default function ArticleEditor({ content, onChange }: ArticleEditorProps) {
  const [blocks, setBlocks] = useState<ContentBlock[]>(() => parseHtmlToBlocks(content));
  const lastIncomingRef = useRef(content);

  useEffect(() => {
    if (content === lastIncomingRef.current) return;
    setBlocks(parseHtmlToBlocks(content));
    lastIncomingRef.current = content;
  }, [content]);

  const htmlOutput = useMemo(() => blocks.map(blockToHtml).join('\n'), [blocks]);

  useEffect(() => {
    if (htmlOutput === content) return;
    onChange(htmlOutput);
  }, [htmlOutput, content, onChange]);

  const addBlock = (type: BlockType) => {
    setBlocks((prev) => [...prev, createBlock(type)]);
  };

  const updateBlock = (id: string, patch: Partial<ContentBlock>) => {
    setBlocks((prev) => prev.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => {
      const next = prev.filter((block) => block.id !== id);
      return next.length > 0 ? next : [{ id: uid(), type: 'paragraph', text: '' }];
    });
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= blocks.length) return;

    setBlocks((prev) => {
      const copy = [...prev];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/40 backdrop-blur-sm p-3">
        <div className="mb-2 text-sm text-muted-foreground">Добавить блок</div>
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
      </div>

      <div className="space-y-3">
        {blocks.map((block, index) => (
          <div key={block.id} className="rounded-xl border border-border bg-card/30 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Блок #{index + 1}</span>
                <select
                  value={block.type}
                  onChange={(e) => updateBlock(block.id, createBlockDraft(e.target.value as BlockType))}
                  className="rounded-md border border-border bg-background/60 px-2 py-1 text-sm"
                >
                  {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
                    <option key={type} value={type}>{BLOCK_LABELS[type]}</option>
                  ))}
                </select>
              </div>

              <div className="inline-flex items-center gap-1">
                <button type="button" onClick={() => moveBlock(index, -1)} className="rounded-md p-1.5 hover:bg-primary/10" title="Вверх">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => moveBlock(index, 1)} className="rounded-md p-1.5 hover:bg-primary/10" title="Вниз">
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => removeBlock(block.id)} className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10" title="Удалить">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {block.type === 'heading' && (
              <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
                <select
                  value={block.level || 2}
                  onChange={(e) => updateBlock(block.id, { level: Number(e.target.value) as HeadingLevel })}
                  className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
                >
                  <option value={2}>H2</option>
                  <option value={3}>H3</option>
                </select>
                <input
                  type="text"
                  value={block.text || ''}
                  onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                  placeholder="Текст заголовка"
                  className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
                />
              </div>
            )}

            {(block.type === 'paragraph' || block.type === 'accent' || block.type === 'card' || block.type === 'quote') && (
              <textarea
                value={block.text || ''}
                onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                rows={block.type === 'quote' ? 3 : 5}
                placeholder="Введите текст блока"
                className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm resize-y"
              />
            )}

            {block.type === 'spacer' && (
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={8}
                  max={120}
                  value={block.space || 24}
                  onChange={(e) => updateBlock(block.id, { space: Number(e.target.value) })}
                  className="w-full"
                />
                <input
                  type="number"
                  min={8}
                  max={120}
                  value={block.space || 24}
                  onChange={(e) => updateBlock(block.id, { space: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-border bg-background/60 px-2 py-1 text-sm"
                />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
            )}

            {block.type === 'rawHtml' && (
              <textarea
                value={block.html || ''}
                onChange={(e) => updateBlock(block.id, { html: e.target.value })}
                rows={7}
                placeholder="<div>Ваш HTML...</div>"
                className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-mono resize-y"
              />
            )}
          </div>
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
  );
}
