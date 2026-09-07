import { parseHTML } from 'linkedom';

/**
 * Санитайзер HTML статей для Cloudflare Functions.
 *
 * Раньше здесь стоял DOMPurify поверх linkedom. У документа linkedom нет
 * `implementation`, DOMPurify считал окружение непригодным и молча возвращал
 * строку без изменений — то есть очистки на сервере не было вовсе. Теперь
 * очистка своя: разметка разбирается linkedom, а дальше обходится дерево и
 * остаётся только то, что явно разрешено. Правило простое и проверяемое:
 * неизвестный тег удаляется вместе с содержимым, неизвестный атрибут —
 * снимается, адрес в ссылочном атрибуте обязан пройти регулярку.
 *
 * Списки тегов и атрибутов совпадают с `src/app/utils/sanitizeHtml.ts` и
 * `scripts/article-sanitizer.js` — это стережёт `test:audit-regressions`.
 * Браузер поверх этого по-прежнему пропускает статью через настоящий
 * DOMPurify: серверная очистка — вторая линия, а не единственная.
 */
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
    'href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style', 'loading', 'decoding', 'fetchpriority',
    'width', 'height', 'data-ww-block', 'data-ww-tone',
    'id', 'role', 'aria-label',
    'colspan', 'rowspan', 'scope',
    'srcset', 'sizes',
    'type', 'controls', 'autoplay', 'loop', 'muted', 'playsinline', 'poster', 'preload',
    'allow', 'allowfullscreen', 'frameborder', 'sandbox', 'referrerpolicy',
    'viewBox', 'preserveAspectRatio', 'd', 'fill', 'stroke', 'stroke-width',
    'stroke-linecap', 'x1', 'x2', 'y1', 'y2', 'offset', 'stop-color',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?):\/\/|data:image\/(?:png|jpe?g|webp|gif|avif);base64,|\/)/i,
  /**
   * Все остальные разрешённые атрибуты — не ссылки, и проверять их адресной
   * регуляркой нельзя. Список выводится из ALLOWED_ATTR, а не пишется руками:
   * иначе новый атрибут добавили бы в один список и забыли про второй.
   */
  ADD_URI_SAFE_ATTR: [] as string[],
};

// Ссылочные атрибуты остаются под проверкой адреса, остальные — нет.
const URL_BEARING_ATTR = new Set(['href', 'src', 'srcset', 'poster']);
CONFIG.ADD_URI_SAFE_ATTR = CONFIG.ALLOWED_ATTR.filter((attr) => !URL_BEARING_ATTR.has(attr));

const ALLOWED_TAGS = new Set(CONFIG.ALLOWED_TAGS.map((tag) => tag.toLowerCase()));
const ALLOWED_ATTR = new Set(CONFIG.ALLOWED_ATTR.map((attr) => attr.toLowerCase()));

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;

function isSafeIframeSrc(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && SAFE_IFRAME_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isAllowedUri(value: string): boolean {
  // DOMPurify нормализует адрес тем же способом: управляющие символы внутри
  // `java\tscript:` не должны обходить проверку.
  const normalized = value.replace(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g, '').trim();
  return CONFIG.ALLOWED_URI_REGEXP.test(normalized);
}

function isAllowedSrcSet(value: string): boolean {
  return value
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0] || '')
    .filter(Boolean)
    .every(isAllowedUri);
}

function sanitizeAttributes(element: Element): void {
  const tag = element.tagName.toLowerCase();
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = String(attribute.value ?? '');
    if (!ALLOWED_ATTR.has(name)) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (URL_BEARING_ATTR.has(name)) {
      const valid = name === 'srcset' ? isAllowedSrcSet(value) : isAllowedUri(value);
      if (!valid) element.removeAttribute(attribute.name);
    }
  }

  if (tag === 'a') {
    const href = element.getAttribute('href') || '';
    const target = element.getAttribute('target') || '';
    if (target === '_blank' || /^https?:\/\//i.test(href)) {
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }

  if (tag === 'iframe') {
    element.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    element.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  }
}

function sanitizeNode(node: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === TEXT_NODE || child.nodeType === CDATA_NODE) continue;
    if (child.nodeType !== ELEMENT_NODE) {
      // Комментарии, инструкции обработки и прочее — не содержимое статьи.
      node.removeChild(child);
      continue;
    }

    const element = child as Element;
    const tag = element.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // Как у DOMPurify по умолчанию: неизвестный элемент уходит целиком, а не
      // «разворачивается». Так `<script>`, `<style>` и `<template>` не могут
      // оставить после себя ни текст, ни вложенную разметку.
      node.removeChild(element);
      continue;
    }

    if (tag === 'iframe' && !isSafeIframeSrc(element.getAttribute('src') || '')) {
      node.removeChild(element);
      continue;
    }

    sanitizeAttributes(element);
    sanitizeNode(element);
  }
}

export function sanitizeArticleHtml(input: string): string {
  const source = String(input || '');
  if (!source.trim()) return '';
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${source}</body></html>`);
  const body = document.body;
  if (!body) return '';
  sanitizeNode(body);
  return body.innerHTML;
}
