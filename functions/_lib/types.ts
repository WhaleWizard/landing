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
}

export interface Env {
  JSONBIN_BIN_ID: string;
  JSONBIN_MASTER_KEY: string;
  JSONBIN_ACCESS_KEY?: string;
  ADMIN_PASSWORD: string;
  SITE_URL?: string;
}
