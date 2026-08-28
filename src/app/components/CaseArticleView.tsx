// Стили .case-article-* живут рядом с компонентом, чтобы их 46 КБ не висели
// в общей блокирующей таблице стилей всего сайта. Тот же файл импортирует
// pages/CasesPage.tsx — там лежат правила витрины .cases-*.
import '../../styles/cases-finder.css';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  ListTree,
  MessageCircle,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import { lazy, Suspense, useCallback, type MouseEvent, type MutableRefObject, type Ref } from 'react';
import type { Article } from './hooks/useArticlesApi';
import Navbar from './Navbar';
import PageNav from './PageNav';
import {
  getCaseCover,
  getCaseCoverAlt,
  getCaseDisplayTitle,
  getMergedCaseData,
} from '../data/caseCatalog';
import { formatReadTime } from '../utils/articleMeta';
import { useManagedTitleFit } from '../utils/contentTypography';
import { smartTitleBreaks } from '../utils/smartTitle';
import DeferredImage from './DeferredImage';

const Footer = lazy(() => import('./Footer'));

// Колонка заголовка кейса узкая — рядом обложка, поэтому потолок здесь три
// строки и на десктопе, и на телефоне. Четвёртая строка недопустима.
const CASE_TITLE_LINES = { titleMaxLinesDesktop: 3, titleMaxLinesMobile: 3 };

type TocItem = { id: string; text: string };

interface CaseArticleViewProps {
  article: Article;
  seoDescription: string;
  articleHtml: string;
  toc: TocItem[];
  relatedArticles: Article[];
  listHref: string;
  relatedSearch: string;
  // Ref, а не RefObject: так подходит и объект из useRef, и функция-ссылка.
  contentRef: Ref<HTMLDivElement>;
  articleTitleRef: MutableRefObject<HTMLHeadingElement | null>;
  onBackToCases: () => void;
  onContact: () => void;
  onRelated: (slug: string) => void;
}

function SourceChip({ source }: { source: string }) {
  const label = source.toLowerCase() === 'meta'
    ? 'Meta Ads'
    : source.toLowerCase() === 'google'
      ? 'Google Ads'
      : source;

  return <span className={`case-article-chip is-${source.toLowerCase()}`}>{label}</span>;
}

function handleInternalLink(event: MouseEvent<HTMLAnchorElement>, action: () => void): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  action();
}

function getProofIcon(value: string, label: string) {
  const token = `${value} ${label}`.toLocaleLowerCase('ru');
  if (/год|месяц|недел|дн|срок|работ/.test(token)) return CalendarDays;
  if (/roi|romi|roas|окупаем|рост/.test(token)) return TrendingUp;
  if (/бюджет|cpl|cac|стоимост|расход|spend/.test(token)) return WalletCards;
  if (/покуп|заказ|корзин|оплат/.test(token)) return ShoppingCart;
  if (/лид|регистрац|проект|клиент|пользоват/.test(token)) return Users;
  return Target;
}

export default function CaseArticleView({
  article,
  seoDescription,
  articleHtml,
  toc,
  relatedArticles,
  listHref,
  relatedSearch,
  contentRef,
  articleTitleRef,
  onBackToCases,
  onContact,
  onRelated,
}: CaseArticleViewProps) {
  const reduceMotion = useReducedMotion();
  const titleFit = useManagedTitleFit<HTMLHeadingElement>(CASE_TITLE_LINES, { minFontSize: 19 });
  const setTitleRef = useCallback((node: HTMLHeadingElement | null) => {
    articleTitleRef.current = node;
    titleFit(node);
  }, [articleTitleRef, titleFit]);
  const caseData = getMergedCaseData(article);
  const cover = getCaseCover(article);
  const displayTitle = getCaseDisplayTitle(article.title);
  const proofItems = [
    ...(caseData.metrics || []).slice(0, 3).map((metric) => ({
      value: metric.value,
      label: metric.label,
    })),
  ];

  return (
    <>
      <Navbar variant="content" />
      <main data-blog-ui="true" className="case-article-page marketing-typography min-h-screen bg-background">
        <header className="case-article-hero">
          <div className="case-article-container">
            <PageNav
              crumbs={[
                { label: 'Главная', to: '/' },
                { label: 'Кейсы', to: listHref },
                { label: displayTitle },
              ]}
              backFallback={listHref}
              className="mb-7"
            />

            <div className="case-article-hero-grid">
              <motion.div
                className="case-article-lead"
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={reduceMotion ? undefined : { duration: 0.4 }}
              >
                <div className="case-article-meta">
                  <span className="case-article-category">Кейс</span>
                  <span><Clock3 aria-hidden="true" /> {formatReadTime(article.readTime)}</span>
                  <span><CalendarDays aria-hidden="true" /> {article.date}</span>
                </div>
                <h1 ref={setTitleRef} tabIndex={-1}>{smartTitleBreaks(displayTitle)}</h1>
                <p>{seoDescription}</p>
                <div className="case-article-chips" aria-label="Каналы и тематика">
                  {(caseData.sources || []).map((source) => <SourceChip key={source} source={source} />)}
                  {caseData.niche ? <span className="case-article-chip">{caseData.niche}</span> : null}
                </div>
              </motion.div>

              <motion.figure
                className="case-article-cover"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
                animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
                transition={reduceMotion ? undefined : { duration: 0.45, delay: 0.08 }}
              >
                <img
                  src={cover}
                  alt={getCaseCoverAlt(article)}
                  loading="eager"
                  decoding="async"
                  fetchpriority="high"
                />
              </motion.figure>

              <aside className="case-article-toc-desktop" aria-label="Оглавление">
                <h2>В этой статье</h2>
                {toc.length ? (
                  <ol>
                    {toc.map((item) => (
                      <li key={item.id}>
                        <a href={`#${item.id}`}>{item.text}</a>
                      </li>
                    ))}
                  </ol>
                ) : <p>Задача, решение, цифры и выводы.</p>}
                <button type="button" onClick={onContact}>
                  <MessageCircle aria-hidden="true" /> Обсудить похожий проект
                </button>
              </aside>
            </div>

            {proofItems.length ? (
              <div className={`case-article-proof count-${Math.min(proofItems.length, 3)}`} aria-label="Ключевые показатели кейса">
                {proofItems.map((item) => {
                  const Icon = getProofIcon(item.value, item.label);
                  return (
                    <div key={`${item.value}-${item.label}`}>
                      <span className="case-article-proof-icon"><Icon aria-hidden="true" /></span>
                      <p><strong>{item.value}</strong><span>{item.label}</span></p>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </header>

        <div className="case-article-container case-article-body-grid">
          <article className="case-article-main">
            {article.summary ? (
              <aside className="case-article-summary case-article-summary-desktop">
                <h2>Коротко</h2>
                <p>{article.summary}</p>
              </aside>
            ) : null}

            {article.summary ? (
              <details className="case-article-summary case-article-summary-mobile">
                <summary><span>Коротко</span><small>Открыть</small></summary>
                <p>{article.summary}</p>
              </details>
            ) : null}

            {toc.length >= 3 ? (
              <details className="case-article-toc-mobile">
                <summary><ListTree aria-hidden="true" /> Содержание <span aria-hidden="true">⌄</span></summary>
                <ol>
                  {toc.map((item, index) => (
                    <li key={item.id}><a href={`#${item.id}`}><span>{String(index + 1).padStart(2, '0')}</span>{item.text}</a></li>
                  ))}
                </ol>
              </details>
            ) : null}

            {Array.isArray(article.keyTakeaways) && article.keyTakeaways.length ? (
              <section className="case-article-takeaways case-article-takeaways-desktop">
                <h2>Ключевые тезисы</h2>
                <ul>
                  {article.keyTakeaways.map((point, index) => <li key={`${point}-${index}`}>{point}</li>)}
                </ul>
              </section>
            ) : null}

            {Array.isArray(article.keyTakeaways) && article.keyTakeaways.length ? (
              <details className="case-article-takeaways case-article-takeaways-mobile">
                <summary><span>Ключевые тезисы</span><small>{article.keyTakeaways.length} пункта</small></summary>
                <ul>
                  {article.keyTakeaways.map((point, index) => <li key={`${point}-${index}`}>{point}</li>)}
                </ul>
              </details>
            ) : null}

            <div
              ref={contentRef}
              className="case-article-content blog-article-content max-w-none"
              dangerouslySetInnerHTML={{ __html: articleHtml }}
            />

            {Array.isArray(article.faq) && article.faq.length ? (
              <section className="case-article-faq">
                <h2>Частые вопросы</h2>
                <div>
                  {article.faq.map((item, index) => (
                    <details key={`${item.question}-${index}`}>
                      <summary>{item.question}<span aria-hidden="true">+</span></summary>
                      <p>{item.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="case-article-cta">
              <span><Sparkles aria-hidden="true" /> Разбор по вашему проекту</span>
              <h2>Нужно применить это к вашему проекту?</h2>
              <p>Пришлите ссылку и короткие вводные. Я посмотрю, какие данные нужны и с какого шага разумнее начать.</p>
              <button type="button" onClick={onContact}>Обсудить проект <ArrowRight aria-hidden="true" /></button>
            </section>
          </article>

          {relatedArticles.length ? (
            <aside className="case-article-related">
              <div className="case-article-related-heading">
                <div><span>Дальше по теме</span><h2>Похожие кейсы</h2></div>
                <a href={listHref} onClick={(event) => handleInternalLink(event, onBackToCases)}>Все кейсы <ArrowRight aria-hidden="true" /></a>
              </div>
              <div className="case-article-related-grid">
                {relatedArticles.map((item) => {
                  const data = getMergedCaseData(item);
                  return (
                    <a
                      key={item.slug}
                      href={`/cases/${item.slug}${relatedSearch}`}
                      onClick={(event) => handleInternalLink(event, () => onRelated(item.slug))}
                    >
                      <DeferredImage src={getCaseCover(item)} alt="" loading="lazy" decoding="async" />
                      <span>{data.niche || 'Кейс'}</span>
                      <strong>{getCaseDisplayTitle(item.title)}</strong>
                      <small>{formatReadTime(item.readTime)} <ArrowRight aria-hidden="true" /></small>
                    </a>
                  );
                })}
              </div>
            </aside>
          ) : null}
        </div>
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      </main>
    </>
  );
}
