import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { D1Database, freshDatabase } from './test-helpers/d1-memory.js';
import {
  ARTICLE_IMAGE_WIDTHS,
  collectArticleImageUrls,
  resolveManifestImage,
  resolveUploadedImage as scriptResolve,
  variantWidths as scriptWidths,
} from './article-image-manifest.js';

/**
 * Уменьшенные копии картинок, загруженных через админку.
 *
 * Страница узнаёт о копиях только по имени файла — ни манифеста, ни запроса
 * к хранилищу. Поэтому три копии правил (браузер, сервер, сборка) обязаны
 * совпадать, а сервер обязан класть либо полный набор, либо ничего: любая
 * рассинхронизация даёт `srcset` на несуществующие файлы, и посетитель видит
 * пустое место вместо обложки. Обработчики проверяются настоящие, хранилище —
 * поддельное в памяти.
 */

globalThis.caches ??= {
  default: {
    match: async () => undefined,
    put: async () => {},
    delete: async () => true,
  },
};

const PASSWORD = 'image-variants-test-password';
const HOST = 'https://pub-test0000.r2.dev';

async function load(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const client = await load('src/app/utils/imageVariants.ts');
const articleImages = await load('src/app/utils/articleImages.ts');
const server = await load('functions/_lib/image-variants.ts');
const upload = await load('functions/api/admin/upload.ts');
const media = await load('functions/api/admin/media.ts');

class FakeBucket {
  constructor({ failOnPut = 0 } = {}) {
    this.objects = new Map();
    this.order = [];
    this.puts = 0;
    this.failOnPut = failOnPut;
  }

  async put(key, value, options = {}) {
    this.puts += 1;
    if (this.failOnPut && this.puts === this.failOnPut) throw new Error('simulated R2 failure');
    const bytes = value == null ? new Uint8Array(0) : new Uint8Array(await new Response(value).arrayBuffer());
    this.objects.set(key, {
      key,
      bytes,
      size: bytes.byteLength,
      uploaded: new Date(),
      httpMetadata: options.httpMetadata || {},
      customMetadata: options.customMetadata || {},
    });
    this.order.push(key);
  }

  async get(key) {
    const object = this.objects.get(key);
    if (!object) return null;
    return { ...object, body: new Response(object.bytes).body, arrayBuffer: async () => object.bytes.buffer };
  }

  async head(key) {
    const object = this.objects.get(key);
    return object ? { ...object } : null;
  }

  async delete(key) {
    for (const item of Array.isArray(key) ? key : [key]) this.objects.delete(item);
  }

  async list({ prefix = '', limit = 1000 } = {}) {
    const objects = [...this.objects.values()]
      .filter((object) => object.key.startsWith(prefix))
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(0, limit);
    return { objects, truncated: false };
  }
}

// База статей в форме прода: после F-009 медиатека без неё честно отказывает
// удалять и переносить файлы, а не гадает, используются ли они.
const envWith = (bucket) => ({
  ADMIN_PASSWORD: PASSWORD, BUCKET: bucket, R2_PUBLIC_HOST: HOST,
  DB: new D1Database(freshDatabase()), USE_D1_ARTICLES: 'true',
});

function webp(bytes = 32) {
  return new Uint8Array(bytes).fill(7);
}

function uploadForm({ name = 'cover.webp', type = 'image/webp', width, height, variants, extra = {} } = {}) {
  const form = new FormData();
  form.append('file', new File([webp(64)], name, { type }));
  if (width !== undefined) form.append('width', String(width));
  if (height !== undefined) form.append('height', String(height));
  for (const [variantWidth, variantType = 'image/webp'] of variants || []) {
    form.append(`variant-${variantWidth}`, new File([webp(16)], `${variantWidth}.webp`, { type: variantType }), `${variantWidth}.webp`);
  }
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return form;
}

async function callUpload(bucket, form) {
  const request = new Request('https://example.test/api/admin/upload', {
    method: 'POST',
    headers: { 'X-Admin-Password': PASSWORD },
    body: form,
  });
  const response = await upload.onRequestPost({ request, env: envWith(bucket) });
  return { status: response.status, payload: await response.json() };
}

async function callMedia(bucket, body) {
  const request = new Request('https://example.test/api/admin/media', {
    method: 'POST',
    headers: { 'X-Admin-Password': PASSWORD, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await media.onRequestPost({ request, env: envWith(bucket) });
  return { status: response.status, payload: await response.json() };
}

async function listMedia(bucket) {
  const request = new Request('https://example.test/api/admin/media', { headers: { 'X-Admin-Password': PASSWORD } });
  const response = await media.onRequestGet({ request, env: envWith(bucket) });
  return response.json();
}

const fullSet = (width) => server.variantWidths(width).map((value) => [value]);

test('браузер, сервер и сборка считают одинаковый набор ширин', () => {
  assert.deepEqual([...client.IMAGE_VARIANT_WIDTHS], ARTICLE_IMAGE_WIDTHS);
  assert.deepEqual([...server.IMAGE_VARIANT_WIDTHS], ARTICLE_IMAGE_WIDTHS);
  for (const width of [16, 300, 480, 481, 800, 1200, 1536, 1600, 1601, 2200, 5000]) {
    assert.deepEqual(client.variantWidths(width), scriptWidths(width), `ширина ${width}`);
    assert.deepEqual(server.variantWidths(width), scriptWidths(width), `ширина ${width}`);
  }
  assert.deepEqual(server.variantWidths(2200), [480, 768, 1200, 1600]);
  assert.deepEqual(server.variantWidths(300), [300], 'мелкая картинка — одна копия своей ширины');
});

test('адрес с размерами разбирается одинаково в браузере и на сборке', () => {
  const urls = [
    `${HOST}/uploads/2026-09-23/1-abc-cover--2200x1238.webp`,
    `${HOST}/uploads/%D0%BE%D0%B1%D0%BB%D0%BE%D0%B6%D0%BA%D0%B8/2026-09-23/1-abc-cover--1024x1024.png`,
    'https://media.whalewzrd.com/uploads/2026-09-23/1-abc-a--800x600.jpg',
    'https://i.ibb.co/abc/cover--2200x1238.webp',
    `${HOST}/uploads/2026-09-23/1-abc-cover--2200x1238-480.webp`,
    `${HOST}/uploads/2026-09-23/1-abc-cover.webp`,
    `${HOST}/other/1-abc-cover--2200x1238.webp`,
    '',
  ];
  for (const url of urls) {
    assert.deepEqual(client.resolveUploadedImage(url), scriptResolve(url), url);
  }
});

test('srcset ведёт на копии нужных ширин, запасной src — 1200', () => {
  const resolved = client.resolveUploadedImage(`${HOST}/uploads/2026-09-23/1-abc-cover--2200x1238.webp`);
  assert.equal(resolved.width, 2200);
  assert.equal(resolved.height, 1238);
  assert.equal(resolved.src, `${HOST}/uploads/2026-09-23/1-abc-cover--2200x1238-1200.webp`);
  assert.deepEqual(
    resolved.srcSet.split(', '),
    [480, 768, 1200, 1600].map((width) => `${HOST}/uploads/2026-09-23/1-abc-cover--2200x1238-${width}.webp ${width}w`),
  );
});

test('чужие адреса, копии и файлы без размеров не получают srcset', () => {
  for (const url of [
    'https://i.ibb.co/abc/cover--2200x1238.webp',
    'https://evil.example/uploads/x--2200x1238.webp',
    `${HOST}/uploads/2026-09-23/1-abc-cover--2200x1238-480.webp`,
    `${HOST}/uploads/2026-09-23/1-abc-cover.webp`,
    `${HOST}/uploads/2026-09-23/1-abc-cover--2200x1238.gif`,
    `http://pub-test0000.r2.dev/uploads/1-a--800x600.webp`,
  ]) {
    assert.equal(client.resolveUploadedImage(url), null, url);
  }
});

test('картинка из админки попадает на страницу без манифеста и без пересборки', () => {
  const url = `${HOST}/uploads/2026-09-23/1-abc-cover--1536x1024.webp`;
  assert.deepEqual(articleImages.resolveArticleImage(url), client.resolveUploadedImage(url));
  assert.deepEqual(resolveManifestImage({}, url), scriptResolve(url));
  const attrs = articleImages.articleImageAttributes(url, articleImages.ARTICLE_IMAGE_SIZES.cover);
  assert.equal(attrs.width, 1536);
  assert.equal(attrs.height, 1024);
  assert.match(attrs.srcSet, /-1536\.webp 1536w$/);
});

test('сборка не качает картинки, уже облегчённые при загрузке', () => {
  const uploaded = `${HOST}/uploads/2026-09-23/1-abc-cover--2200x1238.webp`;
  const legacy = 'https://i.ibb.co/abc/cover.png';
  const urls = collectArticleImageUrls([
    { status: 'published', image: uploaded, content: `<p><img src="${legacy}"></p>` },
  ]);
  assert.deepEqual([...urls], [legacy]);
});

test('загрузка с полным набором: копии записаны до оригинала, адрес несёт размеры', async () => {
  const bucket = new FakeBucket();
  const { status, payload } = await callUpload(bucket, uploadForm({ width: 2200, height: 1238, variants: fullSet(2200) }));
  assert.equal(status, 200, JSON.stringify(payload));
  assert.match(payload.key, /-cover--2200x1238\.webp$/);
  assert.deepEqual(payload.variants, [480, 768, 1200, 1600]);
  assert.equal(bucket.order[bucket.order.length - 1], payload.key, 'оригинал пишется последним');
  assert.equal(bucket.objects.size, 5);

  // Каждый адрес из srcset указывает на реально записанный объект.
  const resolved = client.resolveUploadedImage(payload.url);
  assert.ok(resolved, 'адрес из ответа распознаётся страницей');
  for (const entry of resolved.srcSet.split(', ')) {
    const url = entry.split(' ')[0];
    const key = decodeURIComponent(new URL(url).pathname.slice(1));
    assert.ok(bucket.objects.has(key), `нет объекта для ${url}`);
    assert.equal(bucket.objects.get(key).httpMetadata.contentType, 'image/webp');
  }
});

test('папка с кириллицей: адреса копий совпадают с записанными объектами', async () => {
  const bucket = new FakeBucket();
  const { status, payload } = await callUpload(bucket, uploadForm({ width: 1024, height: 768, variants: fullSet(1024), extra: { folder: 'обложки' } }));
  assert.equal(status, 200, JSON.stringify(payload));
  const resolved = client.resolveUploadedImage(payload.url);
  assert.ok(resolved);
  for (const entry of resolved.srcSet.split(', ')) {
    const key = decodeURIComponent(new URL(entry.split(' ')[0]).pathname.slice(1));
    assert.ok(bucket.objects.has(key), key);
  }
});

test('неполный или чужой набор копий отклоняется и ничего не пишет', async () => {
  const cases = [
    uploadForm({ width: 2200, height: 1238, variants: [[480], [768], [1200]] }),
    uploadForm({ width: 2200, height: 1238, variants: [...fullSet(2200), [999]] }),
    uploadForm({ width: 2200, height: 1238, variants: [[480], [768], [1200], [1600, 'image/png']] }),
    uploadForm({ width: 2200, variants: fullSet(2200) }),
    uploadForm({ width: 5, height: 5, variants: fullSet(5) }),
    uploadForm({ name: 'anim.gif', type: 'image/gif', width: 400, height: 300, variants: fullSet(400) }),
  ];
  for (const form of cases) {
    const bucket = new FakeBucket();
    const { status } = await callUpload(bucket, form);
    assert.equal(status, 400);
    assert.equal(bucket.objects.size, 0, 'при отказе хранилище пустое');
  }
});

test('без копий загрузка работает по-старому: имя без размеров', async () => {
  const bucket = new FakeBucket();
  const { status, payload } = await callUpload(bucket, uploadForm({ name: 'doc.pdf', type: 'application/pdf' }));
  assert.equal(status, 200);
  assert.match(payload.key, /-doc\.pdf$/);
  assert.deepEqual(payload.variants, []);
  assert.equal(client.resolveUploadedImage(payload.url), null);
});

test('сбой хранилища посередине убирает уже записанные копии', async () => {
  const bucket = new FakeBucket({ failOnPut: 3 });
  const { status } = await callUpload(bucket, uploadForm({ width: 2200, height: 1238, variants: fullSet(2200) }));
  assert.equal(status, 500);
  assert.equal(bucket.objects.size, 0);
});

test('медиатека: копии не видны, удаляются и переезжают вместе с оригиналом', async () => {
  const bucket = new FakeBucket();
  const { payload } = await callUpload(bucket, uploadForm({ width: 1536, height: 1024, variants: fullSet(1536) }));
  const other = await callUpload(bucket, uploadForm({ name: 'plain.webp' }));

  const listing = await listMedia(bucket);
  assert.deepEqual(listing.files.map((file) => file.key).sort(), [payload.key, other.payload.key].sort());

  const variantKeys = server.variantKeysFor(payload.key);
  assert.equal(variantKeys.length, 4);
  const refused = await callMedia(bucket, { action: 'delete', key: variantKeys[0] });
  assert.equal(refused.status, 400, 'копию нельзя удалить отдельно от оригинала');
  const altRefused = await callMedia(bucket, { action: 'set_alt', key: variantKeys[0], alt: 'x' });
  assert.equal(altRefused.status, 400);

  const moved = await callMedia(bucket, { action: 'move', key: payload.key, folder: 'covers' });
  assert.equal(moved.status, 200, JSON.stringify(moved.payload));
  const newKey = moved.payload.key;
  assert.match(newKey, /^uploads\/covers\//);
  for (const key of [payload.key, ...variantKeys]) assert.ok(!bucket.objects.has(key), `осталось на старом месте: ${key}`);
  for (const key of [newKey, ...server.variantKeysFor(newKey)]) assert.ok(bucket.objects.has(key), `не доехало: ${key}`);

  const deleted = await callMedia(bucket, { action: 'delete', key: newKey });
  assert.equal(deleted.status, 200);
  assert.deepEqual([...bucket.objects.keys()], [other.payload.key], 'после удаления остаётся только чужой файл');
});

// ─── Пакет 3e: медиатека (DA-72…DA-79, DA-81) ───────────────────────────────

/** Окружение с одной общей базой: так тест видит статьи и клиентов, которых сам завёл. */
function sharedEnv(bucket, sqlite = freshDatabase()) {
  const DB = new D1Database(sqlite);
  return { sqlite, env: { ADMIN_PASSWORD: PASSWORD, BUCKET: bucket, R2_PUBLIC_HOST: HOST, DB, USE_D1_ARTICLES: 'true' } };
}

async function mediaWith(env, body) {
  const request = new Request('https://example.test/api/admin/media', {
    method: 'POST',
    headers: { 'X-Admin-Password': PASSWORD, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await media.onRequestPost({ request, env });
  return { status: response.status, payload: await response.json() };
}

test('DA-73: ссылка с ?v=2 или #page=2 держит файл так же, как обычная', async () => {
  const bucket = new FakeBucket();
  const { sqlite, env } = sharedEnv(bucket);
  for (const name of ['guide.pdf', 'checklist.pdf']) {
    await bucket.put(`uploads/docs/2026-11-01/${name}`, new Uint8Array(4), { httpMetadata: { contentType: 'application/pdf' } });
  }
  sqlite.prepare(
    `INSERT INTO articles (id, slug, title, category, read_time, date, description, content, image, status)
     VALUES (1, 'docs', 'Статья с документами', 'Блог', '5', '2026', 'Описание', ?, '/og.jpg', 'published')`,
  ).run(`<p><a href="${HOST}/uploads/docs/2026-11-01/guide.pdf?v=2">Гайд</a> <a href="${HOST}/uploads/docs/2026-11-01/checklist.pdf#page=2">Чек-лист</a></p>`);
  for (const name of ['guide.pdf', 'checklist.pdf']) {
    const refused = await mediaWith(env, { action: 'delete', key: `uploads/docs/2026-11-01/${name}` });
    assert.equal(refused.status, 409, name);
    assert.ok(bucket.objects.has(`uploads/docs/2026-11-01/${name}`), `${name} остался`);
  }
});

test('DA-72: договор клиента и ресурс проекта нельзя удалить или перенести, свободный файл — можно', async () => {
  const bucket = new FakeBucket();
  const { sqlite, env } = sharedEnv(bucket);
  const files = ['contract.pdf', 'report.pdf', 'free.pdf'].map((name) => `uploads/clients/2026-11-01/${name}`);
  for (const key of files) await bucket.put(key, new Uint8Array(4), { httpMetadata: { contentType: 'application/pdf' } });
  const clientId = Number(sqlite.prepare("INSERT INTO clients (name, contract_file_url) VALUES ('Клиент', ?)").run(`${HOST}/${files[0]}`).lastInsertRowid);
  const workId = Number(sqlite.prepare("INSERT INTO client_work (client_id, kind, title) VALUES (?, 'project', 'Проект')").run(clientId).lastInsertRowid);
  sqlite.prepare("INSERT INTO client_work_resources (work_id, kind, title, url) VALUES (?, 'link', 'Отчёт', ?)").run(workId, `${HOST}/${files[1]}`);

  const contract = await mediaWith(env, { action: 'delete', key: files[0] });
  assert.equal(contract.status, 409);
  assert.match(contract.payload.error, /Клиент/);
  const report = await mediaWith(env, { action: 'move', key: files[1], folder: 'archive' });
  assert.equal(report.status, 409);
  assert.match(report.payload.error, /Проект/);
  assert.equal((await mediaWith(env, { action: 'delete', key: files[2] })).status, 200);
  assert.ok(bucket.objects.has(files[0]) && bucket.objects.has(files[1]));
});

test('DA-74: сбой записи оригинала убирает уже записанные копии', async () => {
  const bucket = new FakeBucket({ failOnPut: 5 });
  const { status } = await callUpload(bucket, uploadForm({ width: 1536, height: 1024, variants: fullSet(1536) }));
  assert.equal(status, 500);
  assert.equal(bucket.objects.size, 0, 'ни одной невидимой копии');
});

test('DA-81: повтор той же загрузки после потерянного ответа не даёт второй комплект', async () => {
  const bucket = new FakeBucket();
  const id = 'a'.repeat(32);
  const first = await callUpload(bucket, uploadForm({ width: 1536, height: 1024, variants: fullSet(1536), extra: { upload_id: id } }));
  const again = await callUpload(bucket, uploadForm({ width: 1536, height: 1024, variants: fullSet(1536), extra: { upload_id: id } }));
  assert.equal(first.status, 200);
  assert.equal(again.status, 200);
  assert.equal(again.payload.key, first.payload.key, 'тот же адрес');
  assert.equal(again.payload.idempotent, true);
  assert.equal(bucket.objects.size, 5, 'один оригинал и четыре копии');
  const other = await callUpload(bucket, uploadForm({ width: 1536, height: 1024, variants: fullSet(1536), extra: { upload_id: 'b'.repeat(32) } }));
  assert.notEqual(other.payload.key, first.payload.key, 'другой файл — отдельная загрузка');
});

test('DA-75: картинку без полного набора копий не переносят, адрес не меняется', async () => {
  const bucket = new FakeBucket();
  const { payload } = await callUpload(bucket, uploadForm({ width: 1536, height: 1024, variants: fullSet(1536) }));
  const variants = server.variantKeysFor(payload.key);
  await bucket.delete([variants[1], variants[2]]);
  const moved = await callMedia(bucket, { action: 'move', key: payload.key, folder: 'covers' });
  assert.equal(moved.status, 409);
  assert.match(moved.payload.error, /копий/);
  assert.ok(bucket.objects.has(payload.key), 'оригинал на месте');
  assert.ok(![...bucket.objects.keys()].some((key) => key.startsWith('uploads/covers/')), 'в новой папке ничего не появилось');
});

test('DA-79: сбой посреди переноса откатывает записанное, повтор проходит', async () => {
  const bucket = new FakeBucket();
  const { payload } = await callUpload(bucket, uploadForm({ width: 1536, height: 1024, variants: fullSet(1536) }));
  bucket.failOnPut = bucket.puts + 2;
  const failed = await callMedia(bucket, { action: 'move', keys: [payload.key], folder: 'covers' });
  assert.equal(failed.payload.failed.length, 1);
  assert.ok(![...bucket.objects.keys()].some((key) => key.startsWith('uploads/covers/')), 'скрытых копий в новой папке нет');
  bucket.failOnPut = 0;
  const retried = await callMedia(bucket, { action: 'move', keys: [payload.key], folder: 'covers' });
  assert.equal(retried.payload.moved.length, 1, JSON.stringify(retried.payload));
});

test('DA-76: подпись к уже перенесённому файлу не сохраняется по старому адресу', async () => {
  const bucket = new FakeBucket();
  const { sqlite, env } = sharedEnv(bucket);
  const { payload } = await callUpload(bucket, uploadForm({ name: 'photo.webp' }));
  const moved = await mediaWith(env, { action: 'move', key: payload.key, folder: 'covers' });
  assert.equal(moved.status, 200);
  const stale = await mediaWith(env, { action: 'set_alt', key: payload.key, alt: 'Старая вкладка' });
  assert.equal(stale.status, 409);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM media_alt').get().n, 0);
  assert.equal((await mediaWith(env, { action: 'set_alt', key: moved.payload.key, alt: 'Подпись' })).status, 200);
});

test('DA-78: папку, в которую идёт загрузка, удалить нельзя', async () => {
  const bucket = new FakeBucket();
  await callMedia(bucket, { action: 'create_folder', name: 'uploading' });
  // Копии уже записаны, оригинала ещё нет — загрузка в процессе.
  const key = 'uploads/uploading/2026-11-01/1-photo--1536x1024.webp';
  for (const variant of server.variantKeysFor(key)) await bucket.put(variant, webp(8), { customMetadata: { variantOf: key } });
  const refused = await callMedia(bucket, { action: 'delete_folder', name: 'uploading' });
  assert.equal(refused.status, 409);
  assert.match(refused.payload.error, /загружается/);
  assert.equal([...bucket.objects.keys()].filter((item) => item.startsWith('uploads/uploading/')).length, 5, 'метка и копии на месте');
});
