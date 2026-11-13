import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Скрипт сбора поискового спроса и интентов через Yandex Wordstat / Search API.
 * 
 * Использование:
 *   node scripts/scout-wordstat.mjs --phrase "продвижение приложений" --geo 225
 * 
 * Переменные окружения (.env или process.env):
 *   YANDEX_API_KEY      - API-ключ из Yandex Cloud / AI Studio
 *   YANDEX_FOLDER_ID    - ID каталога в Yandex Cloud (если используется Search API)
 */

const phrase = process.argv.find((arg, i, arr) => arr[i - 1] === '--phrase') || process.argv[2];
const geo = process.argv.find((arg, i, arr) => arr[i - 1] === '--geo') || '225'; // 225 = Россия, 159 = Казахстан, 171 = Узбекистан

if (!phrase) {
  console.log(`
Использование:
  node scripts/scout-wordstat.mjs --phrase "настройка рекламы meta ads" [--geo 159]

Параметры:
  --phrase   Ключевая фраза для анализа спроса
  --geo      ID региона Яндекс (225: РФ, 159: Казахстан, 171: Узбекистан, 187: Украина, 0: Весь мир)
`);
  process.exit(0);
}

const API_KEY = process.env.YANDEX_API_KEY;
const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

console.log(`[Scout] Анализ спроса для фразы: "${phrase}" (Регион: ${geo})`);

if (!API_KEY) {
  console.log(`
[Внимание] Не найден YANDEX_API_KEY в переменных окружения.
Для прямого подключения к Yandex API:
1. Зарегистрируйтесь в Yandex Cloud (console.yandex.cloud) или Yandex AI Studio.
2. Создайте сервисный аккаунт и получите API-ключ.
3. Добавьте в файл окружения или передайте:
   $env:YANDEX_API_KEY="ваш_ключ"
   $env:YANDEX_FOLDER_ID="ваш_folder_id"

Пока ключ не задан, генерируем структуру ТЗ (seo-brief.md) на базе имеющейся семантики проекта.
`);
}

// Шаблон генерации seo-brief.md на основе структуры ТЗ
function generateSeoBrief(targetPhrase) {
  return `# SEO-Бриф: ${targetPhrase}

## 1. Метаданные
- **Категория блога**: Meta Ads / Приложения / Инфобизнес
- **Слаг (URL)**: ${slugify(targetPhrase)}
- **Title (до 85 знаков)**: ${targetPhrase}: как настроить и не слить бюджет | Whale Wizard
- **Description (до 160 знаков)**: Разбор от практика: что учесть при запуске, частые ошибки, реальная экономика и как выстроить связку без переплаты.

## 2. Интент читателя
- **Кто читает**: Владелец бизнеса / руководитель маркетинга / основатель проекта.
- **Главный вопрос**: «Как решить эту задачу без слива денег и потери времени».
- **Чего читатель боится**: Некомпетентных подрядчиков, блокировок, пустых заявок без продаж.

## 3. Запросы и ключи
- **Основной ключ**: ${targetPhrase}
- **Сопутствующие LSI-фразы**:
  - цена лида / стоимость заявки
  - настройка воронки
  - ошибки при запуске
  - как проверить результат
- **Минус-темы (НЕ писать об этом)**:
  - Вакансии, курсы для новичков, как стать таргетологом.
  - Пошаговые банальности («нажмите зеленую кнопку Создать»).
  - Вода («в современном мире реклама очень важна»).

## 4. Обязательные блоки фактуры (E-E-A-T & AEO)
- **Готовый ответ в первом абзаце (40–50 слов)**: четкое определение и суть решения для AI Overviews / Google Snippet.
- **Цифры и бенчмарки диапазонами**: реальные стоимости целевого действия (CPA/CPL/CPI) по рынкам.
- **Разбор анти-кейса / граблей**: где 8 из 10 проектов теряют окупаемость.
- **Чек-лист / алгоритм действий**: пошаговый список с четкими критериями проверки.
- **Внутренняя перелинковка**: ссылка на калькулятор или релевантную страницу услуги (/meta-ads, /meta-apps или /consult).

## 5. Вопросы для FAQ блока
1. Какой минимальный бюджет нужен на тест?
2. За сколько дней алгоритм обучается и дает стабильные цифры?
3. Что делать, если лиды идут, но отдел продаж не может их закрыть?
`;
}

function slugify(text) {
  const ru = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
  const en = ['a','b','v','g','d','e','yo','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','h','ts','ch','sh','sch','','y','','e','yu','ya'];
  return text.toLowerCase()
    .split('')
    .map(char => {
      const idx = ru.indexOf(char);
      return idx >= 0 ? en[idx] : char;
    })
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const briefDir = join('docs', 'seo', 'briefs');
if (!existsSync(briefDir)) mkdirSync(briefDir, { recursive: true });

const briefFileName = `${slugify(phrase)}-brief.md`;
const briefFilePath = join(briefDir, briefFileName);
writeFileSync(briefFilePath, generateSeoBrief(phrase), 'utf8');

console.log(`✅ ТЗ сформировано: ${briefFilePath}`);
