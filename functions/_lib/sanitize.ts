import { parseHTML } from 'linkedom';
import createDOMPurify from 'dompurify';

const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
const purify = createDOMPurify((document.defaultView)!);

const SAFE_IFRAME_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'player.vimeo.com',
]);

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
    'svg', 'defs', 'linearGradient', 'stop', 'path',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style', 'loading',
    'width', 'height', 'data-ww-block',
    'id', 'role', 'aria-label',
    'colspan', 'rowspan', 'scope',
    'srcset', 'sizes',
    'type', 'controls', 'autoplay', 'loop', 'muted', 'playsinline', 'poster', 'preload',
    'allow', 'allowfullscreen', 'frameborder', 'sandbox', 'referrerpolicy',
    'viewBox', 'preserveAspectRatio', 'd', 'fill', 'stroke', 'stroke-width',
    'stroke-linecap', 'x1', 'x2', 'y1', 'y2', 'offset', 'stop-color',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?):\/\/|data:image\/(?:png|jpe?g|webp|gif|avif);base64,|\/)/i,
};

function isSafeIframeSrc(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && SAFE_IFRAME_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

purify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe') {
    const element = node as Element;
    const src = element.getAttribute('src') || '';
    if (!isSafeIframeSrc(src)) {
      element.remove();
    }
  }
});

purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName?.toLowerCase() === 'a') {
    const element = node as Element;
    const href = element.getAttribute('href') || '';
    const target = element.getAttribute('target') || '';
    if (target === '_blank' || /^https?:\/\//i.test(href)) {
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }

  if (node.nodeName?.toLowerCase() === 'iframe') {
    const element = node as Element;
    const src = element.getAttribute('src') || '';
    if (isSafeIframeSrc(src)) {
      element.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
      element.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    }
  }
});

export function sanitizeArticleHtml(input: string): string {
  return purify.sanitize(input, CONFIG);
}
