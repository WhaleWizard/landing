/**
 * Источник истины по шрифтам редактора страниц.
 *
 * Из этого файла `scripts/build-font-library.js` собирает три вещи:
 *   1. локальные WOFF2 в `public/fonts/library/` (скачиваются из Google Fonts);
 *   2. `src/styles/content-font-library.css` — @font-face с unicode-range;
 *   3. `src/app/utils/contentFontCatalog.ts` и `functions/_lib/content-font-ids.ts`
 *      — каталог для интерфейса и белый список для сервера.
 *
 * Правило: семейство попадает в библиотеку, только если у него есть
 * кириллический subset. Скрипт проверяет это сам и молча пропускает остальные,
 * поэтому список ниже можно расширять смело.
 *
 * `dir: 'hero'` — семейства, которые уже лежат в `public/fonts/hero/` и
 * используются в дизайне конкретных страниц. Их файлы не перекачиваются.
 *
 * `bodySafe: true` — шрифт разрешён и для основного текста, а не только для
 * заголовков. Декоративные и рукописные гарнитуры в длинном тексте нечитаемы.
 */

/** @typedef {'sans'|'serif'|'display'|'handwritten'|'mono'} FontCategory */

export const FONT_LIBRARY = [
  // ─── Без засечек ─────────────────────────────────────────────────────────
  {
    id: 'onest', family: 'Onest', dir: 'hero', category: 'sans', bodySafe: true,
    weights: [400, 500, 600, 700],
    description: 'Современный нейтральный гротеск для заголовков и текста.',
  },
  {
    id: 'commissioner', family: 'Commissioner', dir: 'hero', category: 'sans', bodySafe: true,
    weights: [300, 400, 500, 600, 700],
    description: 'Гибкий деловой гротеск с хорошей кириллицей.',
  },
  {
    id: 'golos-text', family: 'Golos Text', category: 'sans', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Очень читаемый шрифт, спроектированный для кириллицы.',
  },
  {
    id: 'manrope', family: 'Manrope', category: 'sans', bodySafe: true,
    weights: [400, 500, 700, 800],
    description: 'Чистый геометрический гротеск для интерфейса и контента.',
  },
  {
    id: 'geologica', family: 'Geologica', category: 'sans', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Характерный геометрический гротеск для UI и текста.',
  },
  {
    id: 'sofia-sans', family: 'Sofia Sans', category: 'sans', bodySafe: true,
    weights: [400, 500, 700, 800],
    description: 'Мягкий современный гротеск для заголовков и текста.',
  },
  {
    id: 'arsenal', family: 'Arsenal', category: 'sans', bodySafe: true,
    weights: [400, 700],
    description: 'Узкий гуманистический гротеск для компактной вёрстки.',
  },
  {
    id: 'montserrat', family: 'Montserrat', category: 'sans', bodySafe: true,
    weights: [400, 500, 700, 800],
    description: 'Городской геометрический гротеск, привычный по вывескам.',
  },
  {
    id: 'open-sans', family: 'Open Sans', category: 'sans', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Спокойный рабочий гротеск, хорошо читается мелким кеглем.',
  },
  {
    id: 'roboto', family: 'Roboto', category: 'sans', bodySafe: true,
    weights: [300, 400, 500, 700],
    description: 'Стандартный экранный гротеск Android, максимально нейтральный.',
  },
  {
    id: 'roboto-condensed', family: 'Roboto Condensed', category: 'sans', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Узкий Roboto: помещает длинный заголовок в одну строку.',
  },
  {
    id: 'nunito', family: 'Nunito', category: 'sans', bodySafe: true,
    weights: [400, 600, 700, 800],
    description: 'Округлый дружелюбный гротеск без официоза.',
  },
  {
    id: 'nunito-sans', family: 'Nunito Sans', category: 'sans', bodySafe: true,
    weights: [400, 600, 700],
    description: 'Строгая версия Nunito для делового текста.',
  },
  {
    id: 'rubik', family: 'Rubik', category: 'sans', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Гротеск со скруглёнными углами, заметный, но спокойный.',
  },
  {
    id: 'raleway', family: 'Raleway', category: 'sans', bodySafe: true,
    weights: [400, 500, 700, 800],
    description: 'Элегантный гротеск с характерной буквой W.',
  },
  {
    id: 'jost', family: 'Jost', category: 'sans', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Геометрика в духе Futura: сухо и по-дизайнерски.',
  },
  {
    id: 'pt-sans', family: 'PT Sans', category: 'sans', bodySafe: true,
    weights: [400, 700],
    description: 'Государственный русский гротеск, безупречная кириллица.',
  },
  {
    id: 'pt-sans-narrow', family: 'PT Sans Narrow', category: 'sans', bodySafe: true,
    weights: [400, 700],
    description: 'Узкий PT Sans для плотных заголовков и таблиц.',
  },
  {
    id: 'ubuntu', family: 'Ubuntu', category: 'sans', bodySafe: true,
    weights: [300, 400, 500, 700],
    description: 'Тёплый технологичный гротеск с мягкими окончаниями.',
  },
  {
    id: 'fira-sans', family: 'Fira Sans', category: 'sans', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Инженерный гротеск, спокойный в длинном тексте.',
  },
  {
    id: 'exo-2', family: 'Exo 2', category: 'sans', bodySafe: true,
    weights: [400, 500, 700, 800],
    description: 'Техно-гротеск с наклонными срезами для digital-тем.',
  },
  {
    id: 'play', family: 'Play', category: 'sans', bodySafe: true,
    weights: [400, 700],
    description: 'Компактный техно-гротеск, хорош для цифр и метрик.',
  },
  {
    id: 'oswald', family: 'Oswald', category: 'sans', bodySafe: false,
    weights: [400, 500, 700],
    description: 'Очень узкий плакатный гротеск для крупных заголовков.',
  },
  {
    id: 'comfortaa', family: 'Comfortaa', category: 'sans', bodySafe: false,
    weights: [400, 500, 700],
    description: 'Круглый мягкий шрифт, уместен в лайфстайл-темах.',
  },
  {
    id: 'wix-madefor-display', family: 'Wix Madefor Display', category: 'sans', bodySafe: true,
    weights: [400, 500, 700, 800],
    description: 'Плотный современный гротеск для витринных заголовков.',
  },
  {
    id: 'tektur', family: 'Tektur', category: 'sans', bodySafe: false,
    weights: [400, 500, 700],
    description: 'Квадратный техничный шрифт с явным характером.',
  },
  {
    id: 'russo-one', family: 'Russo One', category: 'sans', bodySafe: false,
    weights: [400],
    description: 'Тяжёлый широкий шрифт для коротких лозунгов.',
  },
  {
    id: 'cuprum', family: 'Cuprum', category: 'sans', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Узкий шрифт с индустриальным характером.',
  },
  {
    id: 'scada', family: 'Scada', category: 'sans', bodySafe: true,
    weights: [400, 700],
    description: 'Утилитарный гротеск для интерфейсных подписей.',
  },

  // ─── С засечками ─────────────────────────────────────────────────────────
  {
    id: 'lora', family: 'Lora', category: 'serif', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Современная антиква для спокойного редакционного текста.',
  },
  {
    id: 'pt-serif', family: 'PT Serif', category: 'serif', bodySafe: true,
    weights: [400, 700],
    description: 'Надёжная русская антиква для заголовков и длинного текста.',
  },
  {
    id: 'old-standard-tt', family: 'Old Standard TT', category: 'serif', bodySafe: true,
    weights: [400, 700],
    description: 'Классическая книжная антиква с историческим характером.',
  },
  {
    id: 'roboto-serif', family: 'Roboto Serif', category: 'serif', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Современная экранная антиква с уверенной кириллицей.',
  },
  {
    id: 'alegreya', family: 'Alegreya', category: 'serif', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Литературная антиква с живым ритмом строки.',
  },
  {
    id: 'bitter', family: 'Bitter', category: 'serif', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Брусковая антиква, уверенно держит мелкий кегль.',
  },
  {
    id: 'literata', family: 'Literata', category: 'serif', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Книжная антиква Google Books, сделана для чтения с экрана.',
  },
  {
    id: 'merriweather', family: 'Merriweather', category: 'serif', bodySafe: true,
    weights: [400, 700],
    description: 'Плотная антиква с крупным очком, хороша в статьях.',
  },
  {
    id: 'eb-garamond', family: 'EB Garamond', category: 'serif', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Ренессансная антиква с тонким классическим рисунком.',
  },
  {
    id: 'vollkorn', family: 'Vollkorn', category: 'serif', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Тёплая антиква для человечного, неказённого тона.',
  },
  {
    id: 'podkova', family: 'Podkova', category: 'serif', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Брусковая антиква с плотными засечками-подковами.',
  },
  {
    id: 'kurale', family: 'Kurale', category: 'serif', bodySafe: true,
    weights: [400],
    description: 'Антиква с лёгким рукописным наклоном штриха.',
  },
  {
    id: 'ledger', family: 'Ledger', category: 'serif', bodySafe: true,
    weights: [400],
    description: 'Строгая контрастная антиква с деловым тоном.',
  },
  {
    id: 'alice', family: 'Alice', category: 'serif', bodySafe: true,
    weights: [400],
    description: 'Мягкая книжная антиква с лёгким винтажным оттенком.',
  },

  // ─── Печатные и моноширинные ─────────────────────────────────────────────
  {
    id: 'pt-mono', family: 'PT Mono', category: 'mono', bodySafe: true,
    weights: [400, 700],
    description: 'Классическая печатная машинка: ровная моноширинная кириллица.',
  },
  {
    id: 'jetbrains-mono', family: 'JetBrains Mono', category: 'mono', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Моноширинный шрифт с крупным очком, читается издалека.',
  },
  {
    id: 'ibm-plex-mono', family: 'IBM Plex Mono', category: 'mono', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Технический моношрифт с характерными засечками.',
  },
  {
    id: 'roboto-mono', family: 'Roboto Mono', category: 'mono', bodySafe: true,
    weights: [300, 400, 500, 700],
    description: 'Нейтральный моношрифт для цифр, кода и таблиц.',
  },
  {
    id: 'ubuntu-sans-mono', family: 'Ubuntu Sans Mono', category: 'mono', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Тёплый моношрифт со скруглёнными формами.',
  },
  {
    id: 'fira-mono', family: 'Fira Mono', category: 'mono', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Спокойный инженерный моношрифт.',
  },
  {
    id: 'fira-code', family: 'Fira Code', category: 'mono', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Fira Mono с лигатурами, выглядит как редактор кода.',
  },
  {
    id: 'martian-mono', family: 'Martian Mono', category: 'mono', bodySafe: false,
    weights: [400, 500, 700],
    description: 'Широкий техно-моношрифт для крупных заголовков.',
  },
  {
    id: 'cousine', family: 'Cousine', category: 'mono', bodySafe: true,
    weights: [400, 700],
    description: 'Метрика Courier New: самый «машинописный» из читаемых.',
  },
  {
    id: 'anonymous-pro', family: 'Anonymous Pro', category: 'mono', bodySafe: true,
    weights: [400, 700],
    description: 'Моношрифт с ретро-терминальным характером.',
  },
  {
    id: 'source-code-pro', family: 'Source Code Pro', category: 'mono', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Аккуратный моношрифт Adobe с полной кириллицей.',
  },
  {
    id: 'noto-sans-mono', family: 'Noto Sans Mono', category: 'mono', bodySafe: true,
    weights: [400, 500, 700],
    description: 'Универсальный моношрифт с максимальным покрытием знаков.',
  },

  // ─── Акцентные и заголовочные ────────────────────────────────────────────
  {
    id: 'prata', family: 'Prata', dir: 'hero', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Контрастный акцидентный шрифт для коротких заголовков.',
  },
  {
    id: 'cormorant-garamond', family: 'Cormorant Garamond', category: 'display', bodySafe: false,
    weights: [400, 500, 700],
    description: 'Выразительная антиква для премиальных заголовков.',
  },
  {
    id: 'playfair-display', family: 'Playfair Display', category: 'display', bodySafe: false,
    weights: [400, 500, 700, 800],
    description: 'Редакционная контрастная антиква для выразительных заголовков.',
  },
  {
    id: 'oranienbaum', family: 'Oranienbaum', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Тонкая контрастная антиква для крупных заголовков.',
  },
  {
    id: 'yeseva-one', family: 'Yeseva One', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Декоративная антиква с выразительной русской пластикой.',
  },
  {
    id: 'tenor-sans', family: 'Tenor Sans', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Элегантный заголовочный гротеск с журнальным настроением.',
  },
  {
    id: 'unbounded', family: 'Unbounded', category: 'display', bodySafe: false,
    weights: [400, 500, 700],
    description: 'Широкий футуристичный шрифт для коротких сильных заголовков.',
  },
  {
    id: 'forum', family: 'Forum', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Шрифт с римскими пропорциями, торжественный и спокойный.',
  },
  {
    id: 'ruslan-display', family: 'Ruslan Display', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Древнерусская вязь для одного короткого слова.',
  },
  {
    id: 'stalinist-one', family: 'Stalinist One', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Тяжёлый плакатный шрифт в стиле советской типографики.',
  },
  {
    id: 'underdog', family: 'Underdog', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Гротеск с рваным контуром, будто напечатан на плохой бумаге.',
  },
  {
    id: 'seymour-one', family: 'Seymour One', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Сверхжирный шрифт для одного слова во весь экран.',
  },
  {
    id: 'kelly-slab', family: 'Kelly Slab', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Брусковый ретро-шрифт с вывесочным характером.',
  },
  {
    id: 'rubik-mono-one', family: 'Rubik Mono One', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Толстый моноширинный шрифт для плакатных цифр.',
  },
  {
    id: 'rubik-glitch', family: 'Rubik Glitch', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Сбой изображения: буквы «рассыпаются» по пикселям.',
  },
  {
    id: 'rubik-moonrocks', family: 'Rubik Moonrocks', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Пузырчатые лунные буквы, очень неформально.',
  },
  {
    id: 'rubik-puddles', family: 'Rubik Puddles', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Растёкшиеся буквы, как чернила по мокрой бумаге.',
  },
  {
    id: 'rubik-vinyl', family: 'Rubik Vinyl', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Виниловая наклейка с толстым контуром.',
  },
  {
    id: 'rubik-iso', family: 'Rubik Iso', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Объёмные изометрические буквы.',
  },
  {
    id: 'rubik-spray-paint', family: 'Rubik Spray Paint', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Трафарет из баллончика, уличный характер.',
  },
  {
    id: 'rubik-marker-hatch', family: 'Rubik Marker Hatch', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Буквы, заштрихованные маркером от руки.',
  },
  {
    id: 'rubik-distressed', family: 'Rubik Distressed', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Затёртая печать с выщербленным контуром.',
  },
  {
    id: 'rubik-wet-paint', family: 'Rubik Wet Paint', category: 'display', bodySafe: false,
    weights: [400],
    description: 'Свежая краска с потёками.',
  },

  // ─── Рукописные ──────────────────────────────────────────────────────────
  {
    id: 'caveat', family: 'Caveat', dir: 'hero', category: 'handwritten', bodySafe: false,
    weights: [500, 600],
    description: 'Живой рукописный акцент для коротких фраз.',
  },
  {
    id: 'bad-script', family: 'Bad Script', dir: 'hero', category: 'handwritten', bodySafe: false,
    weights: [400],
    description: 'Мягкий рукописный шрифт с естественной кириллицей.',
  },
  {
    id: 'marck-script', family: 'Marck Script', category: 'handwritten', bodySafe: false,
    weights: [400],
    description: 'Плавный рукописный акцент с полноценной кириллицей.',
  },
  {
    id: 'neucha', family: 'Neucha', category: 'handwritten', bodySafe: false,
    weights: [400],
    description: 'Неформальный рукописный шрифт для живых заголовков.',
  },
  {
    id: 'pangolin', family: 'Pangolin', category: 'handwritten', bodySafe: false,
    weights: [400],
    description: 'Дружелюбный рисованный шрифт для неформальных акцентов.',
  },
  {
    id: 'shantell-sans', family: 'Shantell Sans', category: 'handwritten', bodySafe: false,
    weights: [400, 500, 700],
    description: 'Экспрессивный, но аккуратный рукописный шрифт.',
  },
  {
    id: 'lobster', family: 'Lobster', category: 'handwritten', bodySafe: false,
    weights: [400],
    description: 'Жирный вывесочный курсив, узнаваемый с одного взгляда.',
  },
  {
    id: 'pacifico', family: 'Pacifico', category: 'handwritten', bodySafe: false,
    weights: [400],
    description: 'Расслабленный сёрф-курсив для тёплых заголовков.',
  },
];

/** Порядок subset'ов важен: браузер берёт первый подходящий по unicode-range. */
export const FONT_SUBSETS = ['cyrillic-ext', 'cyrillic', 'latin'];

/** Публичное имя семейства в CSS: префикс исключает конфликт с системным. */
export function cssFamilyName(family) {
  return `WW ${family}`;
}
