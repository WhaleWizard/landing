import { memoizedImport } from './memoizedImport';

// Разметка кейса живёт отдельно от BlogPage (тянет cases-finder.css); на
// странице кейса её ждут вместе с маршрутом, чтобы первый рендер не упёрся
// в заглушку Suspense поверх готовой разметки.
export const loadCaseArticleView = memoizedImport(() => import('../components/CaseArticleView'));
