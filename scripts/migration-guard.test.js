import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  collectMigrationSignatures,
  collectMigrationTables,
  listMigrationFiles,
  renderMigrationSignatures,
  renderMigrationSql,
  renderMigrationTables,
} from './build-migration-map.js';

/**
 * Раннера миграций в проекте нет: владелец применяет их вручную по порядку.
 * Единственная защита от «раздел показал ноль вместо объяснения» — этот
 * контракт. Проверяем и карту таблиц (она сгенерирована и обязана совпадать
 * с реальными файлами), и разбор ошибки D1, и форму ответа.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = join(ROOT, 'functions/_lib/migration-tables.ts');
const SIGNATURES_PATH = join(ROOT, 'functions/_lib/migration-signatures.ts');
const SQL_PATH = join(ROOT, 'functions/_lib/migration-sql.ts');

/** Собирает TypeScript-модуль в ESM, чтобы протестировать реальный код. */
async function importFunctionModule(relativePath) {
  const esbuild = await import('esbuild');
  const outfile = join(ROOT, 'scripts', `.migration-guard.test.${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [join(ROOT, relativePath)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    packages: 'external',
    logLevel: 'silent',
  });
  try {
    return await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  } finally {
    try { unlinkSync(outfile); } catch { /* временный файл */ }
  }
}

const guard = await importFunctionModule('functions/_lib/migration-guard.ts');

test('карта таблиц совпадает с файлами миграций', () => {
  assert.ok(existsSync(MAP_PATH), 'нет functions/_lib/migration-tables.ts — запустите build:migration-map');
  const expected = renderMigrationTables(collectMigrationTables());
  assert.equal(readFileSync(MAP_PATH, 'utf8'), expected,
    'карта миграций устарела — запустите npm run build:migration-map');
});

test('каждая миграция из карты действительно существует', () => {
  for (const [table, file] of Object.entries(guard.MIGRATION_BY_TABLE)) {
    assert.ok(existsSync(join(ROOT, 'migrations', file)),
      `для таблицы ${table} указан несуществующий файл ${file}`);
  }
});

test('таблицы ключевых разделов есть в карте', () => {
  // Разделы, которые обязаны уметь объяснить отсутствие своей таблицы.
  for (const table of ['leads', 'site_sections', 'page_stats_daily', 'visitor_hashes_daily', 'meta_outbox']) {
    assert.ok(guard.MIGRATION_BY_TABLE[table], `таблица ${table} потерялась в карте миграций`);
  }
});

test('подписи миграций не отстали от файлов', () => {
  assert.ok(existsSync(SIGNATURES_PATH), 'нет migration-signatures.ts — запустите build:migration-map');
  const expected = renderMigrationSignatures(collectMigrationSignatures());
  assert.equal(readFileSync(SIGNATURES_PATH, 'utf8'), expected,
    'подписи миграций устарели — запустите npm run build:migration-map');
});

test('тексты миграций не отстали от файлов', () => {
  assert.ok(existsSync(SQL_PATH), 'нет migration-sql.ts — запустите build:migration-map');
  const expected = renderMigrationSql(listMigrationFiles());
  assert.equal(readFileSync(SQL_PATH, 'utf8'), expected,
    'тексты миграций устарели — запустите npm run build:migration-map');
});

test('у каждой миграции есть след в схеме, по которому её видно', () => {
  // Миграция без единого следа неотличима от неприменённой, и раздел
  // «Миграции» показывал бы её как вечно ожидающую.
  for (const item of collectMigrationSignatures()) {
    const traces = item.tables.length
      + Object.values(item.columns).reduce((sum, cols) => sum + cols.length, 0)
      + item.indexes.length
      + item.triggers.length;
    assert.ok(traces > 0, `${item.file} не оставляет следов в схеме — определить её состояние нельзя`);
  }
});

test('то, что удалила поздняя миграция, из подписи ранней убрано', () => {
  // 0034 создаёт idx_page_lock_subscribers_unique, 0035 его удаляет. На
  // правильно мигрированной базе индекса нет — и требовать его от 0034 значит
  // вечно показывать её применённой лишь частично.
  const signatures = collectMigrationSignatures();
  const locks = signatures.find((item) => item.file.startsWith('0034'));
  assert.ok(locks, 'миграция 0034 потерялась');
  assert.ok(
    !locks.indexes.includes('idx_page_lock_subscribers_unique'),
    'в подписи 0034 остался индекс, удалённый миграцией 0035',
  );
});

test('комментарий в миграции не принимается за инструкцию', () => {
  // В 0012 и 0014 в комментариях написано «ALTER TABLE statements are
  // intentionally one-time». Без очистки разбор находил там таблицы
  // `statements` и `migrations`, которых не существует.
  const names = new Set(collectMigrationSignatures().flatMap((item) => Object.keys(item.columns)));
  assert.ok(!names.has('statements'), 'в подписи попала таблица из текста комментария');
  assert.ok(!names.has('migrations'), 'в подписи попала таблица из текста комментария');
});

test('каждая миграция объяснена владельцу, и лишних объяснений нет', async () => {
  const unlocks = await importFunctionModule('functions/_lib/migration-unlocks.ts');
  const files = listMigrationFiles();

  const undescribed = files.filter((file) => !unlocks.MIGRATION_UNLOCKS[file]);
  assert.deepEqual(undescribed, [],
    `эти миграции не описаны в migration-unlocks.ts: ${undescribed.join(', ')}`);

  const extra = Object.keys(unlocks.MIGRATION_UNLOCKS).filter((file) => !files.includes(file));
  assert.deepEqual(extra, [],
    `описаны несуществующие миграции: ${extra.join(', ')}`);
});

test('имя таблицы извлекается из обоих форматов ошибки D1', () => {
  assert.equal(guard.missingTableFromError(new Error('no such table: leads')), 'leads');
  assert.equal(guard.missingTableFromError(new Error('D1_ERROR: no such table: main.site_sections')), 'site_sections');
  assert.equal(guard.missingTableFromError(new Error('D1_ERROR: no such table: main.leads: SQLITE_ERROR')), 'leads');
  assert.equal(guard.missingTableFromError(new Error('syntax error near SELECT')), null);
});

test('отсутствующая колонка считается пробелом схемы, но таблицу не выдумывает', () => {
  const error = new Error('no such column: form_variant');
  assert.equal(guard.isMissingSchemaError(error), true);
  assert.equal(guard.missingTableFromError(error), null);
  assert.equal(guard.migrationForError(error), null);
});

test('обычная ошибка запроса пробелом схемы не считается', () => {
  assert.equal(guard.isMissingSchemaError(new Error('UNIQUE constraint failed')), false);
  assert.equal(guard.isMissingSchemaError('D1_ERROR: database is locked'), false);
});

test('ответ 503 называет конкретный файл миграции из текста ошибки', async () => {
  const response = guard.migrationRequiredResponse(
    new Error('D1_ERROR: no such table: main.leads'),
    '0000_fallback.sql',
    'до неё заявки негде хранить.',
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const payload = await response.json();
  assert.equal(payload.success, false);
  assert.equal(payload.code, 'MIGRATION_REQUIRED');
  assert.equal(payload.table, 'leads');
  assert.equal(payload.migration, '0008_leads_and_page_stats.sql');
  assert.match(payload.error, /Примените миграцию 0008_leads_and_page_stats\.sql/);
});

test('незнакомая таблица откатывается на запасную миграцию раздела', async () => {
  const response = guard.migrationRequiredResponse(
    new Error('no such table: something_new'),
    '0013_site_sections.sql',
    'до неё тексты негде хранить.',
  );
  const payload = await response.json();
  assert.equal(payload.migration, '0013_site_sections.sql');
  assert.equal(payload.table, 'something_new');
});

test('эндпоинты трёх разделов отдают структурный контракт, а не голый текст', () => {
  const leads = readFileSync(join(ROOT, 'functions/api/admin/leads.ts'), 'utf8');
  const sections = readFileSync(join(ROOT, 'functions/api/admin/site-sections.ts'), 'utf8');
  const stats = readFileSync(join(ROOT, 'functions/api/admin/stats.ts'), 'utf8');

  assert.match(leads, /migrationRequiredResponse\(/, 'leads снова отдаёт миграцию текстом');
  assert.match(sections, /migrationRequiredResponse\(/, 'site-sections снова отдаёт миграцию текстом');
  // stats не падает целиком, но обязан перечислить недостающие таблицы.
  assert.match(stats, /schemaGaps: gaps\.report\(\)/, 'stats снова молча показывает нули');
});
