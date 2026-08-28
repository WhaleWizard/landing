#!/usr/bin/env node
/**
 * Собирает `functions/_lib/migration-tables.ts` из самих файлов миграций.
 *
 *   node scripts/build-migration-map.js
 *
 * Карта «таблица → миграция» нужна серверу, чтобы на отсутствующей таблице
 * назвать владельцу конкретный файл, а не абстрактное «нужна миграция».
 * Писать её руками нельзя: имена таблиц и номера файлов расходятся молча
 * (в первой ручной версии половина записей оказалась выдуманной), а проверить
 * это в бою можно только уронив раздел.
 *
 * Целостность стережёт `npm run test:migration-map` в общей проверке.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'migrations');
const OUTPUT_PATH = join(ROOT, 'functions', '_lib', 'migration-tables.ts');
const SIGNATURES_PATH = join(ROOT, 'functions', '_lib', 'migration-signatures.ts');
const SQL_PATH = join(ROOT, 'functions', '_lib', 'migration-sql.ts');

/**
 * Убирает комментарии, чтобы разбор не принял пояснение за инструкцию.
 * Не выдуманная предосторожность: в 0012 и 0014 в комментариях написано
 * «ALTER TABLE statements are intentionally one-time», и без очистки разбор
 * находил там таблицы `statements` и `migrations`.
 */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

export function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
}

/** { таблица: файл миграции }; при повторном CREATE побеждает самый ранний. */
export function collectMigrationTables() {
  const byTable = new Map();
  for (const file of listMigrationFiles()) {
    const sql = stripComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    for (const match of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`[]?([A-Za-z0-9_]+)["`\]]?/gi)) {
      const table = match[1];
      if (!byTable.has(table)) byTable.set(table, file);
    }
  }
  return byTable;
}

/**
 * Подпись миграции — следы, которые она оставляет в схеме: таблицы, колонки,
 * индексы и триггеры. По ним админка отвечает на вопрос «а она применена?».
 *
 * Одних таблиц для этого мало: 0039 только добавляет колонки к `leads`, а 0040
 * ставит триггеры — по карте таблиц обе выглядели бы применёнными с самого
 * начала, потому что таблицы существуют с 0008 и 0006.
 */
export function collectMigrationSignatures() {
  const files = listMigrationFiles();

  // Что удаляют более поздние миграции. Без этого 0034 навсегда числилась бы
  // применённой лишь частично: она создаёт idx_page_lock_subscribers_unique, а
  // 0035 его удаляет — на правильно мигрированной базе индекса и нет.
  const droppedLater = files.map((_, index) => {
    const names = new Set();
    for (const later of files.slice(index + 1)) {
      const sql = stripComments(readFileSync(join(MIGRATIONS_DIR, later), 'utf8'));
      for (const match of sql.matchAll(/DROP\s+(?:TABLE|INDEX|TRIGGER)\s+(?:IF\s+EXISTS\s+)?["`[]?([A-Za-z0-9_]+)["`\]]?/gi)) {
        names.add(match[1]);
      }
    }
    return names;
  });

  return files.map((file, index) => {
    const sql = stripComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    const gone = droppedLater[index];

    const tables = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`[]?([A-Za-z0-9_]+)["`\]]?/gi)]
      .map((match) => match[1])
      .filter((name) => !gone.has(name));

    const columns = {};
    for (const match of sql.matchAll(/ALTER\s+TABLE\s+["`[]?([A-Za-z0-9_]+)["`\]]?\s+ADD\s+(?:COLUMN\s+)?["`[]?([A-Za-z0-9_]+)["`\]]?/gi)) {
      const [, table, column] = match;
      if (gone.has(table)) continue;
      (columns[table] ||= []).push(column);
    }

    const indexes = [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["`[]?([A-Za-z0-9_]+)["`\]]?/gi)]
      .map((match) => match[1])
      .filter((name) => !gone.has(name));

    const triggers = [...sql.matchAll(/CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?["`[]?([A-Za-z0-9_]+)["`\]]?/gi)]
      .map((match) => match[1])
      .filter((name) => !gone.has(name));

    return { file, tables, columns, indexes, triggers };
  });
}

/**
 * Текст миграций для админки: в Cloudflare Functions нет файловой системы, а
 * кнопка «скопировать SQL» нужна именно там, где владелец видит, что миграция
 * ещё не применена. Комментарии сохраняются — они объясняют, зачем миграция,
 * и D1 их спокойно принимает.
 */
export function renderMigrationSql(files) {
  const rows = files.map((file) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/\r\n/g, '\n').trimEnd();
    return `  '${file}': ${JSON.stringify(sql)},`;
  }).join('\n');

  return `/*
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не править руками.
 * Источник: файлы migrations/*.sql
 * Пересборка: node scripts/build-migration-map.js
 *
 * Текст миграций для раздела «Миграции». В Cloudflare Functions нет файловой
 * системы, поэтому SQL попадает на сервер только так. Отдаётся по одной штуке
 * и только под паролем админки.
 */

export const MIGRATION_SQL: Readonly<Record<string, string>> = {
${rows}
};
`;
}

export function renderMigrationSignatures(signatures) {
  const rows = signatures.map((item) => {
    const columnRows = Object.entries(item.columns)
      .map(([table, cols]) => `      ${table}: [${cols.map((c) => `'${c}'`).join(', ')}],`)
      .join('\n');
    return `  {
    file: '${item.file}',
    tables: [${item.tables.map((t) => `'${t}'`).join(', ')}],
    columns: {${columnRows ? `\n${columnRows}\n    ` : ''}},
    indexes: [${item.indexes.map((i) => `'${i}'`).join(', ')}],
    triggers: [${item.triggers.map((t) => `'${t}'`).join(', ')}],
  },`;
  }).join('\n');

  return `/*
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не править руками.
 * Источник: файлы migrations/*.sql
 * Пересборка: node scripts/build-migration-map.js
 *
 * След, который каждая миграция оставляет в схеме. По нему раздел «Миграции»
 * отвечает, применена она или ещё ждёт: сверяет подпись с настоящей базой.
 *
 * Руками этот список вести нельзя — он разойдётся с миграциями молча, и
 * админка начнёт уверенно показывать неверное состояние базы.
 */

export interface MigrationSignature {
  readonly file: string;
  /** Таблицы, которые миграция создаёт. */
  readonly tables: readonly string[];
  /** Колонки, которые она добавляет к уже существующим таблицам. */
  readonly columns: Readonly<Record<string, readonly string[]>>;
  readonly indexes: readonly string[];
  readonly triggers: readonly string[];
}

export const MIGRATION_SIGNATURES: readonly MigrationSignature[] = [
${rows}
];
`;
}

export function renderMigrationTables(byTable) {
  const rows = [...byTable.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([table, file]) => `  ${table}: '${file}',`)
    .join('\n');

  return `/*
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не править руками.
 * Источник: файлы migrations/*.sql
 * Пересборка: node scripts/build-migration-map.js
 *
 * Какая миграция создаёт какую таблицу. Нужна для честного ответа админки
 * «примените миграцию N», когда таблицы в D1 ещё нет.
 */

export const MIGRATION_BY_TABLE: Readonly<Record<string, string>> = {
${rows}
};
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const byTable = collectMigrationTables();
  writeFileSync(OUTPUT_PATH, renderMigrationTables(byTable), 'utf8');

  const signatures = collectMigrationSignatures();
  writeFileSync(SIGNATURES_PATH, renderMigrationSignatures(signatures), 'utf8');

  const files = listMigrationFiles();
  writeFileSync(SQL_PATH, renderMigrationSql(files), 'utf8');

  process.stdout.write(`✅ Таблиц в карте миграций: ${byTable.size}\n`);
  process.stdout.write(`✅ Подписей миграций: ${signatures.length}\n`);
  process.stdout.write(`✅ Текстов миграций: ${files.length}\n`);
}

export const MIGRATION_MAP_PATH = OUTPUT_PATH;
export const MIGRATION_SIGNATURES_PATH = SIGNATURES_PATH;
export const MIGRATION_SQL_PATH = SQL_PATH;
