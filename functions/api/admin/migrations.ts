import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { MIGRATION_SIGNATURES, type MigrationSignature } from '../../_lib/migration-signatures';
import { MIGRATION_SQL } from '../../_lib/migration-sql';
import { MIGRATION_UNLOCKS } from '../../_lib/migration-unlocks';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

type MigrationState = 'applied' | 'pending' | 'partial';

interface MigrationReport {
  file: string;
  /** Номер из имени файла — им владелец и оперирует. */
  number: string;
  state: MigrationState;
  /** Что раздел админки получает после применения; пусто у служебных. */
  unlocks: string;
  /** Чего именно не хватает — по-человечески, для состояния «частично». */
  missing: string[];
  /** Сколько следов проверено и сколько нашлось. */
  checked: number;
  found: number;
}

/**
 * Раздел «Миграции»: что уже применено в D1, а что ещё ждёт.
 *
 * Раннера миграций в проекте нет — владелец применяет их вручную по порядку в
 * консоли D1. До этого раздела единственным способом узнать состояние базы было
 * дождаться, пока какой-нибудь раздел админки ответит «примените миграцию N».
 *
 * Никакой таблицы учёта здесь не заводится намеренно: она отражала бы не базу, а
 * записи о базе, и разошлась бы с реальностью при первом же применении миграции
 * мимо админки. Вместо этого состояние читается из самой схемы — по следам,
 * которые миграция оставляет (таблицы, колонки, индексы, триггеры).
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  // Текст одной миграции — для кнопки «скопировать SQL». Отдаём по одной, а не
  // все сразу: вместе они весят под семьдесят килобайт, и тащить их в браузер
  // ради одной кнопки незачем.
  const requested = new URL(request.url).searchParams.get('sql');
  if (requested) {
    const sql = MIGRATION_SQL[requested];
    if (!sql) {
      return json({ success: false, error: 'Такой миграции нет' }, { status: 404, headers: noStore });
    }
    return json({ success: true, file: requested, sql }, { headers: noStore });
  }

  if (!env.DB) {
    return json(
      { success: false, code: 'D1_NOT_BOUND', error: 'Состояние миграций читается из базы и доступно на production.' },
      { status: 503, headers: noStore },
    );
  }

  try {
    // Одним запросом забираем всё, что есть в схеме: имена таблиц, индексов и
    // триггеров. Отдельный запрос на каждую миграцию дал бы полторы сотни
    // обращений к D1 ради одного экрана.
    const schema = await env.DB.prepare(
      "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger')",
    ).all<{ type: string; name: string }>();

    const tables = new Set<string>();
    const indexes = new Set<string>();
    const triggers = new Set<string>();
    for (const row of schema.results || []) {
      if (row.type === 'table') tables.add(row.name);
      else if (row.type === 'index') indexes.add(row.name);
      else if (row.type === 'trigger') triggers.add(row.name);
    }

    // Колонки спрашиваем только у тех таблиц, которые кто-то из миграций
    // расширяет, и только если таблица вообще существует.
    const tablesWithAddedColumns = new Set<string>();
    for (const signature of MIGRATION_SIGNATURES) {
      for (const table of Object.keys(signature.columns)) tablesWithAddedColumns.add(table);
    }

    const columnsByTable = new Map<string, Set<string>>();
    for (const table of tablesWithAddedColumns) {
      if (!tables.has(table)) continue;
      // Имя таблицы не из запроса, а из сгенерированного файла — подставлять
      // его в текст запроса безопасно, а параметром PRAGMA его не принимает.
      const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
      columnsByTable.set(table, new Set((info.results || []).map((row) => row.name)));
    }

    const report = MIGRATION_SIGNATURES.map((signature) => describe(signature, {
      tables, indexes, triggers, columnsByTable,
    }));

    const applied = report.filter((item) => item.state === 'applied').length;
    const pending = report.filter((item) => item.state === 'pending').length;
    const partial = report.filter((item) => item.state === 'partial').length;

    // Следующая к применению — самая ранняя неприменённая. Порядок важен:
    // поздние миграции опираются на таблицы ранних.
    const next = report.find((item) => item.state !== 'applied') || null;

    return json({
      success: true,
      total: report.length,
      applied,
      pending,
      partial,
      next: next ? next.file : null,
      migrations: report,
    }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(
      { success: false, error: `Не удалось прочитать схему базы: ${message}` },
      { status: 500, headers: noStore },
    );
  }
};

function describe(
  signature: MigrationSignature,
  schema: {
    tables: Set<string>;
    indexes: Set<string>;
    triggers: Set<string>;
    columnsByTable: Map<string, Set<string>>;
  },
): MigrationReport {
  const missing: string[] = [];
  let checked = 0;
  let found = 0;

  for (const table of signature.tables) {
    checked += 1;
    if (schema.tables.has(table)) found += 1;
    else missing.push(`таблица ${table}`);
  }

  for (const [table, columns] of Object.entries(signature.columns)) {
    for (const column of columns) {
      checked += 1;
      if (schema.columnsByTable.get(table)?.has(column)) found += 1;
      else missing.push(`колонка ${table}.${column}`);
    }
  }

  for (const index of signature.indexes) {
    checked += 1;
    if (schema.indexes.has(index)) found += 1;
    else missing.push(`индекс ${index}`);
  }

  for (const trigger of signature.triggers) {
    checked += 1;
    if (schema.triggers.has(trigger)) found += 1;
    else missing.push(`триггер ${trigger}`);
  }

  // «Частично» — это не придирка, а реальный случай: миграцию могли выполнить
  // не целиком, если одна из команд упала посреди файла. Молча считать такую
  // применённой нельзя: раздел админки будет падать на недостающей колонке.
  const state: MigrationState = found === checked ? 'applied' : found === 0 ? 'pending' : 'partial';

  return {
    file: signature.file,
    number: signature.file.slice(0, 4),
    state,
    unlocks: MIGRATION_UNLOCKS[signature.file] || '',
    missing,
    checked,
    found,
  };
}
