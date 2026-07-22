export function isCaseArticle(article: { category?: string | null }): boolean {
  return String(article.category || '').trim().toLocaleLowerCase('ru-RU') === 'кейсы';
}
