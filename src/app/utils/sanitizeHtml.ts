const ALLOWED_TAGS = [
  'p', 'br', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i',
  'blockquote', 'a', 'img', 'figure', 'figcaption', 'details', 'summary',
  'aside', 'section', 'div', 'span', 'svg', 'defs', 'lineargradient', 'stop', 'path',
];

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style', 'loading',
  'width', 'height', 'data-ww-block',
  'viewbox', 'preserveaspectratio', 'd', 'fill', 'stroke', 'stroke-width',
  'stroke-linecap', 'x1', 'x2', 'y1', 'y2', 'offset', 'id', 'stop-color',
]);

const SVG_TAG_CANONICAL: Record<string, string> = {
  lineargradient: 'linearGradient',
};

const SVG_ATTR_CANONICAL: Record<string, string> = {
  viewbox: 'viewBox',
  preserveaspectratio: 'preserveAspectRatio',
};

function stripUnsafeProtocols(value: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^(javascript|data):/i.test(normalized) && !/^data:image\//i.test(normalized)) {
    return '';
  }
  return normalized;
}

export function sanitizeHtml(input: string): string {
  let html = String(input || '')
    .replace(/className\s*=/g, 'class=')
    .replace(/strokeWidth\s*=/g, 'stroke-width=')
    .replace(/strokeLinecap\s*=/g, 'stroke-linecap=')
    .replace(/stopColor\s*=/g, 'stop-color=')
    .replace(/preserveAspectRatio\s*=/g, 'preserveaspectratio=')
    .replace(/viewBox\s*=/g, 'viewbox=')
    .replace(/\\n/g, '\n');

  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  html = html.replace(/<object[\s\S]*?<\/object>/gi, '');
  html = html.replace(/<embed[\s\S]*?<\/embed>/gi, '');

  html = html.replace(/<([a-z0-9-]+)([^>]*)>/gi, (full, tagName: string, attrs: string) => {
    const rawTag = String(tagName || '');
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.includes(tag)) return '';
    const normalizedTag = SVG_TAG_CANONICAL[tag] || tag;
    const isSelfClosing = /\/\s*>$/.test(full);

    const safeAttrs: string[] = [];
    const attrRegex = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(attrs)) !== null) {
      const rawName = String(match[1] || '').toLowerCase();
      const rawValue = match[2] ?? match[3] ?? match[4] ?? '';
      if (!rawName || rawName.startsWith('on')) continue;
      if (!ALLOWED_ATTRS.has(rawName)) continue;
      const normalizedAttr = SVG_ATTR_CANONICAL[rawName] || rawName;

      const sanitizedValue = stripUnsafeProtocols(rawValue);
      if (!sanitizedValue && (rawName === 'href' || rawName === 'src')) continue;
      if (rawName === 'target' && sanitizedValue !== '_blank') continue;

      if (rawName === 'rel') {
        safeAttrs.push(`rel="noopener noreferrer nofollow"`);
        continue;
      }

      safeAttrs.push(`${normalizedAttr}="${sanitizedValue.replace(/"/g, '&quot;')}"`);
    }

    if (tag === 'a' && !safeAttrs.some((part) => part.startsWith('rel='))) {
      safeAttrs.push('rel="noopener noreferrer nofollow"');
    }

    return `<${normalizedTag}${safeAttrs.length > 0 ? ` ${safeAttrs.join(' ')}` : ''}${isSelfClosing ? ' />' : '>'}`;
  });

  return html.replace(/<\/([a-z0-9-]+)>/gi, (full, tagName: string) => {
    const tag = String(tagName || '').toLowerCase();
    if (!ALLOWED_TAGS.includes(tag)) return '';
    return `</${SVG_TAG_CANONICAL[tag] || tag}>`;
  });
}
