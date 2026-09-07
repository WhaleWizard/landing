import assert from 'node:assert/strict';
import test from 'node:test';
import { createArticleSanitizer } from './article-sanitizer.js';

const manifest = {
  'https://i.ibb.co/abc/cover.png': { id: 'abc123abc123', width: 1536, height: 1024, widths: [480, 768, 1200, 1536] },
};

const { sanitize } = createArticleSanitizer({ imageManifest: manifest });

test('the build sanitizer actually removes scripts and event handlers', () => {
  const output = sanitize('<p onclick="x()">Текст</p><script>alert(1)</script><img src="https://cdn.example.com/a.jpg" onerror="e()" alt="">');
  assert.equal(output.includes('<script'), false, 'script tags must be dropped');
  assert.equal(output.includes('onclick'), false, 'inline handlers must be dropped');
  assert.equal(output.includes('onerror'), false, 'image handlers must be dropped');
  assert.ok(output.includes('<p>Текст</p>'), 'safe content survives');
});

test('javascript: and data:text links are stripped, external links get rel', () => {
  const output = sanitize('<a href="javascript:alert(1)">j</a><a href="data:text/html,x">d</a><a href="https://example.com">e</a><a href="/blog">i</a>');
  assert.equal(output.includes('javascript:'), false);
  assert.equal(output.includes('data:text'), false);
  assert.ok(output.includes('<a href="https://example.com" rel="noopener noreferrer">e</a>'));
  assert.ok(output.includes('<a href="/blog">i</a>'));
});

test('only video embeds from the allow-list keep their iframe', () => {
  const output = sanitize('<iframe src="https://evil.example/x"></iframe><iframe src="https://www.youtube.com/embed/abc"></iframe>');
  assert.equal(output.includes('evil.example'), false);
  assert.ok(output.includes('src="https://www.youtube.com/embed/abc"'));
  assert.ok(output.includes('sandbox="allow-scripts allow-same-origin allow-presentation"'));
  assert.ok(output.includes('referrerpolicy="strict-origin-when-cross-origin"'));
});

test('non-URL attributes survive the URI regexp', () => {
  const output = sanitize('<table><tr><td colspan="2">c</td></tr></table><svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg><img src="https://cdn.example.com/a.jpg" width="640" height="480" alt="">');
  assert.ok(output.includes('colspan="2"'));
  assert.ok(output.includes('viewBox="0 0 10 10"'));
  assert.ok(output.includes('d="M0 0L10 10"'));
  assert.ok(output.includes('width="640"'));
  assert.ok(output.includes('height="480"'));
});

test('known images are rewritten to optimized variants and every image is lazy', () => {
  const output = sanitize('<img src="https://i.ibb.co/abc/cover.png" alt="Обложка"><img src="https://cdn.example.com/unknown.jpg" alt="">');
  assert.ok(output.includes('src="/images/articles/abc123abc123-1200.webp"'), 'known image must use the optimized src');
  assert.ok(output.includes('srcset="/images/articles/abc123abc123-480.webp 480w,'), 'known image must carry srcset');
  assert.ok(output.includes('sizes="(max-width: 799px) calc(100vw - 32px), 760px"'));
  assert.ok(output.includes('width="1536"') && output.includes('height="1024"'), 'known image must reserve its aspect ratio');
  assert.ok(output.includes('src="https://cdn.example.com/unknown.jpg"'), 'unknown image stays untouched');
  assert.equal((output.match(/loading="lazy"/g) || []).length, 2, 'every image in the shell must be lazy');
  assert.equal((output.match(/decoding="async"/g) || []).length, 2);
});

test('an image with authored dimensions keeps them', () => {
  const output = sanitize('<img src="https://i.ibb.co/abc/cover.png" width="300" alt="">');
  assert.ok(output.includes('width="300"'));
  assert.equal(output.includes('height="1024"'), false, 'do not add a mismatched height next to an authored width');
});
