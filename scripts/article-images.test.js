import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  ARTICLE_IMAGES_DIR,
  ARTICLE_IMAGES_GENERATED_MODULE_PATH,
  ARTICLE_IMAGES_MANIFEST_PATH,
  collectArticleImageUrls,
  pickFallbackWidth,
  readArticleImageManifest,
  resolveManifestImage,
  variantWidths,
} from './article-image-manifest.js';

test('collects external covers and inline images, skips drafts and local files', () => {
  const urls = collectArticleImageUrls([
    {
      image: 'https://i.ibb.co/abc/cover.png',
      content: '<p>x</p><img src="https://cdn.example.com/a.jpg?w=1&amp;h=2"><img src="/images/local.webp"><img src="data:image/png;base64,AAAA">',
    },
    { image: '/og-image-v2.jpg', content: '' },
    { image: 'https://i.ibb.co/draft/cover.png', content: '<img src="https://cdn.example.com/draft.jpg">', status: 'draft' },
    null,
  ]);

  assert.deepEqual([...urls].sort(), [
    'https://cdn.example.com/a.jpg?w=1&h=2',
    'https://i.ibb.co/abc/cover.png',
  ]);
});

test('variant widths stop at the original size and never upscale', () => {
  assert.deepEqual(variantWidths(1536), [480, 768, 1200, 1536]);
  assert.deepEqual(variantWidths(3000), [480, 768, 1200, 1600]);
  assert.deepEqual(variantWidths(800), [480, 768, 800]);
  assert.deepEqual(variantWidths(400), [400]);
  assert.equal(pickFallbackWidth([480, 768, 1200, 1536]), 1200);
  assert.equal(pickFallbackWidth([480, 768, 800]), 800);
  assert.equal(pickFallbackWidth([1400]), 1400);
});

test('resolves a manifest entry into src, srcset and intrinsic size', () => {
  const manifest = {
    'https://i.ibb.co/abc/cover.png': { id: 'abc123', width: 1536, height: 1024, widths: [480, 768, 1200, 1536] },
  };
  const resolved = resolveManifestImage(manifest, 'https://i.ibb.co/abc/cover.png');
  assert.deepEqual(resolved, {
    src: '/images/articles/abc123-1200.webp',
    srcSet: '/images/articles/abc123-480.webp 480w, /images/articles/abc123-768.webp 768w, /images/articles/abc123-1200.webp 1200w, /images/articles/abc123-1536.webp 1536w',
    width: 1536,
    height: 1024,
  });
  assert.equal(resolveManifestImage(manifest, 'https://i.ibb.co/unknown.png'), null);
  assert.equal(resolveManifestImage(manifest, ''), null);
  assert.equal(resolveManifestImage({}, 'https://i.ibb.co/abc/cover.png'), null);
});

test('committed manifest, generated module and WebP files stay in sync', () => {
  const manifest = readArticleImageManifest();
  const urls = Object.keys(manifest);
  assert.ok(urls.length > 0, 'the committed manifest must describe at least one article image');

  assert.ok(existsSync(ARTICLE_IMAGES_GENERATED_MODULE_PATH), 'the generated TypeScript manifest is missing');
  const generated = readFileSync(ARTICLE_IMAGES_GENERATED_MODULE_PATH, 'utf8');
  assert.ok(generated.includes('scripts/optimize-article-images.js'), 'the generated module must name its generator');

  for (const url of urls) {
    const entry = manifest[url];
    assert.ok(/^[0-9a-f]{12}$/.test(entry.id), `${url}: id must be a 12-character hash`);
    assert.ok(entry.width > 0 && entry.height > 0, `${url}: dimensions must be positive`);
    assert.ok(Array.isArray(entry.widths) && entry.widths.length > 0, `${url}: widths are missing`);
    assert.ok(entry.widths[entry.widths.length - 1] <= 1600, `${url}: variants must not exceed 1600px`);
    for (const width of entry.widths) {
      const file = join(ARTICLE_IMAGES_DIR, `${entry.id}-${width}.webp`);
      assert.ok(existsSync(file), `${url}: missing variant ${file}`);
    }
    assert.ok(generated.includes(JSON.stringify(url)), `${url}: missing from the generated module`);
    assert.ok(generated.includes(`id: ${JSON.stringify(entry.id)}`), `${url}: id missing from the generated module`);
  }

  const generatedKeys = [...generated.matchAll(/^\s+"(https?:\/\/[^"]+)": \{/gm)].map((match) => match[1]);
  assert.deepEqual(generatedKeys.sort(), urls.sort(), 'generated module and manifest must list the same images');
  assert.ok(existsSync(ARTICLE_IMAGES_MANIFEST_PATH), 'manifest.json must be committed next to the variants');
});

test('every published article image has an optimized variant', () => {
  const sources = ['data/articles.build.json', 'data/articles.local.json', 'public/articles.seed.json']
    .map((relative) => join(process.cwd(), relative))
    .filter((pathname) => existsSync(pathname));
  assert.ok(sources.length > 0, 'no article snapshot available');
  const payload = JSON.parse(readFileSync(sources[0], 'utf8'));
  const urls = collectArticleImageUrls(payload.articles || []);
  const manifest = readArticleImageManifest();
  const missing = [...urls].filter((url) => !manifest[url]);
  assert.deepEqual(
    missing,
    [],
    'run `npm run optimize:images` and commit public/images/articles: these images are still served as heavy originals',
  );
});
