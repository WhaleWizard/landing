import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { build, transform } from 'esbuild';
import { ssrBuildOptions } from './ssr-bundle.js';

/**
 * Находки построчного аудита в оболочке админки: статьи, редактор сайта,
 * медиатека, палитра, вход (docs/handoff/audit-findings.json, группа
 * admin-shell).
 *
 * Чистые функции проверяются поведением: модули собираются esbuild в память.
 * У `Admin.tsx` верх модуля — ленивые импорты и константы, поэтому он
 * исполняется с настоящим React и заглушками вместо остальных пакетов, а
 * проверяемые помощники экспортированы из него. Проводка внутри компонентов
 * (кто кого зовёт первой строкой) закреплена проверкой исходника: поднимать
 * ради неё всю админку с контекстами и роутером дороже, чем она стоит.
 */

const require = createRequire(import.meta.url);

// Переводы строк приводятся к LF: на Windows git отдаёт исходники с CRLF, и
// якоря вида «\n}\n» иначе не находились бы, хотя код тот же.
async function source(relativePath) {
  return (await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
}

/** Собирает чистый модуль со всеми зависимостями в память. */
async function bundle(entryPoints) {
  const result = await build({
    entryPoints,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

/**
 * Серверный рендер компонента — тем же способом, что у тестов первого экрана:
 * пакеты из node_modules грузит сам Node (react-dom/server тянет `stream`),
 * поэтому бандл CJS и исполняется через createRequire.
 */
async function renderComponent(componentPath) {
  const compiled = await build(ssrBuildOptions({
    stdin: {
      contents: `
        import { createElement } from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import Component from './${componentPath}';
        export function render(props) { return renderToStaticMarkup(createElement(Component, props)); }
      `,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    format: 'cjs',
    write: false,
  }));
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports);
  return module.exports.render;
}

/**
 * Исполняет один модуль проекта: React настоящий, остальные импорты —
 * заглушки. Компоненты из таких модулей не рендерятся, но экспортированные
 * помощники работают по-настоящему.
 */
async function loadWithStubs(relativePath, real = {}) {
  const stubFn = () => undefined;
  const stub = new Proxy({}, { get: (_, prop) => (prop === '__esModule' ? false : typeof prop === 'symbol' ? undefined : stubFn) });
  const compiled = await transform(await source(relativePath), { loader: 'tsx', format: 'cjs', target: 'node20', jsx: 'automatic' });
  const module = { exports: {} };
  const resolve = (request) => {
    if (request === 'react' || request.startsWith('react/')) return require(request);
    const match = Object.keys(real).find((suffix) => request.endsWith(suffix));
    return match ? real[match] : stub;
  };
  new Function('module', 'exports', 'require', compiled.code)(module, module.exports, resolve);
  return module.exports;
}

async function compilePlain(relativePath) {
  const compiled = await transform(await source(relativePath), { loader: 'ts', format: 'cjs', target: 'node20' });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compiled.code)(module, module.exports, () => ({}));
  return module.exports;
}

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size; },
    dump: () => Object.fromEntries(map),
  };
}

const admin = await loadWithStubs('src/app/pages/Admin.tsx');
const adminSource = await source('src/app/pages/Admin.tsx');
const faqSource = await source('src/app/components/admin/AdminFaqControl.tsx');
const contentControlSource = await source('src/app/components/admin/AdminContentControl.tsx');
const paletteSource = await source('src/app/components/admin/AdminCommandPalette.tsx');
const securitySource = await source('src/app/components/admin/AdminSecurity.tsx');
const mediaSource = await source('src/app/components/admin/AdminMedia.tsx');
const schedulePanelSource = await source('src/app/components/admin/PublishSchedulePanel.tsx');

/** Кусок исходника между двумя якорями — чтобы проверять порядок внутри одной функции. */
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.notEqual(start, -1, `не найден якорь «${from}»`);
  const end = text.indexOf(to, start);
  assert.notEqual(end, -1, `не найден якорь «${to}» после «${from}»`);
  return text.slice(start, end);
}

// ---------------------------------------------------------------------------
// F-060: дефис в поле slug

test('F-060: дефис в конце адреса переживает набор, но не сохранение', () => {
  // Раньше transliterate срезал крайний дефис на каждом нажатии: «plan-»
  // превращалось в «plan», и «plan-zapuska» набирался как «planzapuska».
  assert.equal(admin.slugDraft('plan-'), 'plan-');
  assert.equal(admin.slugDraft('План запуска'), 'plan-zapuska');
  assert.equal(admin.slugDraft('-plan--zapuska-'), 'plan-zapuska-');
  // Готовый адрес без дефиса в конце: сервер отвечает 400 на «plan-».
  assert.equal(admin.transliterate('plan-'), 'plan');
  assert.equal(admin.transliterate('План запуска!'), 'plan-zapuska');
  assert.equal(admin.transliterate('---'), '');
  const handleSave = slice(adminSource, 'const handleSave = async', 'const handleDelete');
  assert.match(handleSave, /const slug = transliterate\(editingArticle\.slug\)/, 'сохранение нормализует адрес, а не берёт trim()');
  assert.match(adminSource, /aria-label="Slug публикации"[^\n]*onBlur=/, 'уход из поля срезает крайний дефис');
});

// ---------------------------------------------------------------------------
// F-007: переход к другой статье и копии автосохранения

test('F-007: копия автосохранения хранится по статье, старая копия переезжает', () => {
  assert.equal(admin.editorBackupKey({ id: 42 }), 'ww-admin-editor-backup-v2:id-42');
  assert.equal(admin.editorBackupKey({ id: 0 }), 'ww-admin-editor-backup-v2:new');
  assert.notEqual(admin.editorBackupKey({ id: 1 }), admin.editorBackupKey({ id: 2 }), 'у двух статей разные ключи');

  const legacy = { article: { id: 7, slug: 'old', title: 'Старая копия' }, savedAt: 1_000 };
  const storage = fakeStorage({
    'ww-admin-editor-backup-v1': JSON.stringify(legacy),
    'ww-admin-editor-backup-v2:id-9': JSON.stringify({ article: { id: 9, slug: 'nine', title: 'Девятая' }, savedAt: 3_000 }),
    'ww-admin-theme': 'dark',
  });
  const backups = admin.readEditorBackups(storage);
  assert.deepEqual(backups.map((backup) => backup.article.id), [9, 7], 'свежие сверху, обе копии видны');
  assert.equal(backups[1].key, 'ww-admin-editor-backup-v2:id-7', 'копия старого формата получила ключ своей статьи');
  assert.equal(storage.getItem('ww-admin-editor-backup-v1'), null, 'старый ключ после переезда удалён');
  assert.equal(storage.getItem('ww-admin-theme'), 'dark', 'чужие ключи не тронуты');

  // Повреждённая запись не роняет чтение остальных.
  const broken = fakeStorage({ 'ww-admin-editor-backup-v2:id-1': '{not json', 'ww-admin-editor-backup-v2:id-2': JSON.stringify({ article: { id: 2 }, savedAt: 5 }) });
  assert.deepEqual(admin.readEditorBackups(broken).map((backup) => backup.article.id), [2]);
});

test('F-007: та же статья узнаётся по id, новая — по адресу', () => {
  assert.equal(admin.isSameArticle({ id: 3, slug: 'a' }, { id: 3, slug: 'a' }), true);
  assert.equal(admin.isSameArticle({ id: 3, slug: 'a' }, { id: 4, slug: 'a' }), false, 'id важнее адреса');
  assert.equal(admin.isSameArticle({ id: 0, slug: 'a-copy' }, { id: 0, slug: 'a-copy' }), true);
  assert.equal(admin.isSameArticle({ id: 0, slug: '' }, { id: 5, slug: 'x' }), false, 'новая пустая статья не совпадает ни с кем');
  assert.equal(admin.isSameArticle(null, { id: 5, slug: 'x' }), false);
});

test('F-007: страж несохранённого стоит перед каждым открытием другой статьи', () => {
  for (const name of ['openArticleForEdit', 'duplicateArticle', 'createArticleDraft', 'createCaseFromClient']) {
    // Каждая функция отделена от следующей пустой строкой.
    const body = slice(adminSource, `const ${name} = `, '\n\n');
    assert.match(body, /await confirmLeaveEditor\(\)/, `${name} спрашивает про несохранённое`);
  }
  const open = slice(adminSource, 'const openArticleForEdit = ', 'const duplicateArticle');
  assert.ok(
    open.indexOf('isSameArticle(editingArticleRef.current, article)') < open.indexOf('loadAdminArticle('),
    'повторный клик по открытой статье не перечитывает её с сервера',
  );
  assert.ok(open.indexOf('await confirmLeaveEditor()') < open.indexOf('loadAdminArticle('), 'вопрос задаётся до загрузки с сервера');
  assert.match(slice(adminSource, 'const closeArticleEditor = ', 'const confirmLeaveEditor'), /clearEditorBackup\(editorBackupKey\(closing\)\)/, '«Отмена» удаляет только копию закрываемой статьи');
  assert.doesNotMatch(adminSource, /clearEditorBackup\(\)/, 'общий ключ копии больше не стирается целиком');
});

// ---------------------------------------------------------------------------
// F-021: обложка не откатывает правки, сделанные пока файл грузился

test('F-021: загруженная обложка применяется к текущему состоянию той же статьи', () => {
  const upload = slice(adminSource, 'aria-label="Загрузить обложку"', '</label>');
  assert.match(upload, /e\.target\.value = ''/, 'тот же файл можно выбрать повторно');
  assert.match(upload, /setEditingArticle\(\(current\) =>/, 'функциональное обновление вместо копии из замыкания');
  assert.match(upload, /editorSessionRef\.current === session/, 'результат отбрасывается, если открыта другая статья');
  assert.doesNotMatch(upload, /\{ \.\.\.editingArticle, image: url \}/);
  for (const anchor of ['const openArticleEditor = useCallback', 'const closeArticleEditor = useCallback']) {
    assert.match(slice(adminSource, anchor, '}, ['), /editorSessionRef\.current \+= 1/, `${anchor} открывает новый сеанс`);
  }
});

// ---------------------------------------------------------------------------
// F-025: список не перерисовывается на каждое нажатие клавиши

test('F-025: строки списка мемоизированы и получают стабильные обработчики', async () => {
  assert.match(adminSource, /const AdminArticleItem = memo\(function AdminArticleItem/);
  assert.match(adminSource, /useDeferredValue\(query\)/, 'поиск по списку отложен');
  const list = slice(adminSource, '<AdminArticleItem', '/>');
  assert.match(list, /onEdit=\{openArticleForEdit\}/);
  assert.match(list, /onDuplicate=\{duplicateArticle\}/);
  assert.doesNotMatch(list, /=>\s*void /, 'стрелок-обёрток у строки нет');
  for (const name of ['duplicateArticle', 'handleDelete', 'toggleFeatured', 'moveFeatured', 'applyFeatured', 'refreshHealth']) {
    assert.match(adminSource, new RegExp(`const ${name} = useCallback\\(`), `${name} стабилен`);
  }
  assert.doesNotMatch(adminSource, /onOpen=\{\(article\) => void openArticleForEdit/, 'календарь и окупаемость получают обработчик напрямую');
  assert.match(await source('src/app/components/admin/ArticleCalendar.tsx'), /export default memo\(ArticleCalendar\)/);
  assert.match(schedulePanelSource, /export default memo\(PublishSchedulePanel\)/);
});

// ---------------------------------------------------------------------------
// F-058: палитра ищет по всем публикациям

test('F-058: палитра получает все публикации, свежие сверху, лимит только без запроса', () => {
  const sorted = admin.sortArticlesForPalette([
    { id: 1, slug: 'old', publishedAt: '2026-01-01T00:00:00Z' },
    { id: 3, slug: 'fresh', publishedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z' },
    { id: 2, slug: 'undated' },
    { id: 4, slug: 'also-undated' },
  ]);
  assert.deepEqual(sorted.map((article) => article.slug), ['fresh', 'old', 'also-undated', 'undated'], 'по дате правки, затем по id');
  assert.doesNotMatch(adminSource, /articles\.slice\(0, 60\)/, 'первые 60 по id больше не режутся заранее');
  assert.match(adminSource, /emptyQueryLimit: 60/);
  assert.match(paletteSource, /emptyQueryLimit\?: number/);
  const visible = slice(paletteSource, 'const visibleGroups', ';');
  assert.match(visible, /!hasQuery && group\.emptyQueryLimit/, 'лимит действует только при пустом запросе');
});

// ---------------------------------------------------------------------------
// F-061: сохранение статьи не возвращает старое закрепление

test('F-061: сохранение статьи не отправляет featuredOrder', () => {
  const normalized = slice(adminSource, 'const normalizedArticle: Article = {', '\n    };');
  assert.match(normalized, /featuredOrder: undefined/);
});

// ---------------------------------------------------------------------------
// F-074 / F-077: несохранённое в «Редакторе сайта» и FAQ

test('F-074: уход из раздела проходит через страж несохранённого', () => {
  assert.match(adminSource, /onRegisterLeaveGuard=\{registerLeaveGuard\}/, 'редактор сайта регистрирует страж');
  const navigate = slice(adminSource, 'const navigateToAdminSection = async', '\n  };');
  assert.match(navigate, /await confirmLeaveSection\(\)/);
  assert.ok(navigate.indexOf('confirmLeaveSection') < navigate.indexOf('setAdminView'), 'вопрос задаётся до смены раздела');
  const today = slice(adminSource, '<AdminToday', '/>');
  assert.match(today, /await confirmLeaveSection\(\)/, '«Сегодня» тоже спрашивает');
  for (const id of ['new-article', 'new-case']) {
    assert.match(slice(adminSource, `id: '${id}'`, '},'), /await confirmLeaveSection\(\)/, `действие палитры ${id}`);
  }
  assert.match(slice(adminSource, 'const openArticleFromPalette', '}, ['), /await confirmLeaveSection\(\)/);
  assert.match(slice(adminSource, 'const openSite = ', '};'), /await confirmLeaveSection\(\)/, '«На сайт» — тоже уход');
  assert.doesNotMatch(adminSource, /onClick=\{\(\) => navigate\('\/'\)\}/);
  assert.match(adminSource, /onClick=\{openSite\}/);

  const register = slice(contentControlSource, 'onRegisterLeaveGuard(async () =>', '});');
  assert.match(register, /faqGuardRef\.current/, 'страж раздела учитывает вкладку FAQ');
  assert.match(register, /confirmDiscardPages\('Уйти из редактора сайта\?'\)/);
  assert.match(contentControlSource, /return \(\) => onRegisterLeaveGuard\(null\)/, 'при размонтировании страж снимается');
  assert.match(contentControlSource, /confirmLabel: 'Перейти и потерять правки'/);
  assert.match(contentControlSource, /onClick=\{\(\) => \{ void switchContentMode\('pages'\); \}\}/, '«Страницы» идёт через проверку FAQ');
});

test('F-077: редактор FAQ знает о несохранённом', () => {
  assert.match(faqSource, /const isDirty = faqSignature\(items, seo\) !== baseline/, 'подпись включает и SEO');
  assert.match(faqSource, /setBaseline\(faqSignature\(loadedItems, nextSeo\)\)/, 'baseline ставится после загрузки (и после сохранения через load)');
  assert.match(faqSource, /Обновить<\/button>/);
  const refresh = slice(faqSource, 'onClick={() => void load()}', '</button>');
  assert.match(refresh, /disabled=\{loading \|\| isDirty\}/, '«Обновить» выключена при правках');
  assert.match(slice(faqSource, 'const restore = async', 'setLoading(true)'), /if \(isDirty\) \{/, 'восстановление версии отказывает при правках');
  assert.match(slice(faqSource, 'aria-label="Восстановить версию FAQ"', '>'), /disabled=\{loading \|\| isDirty\}/);
  assert.match(faqSource, /beforeunload/);
  assert.match(faqSource, /onRegisterLeaveGuard\(async \(\) => !isDirty \|\| confirmAsk\(/, 'страж через общий confirmAsk');
  assert.match(faqSource, /Отменить изменения/);
  assert.match(faqSource, /admin-state admin-state--warning">Не сохранено/);
  assert.doesNotMatch(faqSource, /window\.confirm/);
});

// ---------------------------------------------------------------------------
// F-078: истёкшая сессия

test('F-078: потерянная сессия отличается от любой другой ошибки 401', () => {
  const lost = admin.isLostAdminSession;
  assert.equal(lost('/api/admin/site-sections', 401, { code: 'SESSION_EXPIRED', error: 'Сессия истекла' }, true), true);
  assert.equal(lost('https://www.whalewzrd.com/api/admin/media?x=1', 401, { code: 'SESSION_EXPIRED' }, true), true);
  // Без второго фактора разделы отвечают голым Unauthorized: это «нет сессии»
  // только когда пароля нет и в памяти вкладки.
  assert.equal(lost('/api/admin/planner', 401, { error: 'Unauthorized' }, false), true);
  assert.equal(lost('/api/admin/planner', 401, { error: 'Unauthorized' }, true), false, 'с паролем в памяти Unauthorized — не про сессию');
  // Сам вход и всё вне админки не трогаются.
  assert.equal(lost('/api/admin/auth', 401, { code: 'SESSION_EXPIRED' }, false), false);
  assert.equal(lost('/api/lead', 401, { error: 'Unauthorized' }, false), false);
  assert.equal(lost('/api/admin/stats', 500, { code: 'SESSION_EXPIRED' }, false), false);
  assert.equal(lost('/api/admin/stats', 401, null, true), false);
});

test('F-078: окно повторного входа рисуется поверх раздела, не сбрасывая вход', () => {
  const interceptor = slice(adminSource, 'const original = window.fetch;', '}, [isAuthenticated]);');
  assert.match(interceptor, /isLostAdminSession\(url, response\.status, payload, Boolean\(passwordRef\.current\)\)/);
  assert.match(interceptor, /setSessionExpired\(true\)/);
  assert.doesNotMatch(interceptor, /setIsAuthenticated\(false\)/, 'разделы не размонтируются');
  assert.match(adminSource, /<AdminSessionDialog/);
  const dialog = slice(adminSource, 'function AdminSessionDialog(', '\n}\n');
  assert.match(dialog, /className="admin-confirm"/, 'те же классы, что у диалога подтверждения — обе темы');
  assert.match(dialog, /await adminLogin\(password, code\.trim\(\)\)/, 'тот же вход, со вторым фактором');
  assert.match(dialog, /autoComplete="current-password"/);
  assert.doesNotMatch(adminSource, /\.includes\('session_required'\)/);
  const restored = slice(adminSource, 'onRestored={(restored) =>', '}}');
  assert.match(restored, /setPassword\(restored\)/);
  assert.match(restored, /Вход восстановлен/);
  // При обрыве сети окно показывать нельзя: статус «unknown» — не «expired».
  const visibility = slice(adminSource, "document.addEventListener('visibilitychange', check)", '}, [isAuthenticated]);');
  assert.ok(visibility.length > 0);
  assert.match(slice(adminSource, 'const check = () => {', '};'), /status === 'expired'/);
});

// ---------------------------------------------------------------------------
// F-079: вход не зависит от загрузки списка статей

test('F-079: после принятого входа список статей грузится в фоне', () => {
  // Якорь — сама handleLogin: у окна повторного входа своя ветка result.ok.
  const okBranch = slice(slice(adminSource, 'const handleLogin = async', 'const handleTitleChange'), 'if (result.ok) {', '} else if (result.codeRequired)');
  assert.doesNotMatch(okBranch, /await forceRefreshAdminArticles/, 'вход не ждёт список');
  assert.ok(okBranch.indexOf('setIsAuthenticated(true)') < okBranch.indexOf('forceRefreshAdminArticles(password)'));
  assert.match(okBranch, /forceRefreshAdminArticles\(password\)\.catch\(/, 'отказ слышен тостом, а не экраном входа');
  assert.match(okBranch, /notify\.error\('Не удалось загрузить публикации'/);
});

// ---------------------------------------------------------------------------
// F-103: резервный код 2FA на телефоне

test('F-103: поле кода входа не открывает цифровую клавиатуру', () => {
  const loginCode = slice(adminSource, 'id="admin-2fa-code"', '/>');
  assert.match(loginCode, /inputMode="text"/);
  assert.doesNotMatch(loginCode, /inputMode="numeric"/);
  assert.match(loginCode, /autoCapitalize="none"/);
  assert.match(loginCode, /autoComplete="one-time-code"/, 'подсказка кода из приложения остаётся');
  const sessionCode = slice(adminSource, 'id="admin-session-code"', '/>');
  assert.match(sessionCode, /inputMode="text"/);
  const secCode = slice(securitySource, 'id="sec-code"', '/>');
  assert.match(secCode, /inputMode="text"/);
  // Подтверждение настройки принимает ровно шесть цифр — там numeric уместен.
  assert.match(slice(securitySource, 'id="sec-confirm"', '/>'), /inputMode="numeric"/);
});

// ---------------------------------------------------------------------------
// F-133: расписание не публикует задним числом

test('F-133: дата начала в прошлом отклоняется, сегодняшние слоты не раньше «сейчас»', async () => {
  const { planSchedule, ownerToday, ownerTomorrow, START_LEAD_MINUTES } = await bundle(['src/app/utils/publishSchedule.ts']);
  const seeded = (seed = 42) => {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
  };
  const slugs = Array.from({ length: 6 }, (_, index) => `a-${index + 1}`);
  // 1 октября 2026, 19:30 по Ташкенту = 14:30 UTC.
  const now = Date.UTC(2026, 9, 1, 14, 30);
  const base = { days: 3, perDay: 2, fromHour: 9, toHour: 21, shuffle: false, now, random: seeded() };

  assert.equal(ownerToday(now), '2026-10-01');
  assert.equal(ownerTomorrow(now), '2026-10-02');

  const past = planSchedule(slugs, { ...base, startDate: '2025-10-01' });
  assert.match(past.error, /уже прошла/);
  assert.equal(past.items.length, 0);
  assert.deepEqual(past.overflow, slugs, 'ни одна статья не ушла задним числом');

  const today = planSchedule(slugs, { ...base, startDate: '2026-10-01' });
  assert.equal(today.error, undefined);
  assert.equal(today.items.length, 6);
  const todayItems = today.items.filter((item) => item.localDate === '2026-10-01');
  assert.equal(todayItems.length, 2, 'первый день получает свои две статьи');
  for (const item of todayItems) {
    assert.ok(Date.parse(item.publishedAt) >= now + START_LEAD_MINUTES * 60_000, `${item.localTime} раньше, чем сейчас + ${START_LEAD_MINUTES} мин`);
    assert.ok(item.localTime < '21:00');
  }
  // Остальные дни окно не трогает.
  for (const item of today.items.filter((item) => item.localDate !== '2026-10-01')) {
    assert.ok(item.localTime >= '09:00' && item.localTime < '21:00', item.localTime);
  }

  // 20:30 по Ташкенту, окно до 21:00, две статьи с зазором 45 минут — не помещаются.
  const late = planSchedule(slugs, { ...base, startDate: '2026-10-01', now: Date.UTC(2026, 9, 1, 15, 30) });
  assert.match(late.error, /начните с завтра/);
  assert.equal(late.items.length, 0, 'молча выпускать статью в прошлом нельзя');

  // Завтра и дальше — как раньше.
  const tomorrow = planSchedule(slugs, { ...base, startDate: '2026-10-02' });
  assert.equal(tomorrow.error, undefined);
  assert.equal(tomorrow.items.length, 6);

  // Без `now` функция остаётся чистой: существующие тесты раскладки не зависят от календаря.
  const pure = planSchedule(slugs, { ...base, now: undefined, startDate: '2020-01-01' });
  assert.equal(pure.error, undefined);
});

test('F-133: панель передаёт «сейчас» и не даёт выбрать прошлую дату', () => {
  assert.match(schedulePanelSource, /now: Date\.now\(\)/);
  assert.match(schedulePanelSource, /type="date" min=\{ownerToday\(\)\}/);
});

// ---------------------------------------------------------------------------
// F-062: ссылки на свои страницы

test('F-062: ссылка на страницу услуги считается внутренней', async () => {
  const plural = await compilePlain('src/app/utils/plural.ts');
  const seo = await loadWithStubs('src/app/components/admin/SeoAssistant.tsx', { '/plural': plural });
  const count = seo.countInternalLinks;
  assert.equal(count('<a href="/meta-ads">услуга</a> <a href="/google-ads/">ещё</a> <a href=\'/consult\'>консультация</a>'), 3);
  assert.equal(count('<a href="/blog/x">статья</a><a href="https://www.whalewzrd.com/cases/y">кейс</a><a href="https://whalewzrd.com">главная</a>'), 3);
  // Служебные адреса, якоря, почта, телефон, чужие домены и «//host» — не внутренние.
  assert.equal(count('<a href="/api/articles">api</a><a href="/admin">админка</a><a href="/admin/content-preview">предпросмотр</a>'), 0);
  assert.equal(count('<a href="#faq">якорь</a><a href="mailto:a@b.c">почта</a><a href="tel:+998">тел</a><a href="https://example.com/blog">чужое</a><a href="//evil.com/x">схема</a>'), 0);
  assert.equal(count('<a href="/administrator-guide">не админка</a>'), 1);
  assert.equal(count(''), 0);

  const checks = seo.runChecks({ title: 'Заголовок', content: '<h2>x</h2><p><a href="/meta-ads">услуга</a></p>' });
  const links = checks.find((check) => check.id === 'links');
  assert.equal(links.level, 'ok');
  assert.equal(links.detail, '1 шт.');
  const noLinks = seo.runChecks({ title: 'Заголовок', content: '<p><a href="https://example.com">чужое</a></p>' }).find((check) => check.id === 'links');
  assert.equal(noLinks.level, 'warn');
});

test('Broken Link Checker: валидация ссылок выявляет битые 404, лишние слеши и опечатки в протоколе', async () => {
  const plural = await compilePlain('src/app/utils/plural.ts');
  const seo = await loadWithStubs('src/app/components/admin/SeoAssistant.tsx', { '/plural': plural });
  const { validateContentLinks, runChecks } = seo;

  const validHtml = '<p><a href="/meta-ads">Услуга</a> и <a href="/blog/hello-world">статья</a> и <a href="https://example.com">внешняя</a></p>';
  const validResult = validateContentLinks(validHtml, { knownSlugs: new Set(['hello-world']) });
  assert.equal(validResult.total, 3);
  assert.equal(validResult.internal, 2);
  assert.equal(validResult.external, 1);
  assert.equal(validResult.issues.length, 0);

  const brokenHtml = '<p><a href="/meta-ads/">Слеш</a> <a href="/blog/missing-404">Битая</a> <a href="htp://broken.com">Опечатка</a> <a href="http://insecure.com">Незащищённая</a></p>';
  const brokenResult = validateContentLinks(brokenHtml, { knownSlugs: new Set(['hello-world']) });
  assert.equal(brokenResult.issues.length, 4);

  const slashIssue = brokenResult.issues.find((i) => i.href === '/meta-ads/');
  assert.equal(slashIssue.level, 'warn');
  assert.match(slashIssue.reason, /Лишний завершающий слеш/);

  const missingIssue = brokenResult.issues.find((i) => i.href === '/blog/missing-404');
  assert.equal(missingIssue.level, 'fail');
  assert.match(missingIssue.reason, /404/);

  const typoIssue = brokenResult.issues.find((i) => i.href === 'htp://broken.com');
  assert.equal(typoIssue.level, 'fail');
  assert.match(typoIssue.reason, /Опечатка/);

  const insecureIssue = brokenResult.issues.find((i) => i.href === 'http://insecure.com');
  assert.equal(insecureIssue.level, 'warn');
  assert.match(insecureIssue.reason, /http:\/\//);

  // runChecks возвращает проверку 'link-health'
  const checks = runChecks({ content: brokenHtml }, { knownSlugs: new Set(['hello-world']) });
  const linkHealth = checks.find((c) => c.id === 'link-health');
  assert.ok(linkHealth);
  assert.equal(linkHealth.level, 'fail');
});

// ---------------------------------------------------------------------------
// F-063: календарь не показывает черновики как вышедшие

test('F-063: черновики не попадают в сетку календаря, а подпись их называет', async () => {
  const render = await renderComponent('src/app/components/admin/ArticleCalendar.tsx');
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const noop = () => {};

  const draftsOnly = render({ onOpen: noop, articles: [
    { id: 1, slug: 'd1', title: 'Черновик 1', status: 'draft', publishedAt: hourAgo },
    { id: 2, slug: 'd2', title: 'Черновик 2', status: 'draft', publishedAt: hourAgo },
  ] });
  assert.doesNotMatch(draftsOnly, /data-has=/, 'у дня с одними черновиками точки нет');
  assert.match(draftsOnly, /Черновиков вне сетки: 2/, 'черновики не исчезают молча');
  assert.doesNotMatch(draftsOnly, /Без точной даты публикации/, 'черновики не считаются «без даты»');

  const published = render({ onOpen: noop, articles: [
    { id: 3, slug: 'p1', title: 'Вышла', status: 'published', publishedAt: hourAgo },
    { id: 4, slug: 'd3', title: 'Черновик', status: 'draft', publishedAt: hourAgo },
    { id: 5, slug: 'p2', title: 'Без даты', status: 'published' },
  ] });
  assert.equal((published.match(/data-has="published"/g) || []).length, 1, 'вышедшая статья даёт одну точку');
  assert.match(published, /публикаций — 1"/, 'в клетке считается только вышедшая, не черновик рядом');
  assert.match(published, /Без точной даты публикации: 1/);
  assert.match(published, /Черновиков вне сетки: 1/);
});

// ---------------------------------------------------------------------------
// F-009: использование файла — по данным сервера

test('F-009: медиатека верит серверу об использовании файла, список статей — запасной вариант', async () => {
  const media = await loadWithStubs('src/app/components/admin/AdminMedia.tsx');
  const file = { key: 'uploads/2026-09-01/pic--1200x800.webp', url: 'https://pub.r2.dev/uploads/2026-09-01/pic--1200x800.webp' };
  // Список в админке приходит без текстов: картинка из текста статьи по нему не видна.
  const summaries = [
    { id: 1, slug: 'cover', title: 'С обложкой', image: file.url, _summary: true },
    { id: 2, slug: 'inline', title: 'С картинкой в тексте', image: '', content: '', _summary: true },
  ];
  assert.deepEqual(media.referencesForFile(file, summaries), ['С обложкой']);
  // Сервер посчитал по полным текстам — его ответ главный, даже пустой.
  assert.deepEqual(media.referencesForFile({ ...file, usage: ['С обложкой', 'С картинкой в тексте'] }, summaries), ['С обложкой', 'С картинкой в тексте']);
  assert.deepEqual(media.referencesForFile({ ...file, usage: [] }, summaries), []);
  assert.match(mediaSource, /usage\?: string\[\]/);
  assert.match(mediaSource, /referencesForFile\(file, articles\)/);
});


// ---------------------------------------------------------------------------
// Фоновая сборка Cloudflare Pages: статус сборки в реальном времени

test('CMS: фоновая сборка Cloudflare Pages отображается бейджами «Сборка в процессе» и «Сборка завершена»', () => {
  assert.match(contentControlSource, /type PagesBuildState\s*=/, 'определены типы состояния сборки');
  assert.match(contentControlSource, /STORAGE_KEY_BUILD = 'ww_pages_build_state'/, 'состояние сборки кэшируется в localStorage');
  assert.match(contentControlSource, /PAGES_BUILD_ESTIMATED_SECONDS = 90/, 'таймаут фоновой сборки Cloudflare Pages зафиксирован');
  assert.match(contentControlSource, /action === 'publish' && payload\.seoBuild\?\.triggered/, 'старт сборки слушает ответ seoBuild.triggered');
  assert.match(contentControlSource, /Сборка в процессе \(\{Math\.max\(0, PAGES_BUILD_ESTIMATED_SECONDS/, 'бейдж процесса с обратным отсчётом');
  assert.match(contentControlSource, /Сборка завершена/, 'бейдж успешного завершения сборки');
  assert.match(contentControlSource, /Сбой сборки/, 'бейдж ошибки вызова Deploy Hook');
});

// ---------------------------------------------------------------------------
// Оффлайн-черновики и защита от потери данных в редакторе сайта

test('CMS: оффлайн-черновики страниц сохраняются в localStorage и предлагают восстановление', async () => {
  const contentControl = await loadWithStubs('src/app/components/admin/AdminContentControl.tsx');
  assert.equal(contentControl.siteContentBackupKey('page_meta_ads'), 'ww_site_content_backup:page_meta_ads');

  const storage = fakeStorage();
  const sampleBackup = {
    key: 'page_meta_ads',
    page: 'meta-ads',
    label: 'Meta Ads',
    content: { hero: { titlePrefix: 'Тест', titleAccent: 'Акцент', titleLines: [] } },
    savedAt: 1700000000000,
  };
  storage.setItem(contentControl.siteContentBackupKey('page_meta_ads'), JSON.stringify(sampleBackup));

  const read = contentControl.readSiteContentBackups(storage);
  assert.equal(read.length, 1);
  assert.equal(read[0].key, 'page_meta_ads');
  assert.equal(read[0].page, 'meta-ads');
  assert.equal(read[0].content.hero.titlePrefix, 'Тест');

  assert.match(contentControlSource, /SITE_CONTENT_BACKUP_PREFIX = 'ww_site_content_backup:'/);
  assert.match(contentControlSource, /Найден локальный автосохранённый черновик/);
  assert.match(contentControlSource, /Локальный черновик восстановлен/);
});

// ---------------------------------------------------------------------------
// Фаза 1: Сворачиваемый сайдбар, плавающая панель и селектор полей CRM

test('F-PHASE1-NAV: сворачиваемый сайдбар, хоткей Ctrl+[, бейджи черновиков и data-sidebar-collapsed', () => {
  assert.match(adminSource, /ww-admin-sidebar-collapsed/, 'состояние сайдбара сохраняется в localStorage');
  assert.match(adminSource, /data-sidebar-collapsed={sidebarCollapsed \? 'true' : 'false'}/, 'data-атрибут управляет шириной');
  assert.match(adminSource, /e\.key === '\['/, 'глобальный хоткей Ctrl+[ / Cmd+[');
  assert.match(adminSource, /AdminSidebarCollapseButton/, 'кнопка сворачивания встроена в сайдбар');
  assert.match(adminSource, /admin-sidebar__badge/, 'бейдж черновиков отображается на статьях');
});

test('F-PHASE1-CRM: плавающая панель массовых действий (Floating Action Bar), сброс по Escape и селектор полей карточки', async () => {
  const leadsSource = await source('src/app/components/admin/AdminLeads.tsx');
  assert.match(leadsSource, /admin-floating-bulk/, 'плавающая панель массовых действий');
  assert.match(leadsSource, /event\.key === 'Escape'/, 'сброс выделения по нажатию Escape');
  assert.match(leadsSource, /ww-crm-card-fields/, 'настройки видимости полей карточки сохраняются');
  assert.match(leadsSource, /admin-crm-fields-popover/, 'всплывающее меню настройки полей');
});

test('F-PHASE2-CRM: Slide-over Drawer, воронка-степпер, календарь касаний и зависшие сделки', async () => {
  const stepperSource = await source('src/app/components/admin/PipelineStepper.tsx');
  assert.match(stepperSource, /export function isDealStale/, 'функция выявления зависших сделок экспортирована');
  assert.match(stepperSource, /admin-pipeline-stepper/, 'мини-степпер этапов воронки');

  const leadsSource = await source('src/app/components/admin/AdminLeads.tsx');
  assert.match(leadsSource, /admin-drawer-portal/, 'Slide-over Drawer для карточки сделки');
  assert.match(leadsSource, /admin-drawer-backdrop/, 'backdrop для закрытия Drawer');
  assert.match(leadsSource, /CrmCalendar/, 'компонент календаря касаний подключен');
  assert.match(leadsSource, /value: 'calendar'/, 'вид календарь добавлен в CRM_VIEWS');

  const boardSource = await source('src/app/components/admin/CrmBoard.tsx');
  assert.match(boardSource, /PipelineStepper/, 'степпер воронки встроен в карточку доски');
  assert.match(boardSource, /crm-card__stale/, 'метка зависшей сделки в карточке доски');
});

// ---------------------------------------------------------------------------
// Фаза 3: Витрина статей, сплит-превью, визуальный Diff и управление секциями

test('F-PHASE3-CONTENT: витрина статей, сплит-превью, визуальный Diff и управление секциями', async () => {
  // 1. Пункт 10: витрина статей
  assert.match(adminSource, /AdminArticleCard/, 'карточка витрины экспортирована');
  assert.match(adminSource, /ww_admin_articles_view/, 'режим витрины сохраняется в localStorage');
  assert.match(adminSource, /admin-article-grid/, 'CSS-сетка карточек витрины');
  assert.match(adminSource, /articleSort/, 'мультисортировка статей');

  // 2. Пункт 11: сплит-превью в редакторе
  const editorSource = await source('src/app/components/ArticleEditor.tsx');
  assert.match(editorSource, /ww_editor_view_mode/, 'режим редактора сохраняется в localStorage');
  assert.match(editorSource, /admin-editor-split-layout/, 'двухколоночный сплит-лейаут');
  assert.match(editorSource, /previewViewport/, 'переключатель вьюпорта устройств');

  // 3. Пункт 12: визуальный Diff
  assert.match(contentControlSource, /AdminContentDiffModal/, 'модальное окно визуального diff');
  assert.match(contentControlSource, /computeSectionDiff/, 'расчёт различий между версиями');
  assert.match(contentControlSource, /Сравнить \(Diff\)/, 'кнопка вызова Diff в тулбаре');

  // 4. Пункт 13: порядок секций и скрытие (глазок)
  assert.match(contentControlSource, /toggleSectionVisibility/, 'переключатель видимости секций');
  assert.match(contentControlSource, /moveSection/, 'изменение порядка секций');
  assert.match(contentControlSource, /hiddenSections/, 'массив скрытых секций');
  assert.match(contentControlSource, /sectionOrder/, 'порядок секций');
});


// ---------------------------------------------------------------------------
// Фаза 4: Глобальная палитра, горячие клавиши, CRM чипсы, 1-тап действия, медиатека и скелетоны

test('F-PHASE4-ALL: палитра расширена, справка по ?, чипсы CRM, 1-тап действия, сетка медиатеки и скелетоны', async () => {
  // 1. Пункт 14 & 15: Палитра и Горячие клавиши
  const shortcutsSource = await source('src/app/components/admin/AdminShortcutsModal.tsx');
  assert.match(shortcutsSource, /ADMIN_SHORTCUT_GROUPS/, 'группы шорткатов объявлены');
  assert.match(shortcutsSource, /useAdminKeyboardShortcuts/, 'хук глобальных горячих клавиш');
  assert.match(shortcutsSource, /event\.key === '\?'/, 'справка по знаку вопроса');
  assert.match(adminSource, /AdminShortcutsModal/, 'модальное окно горячих клавиш вмонтировано');
  assert.match(adminSource, /heading: 'CRM и Сделки'/, 'группа CRM в командной палитре');
  assert.match(adminSource, /heading: 'Медиатека и файлы'/, 'группа Медиатеки в командной палитре');
  assert.match(adminSource, /admin-topbar__shortcuts/, 'кнопка вызова клавиш в шапке');

  // 2. Пункт 16 & 19: CRM Чипсы и 1-тап действия
  const leadsSource = await source('src/app/components/admin/AdminLeads.tsx');
  assert.match(leadsSource, /admin-crm-chips/, 'чипсы фильтрации в CRM');
  assert.match(leadsSource, /admin-crm-chip--reset/, 'кнопка сброса фильтров в чипсах');
  assert.match(leadsSource, /admin-crm-quick-btn--call/, 'быстрый звонок в один тап');
  assert.match(leadsSource, /admin-crm-quick-btn--wa/, 'быстрый WhatsApp в один тап');
  assert.match(leadsSource, /admin-crm-quick-btn--tg/, 'быстрый Telegram в один тап');

  // 3. Пункт 17: Масштабируемая сетка медиатеки
  const mediaSource = await source('src/app/components/admin/AdminMedia.tsx');
  assert.match(mediaSource, /ww_admin_media_grid_size/, 'размер сетки сохраняется в localStorage');
  assert.match(mediaSource, /media-grid-size-toggle/, 'переключатель размера сетки');
  assert.match(mediaSource, /media-heavy-toggle/, 'фильтр тяжелее 500 КБ');
  assert.match(mediaSource, /media-grid--\$\{gridSize\}/, 'динамический класс размера сетки');

  // 4. Пункт 18: Спарклайны в AdminToday
  const todaySource = await source('src/app/components/admin/AdminToday.tsx');
  assert.match(todaySource, /sparkSlot=\{3\}/, 'четвертая плитка несет спарклайн');

  // 5. Пункт 20: Контурные скелетоны
  const feedbackSource = await source('src/app/components/admin/AdminFeedback.tsx');
  assert.match(feedbackSource, /export function AdminDetailSkeleton/, 'компонент детального скелетона');
  assert.match(leadsSource, /AdminDetailSkeleton/, 'LeadDetail использует AdminDetailSkeleton');
  const clientsSource = await source('src/app/components/admin/AdminClients.tsx');
  assert.match(clientsSource, /AdminDetailSkeleton/, 'AdminClients использует AdminDetailSkeleton');
});


// ---------------------------------------------------------------------------
// Блок 2 / Модуль 1: Сквозная UTM-аналитика и когортная воронка

test('B2-M1-ATTRIBUTION: каскад конверсий, битва каналов, когортная матрица и копирование UTM', async () => {
  const visualProSource = await source('src/app/components/admin/AttributionVisualPro.tsx');
  assert.match(visualProSource, /export function ConversionCascade/, 'компонент каскада конверсий и отсева');
  assert.match(visualProSource, /export function ChannelBattleCards/, 'компонент битвы рекламных каналов');
  assert.match(visualProSource, /export function CohortHeatmapMatrix/, 'компонент когортной тепловой матрицы');
  assert.match(visualProSource, /export function CopyUtmCell/, 'компонент копирования UTM');
  assert.match(visualProSource, /aggregateChannels/, 'функция группировки трафика по каналам');

  const attrSource = await source('src/app/components/admin/AdminAttribution.tsx');
  assert.match(attrSource, /ConversionCascade/, 'каскад воронки вмонтирован в аналитику');
  assert.match(attrSource, /ChannelBattleCards/, 'карточки каналов вмонтированы');
  assert.match(attrSource, /CohortHeatmapMatrix/, 'когортная матрица вмонтирована');
  assert.match(attrSource, /CopyUtmCell/, 'копирование UTM подключено в ячейки таблицы');
  assert.match(attrSource, /tableFilter === 'romi'/, 'быстрый фильтр положительного ROMI');
});


// ---------------------------------------------------------------------------
// Блок 2 / Модуль 3: Google Search Console & SEO Monitoring

test('B2-M3-GSC: Search Console API, KPI-плитки, векторный график, запросы, точки роста и каннибализация', async () => {
  const gscApiSource = await source('functions/api/admin/search-console.ts');
  assert.match(gscApiSource, /export async function onRequestGet/, 'Эндпоинт GET для данных GSC');
  assert.match(gscApiSource, /export async function onRequestPost/, 'Эндпоинт POST для сохранения ключа');
  assert.match(gscApiSource, /getDemoDataset/, 'Реалистичный демо-датасет для whalewzrd.com');

  const gscUiSource = await source('src/app/components/admin/AdminSearchConsole.tsx');
  assert.match(gscUiSource, /export default function AdminSearchConsole/, 'Компонент AdminSearchConsole экспортирован');
  assert.match(gscUiSource, /GscSvgChart/, 'Векторный интерактивный график поискового спроса');
  assert.match(gscUiSource, /activeTab === 'queries'/, 'Вкладка поисковых запросов');
  assert.match(gscUiSource, /activeTab === 'pages'/, 'Вкладка посадочных страниц');
  assert.match(gscUiSource, /activeTab === 'growth'/, 'Вкладка точек роста и каннибализации');
  assert.match(gscUiSource, /activeTab === 'setup'/, 'Вкладка подключения Google API');
  assert.match(gscUiSource, /admin-gsc-opp-card/, 'Карточки точек роста (Low-hanging fruits)');
  assert.match(gscUiSource, /admin-gsc-cann-card/, 'Детектор каннибализации поисковых запросов');

  const adminSource = await source('src/app/pages/Admin.tsx');
  assert.match(adminSource, /const AdminSearchConsole = lazy/, 'Ленивый импорт AdminSearchConsole');
  assert.match(adminSource, /key: 'seo', label: 'SEO и Поиск'/, 'Пункт SEO и Поиск в навигации');
  assert.match(adminSource, /adminView === 'seo' && <AdminSearchConsole/, 'Рендер раздела seo');
  assert.match(adminSource, /seo: \['поиск', 'google', 'search console'/, 'Ключевые слова для палитры Ctrl+K');

  const adminUiCss = await source('src/styles/admin-ui.css');
  assert.match(adminUiCss, /admin-gsc-container/, 'Стили контейнера GSC');
  assert.match(adminUiCss, /admin-gsc-kpi-grid/, 'Сетка KPI-плиток');
  assert.match(adminUiCss, /admin-gsc-table/, 'Стили таблицы запросов');
});

// ---------------------------------------------------------------------------
// Блок 2 / Модуль 4: Smart Cropper & Image Resizer в медиатеке

test('B2-M4-CROPPER: Smart Cropper модалка, пропорции кадрирования, экспорт WebP и интеграция в AdminMedia', async () => {
  const cropperSource = await source('src/app/components/admin/MediaCropperModal.tsx');
  assert.match(cropperSource, /export default function MediaCropperModal/, 'Компонент MediaCropperModal экспортирован');
  assert.match(cropperSource, /16:9/, 'Пресет 16:9 для обложек и баннеров');
  assert.match(cropperSource, /1:1/, 'Пресет 1:1 для квадратных аватаров и карточек');
  assert.match(cropperSource, /4:5/, 'Пресет 4:5 для постов Meta Feed');
  assert.match(cropperSource, /9:16/, 'Пресет 9:16 для Stories/Reels');
  assert.match(cropperSource, /image\/webp/, 'Экспорт в оптимизированный формат WebP');
  assert.match(cropperSource, /canvasRef/, 'Холст кадрирования');

  const mediaSource = await source('src/app/components/admin/AdminMedia.tsx');
  assert.match(mediaSource, /MediaCropperModal/, 'MediaCropperModal импортирован в AdminMedia');
  assert.match(mediaSource, /croppingFile/, 'Стейт выбранного файла для кадрирования');
  assert.match(mediaSource, /onSave=\{async \(croppedFile\)/, 'Обработчик сохранения кадрированного изображения');

  const adminUiCss = await source('src/styles/admin-ui.css');
  assert.match(adminUiCss, /admin-cropper-modal/, 'Стили модального окна кадрирования');
  assert.match(adminUiCss, /admin-cropper-canvas/, 'Стили канваса кроппера');
  assert.match(adminUiCss, /admin-cropper-preset-btn/, 'Стили кнопок пресетов пропорций');
});

// ---------------------------------------------------------------------------
// Блок 2 / Модуль 5: Launchpad — Интерактивные чек-листы запуска рекламы

test('B2-M5-LAUNCHPAD: Чек-листы запуска рекламы, шаблоны Meta/Google, префлайт-отчет, критичные блокираторы и навигация', async () => {
  const launchpadSource = await source('src/app/components/admin/AdminLaunchpad.tsx');
  assert.match(launchpadSource, /export default function AdminLaunchpad/, 'Компонент AdminLaunchpad экспортирован');
  assert.match(launchpadSource, /meta_leads/, 'Шаблон чек-листа Meta Ads Лидогенерация');
  assert.match(launchpadSource, /google_search/, 'Шаблон чек-листа Google Ads');
  assert.match(launchpadSource, /express_audit/, 'Шаблон экспресс-аудита клиента');
  assert.match(launchpadSource, /handleCopyReport/, 'Функция генерации и копирования префлайт-отчета');
  assert.match(launchpadSource, /hasCriticalPending/, 'Контроль критических блокираторов');

  const adminSource = await source('src/app/pages/Admin.tsx');
  assert.match(adminSource, /const AdminLaunchpad = lazy/, 'Ленивый импорт AdminLaunchpad');
  assert.match(adminSource, /key: 'launchpad', label: 'Чек-листы запуска', icon: Rocket/, 'Пункт в навигации админки');
  assert.match(adminSource, /adminView === 'launchpad' && <AdminLaunchpad/, 'Рендер раздела launchpad');
  assert.match(adminSource, /launchpad: \['запуск', 'чек-лист', 'префлайт'/, 'Ключевые слова для палитры Ctrl+K');

  const adminUiCss = await source('src/styles/admin-ui.css');
  assert.match(adminUiCss, /admin-launchpad-container/, 'Стили контейнера launchpad');
  assert.match(adminUiCss, /admin-launchpad-template-card/, 'Стили карточек шаблонов');
  assert.match(adminUiCss, /admin-launchpad-progress-bar-fill/, 'Стили прогресс-бара готовности');
  assert.match(adminUiCss, /admin-launchpad-item/, 'Стили пунктов чек-листа');
});

// ---------------------------------------------------------------------------
// Блок 2 / Модуль 7: Калькулятор юнит-экономики и медиапланирования

test('B2-M7-UNIT-ECONOMICS: Калькулятор юнит-экономики, воронка CPL/CAC, пресеты ниш, LTV/CAC и медиаплан', async () => {
  const econSource = await source('src/app/components/admin/AdminUnitEconomics.tsx');
  assert.match(econSource, /export default function AdminUnitEconomics/, 'Компонент AdminUnitEconomics экспортирован');
  assert.match(econSource, /b2b_service/, 'Пресет B2B услуги');
  assert.match(econSource, /ecom/, 'Пресет E-commerce');
  assert.match(econSource, /local_clinic/, 'Пресет локальной клиники');
  assert.match(econSource, /real_estate/, 'Пресет недвижимости');
  assert.match(econSource, /dealsNeeded/, 'Расчет требуемых продаж');
  assert.match(econSource, /leadsNeeded/, 'Расчет требуемых лидов');
  assert.match(econSource, /calculatedCpl/, 'Расчет стоимости лида CPL');
  assert.match(econSource, /ltvCacRatio/, 'Расчет соотношения LTV/CAC');
  assert.match(econSource, /breakEvenCpl/, 'Расчет порога безубыточного CPL');
  assert.match(econSource, /handleCopySummary/, 'Функция копирования медиаплана для клиента');

  const adminSource = await source('src/app/pages/Admin.tsx');
  assert.match(adminSource, /const AdminUnitEconomics = lazy/, 'Ленивый импорт AdminUnitEconomics');
  assert.match(adminSource, /key: 'unit_econ', label: 'Юнит-экономика', icon: Calculator/, 'Пункт в навигации админки');
  assert.match(adminSource, /adminView === 'unit_econ' && <AdminUnitEconomics/, 'Рендер раздела unit_econ');
  assert.match(adminSource, /unit_econ: \['юнит экономика', 'калькулятор'/, 'Ключевые слова для палитры Ctrl+K');

  const adminUiCss = await source('src/styles/admin-ui.css');
  assert.match(adminUiCss, /admin-unit-econ-container/, 'Стили контейнера юнит-экономики');
  assert.match(adminUiCss, /admin-unit-econ-kpi-grid/, 'Стили KPI-плиток');
  assert.match(adminUiCss, /admin-unit-econ-funnel-steps/, 'Стили шагов каскада воронки');
  assert.match(adminUiCss, /admin-unit-econ-advice-box/, 'Стили рекомендательного блока');
});

// ---------------------------------------------------------------------------
// Блок 2 / Модуль 8: Центр уведомлений и алертов в Telegram для критических событий

test('B2-M8-ALERTS: Интеграция AdminAlerts, кнопка колокольчика в топбаре, навигация и алерты Telegram', async () => {
  const alertsSource = await source('src/app/components/admin/AdminAlerts.tsx');
  assert.match(alertsSource, /export default function AdminAlerts/, 'Компонент AdminAlerts экспортирован');
  assert.match(alertsSource, /SEVERITY_UI/, 'Разметка уровней срочности (critical/attention/info)');
  assert.match(alertsSource, /action: 'notify'/, 'Действие отправки алертов в Telegram');
  assert.match(alertsSource, /action: 'dismiss'/, 'Действие скрытия алерта');

  const adminSource = await source('src/app/pages/Admin.tsx');
  assert.match(adminSource, /const AdminAlerts = lazy/, 'Ленивый импорт AdminAlerts');
  assert.match(adminSource, /key: 'alerts', label: 'Уведомления', icon: Bell/, 'Пункт в навигации админки');
  assert.match(adminSource, /admin-topbar__bell|navigateToAdminSection\('alerts'\)/, 'Кнопка колокольчика в топбаре');
  assert.match(adminSource, /adminView === 'alerts' && \(\s*<AdminAlerts/, 'Рендер раздела alerts');
  assert.match(adminSource, /alerts: \['уведомления', 'алерты'/, 'Ключевые слова для палитры Ctrl+K');

  const alertsApiSource = await source('functions/api/admin/alerts.ts');
  assert.match(alertsApiSource, /export const onRequestGet/, 'Эндпоинт GET для сбора алертов');
  assert.match(alertsApiSource, /export const onRequestPost/, 'Эндпоинт POST для уведомлений в Telegram');
});

// ---------------------------------------------------------------------------
// Блок 2 / Модуль 6: Журнал аудита действий (Audit Trail)

test('B2-M6-AUDIT: Журнал аудита CRM, история действий, экспорт в CSV и навигация', async () => {
  const auditApiSource = await source('functions/api/admin/audit.ts');
  assert.match(auditApiSource, /export const onRequestGet/, 'Эндпоинт GET для получения журнала аудита');
  assert.match(auditApiSource, /lead_activity/, 'Чтение из таблицы lead_activity');
  assert.match(auditApiSource, /getMockAuditTrail/, 'Демо-данные для локального окружения');

  const auditUiSource = await source('src/app/components/admin/AdminAuditTrail.tsx');
  assert.match(auditUiSource, /export default function AdminAuditTrail/, 'Компонент AdminAuditTrail экспортирован');
  assert.match(auditUiSource, /handleExportCsv/, 'Экспорт журнала действий в CSV');
  assert.match(auditUiSource, /formatTimeAgo/, 'Относительное время действий');
  assert.match(auditUiSource, /STATUS_NAMES/, 'Справочник названий статусов');

  const adminSource = await source('src/app/pages/Admin.tsx');
  assert.match(adminSource, /const AdminAuditTrail = lazy/, 'Ленивый импорт AdminAuditTrail');
  assert.match(adminSource, /key: 'audit', label: 'Журнал аудита', icon: History/, 'Пункт в навигации админки');
  assert.match(adminSource, /adminView === 'audit' && \(\s*<AdminAuditTrail/, 'Рендер раздела audit');
  assert.match(adminSource, /audit: \['аудит', 'журнал'/, 'Ключевые слова для палитры Ctrl+K');

  const adminUiCss = await source('src/styles/admin-ui.css');
  assert.match(adminUiCss, /admin-audit-container/, 'Стили контейнера аудита');
  assert.match(adminUiCss, /admin-audit-card/, 'Стили карточки события аудита');
  assert.match(adminUiCss, /admin-audit-actor-avatar/, 'Стили аватара исполнителя');
  assert.match(adminUiCss, /admin-audit-type-badge/, 'Стили бейджа типа действия');
});





