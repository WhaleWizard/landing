import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/**
 * Удержание истории версий (миграция 0040).
 *
 * Каждое сохранение статьи и блока текстов сайта добавляло строку, и ничто их
 * не удаляло. Здесь проверяется, что после миграции история обрезается до
 * пятидесяти последних — и что обрезается именно хвост, а не свежие версии.
 */

const RETENTION = 50;
const MIGRATION = readFileSync(new URL('../migrations/0040_versions_retention.sql', import.meta.url), 'utf8');

function buildDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE article_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      version_data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE TABLE site_section_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_key TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

test('разовая уборка оставляет пятьдесят последних версий на объект', () => {
  const db = buildDatabase();
  const insert = db.prepare('INSERT INTO article_versions (slug, version_data) VALUES (?, ?)');
  for (let i = 1; i <= 120; i += 1) insert.run('статья-один', `версия ${i}`);
  for (let i = 1; i <= 7; i += 1) insert.run('статья-два', `версия ${i}`);

  db.exec(MIGRATION);

  const first = db.prepare("SELECT COUNT(*) AS n, MIN(version_data) AS oldest FROM article_versions WHERE slug = 'статья-один'").get();
  const second = db.prepare("SELECT COUNT(*) AS n FROM article_versions WHERE slug = 'статья-два'").get();

  assert.equal(first.n, RETENTION, 'у активной статьи должно остаться пятьдесят');
  assert.equal(second.n, 7, 'у редко правленной — сколько было');

  // Обрезан хвост, а не свежие версии.
  const kept = db.prepare("SELECT version_data FROM article_versions WHERE slug = 'статья-один' ORDER BY id ASC LIMIT 1").get();
  assert.equal(kept.version_data, 'версия 71', `ожидалась 71-я как самая старая из оставшихся, получено ${kept.version_data}`);
});

test('триггер держит планку при дальнейших сохранениях', () => {
  const db = buildDatabase();
  db.exec(MIGRATION);

  const insert = db.prepare('INSERT INTO article_versions (slug, version_data) VALUES (?, ?)');
  for (let i = 1; i <= 200; i += 1) insert.run('статья', `версия ${i}`);

  const rows = db.prepare("SELECT version_data FROM article_versions WHERE slug = 'статья' ORDER BY id DESC").all();
  assert.equal(rows.length, RETENTION);
  assert.equal(rows[0].version_data, 'версия 200', 'самая свежая версия должна остаться');
  assert.equal(rows.at(-1).version_data, 'версия 151', 'храним ровно последние пятьдесят');
});

test('истории разных объектов не мешают друг другу', () => {
  const db = buildDatabase();
  db.exec(MIGRATION);

  const insert = db.prepare('INSERT INTO site_section_versions (section_key, snapshot_json) VALUES (?, ?)');
  for (let i = 1; i <= 80; i += 1) insert.run('site:home', `снимок ${i}`);
  for (let i = 1; i <= 3; i += 1) insert.run('site:meta-ads', `снимок ${i}`);

  const home = db.prepare("SELECT COUNT(*) AS n FROM site_section_versions WHERE section_key = 'site:home'").get();
  const meta = db.prepare("SELECT COUNT(*) AS n FROM site_section_versions WHERE section_key = 'site:meta-ads'").get();

  assert.equal(home.n, RETENTION, 'часто правленный блок обрезан');
  assert.equal(meta.n, 3, 'редко правленный блок не тронут');
});

test('ровно пятьдесят версий не обрезаются', () => {
  const db = buildDatabase();
  db.exec(MIGRATION);

  const insert = db.prepare('INSERT INTO article_versions (slug, version_data) VALUES (?, ?)');
  for (let i = 1; i <= RETENTION; i += 1) insert.run('ровно', `версия ${i}`);

  const row = db.prepare("SELECT COUNT(*) AS n FROM article_versions WHERE slug = 'ровно'").get();
  assert.equal(row.n, RETENTION, 'на границе ничего удаляться не должно');
});
