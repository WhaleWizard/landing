export interface Article {
  id: number;
  slug: string;
  sortOrder?: number;
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
  // Meta Conversions API
  META_CAPI_ACCESS_TOKEN?: string;
  META_CAPI_TEST_CODE?: string;
  // Pixel IDs
  VITE_META_PIXEL_ID?: string;
  VITE_TIKTOK_PIXEL_ID?: string;
}
