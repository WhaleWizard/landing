import { typographText } from '../utils/typography';

/** Цветная часть заголовка по умолчанию — тот же градиент, что был в разметке разделов. */
export const ACCENT_TITLE_GRADIENT = 'bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent';

/**
 * Короткое слово в конце обычной части: «Реклама, аналитика и» + «регулярная
 * оптимизация». Оно уезжает на строку вместе с цветной частью, иначе «и»
 * повисло бы в конце первой строки.
 */
const TRAILING_SHORT_WORD = /^([\s\S]*?)[\s ]+(а|в|во|да|до|за|и|из|к|ко|на|но|о|об|от|по|с|со|у|без|для|над|под|при|про|или|перед|через|после|между|около)$/iu;

/**
 * Заголовок раздела «обычная часть + цветная часть» с переносом по смыслу.
 *
 * Помещается в одну строку — одна строка. Не помещается — цветная часть
 * уходит на следующую строку целиком («Что клиенты ценят / в работе со
 * мной»), а не по словам («…в работе со / мной»). Сама она переносится
 * внутри себя, только если не помещается и в отдельную строку. Короткие
 * предлоги и союзы привязаны к следующему слову (`typographText`).
 */
export default function AccentTitle({
  prefix,
  accent,
  accentClassName = ACCENT_TITLE_GRADIENT,
}: {
  prefix?: string | null;
  accent?: string | null;
  accentClassName?: string;
}) {
  const fullPrefix = typographText(String(prefix ?? '').trim());
  const accentText = typographText(String(accent ?? '').trim());
  if (!accentText) return <>{fullPrefix}</>;
  const match = TRAILING_SHORT_WORD.exec(fullPrefix);
  const head = match ? match[1] : fullPrefix;
  const tail = match ? match[2] : '';
  return (
    <>
      {head}
      {head ? ' ' : null}
      <span className="ww-title-accent-group">
        {tail ? `${tail} ` : null}
        <span className={accentClassName}>{accentText}</span>
      </span>
    </>
  );
}
