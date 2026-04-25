const ALLOWED_TAGS = [
  'p', 'br', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i',
  'blockquote', 'a', 'img', 'figure', 'figcaption', 'details', 'summary',
  'aside', 'section', 'div', 'span',
];

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style', 'loading',
  'width', 'height', 'data-ww-block',
]);

function stripUnsafeProtocols(value: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^(javascript|data):/i.test(normalized) && !/^data:image\//i.test(normalized)) {
    return '';
  }
  return normalized;
}

export function sanitizeHtml(input: string): string {
  let html = String(input || '');

  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  html = html.replace(/<object[\s\S]*?<\/object>/gi, '');
  html = html.replace(/<embed[\s\S]*?<\/embed>/gi, '');

  html = html.replace(/<([a-z0-9-]+)([^>]*)>/gi, (full, tagName: string, attrs: string) => {
    const tag = String(tagName || '').toLowerCase();
    if (!ALLOWED_TAGS.includes(tag)) return '';

    const safeAttrs: string[] = [];
    const attrRegex = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(attrs)) !== null) {
      const rawName = String(match[1] || '').toLowerCase();
      const rawValue = match[2] ?? match[3] ?? match[4] ?? '';
      if (!rawName || rawName.startsWith('on')) continue;
      if (!ALLOWED_ATTRS.has(rawName)) continue;

      const sanitizedValue = stripUnsafeProtocols(rawValue);
      if (!sanitizedValue && (rawName === 'href' || rawName === 'src')) continue;
      if (rawName === 'target' && sanitizedValue !== '_blank') continue;

      if (rawName === 'rel') {
        safeAttrs.push(`rel="noopener noreferrer nofollow"`);
        continue;
      }

      safeAttrs.push(`${rawName}="${sanitizedValue.replace(/"/g, '&quot;')}"`);
    }

    if (tag === 'a' && !safeAttrs.some((part) => part.startsWith('rel='))) {
      safeAttrs.push('rel="noopener noreferrer nofollow"');
    }

    return `<${tag}${safeAttrs.length > 0 ? ` ${safeAttrs.join(' ')}` : ''}>`;
  });

  return html.replace(/<\/([a-z0-9-]+)>/gi, (full, tagName: string) => {
    const tag = String(tagName || '').toLowerCase();
    if (!ALLOWED_TAGS.includes(tag)) return '';
    return `</${tag}>`;
  });
}
