import { createArticlePageHandler, headFromGet } from '../_lib/article-page';

export const onRequestGet = createArticlePageHandler('/cases');
// HEAD = GET без тела: иначе Cloudflare Pages отдаёт статику, и мониторинги
// видят 308 на адрес со слешем вместо настоящего ответа кейса.
export const onRequestHead = headFromGet(onRequestGet);
