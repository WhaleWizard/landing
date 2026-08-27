import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { build, transform } from 'esbuild';

// РћР±СЂР°Р±РѕС‚С‡РёРєРё Р°РґРјРёРЅРєРё РїСЂРѕС…РѕРґСЏС‚ С‡РµСЂРµР· РѕРіСЂР°РЅРёС‡РёС‚РµР»СЊ С‡Р°СЃС‚РѕС‚С‹, РєРѕС‚РѕСЂС‹Р№ РІ Cloudflare
// Р¶РёРІС‘С‚ РЅР° РіР»РѕР±Р°Р»СЊРЅРѕРј `caches`. Р’ Node РµРіРѕ РЅРµС‚ вЂ” РїРѕРґСЃС‚Р°РІР»СЏРµРј РїСѓСЃС‚РѕР№ РєРµС€.
globalThis.caches ??= { default: { match: async () => undefined, put: async () => {} } };

// `fresh` РґР°С‘С‚ РјРѕРґСѓР»СЋ СѓРЅРёРєР°Р»СЊРЅС‹Р№ С‚РµРєСЃС‚, РїРѕСЌС‚РѕРјСѓ import() РѕС‚РґР°С‘С‚ РЅРѕРІС‹Р№ СЌРєР·РµРјРїР»СЏСЂ,
// Р° РЅРµ Р·Р°РєРµС€РёСЂРѕРІР°РЅРЅС‹Р№. РќСѓР¶РЅРѕ С‚Р°Рј, РіРґРµ РјРѕРґСѓР»СЊ РґРµСЂР¶РёС‚ СЃРѕР±СЃС‚РІРµРЅРЅС‹Р№ РєРµС€ СЃРѕСЃС‚РѕСЏРЅРёСЏ
// СЃС…РµРјС‹: РёРЅР°С‡Рµ РєРѕР»РѕРЅРєРё РїРµСЂРІРѕР№ С‚РµСЃС‚РѕРІРѕР№ Р±Р°Р·С‹ СѓС‚РµРєР»Рё Р±С‹ РІ СЃР»РµРґСѓСЋС‰СѓСЋ.
async function importTypeScript(path, { fresh = false } = {}) {
  const source = readFileSync(path, 'utf8');
  const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
  const code = fresh ? `${compiled.code}\n//${randomUUID()}` : compiled.code;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

class D1StatementAdapter {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1StatementAdapter(this.database, this.sql, values);
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }

  async all() {
    return { success: true, results: this.database.prepare(this.sql).all(...this.values) };
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: {
        changes: Number(result.changes || 0),
        last_row_id: Number(result.lastInsertRowid || 0),
      },
    };
  }
}

class D1DatabaseAdapter {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1StatementAdapter(this.database, sql);
  }

  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function createLeadDatabase({ softDelete = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const migrations = [
    'migrations/0005_meta_outbox.sql',
    'migrations/0008_leads_and_page_stats.sql',
    'migrations/0009_leads_dedupe_quality.sql',
    'migrations/0010_leads_meta_quality.sql',
    'migrations/0011_leads_utm.sql',
    'migrations/0012_admin_control_center.sql',
    'migrations/0014_crm_workspace.sql',
    'migrations/0015_lead_consent_receipts.sql',
    'migrations/0017_crm_correctness.sql',
    'migrations/0019_lead_ingestion_idempotency.sql',
  ];
  if (softDelete) migrations.push('migrations/0020_leads_soft_delete.sql');
  for (const migration of migrations) {
    sqlite.exec(readFileSync(migration, 'utf8'));
  }
  return { sqlite, d1: new D1DatabaseAdapter(sqlite) };
}

// РћР±СЂР°Р±РѕС‚С‡РёРєРё Pages Functions РёРјРїРѕСЂС‚РёСЂСѓСЋС‚ СЃРѕСЃРµРґРЅРёРµ РјРѕРґСѓР»Рё РїРѕ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Рј
// РїСѓС‚СЏРј, РєРѕС‚РѕСЂС‹Рµ РёР· data:-URL РЅРµ СЂРµР·РѕР»РІСЏС‚СЃСЏ. РџРѕСЌС‚РѕРјСѓ РёС… СЃРѕР±РёСЂР°РµРј С†РµР»РёРєРѕРј.
async function bundleTypeScript(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'neutral',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const TRASH_ENV_PASSWORD = 'trash-test-password';

function trashRequest(body) {
  return new Request('https://example.com/api/admin/lead-trash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': TRASH_ENV_PASSWORD },
    body: JSON.stringify(body),
  });
}

async function callTrash(handlers, d1, body) {
  const response = await handlers.onRequestPost({
    request: trashRequest(body),
    env: { DB: d1, ADMIN_PASSWORD: TRASH_ENV_PASSWORD },
  });
  return { status: response.status, payload: await response.json() };
}

test('lead storage is durable, event-id idempotent and resets CRM on a real repeat', async () => {
  const { storeLead } = await importTypeScript('functions/_lib/leads.ts');
  const { sqlite, d1 } = createLeadDatabase();
  const receipt = {
    consent_version: 1,
    consent_source: 'user',
    consent_region: 'UZ',
    consent_timestamp: Date.now(),
  };

  const first = await storeLead({ DB: d1 }, {
    event_id: 'lead-event-1',
    name: 'Test Lead',
    email: 'lead@example.com',
    phone: '+998 90 123 45 67',
    service: 'Meta Ads',
    page_path: '/meta-ads',
    page_url: 'https://www.whalewzrd.com/meta-ads/',
    message: 'First request',
    marketing_consent: true,
    fbp: 'fb.1.first',
    fbc: 'fb.1.click',
    external_id: 'external-first',
    utm_source: 'meta',
    utm_campaign: 'first-campaign',
    ...receipt,
  });
  assert.deepEqual(
    { durable: first.durable, duplicate: first.duplicate, repeat: first.repeat, count: first.submissionsCount },
    { durable: true, duplicate: false, repeat: false, count: 1 },
  );

  const exactRetry = await storeLead({ DB: d1 }, {
    event_id: 'lead-event-1',
    name: 'Test Lead',
    email: 'lead@example.com',
    marketing_consent: true,
    ...receipt,
  });
  assert.equal(exactRetry.duplicate, true);
  assert.equal(sqlite.prepare('SELECT submissions_count FROM leads').get().submissions_count, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM lead_activity').get().count, 0);

  sqlite.exec(`
    UPDATE leads SET
      status = 'closed',
      quality = 'target',
      pipeline_stage = 'proposal',
      next_action_at = '2030-01-01 12:00:00',
      next_action_text = 'Old next action',
      loss_reason = 'Old reason',
      closed_at = '2026-01-01 00:00:00',
      last_contacted_at = '2026-01-01 00:00:00',
      crm_revision = 7,
      crm_action_id = 'old-crm-action',
      quality_revision = 3,
      quality_action_id = 'old-quality-action',
      quality_processing = 1,
      fbp = 'stale-fbp',
      fbc = 'stale-fbc',
      event_source_url = 'https://stale.example/',
      external_id = 'stale-external',
      utm_source = 'stale-source',
      utm_campaign = 'stale-campaign'
  `);

  const repeat = await storeLead({ DB: d1 }, {
    event_id: 'lead-event-2',
    name: 'Test Lead',
    email: 'lead@example.com',
    phone: '+998901234567',
    service: 'Consult',
    page_path: '',
    page_url: 'https://should-not-remain.example/',
    message: 'Second request',
    marketing_consent: false,
    fbp: 'must-be-cleared',
    fbc: 'must-be-cleared',
    external_id: 'must-be-cleared',
    utm_source: 'must-be-cleared',
    utm_campaign: 'must-be-cleared',
    ...receipt,
  });
  assert.deepEqual(
    { durable: repeat.durable, duplicate: repeat.duplicate, repeat: repeat.repeat, count: repeat.submissionsCount },
    { durable: true, duplicate: false, repeat: true, count: 2 },
  );

  const row = sqlite.prepare('SELECT * FROM leads').get();
  assert.equal(row.status, 'new');
  assert.equal(row.quality, '');
  assert.equal(row.pipeline_stage, 'new');
  assert.equal(row.next_action_at, null);
  assert.equal(row.next_action_text, '');
  assert.equal(row.loss_reason, '');
  assert.equal(row.closed_at, null);
  assert.equal(row.last_contacted_at, null);
  assert.equal(row.crm_revision, 8);
  assert.equal(row.crm_action_id, 'lead-resubmitted:lead-event-2');
  assert.equal(row.quality_revision, 4);
  assert.ok(row.quality_updated_at);
  assert.equal(row.quality_action_id, '');
  assert.equal(row.quality_processing, 0);
  assert.ok(row.pipeline_changed_at);
  for (const field of ['fbp', 'fbc', 'event_source_url', 'external_id', 'utm_source', 'utm_campaign']) {
    assert.equal(row[field], '', `${field} must be cleared after marketing consent downgrade`);
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lead_activity WHERE type = 'lead_resubmitted'").get().count, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM lead_ingestions').get().count, 2);

  const repeatRetry = await storeLead({ DB: d1 }, {
    event_id: 'lead-event-2',
    name: 'Test Lead',
    email: 'lead@example.com',
    marketing_consent: false,
    ...receipt,
  });
  assert.equal(repeatRetry.duplicate, true);
  assert.equal(sqlite.prepare('SELECT submissions_count FROM leads').get().submissions_count, 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lead_activity WHERE type = 'lead_resubmitted'").get().count, 1);
});

test('lead storage rejects a missing binding and configured D1 failures as retryable', async () => {
  const { LeadStorageError, storeLead } = await importTypeScript('functions/_lib/leads.ts');
  await assert.rejects(
    () => storeLead({}, { event_id: 'missing-db-event' }),
    (error) => error instanceof LeadStorageError && error.retryable === true,
  );

  const brokenDb = { prepare() { throw new Error('simulated D1 outage'); } };
  await assert.rejects(
    () => storeLead({ DB: brokenDb }, { event_id: 'broken-event' }),
    (error) => error instanceof LeadStorageError && error.retryable === true,
  );
});

test('retry consent can only downgrade and preserves the original receipt', async () => {
  const { applyConsentDowngrade } = await importTypeScript('src/app/utils/leadRetryConsent.ts');
  const original = {
    event_id: 'queued-event',
    name: 'Lead',
    email: 'lead@example.com',
    phone: '+998 90 123 45 67',
    telegramUsername: '@lead',
    message: 'Need a campaign audit',
    form_id: 'contact-main',
    form_variant: 'landing',
    service: 'Meta Ads',
    marketing_consent: true,
    consent_version: 1,
    consent_source: 'user',
    consent_region: 'UZ',
    consent_timestamp: 1_700_000_000_000,
    fbp: 'fbp',
    fbc: 'fbc',
    fbclid: 'click',
    external_id: 'external',
    utm_source: 'meta',
    ga_client_id: 'ga',
    yandex_client_id: 'ym',
    page_url: 'https://example.com/meta-ads/',
    lead_source_page: '/meta-ads/',
    referrer: 'https://facebook.com/',
    screen_width: 1440,
  };

  const stillGranted = applyConsentDowngrade(original, { categories: { marketing: true } });
  assert.equal(stillGranted.marketing_consent, true);
  assert.equal(stillGranted.consent_timestamp, original.consent_timestamp);
  assert.equal(stillGranted.fbp, 'fbp');

  const revoked = applyConsentDowngrade(original, null);
  assert.equal(revoked.marketing_consent, false);
  assert.equal(revoked.consent_timestamp, original.consent_timestamp);
  assert.equal(revoked.name, original.name);
  assert.equal(revoked.email, original.email);
  assert.equal(revoked.phone, original.phone);
  assert.equal(revoked.telegramUsername, original.telegramUsername);
  assert.equal(revoked.message, original.message);
  assert.equal(revoked.form_id, original.form_id);
  assert.equal(revoked.form_variant, original.form_variant);
  assert.equal(revoked.service, original.service);
  for (const field of ['fbp', 'fbc', 'fbclid', 'external_id', 'utm_source', 'ga_client_id', 'yandex_client_id', 'page_url', 'lead_source_page', 'referrer', 'screen_width']) {
    assert.equal(field in revoked, false, `${field} must be removed after downgrade`);
  }

  const originallyDenied = applyConsentDowngrade({ ...original, marketing_consent: false }, { categories: { marketing: true } });
  assert.equal(originallyDenied.marketing_consent, false, 'retry must never upgrade false to true');
  assert.equal('fbp' in originallyDenied, false);
  assert.equal(originallyDenied.consent_timestamp, original.consent_timestamp);
});

test('CRM correctness schema rejects duplicate actions and stale revisions', () => {
  const { sqlite } = createLeadDatabase();
  const leadId = Number(sqlite.prepare("INSERT INTO leads (event_id, name) VALUES ('crm-event-1', 'CRM Lead')").run().lastInsertRowid);

  const lead = sqlite.prepare('SELECT crm_revision, quality_revision, quality_processing FROM leads WHERE id = ?').get(leadId);
  assert.deepEqual(
    { crm_revision: lead.crm_revision, quality_revision: lead.quality_revision, quality_processing: lead.quality_processing },
    { crm_revision: 0, quality_revision: 0, quality_processing: 0 },
  );

  sqlite.prepare("INSERT INTO crm_notes (lead_id, body, action_id) VALUES (?, 'First', 'note-action-1')").run(leadId);
  assert.throws(
    () => sqlite.prepare("INSERT INTO crm_notes (lead_id, body, action_id) VALUES (?, 'Duplicate', 'note-action-1')").run(leadId),
    /UNIQUE constraint failed/,
  );

  const first = sqlite.prepare("UPDATE leads SET crm_revision = crm_revision + 1, crm_action_id = 'save-1' WHERE id = ? AND crm_revision = 0").run(leadId);
  const stale = sqlite.prepare("UPDATE leads SET crm_revision = crm_revision + 1, crm_action_id = 'save-stale' WHERE id = ? AND crm_revision = 0").run(leadId);
  assert.equal(first.changes, 1);
  assert.equal(stale.changes, 0);
  assert.equal(sqlite.prepare('SELECT crm_action_id FROM leads WHERE id = ?').get(leadId).crm_action_id, 'save-1');
});

test('quality action ids make reclassification signals unique and retries stable', async () => {
  // Через bundleTypeScript, а не importTypeScript: модуль импортирует соседний
  // `_lib/redact.ts`, а относительные пути из data:-URL не резолвятся.
  const { qualityEventId, qualityEventIds } = await bundleTypeScript('functions/_lib/admin-lead-quality-status.ts');
  const first = { id: 7, event_id: 'lead-event', quality_action_id: 'quality-action-1' };
  const retry = { ...first };
  const later = { ...first, quality_action_id: 'quality-action-2' };

  assert.equal(qualityEventId(first, 'target'), qualityEventId(retry, 'target'));
  assert.notEqual(qualityEventId(first, 'target'), qualityEventId(later, 'target'));
  assert.deepEqual(qualityEventIds(first, 'target'), [
    'lq:target:lead-event:a:quality-action-1',
    'lq:target:lead-event',
    'lq:target:7',
  ]);
});

test('legacy admin endpoint cannot partially persist a combined status and quality mutation', () => {
  const source = readFileSync('functions/api/admin/leads.ts', 'utf8');
  assert.match(source, /if \(hasStatus && hasQuality\)/);
  assert.match(source, /Update status and quality in separate requests/);
});

test('a trashed lead never absorbs a new submission from the same contact', async () => {
  const { storeLead } = await importTypeScript('functions/_lib/leads.ts', { fresh: true });
  const { sqlite, d1 } = createLeadDatabase();

  const first = await storeLead({ DB: d1 }, {
    event_id: 'trash-dedupe-1',
    name: 'Spam Bot',
    email: 'repeat@example.com',
  });
  assert.equal(first.repeat, false);

  sqlite.exec("UPDATE leads SET deleted_at = datetime('now') WHERE id = " + first.leadId);

  // РўРѕС‚ Р¶Рµ РєРѕРЅС‚Р°РєС‚ РѕР±СЂР°С‰Р°РµС‚СЃСЏ СЃРЅРѕРІР°. Р—Р°СЏРІРєР° РѕР±СЏР·Р°РЅР° РїРѕСЏРІРёС‚СЊСЃСЏ РєР°Рє РЅРѕРІР°СЏ:
  // РёРЅР°С‡Рµ РѕРЅР° РїРѕРґРєР»РµРёР»Р°СЃСЊ Р±С‹ Рє СЃРєСЂС‹С‚РѕР№ Р·Р°РїРёСЃРё Рё РЅРµ РїРѕРїР°Р»Р° Р±С‹ РІ СЃРїРёСЃРѕРє.
  const afterTrash = await storeLead({ DB: d1 }, {
    event_id: 'trash-dedupe-2',
    name: 'Real Client',
    email: 'repeat@example.com',
  });
  assert.equal(afterTrash.repeat, false, 'new submission must not be treated as a repeat');
  assert.notEqual(afterTrash.leadId, first.leadId, 'new submission must get its own lead row');
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) AS count FROM leads WHERE deleted_at IS NULL').get().count,
    1,
    'only the fresh lead stays visible',
  );
});

test('trash hides a lead from active lists and a restore brings it back intact', async () => {
  const trash = await bundleTypeScript('functions/api/admin/lead-trash.ts');
  const { sqlite, d1 } = createLeadDatabase();
  const leadId = Number(
    sqlite.prepare("INSERT INTO leads (event_id, name, email) VALUES ('t-1', 'Client', 'c@example.com')").run().lastInsertRowid,
  );
  sqlite.prepare("INSERT INTO crm_notes (lead_id, body, action_id) VALUES (?, 'Important note', 'note-keep')").run(leadId);

  const moved = await callTrash(trash, d1, { action: 'delete', ids: [leadId], reason: 'СЃРїР°Рј' });
  assert.equal(moved.status, 200);
  assert.equal(moved.payload.moved, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM leads WHERE deleted_at IS NULL').get().count, 0);
  assert.equal(sqlite.prepare('SELECT deleted_reason FROM leads WHERE id = ?').get(leadId).deleted_reason, 'СЃРїР°Рј');
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) AS count FROM crm_notes WHERE lead_id = ?').get(leadId).count,
    1,
    'trashing must keep related records for a lossless restore',
  );

  const restored = await callTrash(trash, d1, { action: 'restore', ids: [leadId] });
  assert.equal(restored.payload.restored, 1);
  const row = sqlite.prepare('SELECT deleted_at, deleted_reason FROM leads WHERE id = ?').get(leadId);
  assert.equal(row.deleted_at, null);
  assert.equal(row.deleted_reason, '');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM crm_notes WHERE lead_id = ?').get(leadId).count, 1);
});

test('purging clears the lead with every related record and only from the trash', async () => {
  const trash = await bundleTypeScript('functions/api/admin/lead-trash.ts');
  const { sqlite, d1 } = createLeadDatabase();
  const leadId = Number(
    sqlite.prepare("INSERT INTO leads (event_id, name, email) VALUES ('p-1', 'Junk', 'junk@example.com')").run().lastInsertRowid,
  );
  const activeId = Number(
    sqlite.prepare("INSERT INTO leads (event_id, name, email) VALUES ('p-2', 'Active', 'active@example.com')").run().lastInsertRowid,
  );
  sqlite.prepare("INSERT INTO crm_notes (lead_id, body, action_id) VALUES (?, 'note', 'n-1')").run(leadId);
  sqlite.prepare("INSERT INTO crm_tasks (lead_id, title, action_id) VALUES (?, 'task', 't-1')").run(leadId);
  sqlite.prepare("INSERT INTO lead_activity (lead_id, type, \"from\", \"to\", note) VALUES (?, 'x', '', '', '')").run(leadId);
  sqlite.prepare("INSERT INTO lead_ingestions (event_id, claim_token, lead_id, submission_kind) VALUES ('p-1', 'claim-1', ?, 'new')").run(leadId);

  // РђРєС‚РёРІРЅСѓСЋ Р·Р°СЏРІРєСѓ РѕРєРѕРЅС‡Р°С‚РµР»СЊРЅРѕ СѓРґР°Р»РёС‚СЊ РЅРµР»СЊР·СЏ вЂ” СЃРЅР°С‡Р°Р»Р° РєРѕСЂР·РёРЅР°.
  const refused = await callTrash(trash, d1, { action: 'purge', ids: [activeId] });
  assert.equal(refused.payload.purged, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM leads WHERE id = ?').get(activeId).count, 1);

  await callTrash(trash, d1, { action: 'delete', ids: [leadId] });
  const purged = await callTrash(trash, d1, { action: 'purge', ids: [leadId] });
  assert.equal(purged.payload.purged, 1);

  for (const table of ['crm_notes', 'crm_tasks', 'lead_activity', 'lead_ingestions']) {
    assert.equal(
      sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE lead_id = ?`).get(leadId).count,
      0,
      `${table} must not keep orphans after a purge`,
    );
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM leads').get().count, 1, 'the active lead survives');
});

test('queued quality events are cancelled when a lead goes to the trash, delivered ones are kept', async () => {
  const trash = await bundleTypeScript('functions/api/admin/lead-trash.ts');
  const { sqlite, d1 } = createLeadDatabase();
  const leadId = Number(
    sqlite.prepare("INSERT INTO leads (event_id, name, quality) VALUES ('q-1', 'Lead', 'target')").run().lastInsertRowid,
  );
  const insertOutbox = sqlite.prepare(
    "INSERT INTO meta_outbox (id, event_name, event_id, payload_json, status) VALUES (?, 'QualifiedLead', ?, '{}', ?)",
  );
  insertOutbox.run('lq:target:q-1', 'lq:target:q-1', 'pending');
  insertOutbox.run('lq:nontarget:q-1', 'lq:nontarget:q-1', 'sent');

  const moved = await callTrash(trash, d1, { action: 'delete', ids: [leadId] });
  assert.equal(moved.payload.cancelled_events, 1, 'only the not-yet-delivered event is cancelled');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM meta_outbox WHERE status = 'pending'").get().count, 0);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS count FROM meta_outbox WHERE status = 'sent'").get().count,
    1,
    'an event already confirmed by Meta must stay in history',
  );
});

test('without migration 0020 the trash reports it clearly and lead intake keeps working', async () => {
  const trash = await bundleTypeScript('functions/api/admin/lead-trash.ts');
  const { storeLead } = await importTypeScript('functions/_lib/leads.ts', { fresh: true });
  const { sqlite, d1 } = createLeadDatabase({ softDelete: false });

  const refused = await callTrash(trash, d1, { action: 'delete', ids: [1] });
  assert.equal(refused.status, 503);
  assert.equal(refused.payload.code, 'LEAD_TRASH_MIGRATION_REQUIRED');
  assert.match(refused.payload.migration, /0020/);

  // РџСЂРёС‘Рј Р·Р°СЏРІРѕРє РЅРµ РґРѕР»Р¶РµРЅ Р·Р°РІРёСЃРµС‚СЊ РѕС‚ РєРѕСЂР·РёРЅС‹: РєРѕРґ РјРѕР¶РµС‚ СѓРµС…Р°С‚СЊ СЂР°РЅСЊС€Рµ РјРёРіСЂР°С†РёРё.
  const stored = await storeLead({ DB: d1 }, { event_id: 'no-0020', name: 'Lead', email: 'a@example.com' });
  assert.equal(stored.durable, true);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM leads').get().count, 1);
});
