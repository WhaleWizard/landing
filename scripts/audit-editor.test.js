import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

/**
 * Находки построчного аудита в блочном редакторе статей (группа editor):
 * `ArticleEditor.tsx` и `CaseFieldsEditor.tsx`.
 *
 * Проверяется поведение настоящих компонентов: модули собираются esbuild в
 * памяти, редактор рисуется в jsdom, а тест смотрит на то же, что увидел бы
 * владелец, — текст в полях и HTML, который уходит родителю через onChange.
 * Разбор и сборка статьи проверяются на живых статьях из
 * `data/articles.build.json`: до и после круга «HTML → блоки → HTML» число
 * ссылок и выделений должно совпадать.
 */

const TMP_DIR = `${process.cwd()}/tmp/audit-editor`;
mkdirSync(TMP_DIR, { recursive: true });
after(() => rmSync(TMP_DIR, { recursive: true, force: true }));

// jsdom ставится до сборки модулей: react-dnd и DOMPurify смотрят на `window`
// в момент импорта.
const dom = new JSDOM('<!doctype html><html lang="ru"><body></body></html>', { url: 'https://www.whalewzrd.com/admin', pretendToBeVisual: true });
const { window } = dom;
for (const key of Object.getOwnPropertyNames(window)) {
  if (!/^[A-Z]/.test(key) || key in globalThis) continue;
  const value = window[key];
  if (typeof value === 'function') Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
for (const key of [
  'window', 'document', 'navigator', 'getComputedStyle', 'localStorage', 'sessionStorage', 'location', 'history',
  'matchMedia', 'self', 'requestAnimationFrame', 'cancelAnimationFrame', 'getSelection', 'DOMParser',
]) {
  if (key in window && (!(key in globalThis) || key === 'self')) {
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  }
}
if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
if (!globalThis.IntersectionObserver) globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Собирает модуль из исходников сайта. Пакеты из node_modules грузит сам Node — React один на всех. */
async function bundle(contents) {
  const result = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    packages: 'external',
    loader: { '.css': 'empty', '.json': 'json' },
    define: {
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.SSR': 'false',
      'import.meta.env.MODE': '"production"',
    },
    write: false,
    logLevel: 'silent',
  });
  const file = `${TMP_DIR}/${randomUUID()}.mjs`;
  writeFileSync(file, result.outputFiles[0].text);
  return import(file);
}

const { createElement, act, createRoot } = await bundle(`
  export { createElement, act } from 'react';
  export { createRoot } from 'react-dom/client';
`);

const editor = await bundle(`
  export { default as ArticleEditor, parseHtmlToBlocks, serializeBlocks, markdownToBlocks, blockToMarkdown } from './src/app/components/ArticleEditor';
  export { default as CaseFieldsEditor } from './src/app/components/CaseFieldsEditor';
`);

/** Рисует компонент в jsdom и возвращает корень вместе с контейнером. */
async function mount(Component, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(createElement(Component, props)); });
  return {
    container,
    root,
    async rerender(nextProps) { await act(async () => { root.render(createElement(Component, nextProps)); }); },
    async unmount() { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

async function click(element) {
  assert.ok(element, 'элемент для нажатия не найден');
  await act(async () => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); });
}

/** Ввод в управляемое поле React: значение ставится через родной сеттер, иначе React его не замечает. */
async function type(input, value) {
  assert.ok(input, 'поле для ввода не найдено');
  const proto = input instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
  await act(async () => { input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}

/** Ждёт настоящие миллисекунды — для синхронизации, отложенной через setTimeout (220 мс в редакторе). */
async function wait(ms) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

/** Нажатие клавиши: `code` — физическая клавиша, как и в редакторе (русская раскладка даёт другой `key`). */
async function press(target, init) {
  const event = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  await act(async () => { target.dispatchEvent(event); });
  return event;
}

const buttonByText = (container, text) => [...container.querySelectorAll('button')].find((node) => node.textContent.trim() === text);
const blockInputs = (container) => [...container.querySelectorAll('textarea[data-block-input]')];
const count = (html, needle) => html.split(needle).length - 1;

/** Спутник onChange: помнит все вызовы, последний HTML — в `last`. */
function changeSpy() {
  const calls = [];
  const spy = (html) => { calls.push(html); };
  spy.calls = calls;
  Object.defineProperty(spy, 'last', { get: () => calls[calls.length - 1] });
  return spy;
}

const liveArticles = JSON.parse(readFileSync(new URL('../data/articles.build.json', import.meta.url), 'utf8'));
const liveArticleList = Array.isArray(liveArticles) ? liveArticles : liveArticles.articles;

/* ---------------------------------------------------------------------- */
/* F-006 — ссылки, жирный и курсив переживают открытие в редакторе          */
/* ---------------------------------------------------------------------- */

const RICH_ARTICLE = [
  '<h2>Шаги</h2>',
  '<p>Смотрите <a href="/blog/retargeting">статью о ретаргетинге</a> и <strong>не спешите</strong> с <em>выводами</em>.</p>',
  '<ul><li><strong>Шаг 1:</strong> собрать данные</li><li><strong>Шаг 2:</strong> запустить</li></ul>',
  '<blockquote>Цитата с <a href="https://example.com">источником</a></blockquote>',
  '<p>Обычный абзац<br>со второй строкой</p>',
].join('\n');

test('F-006: круг «HTML → блоки → HTML» не теряет ссылки, жирный и курсив', () => {
  const { parseHtmlToBlocks, serializeBlocks } = editor;
  const blocks = parseHtmlToBlocks(RICH_ARTICLE);
  const output = serializeBlocks(blocks);
  for (const needle of ['<a ', '<strong>', '<em>']) {
    assert.equal(count(output, needle), count(RICH_ARTICLE, needle), `${needle} пропадает при разборе`);
  }
  assert.ok(output.includes('href="/blog/retargeting"'), 'внутренняя ссылка на месте');
  assert.ok(output.includes('<strong>Шаг 1:</strong>'), 'жирный подзаголовок шага на месте');

  // Блоки из чистого текста по-прежнему редактируются как текст, а не как HTML.
  const types = blocks.map((block) => block.type);
  assert.equal(types[0], 'heading');
  assert.equal(types[1], 'rawHtml', 'абзац со ссылкой хранится без потерь');
  assert.equal(types[2], 'rawHtml', 'список с жирными подзаголовками хранится без потерь');
  assert.equal(types[3], 'rawHtml');
  assert.equal(types[4], 'paragraph', 'абзац с одним <br> остаётся текстовым блоком');
  assert.equal(blocks[4].text, 'Обычный абзац\nсо второй строкой');
});

test('F-006: на живых статьях число <a>, <strong> и <em> до и после разбора совпадает', () => {
  const { parseHtmlToBlocks, serializeBlocks } = editor;
  assert.ok(liveArticleList.length > 0, 'есть статьи для проверки');
  let strongTotal = 0;
  for (const article of liveArticleList) {
    const output = serializeBlocks(parseHtmlToBlocks(article.content));
    for (const needle of ['<a ', '<strong', '<em']) {
      assert.equal(count(output, needle), count(article.content, needle), `${article.slug}: ${needle} теряется`);
    }
    strongTotal += count(article.content, '<strong');
  }
  assert.ok(strongTotal > 0, 'в живых статьях есть выделения — проверка не пустая');
});

test('F-006: открытие статьи и перерисовка родителя не вызывают onChange; правка блока — вызывает', async () => {
  const onChange = changeSpy();
  const view = await mount(editor.ArticleEditor, { content: RICH_ARTICLE, onChange });
  await wait(300);
  assert.equal(onChange.calls.length, 0, 'монтирование не переписывает статью');

  // Родитель перерисовался (например, владелец печатает заголовок) и передал новую функцию onChange.
  const another = changeSpy();
  await view.rerender({ content: RICH_ARTICLE, onChange: another });
  await wait(300);
  assert.equal(another.calls.length, 0, 'перерисовка родителя без правок не переписывает статью');

  // Настоящая правка последнего абзаца — уходит родителю, разметка остальных блоков цела.
  const inputs = blockInputs(view.container);
  const last = inputs[inputs.length - 1];
  await type(last, 'Обычный абзац\nсо второй строкой и правкой');
  await wait(300);
  assert.equal(another.calls.length, 1, 'правка блока уходит родителю один раз');
  assert.ok(another.last.includes('со второй строкой и правкой'));
  assert.equal(count(another.last, '<a '), count(RICH_ARTICLE, '<a '));
  assert.equal(count(another.last, '<strong>'), count(RICH_ARTICLE, '<strong>'));
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-008 — набранное в Markdown доходит до родителя и до «Сохранить»        */
/* ---------------------------------------------------------------------- */

const ACCENT_ARTICLE = '<h2 data-ww-block="heading" data-ww-tone="accent">Акцентный заголовок</h2>\n<p>Первый абзац.</p>';
const mdField = (container) => container.querySelector('textarea[aria-label="Markdown-разметка статьи"]');

test('F-008: текст, набранный в режиме Markdown, уходит родителю без кнопки «Применить разметку»', async () => {
  const onChange = changeSpy();
  const view = await mount(editor.ArticleEditor, { content: ACCENT_ARTICLE, onChange });
  await click(buttonByText(view.container, 'Markdown'));
  const field = mdField(view.container);
  assert.ok(field, 'поле Markdown открылось');
  assert.ok(field.value.includes('## Акцентный заголовок'));

  await type(field, `${field.value}\n\nНовый абзац из Markdown.`);
  await wait(300);
  assert.ok(onChange.calls.length >= 1, 'правка в Markdown дошла до родителя');
  assert.ok(onChange.last.includes('Новый абзац из Markdown.'), 'родитель получил набранный текст');
  assert.ok(onChange.last.includes('Акцентный заголовок'));
  assert.ok(mdField(view.container), 'режим Markdown при этом не закрылся');
  assert.ok(view.container.querySelector('.blog-article-content').textContent.includes('Новый абзац из Markdown.'), 'предпросмотр обновился');
  await view.unmount();
});

test('F-008: вход в Markdown и выход без правок не переписывают статью и не снимают акцент с заголовка', async () => {
  const onChange = changeSpy();
  const view = await mount(editor.ArticleEditor, { content: ACCENT_ARTICLE, onChange });
  await click(buttonByText(view.container, 'Markdown'));
  await wait(300);
  await click(buttonByText(view.container, 'Визуальный'));
  await wait(300);
  assert.equal(onChange.calls.length, 0, 'переключение туда-обратно — не правка');
  assert.ok(view.container.querySelector('.blog-article-content h2[data-ww-tone="accent"]'), 'акцентный тон заголовка на месте');
  await view.unmount();
});

test('F-008: потеря фокуса полем Markdown применяет текст сразу — «Сохранить» не опередит задержку', async () => {
  const onChange = changeSpy();
  const view = await mount(editor.ArticleEditor, { content: ACCENT_ARTICLE, onChange });
  await click(buttonByText(view.container, 'Markdown'));
  const field = mdField(view.container);
  await act(async () => { field.focus(); });
  await type(field, `${field.value}\n\nСтрока перед самым сохранением.`);
  assert.equal(onChange.calls.length, 0, 'до задержки родитель ещё не получил текст');
  await act(async () => { field.blur(); });
  assert.ok(onChange.calls.length >= 1, 'blur применил Markdown без ожидания');
  assert.ok(onChange.last.includes('Строка перед самым сохранением.'));
  await view.unmount();
});

test('F-008: в режиме Markdown палитра «Добавить блок» и отмена выключены — блок не затрётся синхронизацией', async () => {
  const onChange = changeSpy();
  const view = await mount(editor.ArticleEditor, { content: ACCENT_ARTICLE, onChange });
  const palette = () => [...view.container.querySelectorAll('.admin-block-palette button')];
  assert.ok(palette().length > 0);
  assert.ok(palette().every((button) => !button.disabled), 'в визуальном режиме палитра активна');
  await click(buttonByText(view.container, 'Markdown'));
  assert.ok(palette().every((button) => button.disabled), 'в Markdown палитра выключена');
  assert.ok(view.container.querySelector('button[aria-label="Отменить изменение"]').disabled);
  await click(buttonByText(view.container, 'Визуальный'));
  assert.ok(palette().every((button) => !button.disabled), 'после возврата палитра снова активна');
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-022 — вставка из буфера                                               */
/* ---------------------------------------------------------------------- */

/** Событие вставки с буфером: jsdom не умеет ClipboardEvent, React читает `clipboardData` с самого события. */
async function paste(target, data) {
  const event = new window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (kind) => data[kind] || '' } });
  await act(async () => { target.dispatchEvent(event); });
  return event;
}

test('F-022: обычная вставка текста отдаётся браузеру — она встаёт по курсору, а не в конец абзаца', async () => {
  const onChange = changeSpy();
  const view = await mount(editor.ArticleEditor, { content: '<p>Первый абзац.</p>', onChange });
  const [input] = blockInputs(view.container);

  const plainOnly = await paste(input, { 'text/plain': 'замена' });
  assert.equal(plainOnly.defaultPrevented, false, 'чистый текст вставляет браузер');
  assert.equal(input.value, 'Первый абзац.', 'обработчик ничего не дописал в конец');

  // Абзац из Google Docs или с сайта: текст с иконкой — тоже браузеру, а не «не вставляется вовсе».
  const withIcon = await paste(input, {
    'text/html': '<p>Абзац с иконкой <img src="https://cdn.example.com/icon.png" alt=""> и текстом</p>',
    'text/plain': 'Абзац с иконкой и текстом',
  });
  assert.equal(withIcon.defaultPrevented, false, 'текст с картинкой вставляет браузер');
  assert.ok(blockInputs(view.container).length === 1, 'блок остался текстовым');
  await view.unmount();
});

test('F-022: одна картинка без текста в буфере превращает блок в изображение', async () => {
  const onChange = changeSpy();
  const view = await mount(editor.ArticleEditor, { content: '<p>Первый абзац.</p>', onChange });
  const [input] = blockInputs(view.container);
  const event = await paste(input, { 'text/html': '<meta charset="utf-8"><img src="https://cdn.example.com/scheme.png" alt="Схема воронки">', 'text/plain': '' });
  assert.equal(event.defaultPrevented, true, 'вставку картинки обрабатывает редактор');
  const url = view.container.querySelector('input[aria-label="URL изображения"]');
  assert.ok(url, 'блок стал изображением (раньше менялся только imageUrl у абзаца, и картинка не появлялась)');
  assert.equal(url.value, 'https://cdn.example.com/scheme.png');
  assert.equal(view.container.querySelector('input[aria-label="Альтернативный текст изображения"]').value, 'Схема воронки');
  await wait(300);
  assert.ok(onChange.last?.includes('data-ww-block="image"'), 'родитель получил блок-картинку');
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-023 — режим Markdown не переживает переход к другой статье              */
/* ---------------------------------------------------------------------- */

test('F-023: открытие другой статьи закрывает Markdown и показывает её текст, а не предыдущей', async () => {
  const onChange = changeSpy();
  const view = await mount(editor.ArticleEditor, { content: '<p>Текст статьи А.</p>', onChange });
  await click(buttonByText(view.container, 'Markdown'));
  const field = mdField(view.container);
  await type(field, 'Текст статьи А с правкой.');
  await wait(300);
  assert.ok(onChange.last.includes('Текст статьи А с правкой.'));

  // Родитель применил правку: это локальная синхронизация, режим остаётся.
  await view.rerender({ content: onChange.last, onChange });
  assert.ok(mdField(view.container), 'своя правка не закрывает Markdown');

  // Владелец открыл статью Б из списка.
  const another = changeSpy();
  await view.rerender({ content: '<p>Текст статьи Б.</p>', onChange: another });
  assert.equal(mdField(view.container), null, 'режим Markdown закрыт');
  assert.deepEqual(blockInputs(view.container).map((input) => input.value), ['Текст статьи Б.'], 'на экране текст статьи Б');
  await wait(300);
  assert.equal(another.calls.length, 0, 'статья Б не переписана текстом А');

  // «Markdown» на статье Б показывает её собственный текст.
  await click(buttonByText(view.container, 'Markdown'));
  assert.equal(mdField(view.container).value, 'Текст статьи Б.');
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-059 — метрики кейса не прыгают между полями                            */
/* ---------------------------------------------------------------------- */

test('F-059: заполнение первой и третьей метрики не схлопывает третью во вторую', async () => {
  const calls = [];
  let value = { niche: 'Приложения' };
  const onChange = (next) => { calls.push(next); value = next; };
  const view = await mount(editor.CaseFieldsEditor, { value, niches: [], onChange });
  const metricValue = (n) => view.container.querySelector(`input[aria-label="Значение метрики ${n}"]`);

  await type(metricValue(1), '$1 млн+');
  await view.rerender({ value, niches: [], onChange });
  await type(metricValue(3), '4 года');
  await view.rerender({ value, niches: [], onChange });

  assert.equal(value.metrics.length, 3, 'все три слота хранятся, включая пустой средний');
  assert.equal(value.metrics[0].value, '$1 млн+');
  assert.deepEqual(value.metrics[1], { value: '', label: '' }, 'средний слот пуст, а не занят третьей метрикой');
  assert.equal(value.metrics[2].value, '4 года');
  assert.equal(metricValue(3).value, '4 года', 'введённое осталось в третьем поле');
  assert.equal(metricValue(2).value, '', 'во второе поле ничего не перескочило');

  // Стёрли всё — метрик нет, а не три пустых слота.
  await type(metricValue(1), '');
  await view.rerender({ value, niches: [], onChange });
  await type(metricValue(3), '');
  assert.equal(value.metrics, undefined);
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-064 — горячие клавиши из подсказки работают                            */
/* ---------------------------------------------------------------------- */

const THREE_PARAGRAPHS = '<p>Первый</p><p>Второй</p><p>Третий</p>';
const blockTexts = (container) => blockInputs(container).map((input) => input.value);

test('F-064: Alt+Shift+↑/↓ двигает выбранный блок, Ctrl+Z/Y вне поля ввода отменяет и возвращает', async () => {
  const onChange = changeSpy();
  const view = await mount(editor.ArticleEditor, { content: THREE_PARAGRAPHS, onChange });
  assert.deepEqual(blockTexts(view.container), ['Первый', 'Второй', 'Третий']);

  // Выбираем второй блок кликом по нему и двигаем вниз из его же поля.
  const second = blockInputs(view.container)[1];
  await click(second.closest('.admin-editor-block'));
  const down = await press(second, { code: 'ArrowDown', key: 'ArrowDown', altKey: true, shiftKey: true });
  assert.equal(down.defaultPrevented, true);
  assert.deepEqual(blockTexts(view.container), ['Первый', 'Третий', 'Второй'], 'блок уехал вниз');

  // Ctrl+Z в поле ввода — отмена набора браузером, блоки не трогаем.
  const inField = await press(blockInputs(view.container)[0], { code: 'KeyZ', key: 'я', ctrlKey: true });
  assert.equal(inField.defaultPrevented, false, 'в поле ввода Ctrl+Z остаётся браузеру');
  assert.deepEqual(blockTexts(view.container), ['Первый', 'Третий', 'Второй']);

  // После удаления блока фокус уходит на body — Ctrl+Z (на русской раскладке «я») возвращает порядок.
  const undo = await press(document.body, { code: 'KeyZ', key: 'я', ctrlKey: true });
  assert.equal(undo.defaultPrevented, true);
  assert.deepEqual(blockTexts(view.container), ['Первый', 'Второй', 'Третий'], 'Ctrl+Z вернул порядок');

  const redo = await press(document.body, { code: 'KeyY', key: 'н', ctrlKey: true });
  assert.equal(redo.defaultPrevented, true);
  assert.deepEqual(blockTexts(view.container), ['Первый', 'Третий', 'Второй'], 'Ctrl+Y повторил перемещение');

  // Cmd+Shift+Z на Mac — тоже возврат.
  await press(document.body, { code: 'KeyZ', key: 'z', metaKey: true });
  assert.deepEqual(blockTexts(view.container), ['Первый', 'Второй', 'Третий']);
  await press(document.body, { code: 'KeyZ', key: 'Z', metaKey: true, shiftKey: true });
  assert.deepEqual(blockTexts(view.container), ['Первый', 'Третий', 'Второй']);

  // Удалённый блок возвращается по Ctrl+Z — сценарий находки.
  await click(view.container.querySelectorAll('button[aria-label="Удалить блок"]')[2]);
  assert.deepEqual(blockTexts(view.container), ['Первый', 'Третий']);
  await press(document.body, { code: 'KeyZ', key: 'я', ctrlKey: true });
  assert.deepEqual(blockTexts(view.container), ['Первый', 'Третий', 'Второй'], 'удалённый блок вернулся');
  await view.unmount();
});

test('F-064: в режиме Markdown сочетания блоков молчат, подсказка обещает только то, что есть', async () => {
  const onChange = changeSpy();
  const view = await mount(editor.ArticleEditor, { content: THREE_PARAGRAPHS, onChange });
  await click(blockInputs(view.container)[0].closest('.admin-editor-block'));
  await click(buttonByText(view.container, 'Markdown'));
  const field = mdField(view.container);
  const move = await press(field, { code: 'ArrowDown', key: 'ArrowDown', altKey: true, shiftKey: true });
  assert.equal(move.defaultPrevented, false);
  const undo = await press(document.body, { code: 'KeyZ', key: 'z', ctrlKey: true });
  assert.equal(undo.defaultPrevented, false);
  await click(buttonByText(view.container, 'Визуальный'));
  assert.deepEqual(blockTexts(view.container), ['Первый', 'Второй', 'Третий'], 'в Markdown блоки не двигались');

  const hint = view.container.querySelector('.admin-meta').textContent;
  for (const promised of ['Alt+Shift+↑/↓', 'Ctrl+Enter', 'Ctrl+Z/Y']) assert.ok(hint.includes(promised), `подсказка упоминает ${promised}`);
  assert.ok(hint.includes('не в поле ввода'), 'подсказка объясняет, когда работает отмена');
  await view.unmount();
});
