/*
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не править руками.
 * Источник: файлы migrations/*.sql
 * Пересборка: node scripts/build-migration-map.js
 *
 * Какая миграция создаёт какую таблицу. Нужна для честного ответа админки
 * «примените миграцию N», когда таблицы в D1 ещё нет.
 */

export const MIGRATION_BY_TABLE: Readonly<Record<string, string>> = {
  ad_spend: '0023_ad_spend.sql',
  admin_alerts: '0028_admin_alerts.sql',
  admin_goals: '0024_admin_goals.sql',
  article_versions: '0006_articles_status_and_versions.sql',
  articles: '0001_create_articles.sql',
  client_access: '0032_clients.sql',
  client_months: '0032_clients.sql',
  client_notes: '0032_clients.sql',
  clients: '0032_clients.sql',
  crm_lead_tags: '0014_crm_workspace.sql',
  crm_notes: '0014_crm_workspace.sql',
  crm_tags: '0014_crm_workspace.sql',
  crm_tasks: '0014_crm_workspace.sql',
  crm_templates: '0025_crm_speed.sql',
  finance_expenses: '0033_finance.sql',
  finance_settings: '0033_finance.sql',
  invoices: '0033_finance.sql',
  lead_activity: '0012_admin_control_center.sql',
  lead_ingestions: '0019_lead_ingestion_idempotency.sql',
  leads: '0008_leads_and_page_stats.sql',
  media_alt: '0031_media_alt.sql',
  meta_capi_diagnostics: '0002_meta_capi_diagnostics.sql',
  meta_outbox: '0005_meta_outbox.sql',
  page_lock_events: '0034_page_locks.sql',
  page_lock_subscribers: '0034_page_locks.sql',
  page_locks: '0034_page_locks.sql',
  page_stats_daily: '0008_leads_and_page_stats.sql',
  pagespeed_history: '0030_pagespeed_history.sql',
  planner_template: '0029_planner_template.sql',
  planner_weeks: '0021_planner.sql',
  site_section_versions: '0013_site_sections.sql',
  site_sections: '0013_site_sections.sql',
  time_entries: '0033_finance.sql',
  tracking_request_nonces: '0018_tracking_request_nonces.sql',
  tracking_signature_daily: '0018_tracking_request_nonces.sql',
  visitor_hashes_daily: '0008_leads_and_page_stats.sql',
  web_vitals_daily: '0027_web_vitals.sql',
};
