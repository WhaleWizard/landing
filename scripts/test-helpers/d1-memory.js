/**
 * D1 в памяти для тестов: node:sqlite с настоящими миграциями из migrations/.
 *
 * Та же обёртка, что внутри scripts/audit-admin-api-core.test.js; вынесена,
 * чтобы тесты, которым нужна база «в форме прода» (например, медиатека после
 * F-009 отказывает удалять и переносить файлы без базы статей), не копировали
 * её по третьему разу.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export const ALL_MIGRATIONS = readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort();

class D1Statement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new D1Statement(this.db, this.sql, values);
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.values) ?? null;
  }
  async all() {
    return { success: true, results: this.db.prepare(this.sql).all(...this.values) };
  }
  async run() {
    const info = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
  }
}

export class D1Database {
  constructor(db) { this.db = db; }
  prepare(sql) { return new D1Statement(this.db, sql); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

/** Свежая база со всеми миграциями. */
export function freshDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ALL_MIGRATIONS) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  return sqlite;
}
