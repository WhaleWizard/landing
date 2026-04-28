import { parseHTML } from 'linkedom';
import createDOMPurify from 'dompurify';

// Создаём DOM-окружение
const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
const purify = createDOMPurify(document);

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
    'svg', 'defs', 'linearGradient', 'stop', 'path',
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
};

purify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe') {
    const src = node.getAttribute('src') || '';
    const safeHosts = ['www.youtube.com', 'youtube.com', 'youtu.be', 'player.vimeo.com', 'vimeo.com'];
    let isSafe = false;
    try {
      const url = new URL(src);
      isSafe = url.protocol === 'https:' && safeHosts.includes(url.hostname.toLowerCase());
    } catch { /* невалидный URL – удаляем */ }
    if (!isSafe) {
      node.remove();
    }
  }
});

export function sanitizeArticleHtml(input: string): string {
  return purify.sanitize(input, CONFIG);
}
