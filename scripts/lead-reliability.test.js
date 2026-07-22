import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { transform } from 'esbuild';

async function importTypeScript(path) {
  const source = readFileSync(path, 'utf8');
  const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
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

function createLeadDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const migration of [
    'migrations/0008_leads_and_page_stats.sql',
    'migrations/0009_leads_dedupe_quality.sql',
    'migrations/0010_leads_meta_quality.sql',
    'migrations/0011_leads_utm.sql',
    'migrations/0012_admin_control_center.sql',
    'migrations/0014_crm_workspace.sql',
    'migrations/0015_lead_consent_receipts.sql',
    'migrations/0017_crm_correctness.sql',
    'migrations/0019_lead_ingestion_idempotency.sql',
  ]) {
    sqlite.exec(readFileSync(migration, 'utf8'));
  }
  return { sqlite, d1: new D1DatabaseAdapter(sqlite) };
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
  const { qualityEventId, qualityEventIds } = await importTypeScript('functions/_lib/admin-lead-quality-status.ts');
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
