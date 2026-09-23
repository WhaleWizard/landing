#!/usr/bin/env node
/**
 * Импорт статей в CMS по одной через PATCH /api/admin/articles.
 *
 *   node scripts/import-articles.mjs --dir content/articles [--env-file path] [--code 123456]
 *        [--dry-run] [--status draft|published] [--delay-ms 2500] [--report report.json]
 *        [--only slug1,slug2]
 *
 * Откуда пароль: переменная окружения ADMIN_PASSWORD или файл `--env-file`
 * (строки KEY=VALUE). Файл с паролем живёт ВНЕ репозитория и никогда не
 * печатается — в отчёте его нет. SITE_URL берётся оттуда же, по умолчанию
 * https://www.whalewzrd.com.
 *
 * Двухфакторная защита: первый запуск — с `--code` из приложения (или
 * резервным кодом). Сессия на 12 часов сохраняется рядом с файлом пароля,
 * вне репозитория, и следующие запуски в эти 12 часов кода не требуют.
 * Подробности — scripts/admin-client.mjs.
 *
 * Что читает: файлы *.json в папке. Каждый — объект статьи (или массив).
 * Обязательны title, slug, content (HTML, как из редактора) и category —
 * один из разделов `src/app/data/blogSections.ts` или «Кейсы». Остальное
 * дозаполняется: readTime по числу слов, date, image.
 * Статус по умолчанию — draft: ничего не уходит на сайт, пока владелец не
 * решит иначе (или не передан --status published).
 *
 * Идемпотентно: PATCH делает upsert по слагу, повторный запуск обновляет
 * те же статьи. Уважает лимит админки 30 запросов в минуту: пауза между
 * запросами и повтор при 429.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdminClient } from './admin-client.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.dir) {
  console.error('Нужен --dir <папка со статьями>');
  process.exit(2);
}

const envFile = args['env-file'] || process.env.WHALEWZRD_ENV_FILE;
const DRY_RUN = Boolean(args['dry-run']);
const DELAY_MS = Number(args['delay-ms'] || 2500);
const FORCE_STATUS = args.status === 'published' || args.status === 'draft' ? args.status : null;
const ONLY = args.only ? new Set(String(args.only).split(',').map((s) => s.trim()).filter(Boolean)) : null;

let client = null;
if (!DRY_RUN) {
  try {
    client = createAdminClient({ envFile, code: args.code === true ? '' : args.code });
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Разделы блога берутся из того же справочника, что у фильтра и редактора:
// статья с незнакомым разделом выпала бы в отдельную плитку фильтра.
const ARTICLE_CATEGORY_VALUES = await loadArticleCategories();
const dir = resolve(args.dir);
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`Папка не найдена: ${dir}`);
  process.exit(2);
}

const files = readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
const report = { created: [], updated: [], skipped: [], failed: [], dryRun: DRY_RUN, site: client ? client.siteUrl : null };

const candidates = [];
for (const name of files) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'));
  } catch (error) {
    report.skipped.push({ file: name, reason: `не JSON: ${error.message}` });
    continue;
  }
  for (const raw of Array.isArray(parsed) ? parsed : [parsed]) {
    const { article, problem } = normalize(raw, name);
    if (problem) { report.skipped.push({ file: name, reason: problem }); continue; }
    if (ONLY && !ONLY.has(article.slug)) continue;
    candidates.push({ file: name, article });
  }
}

console.log(`Найдено статей: ${candidates.length} (файлов ${files.length}), пропущено ${report.skipped.length}${DRY_RUN ? ', режим проверки без отправки' : ''}`);

for (const [index, { file, article }] of candidates.entries()) {
  const label = `${String(index + 1).padStart(3)}/${candidates.length} ${article.slug}`;
  if (DRY_RUN) {
    console.log(`${label} — ок (${article.status}, ${article.readTime} мин, ${article.content.length} симв.)`);
    continue;
  }
  const outcome = await sendWithRetry(article);
  if (outcome.ok) {
    (outcome.created ? report.created : report.updated).push({ file, slug: article.slug, id: outcome.id });
    console.log(`${label} — ${outcome.created ? 'создана' : 'обновлена'} (id ${outcome.id})`);
  } else {
    report.failed.push({ file, slug: article.slug, reason: outcome.error });
    console.log(`${label} — ОШИБКА: ${outcome.error}`);
    // Нет доступа — остальные статьи упадут так же, дальше идти бессмысленно.
    if (outcome.fatal) break;
  }
  if (index < candidates.length - 1) await sleep(DELAY_MS);
}

console.log(`\nИтог: создано ${report.created.length}, обновлено ${report.updated.length}, пропущено ${report.skipped.length}, ошибок ${report.failed.length}`);
for (const item of report.skipped) console.log(`  пропуск ${item.file}: ${item.reason}`);
for (const item of report.failed) console.log(`  ошибка ${item.slug}: ${item.reason}`);
if (args.report) {
  writeFileSync(resolve(args.report), JSON.stringify(report, null, 2), 'utf8');
  console.log(`Отчёт: ${resolve(args.report)}`);
}
process.exit(report.failed.length > 0 ? 1 : 0);

// ——— helpers ———

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

function normalize(raw, file) {
  if (!raw || typeof raw !== 'object') return { problem: 'не объект' };
  const title = String(raw.title || '').trim();
  const slug = String(raw.slug || '').trim().toLowerCase();
  const content = String(raw.content || '').trim();
  if (!title) return { problem: `${file}: нет title` };
  if (!SLUG_RE.test(slug)) return { problem: `${file}: плохой slug «${slug}»` };
  if (!content) return { problem: `${file}: пустой content` };
  if (content.length > 120_000) return { problem: `${file}: content длиннее 120 000 символов` };
  const category = String(raw.category || '').trim();
  if (!ARTICLE_CATEGORY_VALUES.includes(category)) {
    return { problem: `${file}: раздел «${category || 'не указан'}» не из списка: ${ARTICLE_CATEGORY_VALUES.join(' · ')}` };
  }

  const words = content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  const description = String(raw.description || raw.summary || '').trim().slice(0, 2000);
  const status = FORCE_STATUS || (raw.status === 'published' ? 'published' : 'draft');

  const article = {
    id: Number(raw.id) || 0,
    slug,
    title,
    category,
    readTime: String(raw.readTime || Math.max(1, Math.round(words / 200))),
    date: String(raw.date || new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })),
    description,
    content,
    image: String(raw.image || '/og-image-v2.jpg'),
    seoTitle: raw.seoTitle ? String(raw.seoTitle).slice(0, 120) : undefined,
    seoDescription: raw.seoDescription ? String(raw.seoDescription).slice(0, 220) : undefined,
    publishedAt: raw.publishedAt ? String(raw.publishedAt) : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 20) : [],
    summary: String(raw.summary || description).trim(),
    keyTakeaways: Array.isArray(raw.keyTakeaways) ? raw.keyTakeaways.map(String).slice(0, 20) : [],
    faq: Array.isArray(raw.faq)
      ? raw.faq.filter((item) => item && item.question && item.answer).map((item) => ({ question: String(item.question), answer: String(item.answer) })).slice(0, 20)
      : [],
    status,
  };
  if (raw.caseData && typeof raw.caseData === 'object') article.caseData = raw.caseData;
  return { article };
}

async function sendWithRetry(article, attempt = 1) {
  try {
    const res = await client.request('/api/admin/articles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article }),
    });
    if (res.status === 429 && attempt <= 3) {
      console.log(`  лимит запросов, жду 65 с (попытка ${attempt})`);
      await sleep(65_000);
      return sendWithRetry(article, attempt + 1);
    }
    const payload = await res.json().catch(() => null);
    if (res.status === 401) return { ok: false, fatal: true, error: payload?.error || 'нет доступа' };
    if (!res.ok || !payload?.success) return { ok: false, error: payload?.error || `HTTP ${res.status}` };
    return { ok: true, created: Boolean(payload.created), id: payload.article?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Вход не удался (нужен код, неверный пароль) — повтор не поможет.
    if (/Вход|двухфакторн|сессию|Пароль/.test(message)) return { ok: false, fatal: true, error: message };
    if (attempt <= 3) {
      await sleep(5_000);
      return sendWithRetry(article, attempt + 1);
    }
    return { ok: false, error: message };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadArticleCategories() {
  const { build } = await import('esbuild');
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/app/data/blogSections.ts', import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  return module.ARTICLE_CATEGORY_VALUES;
}
