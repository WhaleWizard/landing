export const FAQ_CATEGORIES = ['Старт', 'Бюджет', 'Аналитика', 'Приложения', 'Результат', 'Процесс', 'Консультация'] as const;
export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  details: string[];
  category: FaqCategory;
  relatedTermIds?: string[];
  sourceIds?: string[];
  reviewedAt?: string;
}
