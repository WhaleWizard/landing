import { createArticlePageHandler, headFromGet } from '../_lib/article-page';

export const onRequestGet = createArticlePageHandler('/blog');
// HEAD = GET без тела: иначе Cloudflare Pages отдаёт статику, и мониторинги
// видят 308 на адрес со слешем вместо настоящего ответа статьи.
export const onRequestHead = headFromGet(onRequestGet);
