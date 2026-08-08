import { json } from './http';
import { CACHE_CONTROL } from './cache';
import { MIGRATION_BY_TABLE } from './migration-tables';

/**
 * Единый ответ разделов админки, которым не хватает миграции D1.
 *
 * Раннера миграций в проекте нет: владелец применяет их вручную по порядку.
 * Поэтому раздел без своей таблицы обязан объяснить себя, а не падать и не
 * рисовать нули. Раньше каждый эндпоинт решал это по-своему — часть отдавала
 * структурные поля `code`/`migration`, часть только текст, и интерфейс не мог
 * отличить «нужна миграция» от «сломался сервер».
 */

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

export { MIGRATION_BY_TABLE } from './migration-tables';

/** Ошибка D1 «таблицы/колонки ещё нет», а не «запрос неверный». */
export function isMissingSchemaError(error: unknown): boolean {
  return /no such table|no such column/i.test(error instanceof Error ? error.message : String(error));
}

/**
 * Имя таблицы из текста ошибки SQLite. Формат бывает и `no such table: leads`,
 * и `D1_ERROR: no such table: main.leads` — префикс схемы отбрасываем.
 */
export function missingTableFromError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /no such table:\s*(?:[A-Za-z0-9_]+\.)?([A-Za-z0-9_]+)/i.exec(message);
  return match ? match[1] : null;
}

/** Файл миграции, создающей таблицу из ошибки. */
export function migrationForError(error: unknown): string | null {
  const table = missingTableFromError(error);
  return table ? MIGRATION_BY_TABLE[table] || null : null;
}

export type MigrationRequiredPayload = {
  success: false;
  code: 'MIGRATION_REQUIRED';
  migration: string;
  table: string | null;
  error: string;
};

/**
 * Тело ответа «нужна миграция». `reason` — человеческим языком, что именно
 * не заработает до неё: владелец не разработчик, номер файла ему ничего
 * не говорит сам по себе.
 */
export function migrationRequiredPayload(
  migration: string,
  reason: string,
  table: string | null = null,
): MigrationRequiredPayload {
  return {
    success: false,
    code: 'MIGRATION_REQUIRED',
    migration,
    table,
    error: `Примените миграцию ${migration} к production D1 — ${reason}`,
  };
}

/** Готовый 503-ответ для эндпоинта, упавшего на отсутствующей таблице. */
export function migrationRequiredResponse(
  error: unknown,
  fallbackMigration: string,
  reason: string,
): Response {
  const table = missingTableFromError(error);
  const migration = migrationForError(error) || fallbackMigration;
  return json(migrationRequiredPayload(migration, reason, table), { status: 503, headers: noStore });
}
