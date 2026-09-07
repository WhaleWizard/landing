import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { build } from 'esbuild';

async function bundleTypeScript(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const { sanitizeArticleHtml } = await bundleTypeScript('functions/_lib/sanitize.ts');

test('the server sanitizer really removes scripts, handlers and unknown elements', () => {
  const output = sanitizeArticleHtml('<p onclick="x()">Текст</p><script>alert(1)</script><style>p{}</style><template><img src=x onerror=e()></template><!-- c --><math><mi>x</mi></math>');
  assert.equal(output, '<p>Текст</p>');
});

test('dangerous urls are dropped while allowed ones survive with rel', () => {
  const output = sanitizeArticleHtml('<a href="javascript:alert(1)">j</a><a href="java\tscript:alert(1)">t</a><a href="data:text/html,x">d</a><a href="https://example.com" target="_blank">e</a><a href="/blog">i</a>');
  assert.equal(output.includes('javascript'), false);
  assert.equal(output.includes('data:text'), false);
  const external = output.match(/<a [^>]*>e<\/a>/)?.[0] || '';
  assert.ok(external.includes('href="https://example.com"'));
  assert.ok(external.includes('target="_blank"'));
  assert.ok(external.includes('rel="noopener noreferrer"'));
  assert.ok(output.includes('<a href="/blog">i</a>'));
});

test('images keep safe sources, sizes and srcset candidates are validated', () => {
  const output = sanitizeArticleHtml('<img src="https://cdn.example.com/a.jpg" onerror="e()" width="640" height="480" alt="a" srcset="https://cdn.example.com/a-480.jpg 480w, https://cdn.example.com/a-960.jpg 960w" sizes="100vw"><img src="data:image/png;base64,AAAA" alt="b"><img srcset="javascript:x 1x" src="/local.webp" alt="c">');
  assert.ok(output.includes('src="https://cdn.example.com/a.jpg"'));
  assert.equal(output.includes('onerror'), false);
  assert.ok(output.includes('width="640"') && output.includes('height="480"'));
  assert.ok(output.includes('srcset="https://cdn.example.com/a-480.jpg 480w, https://cdn.example.com/a-960.jpg 960w"'));
  assert.ok(output.includes('src="data:image/png;base64,AAAA"'));
  assert.ok(output.includes('src="/local.webp"'), 'a local image survives');
  assert.equal(output.includes('javascript:x'), false, 'an unsafe srcset candidate drops the whole attribute');
});

test('only video embeds from the allow-list keep their iframe', () => {
  const output = sanitizeArticleHtml('<iframe src="https://evil.example/x"></iframe><iframe src="https://www.youtube.com/embed/abc" allowfullscreen></iframe>');
  assert.equal(output.includes('evil.example'), false);
  assert.ok(output.includes('src="https://www.youtube.com/embed/abc"'));
  assert.ok(output.includes('sandbox="allow-scripts allow-same-origin allow-presentation"'));
  assert.ok(output.includes('referrerpolicy="strict-origin-when-cross-origin"'));
});

test('non-URL attributes and editor blocks survive', () => {
  const output = sanitizeArticleHtml('<h3 data-ww-block="heading" style="margin:0">H</h3><table><tr><td colspan="2">c</td></tr></table><svg viewBox="0 0 10 10"><path d="M0 0L10 10" stroke="#fff"/></svg><details open><summary>s</summary><p>d</p></details>');
  assert.ok(output.includes('data-ww-block="heading"'));
  assert.ok(output.includes('style="margin:0"'));
  assert.ok(output.includes('colspan="2"'));
  assert.ok(output.includes('viewBox="0 0 10 10"'));
  assert.ok(output.includes('d="M0 0L10 10"'));
  // `open` не входит в общий список атрибутов — как и в браузере, аккордеон
  // приезжает свёрнутым. Сам элемент и его содержимое остаются.
  assert.ok(output.includes('<details><summary>s</summary><p>d</p></details>'));
});

test('text and attribute values are escaped on output', () => {
  const output = sanitizeArticleHtml('<p>a &lt;script&gt;alert(1)&lt;/script&gt; b</p><img src="/x.webp" alt="&quot;&gt;&lt;script&gt;">');
  // Текст остаётся текстом: закрывающие скобки в нём экранированы.
  assert.ok(output.includes('<p>a &lt;script&gt;alert(1)&lt;/script&gt; b</p>'));
  // Кавычка внутри значения атрибута экранирована, поэтому значение не может
  // закрыть атрибут и открыть новый тег; сам `<script` внутри кавычек —
  // обычный текст по правилам сериализации HTML.
  assert.ok(output.includes('alt="&quot;><script>"'));
  assert.equal(/<script[\s>]/.test(output.replace(/alt="[^"]*"/g, '')), false, 'no real script element outside attribute values');
  assert.equal(sanitizeArticleHtml(''), '');
  assert.equal(sanitizeArticleHtml('   '), '');
});
