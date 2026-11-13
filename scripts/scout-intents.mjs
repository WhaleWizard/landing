#!/usr/bin/env node
/**
 * Scout Intents — бесплатный сборщик поисковых интентов и подсказок.
 * 
 * Не требует платных API-ключей. Подключается к открытым эндпоинтам автодополнения
 * Google, Bing и Яндекса, формируя полное дерево коммерческих, информационных и гео-запросов.
 * 
 * Использование:
 *   node scripts/scout-intents.mjs --seed "таргетолог"
 *   node scripts/scout-intents.mjs --seed "трафик для инфобизнеса"
 *   node scripts/scout-intents.mjs --seed "реклама приложений"
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const seedIndex = args.indexOf('--seed');
const seed = (seedIndex !== -1 && args[seedIndex + 1]) ? args[seedIndex + 1] : (args[0] || 'таргетолог');

const MODIFIERS = {
  commercial: ['услуги', 'цена', 'стоимость', 'заказать', 'настройка', 'под ключ', 'ведение', 'кейсы'],
  niches: ['для онлайн школ', 'для инфобизнеса', 'для курсов', 'для приложений', 'для экспертов', 'для бьюти', 'для b2b', 'для интернет магазина'],
  questions: ['как', 'сколько стоит', 'как выбрать', 'где найти', 'чем занимается', 'что делает', 'что входит в обязанности'],
  geo: ['казахстан', 'узбекистан', 'алматы', 'ташкент', 'дубай', 'оаэ', 'беларусь', 'грузия'],
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchGoogleSuggestions(query) {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}&hl=ru&gl=ru&ie=utf-8&oe=utf-8`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

async function fetchBingSuggestions(query) {
  try {
    const url = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

async function fetchYandexSuggestions(query) {
  try {
    const url = `https://suggest.yandex.ru/suggest-ya.cgi?part=${encodeURIComponent(query)}&v=4`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

async function collectAllSuggestions(query) {
  const [google, bing, yandex] = await Promise.all([
    fetchGoogleSuggestions(query),
    fetchBingSuggestions(query),
    fetchYandexSuggestions(query),
  ]);

  const set = new Set();
  const list = [];

  for (const item of [...google, ...bing, ...yandex]) {
    const clean = String(item).trim().toLowerCase();
    if (clean && !set.has(clean)) {
      set.add(clean);
      list.push(clean);
    }
  }

  return list;
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`[Scout Intents] Поиск интентов для базы: "${seed}"`);
  console.log(`======================================================\n`);

  // Базовые подсказки
  const baseSuggestions = await collectAllSuggestions(seed);
  console.log(`✓ Базовые подсказки: найдено ${baseSuggestions.length}`);

  const results = {
    seed,
    timestamp: new Date().toISOString(),
    base: baseSuggestions,
    commercial: [],
    niches: [],
    questions: [],
    geo: [],
  };

  // 1. Коммерческие
  for (const mod of MODIFIERS.commercial) {
    const q = `${seed} ${mod}`;
    const found = await collectAllSuggestions(q);
    results.commercial.push({ modifier: mod, query: q, suggestions: found });
  }
  console.log(`✓ Коммерческие модификаторы: обработано ${MODIFIERS.commercial.length}`);

  // 2. Ниши
  for (const mod of MODIFIERS.niches) {
    const q = `${seed} ${mod}`;
    const found = await collectAllSuggestions(q);
    results.niches.push({ modifier: mod, query: q, suggestions: found });
  }
  console.log(`✓ Нишевые модификаторы: обработано ${MODIFIERS.niches.length}`);

  // 3. Вопросы (PAA для AEO)
  for (const mod of MODIFIERS.questions) {
    const q = `${mod} ${seed}`;
    const found = await collectAllSuggestions(q);
    results.questions.push({ modifier: mod, query: q, suggestions: found });
  }
  console.log(`✓ Вопросные интенты (PAA): обработано ${MODIFIERS.questions.length}`);

  // 4. Гео
  for (const mod of MODIFIERS.geo) {
    const q = `${seed} ${mod}`;
    const found = await collectAllSuggestions(q);
    results.geo.push({ modifier: mod, query: q, suggestions: found });
  }
  console.log(`✓ Географические привязки: обработано ${MODIFIERS.geo.length}`);

  // Сбор уникального пула
  const allUnique = new Set();
  const addList = (items) => items.forEach((i) => allUnique.add(i));

  baseSuggestions.forEach((s) => allUnique.add(s));
  results.commercial.forEach((c) => addList(c.suggestions));
  results.niches.forEach((n) => addList(n.suggestions));
  results.questions.forEach((q) => addList(q.suggestions));
  results.geo.forEach((g) => addList(g.suggestions));

  console.log(`\n======================================================`);
  console.log(`Всего уникальных поисковых интентов собрано: ${allUnique.size}`);
  console.log(`======================================================\n`);

  // Сохранение в docs/seo/intents/
  const outDir = join(process.cwd(), 'docs', 'seo', 'intents');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const safeSlug = seed.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '');
  const jsonPath = join(outDir, `${safeSlug}-intents.json`);
  const mdPath = join(outDir, `${safeSlug}-intents.md`);

  writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf8');

  // Генерируем Markdown отчёт
  let md = `# Поисковые интенты и подсказки: «${seed}»\n\n`;
  md += `*Дата сбора:* ${new Date().toLocaleDateString('ru-RU')} | *Источники:* Google, Bing, Яндекс (открытые Suggest API)\n\n`;
  md += `## 1. Горячие коммерческие запросы (Транзакционные)\n`;
  for (const c of results.commercial) {
    if (c.suggestions.length > 0) {
      md += `* **${c.modifier}:** ${c.suggestions.join(', ')}\n`;
    }
  }

  md += `\n## 2. Нишевой спрос (Для кого ищут)\n`;
  for (const n of results.niches) {
    if (n.suggestions.length > 0) {
      md += `* **${n.modifier}:** ${n.suggestions.join(', ')}\n`;
    }
  }

  md += `\n## 3. Вопросы пользователей (AEO / FAQ для ChatGPT и Perplexity)\n`;
  for (const q of results.questions) {
    if (q.suggestions.length > 0) {
      md += `* **${q.modifier}:** ${q.suggestions.join(', ')}\n`;
    }
  }

  md += `\n## 4. Географический спрос (Локальные рынки)\n`;
  for (const g of results.geo) {
    if (g.suggestions.length > 0) {
      md += `* **${g.modifier}:** ${g.suggestions.join(', ')}\n`;
    }
  }

  writeFileSync(mdPath, md, 'utf8');

  console.log(`Отчёт сохранён:`);
  console.log(`- JSON: ${jsonPath}`);
  console.log(`- Markdown: ${mdPath}\n`);
}

run();
