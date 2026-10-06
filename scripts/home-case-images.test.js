import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Обложки кейсов на главной (Cases.tsx).
 *
 * Карточки рисовались JPG без width/height: пока картинка догружалась, текст
 * под ней сдвигался (CLS), а телефон качал вдвое тяжелее нужного. Теперь у
 * четырёх штатных обложек есть WebP-копия и размеры по карте; адреса в CMS
 * остаются прежними. Проверяется то, что ломается молча: копия существует,
 * легче JPG, а размеры в карте совпадают с настоящими пикселями файла.
 */
const ROOT = join(import.meta.dirname, '..');
const source = readFileSync(join(ROOT, 'src/app/components/Cases.tsx'), 'utf8');
const entries = [...source.matchAll(/'(\/images\/case-[a-z0-9-]+\.jpg)': \{ webp: '([^']+)', width: (\d+), height: (\d+) \}/g)];

test('у каждой штатной обложки кейса есть WebP-копия легче JPG', () => {
  assert.equal(entries.length, 4, 'четыре штатных обложки в карте');
  for (const [, jpg, webp] of entries) {
    const jpgPath = join(ROOT, 'public', jpg);
    const webpPath = join(ROOT, 'public', webp);
    assert.ok(existsSync(webpPath), `нет файла ${webp}`);
    assert.ok(statSync(webpPath).size < statSync(jpgPath).size, `${webp} не легче ${jpg}`);
  }
});

test('размеры в карте совпадают с настоящими пикселями файла', async () => {
  const sharp = (await import('sharp')).default;
  for (const [, jpg, webp, width, height] of entries) {
    const meta = await sharp(join(ROOT, 'public', webp)).metadata();
    assert.equal(`${meta.width}x${meta.height}`, `${width}x${height}`, `${webp}: размеры в карте отстали от файла`);
    const original = await sharp(join(ROOT, 'public', jpg)).metadata();
    assert.equal(`${original.width}x${original.height}`, `${width}x${height}`, `${webp}: пропорции отличаются от JPG — вид карточки изменится`);
  }
});

test('картинки карточек получают размеры и асинхронное декодирование', () => {
  assert.match(source, /\{\.\.\.caseImageProps\(item\.image\)\}[\s\S]{0,200}loading="lazy"[\s\S]{0,40}decoding="async"/);
  assert.ok(!/src=\{item\.image\}/.test(source), 'сырой src без размеров ещё остался');
});
