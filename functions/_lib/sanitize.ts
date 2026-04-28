import { DOMPurify } from 'dompurify';
import { parseHTML } from 'linkedom';
import type { Env } from './types';

// Создаём DOM-окружение один раз
const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
const purify = DOMPurify(document as any);

// Конфигурация, идентичная текущим разрешённым тегам/атрибутам
const CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'strong', 'em', 'b', 'i',
    'blockquote', 'pre', 'code',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'details', 'summary', 'aside', 'section', 'div', 'span',
    'video', 'source', 'iframe',
    'button', 'form', 'input', 'label', 'textarea', 'select', 'option',
    'svg', 'defs', 'linearGradient', 'stop', 'path', // обратите внимание на верблюжий регистр
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style', 'loading',
    'width', 'height', 'data-ww-block',
    'id', 'role', 'aria-label',
    'colspan', 'rowspan', 'scope',
    'srcset', 'sizes',
    'type', 'controls', 'autoplay', 'loop', 'muted', 'playsinline', 'poster', 'preload',
    'name', 'value', 'placeholder', 'for', 'disabled', 'checked', 'selected',
    'rows', 'cols', 'maxlength', 'minlength', 'min', 'max', 'step',
    'method', 'action',
    'allow', 'allowfullscreen', 'frameborder', 'sandbox', 'referrerpolicy',
    'viewBox', 'preserveAspectRatio', 'd', 'fill', 'stroke', 'stroke-width',
    'stroke-linecap', 'x1', 'x2', 'y1', 'y2', 'offset', 'stop-color',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp):\/\/|data:image\/)/i,
  ADD_TAGS: ['iframe'], // Разрешаем только безопасные iframe
  ADD_ATTR: ['allowfullscreen', 'frameborder'],
  WHOLE_DOCUMENT: false,
  RETURN_TRUSTED_TYPE: true,
};

// Дополнительная проверка iframe (только YouTube/Vimeo)
purify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe') {
    const src = node.getAttribute('src') || '';
    const safeHosts = ['www.youtube.com', 'youtube.com', 'youtu.be', 'player.vimeo.com', 'vimeo.com'];
    let isSafe = false;
    try {
      const url = new URL(src);
      isSafe = url.protocol === 'https:' && safeHosts.includes(url.hostname.toLowerCase());
    } catch { /* остаётся false */ }
    if (!isSafe) {
      node.remove();
    }
  }
});

export function sanitizeArticleHtml(input: string): string {
  return purify.sanitize(input, CONFIG);
}
