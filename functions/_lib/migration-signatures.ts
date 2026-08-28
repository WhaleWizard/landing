/*
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
  {
    file: '0001_create_articles.sql',
    tables: ['articles'],
    columns: {},
    indexes: ['idx_articles_updated_at', 'idx_articles_date'],
    triggers: [],
  },
  {
    file: '0002_meta_capi_diagnostics.sql',
    tables: ['meta_capi_diagnostics'],
    columns: {},
    indexes: ['idx_meta_capi_diagnostics_created_at', 'idx_meta_capi_diagnostics_event', 'idx_meta_capi_diagnostics_status'],
    triggers: [],
  },
  {
    file: '0003_meta_capi_diagnostics_quality.sql',
    tables: [],
    columns: {
      meta_capi_diagnostics: ['form_id', 'form_variant', 'contact_method', 'lead_source_page', 'match_quality_score'],
    },
    indexes: ['idx_meta_capi_diagnostics_form_created', 'idx_meta_capi_diagnostics_page_created', 'idx_meta_capi_diagnostics_quality'],
    triggers: [],
  },
  {
    file: '0004_meta_capi_diagnostics_enrichment.sql',
    tables: [],
    columns: {
      meta_capi_diagnostics: ['event_source_url', 'page_path_normalized', 'lead_value', 'lead_currency', 'score_identity', 'score_attribution', 'score_consent', 'score_context'],
    },
    indexes: ['idx_meta_capi_diag_norm_path_created', 'idx_meta_capi_diag_value_created', 'idx_meta_capi_diag_event_source_created'],
    triggers: [],
  },
  {
    file: '0005_meta_outbox.sql',
    tables: ['meta_outbox'],
    columns: {},
    indexes: ['idx_meta_outbox_status_next_retry', 'idx_meta_outbox_event'],
    triggers: [],
  },
  {
    file: '0006_articles_status_and_versions.sql',
    tables: ['article_versions'],
    columns: {
      articles: ['status'],
    },
    indexes: ['idx_articles_status_published_at', 'idx_article_versions_slug_created_at'],
    triggers: [],
  },
  {
    file: '0007_articles_case_data.sql',
    tables: [],
    columns: {
      articles: ['case_data_json'],
    },
    indexes: [],
    triggers: [],
  },
  {
    file: '0008_leads_and_page_stats.sql',
    tables: ['leads', 'page_stats_daily', 'visitor_hashes_daily'],
    columns: {},
    indexes: ['idx_leads_status_created', 'idx_leads_created', 'idx_visitor_hashes_day'],
    triggers: [],
  },
  {
    file: '0009_leads_dedupe_quality.sql',
    tables: [],
    columns: {
      leads: ['submissions_count', 'last_submitted_at', 'quality'],
    },
    indexes: [],
    triggers: [],
  },
  {
    file: '0010_leads_meta_quality.sql',
    tables: [],
    columns: {
      leads: ['fbp', 'fbc', 'event_source_url', 'external_id', 'marketing_consent'],
    },
    indexes: [],
    triggers: [],
  },
  {
    file: '0011_leads_utm.sql',
    tables: [],
    columns: {
      leads: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'],
    },
    indexes: [],
    triggers: [],
  },
  {
    file: '0012_admin_control_center.sql',
    tables: ['lead_activity'],
    columns: {
      leads: ['pipeline_stage', 'next_action_at', 'loss_reason', 'notes', 'deal_value', 'deal_currency'],
    },
    indexes: ['idx_leads_pipeline_stage_next_action', 'idx_leads_next_action', 'idx_lead_activity_lead_created'],
    triggers: [],
  },
  {
    file: '0013_site_sections.sql',
    tables: ['site_sections', 'site_section_versions'],
    columns: {},
    indexes: ['idx_site_sections_status_updated', 'idx_site_section_versions_key_created'],
    triggers: [],
  },
  {
    file: '0014_crm_workspace.sql',
    tables: ['crm_notes', 'crm_tasks', 'crm_tags', 'crm_lead_tags'],
    columns: {
      leads: ['priority', 'lead_score', 'next_action_text', 'pipeline_changed_at', 'last_contacted_at', 'closed_at', 'crm_revision'],
      lead_activity: ['actor', 'entity_type', 'entity_id', 'action_id', 'metadata_json'],
    },
    indexes: ['idx_leads_crm_priority_score', 'idx_leads_crm_pipeline_updated', 'idx_lead_activity_action', 'idx_lead_activity_entity', 'idx_crm_notes_lead_pinned_created', 'idx_crm_tasks_status_due', 'idx_crm_tasks_lead_status', 'idx_crm_lead_tags_tag_lead'],
    triggers: [],
  },
  {
    file: '0015_lead_consent_receipts.sql',
    tables: [],
    columns: {
      leads: ['consent_version', 'consent_source', 'consent_region', 'consent_timestamp', 'consent_recorded_at'],
    },
    indexes: ['idx_leads_consent_eligibility'],
    triggers: [],
  },
  {
    file: '0016_meta_diagnostics_retention.sql',
    tables: [],
    columns: {},
    indexes: [],
    triggers: ['trg_meta_capi_diagnostics_retention'],
  },
  {
    file: '0017_crm_correctness.sql',
    tables: [],
    columns: {
      leads: ['crm_action_id', 'quality_revision', 'quality_updated_at', 'quality_action_id', 'quality_processing'],
      crm_notes: ['revision', 'action_id'],
      crm_tasks: ['revision', 'action_id'],
    },
    indexes: ['idx_leads_quality_revision', 'idx_crm_notes_action_id', 'idx_crm_tasks_action_id', 'idx_crm_notes_lead_revision', 'idx_crm_tasks_lead_revision'],
    triggers: [],
  },
  {
    file: '0018_tracking_request_nonces.sql',
    tables: ['tracking_request_nonces', 'tracking_signature_daily'],
    columns: {},
    indexes: ['idx_tracking_request_nonces_expires', 'idx_tracking_signature_daily_day'],
    triggers: ['trg_tracking_request_nonces_retention', 'trg_tracking_signature_daily_retention', 'trg_tracking_signature_daily_retention_update'],
  },
  {
    file: '0019_lead_ingestion_idempotency.sql',
    tables: ['lead_ingestions'],
    columns: {},
    indexes: ['idx_lead_ingestions_lead_received'],
    triggers: [],
  },
  {
    file: '0020_leads_soft_delete.sql',
    tables: [],
    columns: {
      leads: ['deleted_at', 'deleted_reason'],
    },
    indexes: ['idx_leads_active_recent', 'idx_leads_deleted_at'],
    triggers: [],
  },
  {
    file: '0021_planner.sql',
    tables: ['planner_weeks'],
    columns: {},
    indexes: ['idx_planner_weeks_updated'],
    triggers: [],
  },
  {
    file: '0022_leads_form_source.sql',
    tables: [],
    columns: {
      leads: ['form_id', 'form_variant'],
    },
    indexes: ['idx_leads_form_created'],
    triggers: [],
  },
  {
    file: '0023_ad_spend.sql',
    tables: ['ad_spend'],
    columns: {},
    indexes: ['idx_ad_spend_slot', 'idx_ad_spend_day'],
    triggers: [],
  },
  {
    file: '0024_admin_goals.sql',
    tables: ['admin_goals'],
    columns: {},
    indexes: ['idx_admin_goals_period'],
    triggers: [],
  },
  {
    file: '0025_crm_speed.sql',
    tables: ['crm_templates'],
    columns: {
      leads: ['first_response_at'],
    },
    indexes: ['idx_leads_first_response', 'idx_crm_templates_sort'],
    triggers: [],
  },
  {
    file: '0026_leads_geo_device.sql',
    tables: [],
    columns: {
      leads: ['country', 'device'],
    },
    indexes: ['idx_leads_country_created', 'idx_leads_device_created'],
    triggers: [],
  },
  {
    file: '0027_web_vitals.sql',
    tables: ['web_vitals_daily'],
    columns: {},
    indexes: ['idx_web_vitals_day'],
    triggers: [],
  },
  {
    file: '0028_admin_alerts.sql',
    tables: ['admin_alerts'],
    columns: {},
    indexes: ['idx_admin_alerts_open', 'idx_admin_alerts_notify'],
    triggers: [],
  },
  {
    file: '0029_planner_template.sql',
    tables: ['planner_template'],
    columns: {},
    indexes: [],
    triggers: [],
  },
  {
    file: '0030_pagespeed_history.sql',
    tables: ['pagespeed_history'],
    columns: {},
    indexes: ['idx_pagespeed_history_day'],
    triggers: [],
  },
  {
    file: '0031_media_alt.sql',
    tables: ['media_alt'],
    columns: {},
    indexes: [],
    triggers: [],
  },
  {
    file: '0032_clients.sql',
    tables: ['clients', 'client_months', 'client_access', 'client_notes'],
    columns: {},
    indexes: ['idx_clients_status', 'idx_clients_lead', 'idx_client_months_month', 'idx_client_access_client', 'idx_client_notes_client'],
    triggers: [],
  },
  {
    file: '0033_finance.sql',
    tables: ['invoices', 'finance_expenses', 'time_entries', 'finance_settings'],
    columns: {},
    indexes: ['idx_invoices_status', 'idx_invoices_client', 'idx_finance_expenses_day', 'idx_time_entries_day'],
    triggers: [],
  },
  {
    file: '0034_page_locks.sql',
    tables: ['page_locks', 'page_lock_events', 'page_lock_subscribers'],
    columns: {},
    indexes: ['idx_page_locks_locked', 'idx_page_lock_events_created', 'idx_page_lock_subscribers_created'],
    triggers: [],
  },
  {
    file: '0035_page_lock_contacts.sql',
    tables: [],
    columns: {
      page_lock_subscribers: ['phone', 'telegram', 'marketing_consent', 'consent_at', 'consent_region'],
    },
    indexes: ['idx_page_lock_subscribers_email', 'idx_page_lock_subscribers_phone', 'idx_page_lock_subscribers_telegram'],
    triggers: [],
  },
  {
    file: '0036_admin_2fa.sql',
    tables: ['admin_2fa'],
    columns: {},
    indexes: [],
    triggers: [],
  },
  {
    file: '0037_form_guard_daily.sql',
    tables: ['form_guard_daily'],
    columns: {},
    indexes: [],
    triggers: [],
  },
  {
    file: '0038_meta_outbox_cleanup_index.sql',
    tables: [],
    columns: {},
    indexes: ['idx_meta_outbox_status_updated'],
    triggers: [],
  },
  {
    file: '0039_leads_dedupe_index.sql',
    tables: [],
    columns: {
      leads: ['dedupe_email', 'dedupe_phone', 'dedupe_telegram'],
    },
    indexes: ['idx_leads_dedupe_email', 'idx_leads_dedupe_phone', 'idx_leads_dedupe_telegram'],
    triggers: [],
  },
  {
    file: '0040_versions_retention.sql',
    tables: [],
    columns: {},
    indexes: ['idx_article_versions_slug_id', 'idx_site_section_versions_key_id'],
    triggers: ['trg_article_versions_retention', 'trg_site_section_versions_retention'],
  },
];
