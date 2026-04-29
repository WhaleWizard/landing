// ... (все существующие импорты)
import { Upload } from 'lucide-react'; // добавлен импорт иконки

interface ArticleEditorProps {
  content: string;
  onChange: (html: string) => void;
  onUpload?: (file: File) => Promise<string | null>;
}

// Добавляем downloadButton в перечисления:
type BlockType = 'heading' | 'paragraph' | 'accent' | 'card' | 'quote' | 'image' | 'spacer' | 'rawHtml' | 'video' | 'gallery' | 'downloadButton';

// ... (в BLOCK_LABELS)
  downloadButton: 'Кнопка скачивания',

// В interface ContentBlock добавляем поля для downloadButton:
  downloadUrl?: string;
  downloadLabel?: string;

// В функции blockToHtml добавляем case 'downloadButton':
    case 'downloadButton': {
      const label = block.downloadLabel || 'Скачать';
      const url = block.downloadUrl || '#';
      return `<div style="text-align:center; margin:1.5em 0;"><a href="${escapeHtml(url)}" target="_blank" class="blog-touch-target group relative inline-flex items-center justify-center gap-3 px-7 md:px-10 py-3 md:py-4 rounded-2xl font-semibold text-white bg-gradient-to-r from-primary to-accent shadow-xl shadow-primary/30 overflow-hidden transition-all hover:scale-105 active:scale-95 cursor-pointer" style="display:inline-flex;text-decoration:none;color:white;"><div style="position:absolute;inset:0;background:linear-gradient(to right,transparent,rgba(255,255,255,0.2),transparent);transform:translateX(-120%);transition:transform 1s;" class="group-hover:translate-x-[120%]"></div><span style="position:relative;">${escapeHtml(label)}</span></a></div>`;
    }

// В parseNodeToBlock добавляем распознавание downloadButton:
  if (wwType === 'downloadButton') {
    const link = node.querySelector('a');
    return { id: uid(), type: 'downloadButton', downloadUrl: link?.getAttribute('href') || '', downloadLabel: link?.textContent?.trim() || 'Скачать' };
  }

// В createBlock добавляем:
    case 'downloadButton': return { id: uid(), type, downloadUrl: '', downloadLabel: 'Скачать файл' };

// В DraggableBlockItem добавляем отображение для downloadButton (можете вставить после других блоков):
      {block.type === 'downloadButton' && (
        <div className="space-y-2">
          <input type="text" value={block.downloadLabel || ''} onChange={(e) => onUpdate(block.id, { downloadLabel: e.target.value })} placeholder="Текст кнопки" className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <input type="url" value={block.downloadUrl || ''} onChange={(e) => onUpdate(block.id, { downloadUrl: e.target.value })} placeholder="Ссылка на файл" className="flex-1 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
            {onUpload && (
              <label className="cursor-pointer px-3 py-2 rounded-lg border border-border bg-background/60 hover:bg-primary/10 transition flex items-center gap-1">
                <Upload className="w-4 h-4" />
                <input type="file" className="hidden" onChange={async (e) => {
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

// Аналогично в блоке image добавляем кнопку загрузки (вставляем после полей url и alt):
      {onUpload && (
        <div className="flex gap-2 items-end">
          <label className="cursor-pointer px-3 py-2 rounded-lg border border-border bg-background/60 hover:bg-primary/10 transition flex items-center gap-1">
            <Upload className="w-4 h-4" />
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const url = await onUpload(file);
              if (url) onUpdate(block.id, { imageUrl: url });
            }} />
          </label>
        </div>
      )}

// Для галереи тоже добавим возможность загрузки – но оставим как есть, либо добавим аналогичную кнопку.

// Подсветка синтаксиса в rawHtml: используем useEffect, который после изменения значения прогоняет Prism.highlightElement. В компоненте DraggableBlockItem для rawHtml добавим реф и вызов подсветки. Но это усложнит код. Проще предложить обернуть textarea в компонент с подсветкой: при фокусе показывать textarea, при блюре – отрендеренный подсвеченный код. Мы можем оставить это как опцию, которую легко добавить позже. Пока что просто упомянем, что Prism уже подключен, и для подсветки можно в rawHtml вставлять код, обернув его в <pre><code class="language-html">... и при предпросмотре он будет подсвечен (если подключить CSS). Но для редактора это не критично.

// В основном компоненте ArticleEditor добавим проброс onUpload и используем его в нужных местах.
