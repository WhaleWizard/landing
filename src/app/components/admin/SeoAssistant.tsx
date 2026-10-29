import { useMemo } from 'react';
import { AlertTriangle, Check, CircleAlert, Sparkles } from 'lucide-react';
import { plural, withPlural } from '../../utils/plural';

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
  if (value < min) return { id, label, detail: `${measured} — коротко, лучше от ${min}`, level: 'warn' };
  if (value > max) return { id, label, detail: `${measured} — длинно, обрежется до ${max}`, level: 'warn' };
  return { id, label, detail: `${measured} — в норме`, level: 'ok' };
}

/** Путь внутри сайта или null, если ссылка ведёт наружу, на якорь, mailto: и т. п. */
function internalPath(href: string): string | null {
  const own = /^https?:\/\/(?:www\.)?whalewzrd\.com(\/.*)?$/i.exec(href);
  if (own) return own[1] || '/';
  // Одна косая черта в начале — свой адрес; две — чужой домен без схемы.
  return /^\/(?!\/)/.test(href) ? href : null;
}

/**
 * Ссылки на свои страницы: любой `href` с одной косой черты (кроме служебных
 * /api/ и /admin) и абсолютные адреса whalewzrd.com. Раньше считались только
 * /blog, /cases и несуществующий /services — ссылка на услугу (/meta-ads,
 * /google-ads, /consult), которую требует docs/SEO_STRATEGY.md, в счёт не
 * шла, и проверка советовала её убрать.
 */
export function countInternalLinks(content = ''): number {
  let count = 0;
  for (const match of String(content).matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const path = internalPath(match[1].trim());
    if (!path) continue;
    if (/^\/api\//i.test(path) || /^\/admin(?:[/?#]|$)/i.test(path)) continue;
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
  '/privacy',
  '/terms',
  '/data-deletion',
  '/blog',
  '/cases',
  '/glossary',
  '/faq',
  '/calculator',
  '/roi-calculator',
  '/unit-economics',
  '/client-report',
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

export function validateContentLinks(
  content = '',
  options?: { knownSlugs?: Set<string> | string[] },
): LinkValidationResult {
  const issues: LinkIssue[] = [];
  const slugsSet = options?.knownSlugs instanceof Set
    ? options.knownSlugs
    : new Set(options?.knownSlugs || []);
  let total = 0;
  let internal = 0;
  let external = 0;

  for (const match of String(content).matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const rawHref = match[1].trim();
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

    if (/^https?\/\//i.test(rawHref) || /^htps?:\/\//i.test(rawHref)) {
      issues.push({ href: rawHref, reason: 'Опечатка в схеме протокола', level: 'fail' });
      continue;
    }

    const path = internalPath(rawHref);
    if (path) {
      internal += 1;

      if (/^\/api\//i.test(path) || /^\/admin(?:[/?#]|$)/i.test(path)) {
        issues.push({ href: rawHref, reason: 'Ссылка ведёт на служебный или закрытый раздел', level: 'warn' });
        continue;
      }

      const [pathname] = path.split(/[?#]/);

      if (pathname.length > 1 && pathname.endsWith('/')) {
        issues.push({
          href: rawHref,
          reason: `Лишний завершающий слеш (канонический адрес: ${pathname.replace(/\/+$/, '')})`,
          level: 'warn',
        });
        continue;
      }

      if (pathname.includes('//')) {
        issues.push({ href: rawHref, reason: 'Двойная косая черта в пути', level: 'fail' });
        continue;
      }

      if (CANONICAL_STATIC_ROUTES.has(pathname)) {
        continue;
      }

      const articleMatch = /^\/(?:blog|cases)\/([a-z0-9-]+)$/i.exec(pathname);
      if (articleMatch) {
        const slug = articleMatch[1].toLowerCase();
        if (slugsSet.size > 0 && !slugsSet.has(slug)) {
          issues.push({
            href: rawHref,
            reason: `Статья или кейс «${slug}» не найдены (битая ссылка 404)`,
            level: 'fail',
          });
          continue;
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
      if (/^http:\/\//i.test(rawHref)) {
        issues.push({
          href: rawHref,
          reason: 'Незащищённый протокол http:// (рекомендуется https://)',
          level: 'warn',
        });
      } else if (!/^https:\/\//i.test(rawHref)) {
        issues.push({
          href: rawHref,
          reason: 'Некорректный адрес внешней ссылки',
          level: 'warn',
        });
      }
    }
  }

  return { total, internal, external, issues };
}

/**
 * Проверки перед публикацией. Раньше в редакторе был короткий список
 * «чего не хватает», но без чисел и без объяснения, почему это важно —
 * по нему нельзя было понять, что именно исправлять.
 */
export function runChecks(
  article: ArticleLike,
  options?: { knownSlugs?: Set<string> | string[] },
): CheckResult[] {
  const text = stripHtml(article.content || '');
  const words = countWords(text);
  const title = (article.seoTitle || article.title || '').trim();
  const description = (article.seoDescription || article.description || '').trim();
  const internalLinks = countInternalLinks(article.content);
  const linkStats = validateContentLinks(article.content, options);
  const headings = (String(article.content || '').match(/<h2/gi) || []).length;

  const checks: CheckResult[] = [
    rangeCheck('title', 'Заголовок для поиска', title.length, 30, 65, SYMBOLS, 'Не заполнен — в выдаче будет обрезанный слаг'),
    rangeCheck('description', 'Описание для поиска', description.length, 80, 160, SYMBOLS, 'Не заполнено — Google соберёт сниппет сам, и обычно неудачно'),
    {
      id: 'image',
      label: 'Обложка',
      detail: article.image?.trim() ? 'Есть' : 'Нет — в соцсетях и выдаче ссылка будет пустой',
      level: article.image?.trim() ? 'ok' : 'fail',
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
        ? (linkStats.total === 0 ? 'Ссылок нет' : `Все ${linkStats.total} ${plural(linkStats.total, ['ссылка', 'ссылки', 'ссылок'])} корректны`)
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
      detail: !article.slug?.trim()
        ? 'Пустой'
        : /^[a-z0-9-]+$/.test(article.slug)
          ? article.slug.length > 70 ? `${withPlural(article.slug.length, SYMBOLS)} — длинновато` : 'В норме'
          : 'Есть недопустимые символы',
      level: !article.slug?.trim()
        ? 'fail'
        : /^[a-z0-9-]+$/.test(article.slug) && article.slug.length <= 70 ? 'ok' : 'warn',
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
  knownArticles?: Array<{ slug?: string }>;
}) {
  const knownSlugs = useMemo(() => {
    if (!knownArticles) return undefined;
    return new Set(knownArticles.map((a) => (a.slug || '').trim().toLowerCase()).filter(Boolean));
  }, [knownArticles]);

  const checks = useMemo(() => runChecks(article, { knownSlugs }), [article, knownSlugs]);
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
