import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { ARTICLE_IMAGE_SIZES, resolveManifestImage } from './article-image-manifest.js';

/**
 * Санитайзер HTML статей для генератора страниц.
 *
 * Раньше DOMPurify здесь работал поверх linkedom, и это выглядело рабочим,
 * но не было им: у документа linkedom нет `implementation`, DOMPurify считал
 * окружение неподдерживаемым и возвращал строку как есть — `<script>` и
 * `onclick` проходили в статическую оболочку статьи без единого
 * предупреждения. Теперь окно даёт jsdom, а `isSupported` проверяется явно:
 * сборка лучше упадёт, чем выпустит неочищенный HTML.
 *
 * Списки тегов и атрибутов обязаны совпадать с `functions/_lib/sanitize.ts`
 * и `src/app/utils/sanitizeHtml.ts` — это стережёт `test:audit-regressions`.
 */
const SAFE_IFRAME_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com', 'player.vimeo.com']);

function isSafeIframeSrc(src = '') {
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && SAFE_IFRAME_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const ARTICLE_HTML_SANITIZE_CONFIG = {
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
   * регуляркой нельзя.
   *
   * DOMPurify отбрасывает атрибут, если его значение не прошло
   * ALLOWED_URI_REGEXP и сам атрибут не числится «неадресным». Своя строгая
   * регулярка выше требует https://, data:image или ведущую косую черту —
   * поэтому width="640", colspan="2", loading="lazy", d="M0 0" и ещё три
   * десятка атрибутов молча вырезались, хотя стоят в списке разрешённых.
   *
   * Список выводится из ALLOWED_ATTR, а не пишется руками: иначе новый атрибут
   * добавили бы в один список и забыли про второй — и он снова оказался бы
   * мёртвым без единой ошибки.
   */
  ADD_URI_SAFE_ATTR: [],
};

// Ссылочные атрибуты остаются под проверкой адреса, остальные — нет.
const URL_BEARING_ATTR = new Set(['href', 'src', 'srcset', 'poster']);
ARTICLE_HTML_SANITIZE_CONFIG.ADD_URI_SAFE_ATTR = ARTICLE_HTML_SANITIZE_CONFIG.ALLOWED_ATTR.filter((attr) => !URL_BEARING_ATTR.has(attr));

/**
 * @param {object} [options]
 * @param {Record<string, object>} [options.imageManifest] — готовые варианты
 *   картинок статей (`public/images/articles/manifest.json`): известные адреса
 *   подменяются на WebP с размерами, все картинки становятся ленивыми.
 */
export function createArticleSanitizer({ imageManifest = {} } = {}) {
  const { window } = new JSDOM('<!doctype html><html><body></body></html>');
  const purify = createDOMPurify(window);
  if (!purify.isSupported) {
    throw new Error('DOMPurify не поддерживает это окружение: статический HTML статей остался бы неочищенным.');
  }

  purify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'iframe') {
      const src = node.getAttribute('src') || '';
      if (!isSafeIframeSrc(src)) node.remove();
    }
  });

  purify.addHook('afterSanitizeAttributes', (node) => {
    const tag = node.nodeName?.toLowerCase();

    if (tag === 'a') {
      const href = node.getAttribute('href') || '';
      const target = node.getAttribute('target') || '';
      if (target === '_blank' || /^https?:\/\//i.test(href)) node.setAttribute('rel', 'noopener noreferrer');
    }

    if (tag === 'iframe') {
      const src = node.getAttribute('src') || '';
      if (isSafeIframeSrc(src)) {
        node.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
        node.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      }
    }

    if (tag === 'img') {
      const resolved = resolveManifestImage(imageManifest, node.getAttribute('src') || '');
      if (resolved) {
        node.setAttribute('src', resolved.src);
        node.setAttribute('srcset', resolved.srcSet);
        node.setAttribute('sizes', ARTICLE_IMAGE_SIZES.content);
        // Размеры резервируют место под фотографию, пока она грузится: без
        // них каждая догрузившаяся картинка сдвигала текст под собой.
        if (!node.hasAttribute('width') && !node.hasAttribute('height')) {
          node.setAttribute('width', String(resolved.width));
          node.setAttribute('height', String(resolved.height));
        }
      }
      // Текст статьи в оболочке лежит ниже заголовка, а React затем повторяет
      // ту же разметку с ленивой загрузкой. Пока оболочка на экране, качать
      // все фотографии сразу незачем.
      node.setAttribute('loading', 'lazy');
      node.setAttribute('decoding', 'async');
    }
  });

  return {
    isSupported: true,
    sanitize(html = '') {
      return purify.sanitize(String(html || ''), ARTICLE_HTML_SANITIZE_CONFIG);
    },
  };
}
