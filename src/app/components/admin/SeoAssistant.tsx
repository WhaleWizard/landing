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

/**
 * Проверки перед публикацией. Раньше в редакторе был короткий список
 * «чего не хватает», но без чисел и без объяснения, почему это важно —
 * по нему нельзя было понять, что именно исправлять.
 */
function runChecks(article: ArticleLike): CheckResult[] {
  const text = stripHtml(article.content || '');
  const words = countWords(text);
  const title = (article.seoTitle || article.title || '').trim();
  const description = (article.seoDescription || article.description || '').trim();
  const internalLinks = (String(article.content || '').match(/href="\/(blog|cases|services)/g) || []).length;
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

export default function SeoAssistant({ article }: { article: ArticleLike }) {
  const checks = useMemo(() => runChecks(article), [article]);
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
