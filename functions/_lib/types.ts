export interface CaseMetric {
  value: string;
  label: string;
}

export interface CaseBeforeAfter {
  label: string;
  from: string;
  to: string;
  delta?: string;
}

// Структурированные поля кейса для страницы /cases (статья категории «Кейсы»).
export interface CaseData {
  niche?: string;
  sources?: string[];
  period?: string;
  budgetLabel?: string;
  budgetValue?: number;
  leadsValue?: number;
  roiValue?: number;
  headline?: string;
  headlineLabel?: string;
  trend?: string;
  metrics?: CaseMetric[];
  beforeAfter?: CaseBeforeAfter;
  chartPoints?: number[];
  featured?: boolean;
}

export interface Article {
  id: number;
  slug: string;
  title: string;
  category: string;
  readTime: string;
  date: string;
  description: string;
  content: string;
  image: string;
  seoTitle?: string;
  seoDescription?: string;
  publishedAt?: string;
  updatedAt?: string;
  tags?: string[];
  summary?: string;
  keyTakeaways?: string[];
  faq?: Array<{
    question: string;
    answer: string;
  }>;
  status?: 'draft' | 'published';
  caseData?: CaseData;
  downloads?: Array<{
    url: string;
    label: string;
  }>;
}

export interface Env {
  DB?: D1Database;
  BUCKET: R2Bucket;
  R2_PUBLIC_HOST?: string;
  USE_D1_ARTICLES?: string;
  JSONBIN_BIN_ID: string;
  JSONBIN_MASTER_KEY: string;
  JSONBIN_ACCESS_KEY?: string;
  JSONBIN_BACKUP_BIN_ID?: string;
  JSONBIN_BACKUP_MASTER_KEY?: string;
  JSONBIN_BACKUP_ACCESS_KEY?: string;
  ADMIN_PASSWORD: string;
  SITE_URL?: string;
  INDEXNOW_KEY?: string;
  INDEXNOW_ENDPOINT?: string;
  // Глобальная очистка кэша Cloudflare после сохранения статей (опционально):
  // без них чистится только кэш текущего дата-центра.
  CF_ZONE_ID?: string;
  CF_CACHE_PURGE_TOKEN?: string;
  // Meta Conversions API
  META_CAPI_ACCESS_TOKEN?: string;
  META_CAPI_TEST_CODE?: string;
  META_CAPI_API_VERSION?: string;
  META_CAPI_DIAGNOSTICS?: KVNamespace;
  META_CAPI_IDEMPOTENCY?: KVNamespace;
  META_CAPI_DEBUG_SECRET?: string;
  META_CAPI_DATA_PROCESSING_OPTIONS?: string;
  META_CAPI_DATA_PROCESSING_OPTIONS_COUNTRY?: string;
  META_CAPI_DATA_PROCESSING_OPTIONS_STATE?: string;
  META_CAPI_NONCE?: KVNamespace;
  TRACKING_HMAC_SECRET?: string;
  TRACKING_SIG_TTL_SEC?: string;
  TRACKING_SIGNATURE_MODE?: string;
  META_OUTBOX_MAX_ATTEMPTS?: string;
  // Pixel IDs
  VITE_META_PIXEL_ID?: string;
  VITE_TIKTOK_PIXEL_ID?: string;
  // Уведомления о заявках в Telegram (секреты Cloudflare Pages).
  // Если не заданы — заявка уходит на старый Google Apps Script (fallback).
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}
