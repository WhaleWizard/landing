import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/**
 * Поиск дублей заявки по индексу (миграция 0039).
 *
 * До неё приём заявки перебирал последние 500 строк и сравнивал контакты в
 * коде: человек, писавший раньше этих пятисот, создавал дубль вместо того,
 * чтобы поднять свою заявку. Здесь проверяется, что приведение контактов в
 * миграции совпадает с приведением в коде — иначе индекс будет искать не то.
 */

const MIGRATION = readFileSync(new URL('../migrations/0039_leads_dedupe_index.sql', import.meta.url), 'utf8');

// Ровно те же правила, что в functions/_lib/leads.ts.
function contactKeys(email, phone, telegram) {
  const digits = String(phone || '').replace(/\D/g, '');
  return {
    email: String(email || '').trim().toLowerCase(),
    phone: digits.length > 10 ? digits.slice(-10) : digits,
    telegram: String(telegram || '').trim().toLowerCase().replace(/^@/, ''),
  };
}

function buildDatabase(rows) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE leads (
    id INTEGER PRIMARY KEY, email TEXT, phone TEXT, telegram_username TEXT, deleted_at TEXT
  );`);
  const insert = db.prepare('INSERT INTO leads (id, email, phone, telegram_username, deleted_at) VALUES (?, ?, ?, ?, ?)');
  rows.forEach((row, index) => insert.run(index + 1, row.email, row.phone, row.telegram, row.deleted || null));
  db.exec(MIGRATION);
  return db;
}

test('приведение контактов в миграции совпадает с приведением в коде', () => {
  const rows = [
    { email: 'Ivan@Mail.RU', phone: '+7 999 123-45-67', telegram: '@Ivan' },
    { email: '  ivan@mail.ru  ', phone: '8 (999) 123-45-67', telegram: 'ivan' },
    { email: '', phone: '', telegram: '' },
    { email: 'a@b.c', phone: '12345', telegram: '@Bob' },
    { email: 'd@e.f', phone: '+1 (800) 555-12-34', telegram: '' },
  ];
  const db = buildDatabase(rows);
  const stored = db.prepare('SELECT id, dedupe_email, dedupe_phone, dedupe_telegram FROM leads ORDER BY id').all();

  stored.forEach((row, index) => {
    const expected = contactKeys(rows[index].email, rows[index].phone, rows[index].telegram);
    assert.equal(row.dedupe_email, expected.email || null, `строка ${row.id}: почта`);
    assert.equal(row.dedupe_phone, expected.phone || null, `строка ${row.id}: телефон`);
    assert.equal(row.dedupe_telegram, expected.telegram || null, `строка ${row.id}: телеграм`);
  });

  // Разные написания одного человека дают один ключ — ради этого всё и делалось.
  assert.equal(stored[0].dedupe_phone, stored[1].dedupe_phone);
  assert.equal(stored[0].dedupe_email, stored[1].dedupe_email);
});

test('заявки без контакта не склеиваются между собой', () => {
  const db = buildDatabase([
    { email: '', phone: '', telegram: '' },
    { email: '   ', phone: '  ', telegram: '' },
  ]);
  const rows = db.prepare('SELECT dedupe_email, dedupe_phone, dedupe_telegram FROM leads').all();

  // Пусто хранится как NULL, а не пустая строка: в SQL NULL не равен NULL,
  // поэтому такие заявки не найдут друг друга. Пустая строка склеила бы их все.
  for (const row of rows) {
    assert.equal(row.dedupe_email, null);
    assert.equal(row.dedupe_phone, null);
    assert.equal(row.dedupe_telegram, null);
  }

  const found = db.prepare(
    `SELECT COUNT(*) AS n FROM leads
     WHERE (?1 IS NOT NULL AND dedupe_email = ?1)
        OR (?2 IS NOT NULL AND dedupe_phone = ?2)
        OR (?3 IS NOT NULL AND dedupe_telegram = ?3)`,
  ).get(null, null, null);
  assert.equal(found.n, 0, 'пустой ключ не должен находить ничего');
});

test('запрос поиска находит контакт любой давности и уважает корзину', () => {
  const db = buildDatabase([
    { email: 'old@mail.ru', phone: '+7 999 000-00-01', telegram: '@old' },
    { email: 'trashed@mail.ru', phone: '+7 999 000-00-02', telegram: '@trashed', deleted: '2026-01-01' },
  ]);

  const search = (keys) => db.prepare(
    `SELECT id FROM leads
     WHERE deleted_at IS NULL AND (
       (?1 IS NOT NULL AND dedupe_email = ?1)
       OR (?2 IS NOT NULL AND dedupe_phone = ?2)
       OR (?3 IS NOT NULL AND dedupe_telegram = ?3)
     )
     ORDER BY id DESC LIMIT 1`,
  ).get(keys.email || null, keys.phone || null, keys.telegram || null);

  // Тот же человек в другом написании — находится.
  assert.equal(search(contactKeys('OLD@MAIL.RU', '8 999 000 00 01', 'OLD')).id, 1);
  // Совпадения хватает по одному каналу: пришёл только с телефоном.
  assert.equal(search(contactKeys('', '+7 999 000-00-01', '')).id, 1);
  // Заявка в корзине в дедупликации не участвует.
  assert.equal(search(contactKeys('trashed@mail.ru', '', '')), undefined);
  // Незнакомый контакт не находит никого.
  assert.equal(search(contactKeys('new@mail.ru', '+7 900 111-22-33', '@new')), undefined);
});

test('индексы созданы и покрывают поиск', () => {
  const db = buildDatabase([{ email: 'a@b.c', phone: '+79990000001', telegram: '@a' }]);
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_leads_dedupe%'")
    .all().map((row) => row.name).sort();
  assert.deepEqual(indexes, ['idx_leads_dedupe_email', 'idx_leads_dedupe_phone', 'idx_leads_dedupe_telegram']);

  // Главное, ради чего миграция: план запроса берёт индекс, а не читает всё.
  const plan = db.prepare(
    'EXPLAIN QUERY PLAN SELECT id FROM leads WHERE dedupe_phone = ?',
  ).all().map((row) => row.detail).join(' ');
  assert.match(plan, /idx_leads_dedupe_phone/, `ожидался поиск по индексу, план: ${plan}`);
});
