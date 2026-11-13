import { useMemo } from 'react';
import { AlertTriangle, Check, CircleAlert, Sparkles } from 'lucide-react';
import { plural, withPlural } from '../../utils/plural';
import { isCaseArticle } from '../../utils/articleCategory';
import { hasCustomCover } from '../../utils/articleCover';

/** Формы для счётных подписей: «1 символ / 2 символа / 5 символов». */
const SYMBOLS: [string, string, string] = ['символ', 'символа', 'символов'];
const WORDS: [string, string, string] = ['слово', 'слова', 'слов'];

interface CheckResult {
  id: string;
  label: string;
  detail: string;
  level: 'ok' | 'warn' | 'fail';
}

interface ArticleLike {
  title?: string;
  slug?: string;
  description?: string;
  summary?: string;
  content?: string;
  image?: string;
  seoTitle?: string;
  seoDescription?: string;
  tags?: string[];
  keyTakeaways?: string[];
  faq?: Array<{ question: string; answer: string }>;
}

interface LinkArticle {
  slug?: string;
  category?: string | null;
  status?: string;
  publishedAt?: string;
}

interface LinkCheckOptions {
  knownArticles?: readonly LinkArticle[];
  now?: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function articleLinks(content: string): string[] {
  // Template content is inert. Parsing the actual attributes also handles
  // empty hrefs, entity escapes and markup pasted from rich-text editors.
  const template = document.createElement('template');
  template.innerHTML = content;
  return Array.from(template.content.querySelectorAll('a[href]'), (link) => (link.getAttribute('href') ?? '').trim());
}

function stripHtml(html = ''): string {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text: string): number {
  const normalized = text.trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

function rangeCheck(
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  unit: [string, string, string],
  emptyText: string,
): CheckResult {
  if (value === 0) return { id, label, detail: emptyText, level: 'fail' };
  const measured = `${value} ${plural(value, unit)}`;
  if (value < min) return { id, label, detail: `${measured} — коротко, лучше от\u00a0${min}`, level: 'warn' };
  if (value > max) return { id, label, detail: `${measured} — длиннее ориентира\u00a0${max}, поисковик может сократить текст`, level: 'warn' };
  return { id, label, detail: `${measured} — в норме`, level: 'ok' };
}

/** Путь внутри сайта или null, если ссылка ведёт наружу, на якорь, mailto: и т. п. */
function internalPath(href: string): string | null {
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    const url = new URL(href);
    return ['www.whalewzrd.com', 'whalewzrd.com'].includes(url.host)
      ? url.pathname + url.search + url.hash
      : null;
  } catch {
    return null;
  }
}

const SERVICE_PATH = /^\/(?:api|admin)(?:[/?#]|$)/i;

/**
 * Ссылки на свои страницы: любой `href` с одной косой черты (кроме служебных
 * /api/ и /admin) и абсолютные адреса whalewzrd.com. Раньше считались только
 * /blog, /cases и несуществующий /services — ссылка на услугу (/meta-ads,
 * /google-ads, /consult), которую требует docs/SEO_STRATEGY.md, в счёт не
 * шла, и проверка советовала её убрать.
 */
export function countInternalLinks(content = ''): number {
  let count = 0;
  for (const href of articleLinks(content)) {
    const path = internalPath(href);
    if (!path || SERVICE_PATH.test(path)) continue;
    count += 1;
  }
  return count;
}

export const CANONICAL_STATIC_ROUTES = new Set([
  '/',
  '/meta-ads',
  '/meta-apps',
  '/google-ads',
  '/consult',
  '/about',
  '/privacy-policy',
  '/offer',
  '/cookie-policy',
  '/blog',
  '/cases',
  '/marketing-glossary',
  '/faq',
  '/calculator',
  '/roi-calculator',
]);

export interface LinkIssue {
  href: string;
  reason: string;
  level: 'fail' | 'warn';
}

export interface LinkValidationResult {
  total: number;
  internal: number;
  external: number;
  issues: LinkIssue[];
}

function isPublicArticle(article: LinkArticle, now: string): boolean {
  return article.status !== 'draft' && (!article.publishedAt || article.publishedAt <= now);
}

function articleSection(article: LinkArticle): 'cases' | 'blog' {
  return isCaseArticle(article) ? 'cases' : 'blog';
}

export function validateContentLinks(
  content = '',
  options?: LinkCheckOptions,
): LinkValidationResult {
  const issues: LinkIssue[] = [];
  const catalog = options?.knownArticles
    ? new Map(options.knownArticles.map((article) => [article.slug, article]))
    : undefined;
  const now = options?.now ?? new Date().toISOString();
  let total = 0;
  let internal = 0;
  let external = 0;

  for (const rawHref of articleLinks(content)) {
    if (!rawHref) {
      issues.push({ href: '""', reason: 'Пустая ссылка href', level: 'fail' });
      continue;
    }
    total += 1;

    if (rawHref.startsWith('#')) {
      if (rawHref === '#') {
        issues.push({ href: '#', reason: 'Пустой якорь без ID секции', level: 'warn' });
      }
      continue;
    }

    if (/^(?:mailto:|tel:)/i.test(rawHref)) {
      continue;
    }

    if (/^(?:https?\/\/|htps?:\/\/)/i.test(rawHref)) {
      issues.push({ href: rawHref, reason: 'Опечатка в схеме протокола', level: 'fail' });
      continue;
    }

    const path = internalPath(rawHref);
    if (path) {
      internal += 1;

      if (SERVICE_PATH.test(path)) {
        issues.push({ href: rawHref, reason: 'Ссылка ведёт на служебный или закрытый раздел', level: 'warn' });
        continue;
      }

      const [pathname] = path.split(/[?#]/);

      if (pathname.includes('//')) {
        issues.push({ href: rawHref, reason: 'Двойная косая черта в пути', level: 'fail' });
        continue;
      }

      const normalized = pathname.replace(/\/$/, '') || '/';
      if (CANONICAL_STATIC_ROUTES.has(normalized)) {
        if (pathname !== '/' && !pathname.endsWith('/')) {
          issues.push({ href: rawHref, reason: `Канонический адрес: ${normalized}/`, level: 'warn' });
        }
        continue;
      }

      const articleMatch = /^\/(blog|cases)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(normalized);
      if (articleMatch) {
        const [, section, slug] = articleMatch;
        const article = catalog?.get(slug);
        if (article && !isPublicArticle(article, now)) {
          issues.push({ href: rawHref, reason: 'Публикация пока недоступна читателям', level: 'fail' });
        } else if (catalog && !article) {
          const matches = options?.knownArticles?.filter((candidate) =>
            candidate.slug?.startsWith(`${slug}-`) && isPublicArticle(candidate, now) && articleSection(candidate) === section,
          );
          if (matches?.length === 1) {
            issues.push({ href: rawHref, reason: `Канонический адрес: /${section}/${matches[0].slug}`, level: 'warn' });
          } else {
            issues.push({ href: rawHref, reason: 'Публикация отсутствует в списке', level: 'fail' });
          }
        } else {
          const correctSection = article ? articleSection(article) : section;
          const canonical = `/${correctSection}/${slug}`;
          if (pathname !== canonical) {
            issues.push({ href: rawHref, reason: `Канонический адрес: ${canonical}`, level: 'warn' });
          }
        }
        continue;
      }

      issues.push({
        href: rawHref,
        reason: 'Несуществующий раздел сайта (битая ссылка 404)',
        level: 'fail',
      });
    } else {
      external += 1;
      if (!/^https?:\/\/[^/]/i.test(rawHref) || !isAbsoluteUrl(rawHref)) {
        issues.push({ href: rawHref, reason: 'Некорректный адрес внешней ссылки', level: 'fail' });
      } else if (/^http:\/\//i.test(rawHref)) {
        issues.push({
          href: rawHref,
          reason: 'Незащищённый протокол http:// (рекомендуется https://)',
          level: 'warn',
        });
      }
    }
  }

  return { total, internal, external, issues };
}

function isAbsoluteUrl(href: string): boolean {
  try {
    new URL(href);
    return true;
  } catch {
    return false;
  }
}

/**
 * Проверки перед публикацией. Раньше в редакторе был короткий список
 * «чего не хватает», но без чисел и без объяснения, почему это важно —
 * по нему нельзя было понять, что именно исправлять.
 */
export function runChecks(
  article: ArticleLike,
  options?: LinkCheckOptions,
): CheckResult[] {
  const text = stripHtml(article.content || '');
  const words = countWords(text);
  const title = (article.seoTitle || article.title || '').trim();
  const description = (article.seoDescription || article.description || '').trim();
  const internalLinks = countInternalLinks(article.content);
  const linkStats = validateContentLinks(article.content, options);
  const headings = (String(article.content || '').match(/<h2\b/gi) || []).length;
  const slug = (article.slug || '').trim();
  const validSlug = SLUG_PATTERN.test(slug) && slug.length <= 200;
  const customCover = hasCustomCover(article.image);

  const checks: CheckResult[] = [
    rangeCheck('title', 'Заголовок для поиска', title.length, 30, 65, SYMBOLS, 'Не заполнен — в выдаче будет обрезанный слаг'),
    rangeCheck('description', 'Описание для поиска', description.length, 80, 160, SYMBOLS, 'Не заполнено — Google соберёт сниппет сам, и обычно неудачно'),
    {
      id: 'image',
      label: 'Обложка',
      detail: customCover ? 'Есть' : 'Используется стандартная обложка сайта',
      level: customCover ? 'ok' : 'warn',
    },
    {
      id: 'words',
      label: 'Объём текста',
      detail: words === 0
        ? 'Пусто'
        : words < 300
          ? `${withPlural(words, WORDS)} — для поиска мало, нужно от 300`
          : withPlural(words, WORDS),
      level: words === 0 ? 'fail' : words < 300 ? 'warn' : 'ok',
    },
    {
      id: 'headings',
      label: 'Подзаголовки',
      detail: headings === 0
        ? 'Нет ни одного — сплошной текст плохо читается и хуже ранжируется'
        : `${headings} шт.`,
      level: headings === 0 ? 'warn' : 'ok',
    },
    {
      id: 'links',
      label: 'Ссылки на свои страницы',
      detail: internalLinks === 0
        ? 'Нет — читатель уходит, вес страницы никуда не передаётся'
        : `${internalLinks} шт.`,
      level: internalLinks === 0 ? 'warn' : 'ok',
    },
    {
      id: 'link-health',
      label: 'Целостность ссылок',
      detail: linkStats.issues.length === 0
        ? (linkStats.total === 0 ? 'Ссылок нет' : 'Замечаний к адресам в тексте нет')
        : linkStats.issues.slice(0, 2).map((i) => `${i.reason} (${i.href})`).join('; ') + (linkStats.issues.length > 2 ? ` и ещё ${linkStats.issues.length - 2}` : ''),
      level: linkStats.issues.some((i) => i.level === 'fail')
        ? 'fail'
        : linkStats.issues.length > 0
          ? 'warn'
          : 'ok',
    },
    {
      id: 'slug',
      label: 'Адрес страницы',
      detail: !slug
        ? 'Пустой'
        : !SLUG_PATTERN.test(slug) ? 'Используйте строчные буквы a–z, цифры и одиночные дефисы между словами'
        : slug.length > 200 ? 'Адрес превышает 200 символов'
        : slug.length > 70 ? `${withPlural(slug.length, SYMBOLS)} — длинновато` : 'В норме',
      level: !validSlug ? 'fail' : slug.length <= 70 ? 'ok' : 'warn',
    },
    {
      id: 'faq',
      label: 'Блок вопросов и ответов',
      detail: (article.faq || []).length > 0
        ? `${withPlural((article.faq || []).length, ['вопрос', 'вопроса', 'вопросов'])} — ${plural((article.faq || []).length, ['попадёт', 'попадут', 'попадут'])} в разметку`
        : 'Нет — теряется шанс на расширенный сниппет',
      level: (article.faq || []).length > 0 ? 'ok' : 'warn',
    },
  ];

  return checks;
}

export default function SeoAssistant({
  article,
  knownArticles,
}: {
  article: ArticleLike;
  knownArticles?: readonly LinkArticle[];
}) {
  const checks = useMemo(() => runChecks(article, { knownArticles }), [article, knownArticles]);
  const failed = checks.filter((check) => check.level === 'fail').length;
  const warned = checks.filter((check) => check.level === 'warn').length;
  const passed = checks.length - failed - warned;
  const score = Math.round((passed / checks.length) * 100);

  const verdict = failed > 0
    ? 'Публиковать рано — есть критичные пропуски'
    : warned > 0
      ? 'Можно публиковать, но лучше доработать'
      : 'Всё готово к публикации';

  return (
    <section className={`seo-assistant ${failed > 0 ? 'is-fail' : warned > 0 ? 'is-warn' : 'is-ok'}`} aria-label="Проверка перед публикацией">
      <header className="seo-assistant__head">
        <span className="seo-assistant__score" aria-hidden="true">{score}</span>
        <div>
          <p className="seo-assistant__title"><Sparkles aria-hidden="true" /> Проверка перед публикацией</p>
          <p className="seo-assistant__verdict">{verdict}</p>
        </div>
      </header>
      <ul className="seo-assistant__list">
        {checks.map((check) => (
          <li key={check.id} className={`is-${check.level}`}>
            <span className="seo-assistant__icon" aria-hidden="true">
              {check.level === 'ok' ? <Check /> : check.level === 'warn' ? <CircleAlert /> : <AlertTriangle />}
            </span>
            <span className="seo-assistant__label">{check.label}</span>
            <span className="seo-assistant__detail">{check.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
