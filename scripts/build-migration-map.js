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

/** { таблица: файл миграции }; при повторном CREATE побеждает самый ранний. */
export function collectMigrationTables() {
  const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
  const byTable = new Map();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const match of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`[]?([A-Za-z0-9_]+)["`\]]?/gi)) {
      const table = match[1];
      if (!byTable.has(table)) byTable.set(table, file);
    }
  }
  return byTable;
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
  process.stdout.write(`✅ Таблиц в карте миграций: ${byTable.size}\n`);
}

export const MIGRATION_MAP_PATH = OUTPUT_PATH;
