import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

/**
 * Находки построчного аудита в интерфейсе админки: заявки, клиенты, финансы,
 * планер, «Сегодня» (группа admin-crm-ui).
 *
 * Проверяется поведение настоящих компонентов и их помощников: модули
 * собираются esbuild в памяти, компоненты рисуются в jsdom с подменённым
 * `fetch`, и тест смотрит на то же, что увидел бы владелец, — текст на экране
 * и тело запроса к серверу. Даты считаются от «сейчас», чтобы тесты не
 * зависели от дня запуска.
 */

// Часовой пояс выбирается так, чтобы местная дата прямо сейчас отличалась от
// даты по Гринвичу: до полудня UTC — пояс UTC−12 (там ещё вчера), после — UTC+14
// (там уже завтра). Так проверка «даты по местному календарю, а не по UTC»
// (F-068) не зависит от времени запуска.
process.env.TZ = new Date().getUTCHours() < 12 ? 'Etc/GMT+12' : 'Etc/GMT-14';

const TMP_DIR = `${process.cwd()}/tmp/audit-admin-crm-ui`;
mkdirSync(TMP_DIR, { recursive: true });
after(() => rmSync(TMP_DIR, { recursive: true, force: true }));

// jsdom ставится до сборки модулей: часть библиотек (motion, react-dnd)
// смотрит на `window` в момент импорта.
const dom = new JSDOM('<!doctype html><html lang="ru"><body></body></html>', { url: 'https://www.whalewzrd.com/admin', pretendToBeVisual: true });
const { window } = dom;
// Все конструкторы DOM (HTMLElement, DocumentFragment, Range…) и окно целиком:
// Radix и React смотрят на них по глобальному имени.
for (const key of Object.getOwnPropertyNames(window)) {
  if (!/^[A-Z]/.test(key) || key in globalThis) continue;
  const value = window[key];
  if (typeof value === 'function') Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
for (const key of [
  'window', 'document', 'navigator', 'getComputedStyle', 'localStorage', 'sessionStorage', 'location', 'history',
  'matchMedia', 'self', 'requestAnimationFrame', 'cancelAnimationFrame', 'getSelection',
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

const reactModule = await bundle(`
  export { createElement, act } from 'react';
  export { createRoot } from 'react-dom/client';
`);
const { createElement, act, createRoot } = reactModule;

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

async function submit(form) {
  assert.ok(form, 'форма не найдена');
  await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
}

/** Ждёт, пока отработают обещания эффектов (несколько тиков микрозадач). */
async function settle(ticks = 4) {
  for (let i = 0; i < ticks; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

/** Ждёт настоящие миллисекунды — для загрузок, отложенных через setTimeout. */
async function wait(ms) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
  await settle(2);
}

/**
 * Подмена `fetch`: отвечает по правилам «подстрока адреса → ответ», пишет
 * журнал запросов. Правило может быть функцией от (url, init).
 */
function mockFetch(rules) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    calls.push({ url: address, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null, init });
    for (const [needle, reply] of rules) {
      if (address.includes(needle)) {
        const result = await (typeof reply === 'function' ? reply(address, init, calls) : reply);
        const { status = 200, ...payload } = result;
        return { ok: status < 400, status, json: async () => payload, text: async () => JSON.stringify(payload) };
      }
    }
    return { ok: true, status: 200, json: async () => ({ success: true }), text: async () => '{"success":true}' };
  };
  return calls;
}

const byLabel = (container, label) => [...container.querySelectorAll('label')].find((node) => node.querySelector('.admin-label')?.textContent === label)?.querySelector('input, textarea');
const buttonByText = (container, text) => [...container.querySelectorAll('button')].find((node) => node.textContent.trim() === text);
const buttonByAria = (container, label) => container.querySelector(`button[aria-label="${label}"]`);

/* ---------------------------------------------------------------------- */
/* F-026 · F-037 — Финансы                                                  */
/* ---------------------------------------------------------------------- */

const finance = await bundle(`
  export { default as AdminFinance, profitByCurrency, withInvoiceStatus } from './src/app/components/admin/AdminFinance';
`);

const invoiceFixture = (overrides = {}) => ({
  id: 7, client_id: null, number: 'A-7', period: '2026-09', amount: 500, currency: 'USD',
  issued_at: '2026-09-10', due_at: '2026-09-20', paid_at: '2026-09-15', status: 'paid', note: '', ...overrides,
});

const financePayload = (overrides = {}) => ({
  success: true, invoices: [], expenses: [], timeEntries: [], clients: [],
  settings: { tax_rate: 10, target_hourly_rate: 0, main_currency: 'USD', requisites: '' },
  today: '2026-10-02', oneOffSales: false, ...overrides,
});

test('F-026: статус «оплачен» в форме счёта получает дату оплаты, по которой считают сводки', () => {
  const { withInvoiceStatus } = finance;
  const fresh = withInvoiceStatus(invoiceFixture({ status: 'issued', paid_at: null }), 'paid', '2026-10-02');
  assert.equal(fresh.paid_at, '2026-10-02', 'без даты оплаты счёт выпадал из «Получено», «Прибыли» и «По месяцам»');

  const kept = withInvoiceStatus(invoiceFixture({ paid_at: '2026-09-15' }), 'paid', '2026-10-02');
  assert.equal(kept.paid_at, '2026-09-15', 'уже известная дата оплаты не затирается сегодняшней');

  const reverted = withInvoiceStatus(invoiceFixture({ paid_at: '2026-09-15' }), 'issued', '2026-10-02');
  assert.equal(reverted.paid_at, null, 'выставленный счёт не несёт старую дату оплаты');
  assert.equal(reverted.status, 'issued');
});

test('F-026: у оплаченного счёта в форме видна дата оплаты, у выставленного — нет', async () => {
  const calls = mockFetch([['/api/admin/finance', financePayload({ invoices: [invoiceFixture(), invoiceFixture({ id: 8, status: 'issued', paid_at: null })] })]]);
  const view = await mount(finance.AdminFinance, { password: 'x' });
  await settle();

  const editButtons = [...view.container.querySelectorAll('button[aria-label="Изменить счёт"]')];
  assert.equal(editButtons.length, 2, 'оба счёта в таблице');

  await click(editButtons[0]);
  const paidAt = byLabel(view.container, 'Оплачен');
  assert.ok(paidAt, 'у оплаченного счёта есть поле «Оплачен»');
  assert.equal(paidAt.type, 'date');
  assert.equal(paidAt.value, '2026-09-15');

  await click(buttonByText(view.container, 'Отмена'));
  await click(editButtons[1]);
  assert.equal(byLabel(view.container, 'Оплачен'), undefined, 'у выставленного счёта даты оплаты нет');
  assert.ok(byLabel(view.container, 'Выставлен'), 'остальная форма на месте');

  await view.unmount();
  assert.ok(calls.some((call) => call.url.includes('/api/admin/finance')));
});

test('F-037: прибыль месяца с одними расходами — минус, а не «—»; налог только там, где был приход', () => {
  const { profitByCurrency } = finance;
  const onlySpent = profitByCurrency(new Map(), new Map([['USD', 300]]), 10);
  assert.equal(onlySpent.profit.get('USD'), -300, 'расход был — прибыль отрицательная');
  assert.equal(onlySpent.tax.size, 0, 'облагать нечего — налог не пишется');

  const mixed = profitByCurrency(new Map([['USD', 1000]]), new Map([['USD', 100], ['RUB', 50_000]]), 10);
  assert.equal(mixed.profit.get('USD'), 1000 - 100 - 100);
  assert.equal(mixed.profit.get('RUB'), -50_000, 'валюты считаются раздельно, рубли не вычитаются из долларов');
  assert.equal(mixed.tax.get('USD'), 100);
  assert.equal(mixed.tax.has('RUB'), false);
});

test('F-037: таблица «По месяцам» показывает минус за месяц, где были только расходы', async () => {
  mockFetch([['/api/admin/finance', financePayload({
    expenses: [{ id: 1, day: '2026-10-01', category: 'сервисы', amount: 300, currency: 'USD', note: '' }],
  })]]);
  const view = await mount(finance.AdminFinance, { password: 'x' });
  await settle();
  await click(buttonByText(view.container, 'Итоги'));

  const table = [...view.container.querySelectorAll('table')].find((node) => node.textContent.includes('Прибыль'));
  assert.ok(table, 'таблица «По месяцам» на месте');
  const cells = [...table.querySelectorAll('tbody td')].map((cell) => cell.textContent.trim());
  assert.equal(cells.length, 5, 'строка месяца: месяц, получено, расходы, налог, прибыль');
  assert.equal(cells[2], '300 USD');
  assert.equal(cells[4], '-300 USD', 'прибыль — честный минус, а не прочерк');
  assert.equal(cells[3], '—', 'налога нет, потому что не было прихода');
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-027 · F-035 · F-066 · F-067 — Заявки                                  */
/* ---------------------------------------------------------------------- */

const leadsModule = await bundle(`
  export { default as AdminLeads, parseDealValue, advanceStage, quickActionDue } from './src/app/components/admin/AdminLeads';
`);

test('F-027: сумма сделки читается в любом привычном формате, а нечитаемая — отказ, не NULL', () => {
  const { parseDealValue } = leadsModule;
  assert.deepEqual(parseDealValue('1,234.56'), { ok: true, value: 1234.56 });
  assert.deepEqual(parseDealValue('1.500,50'), { ok: true, value: 1500.5 });
  assert.deepEqual(parseDealValue('$1,234.56'), { ok: true, value: 1234.56 });
  assert.deepEqual(parseDealValue('1 500,50'), { ok: true, value: 1500.5 });
  assert.deepEqual(parseDealValue('1500'), { ok: true, value: 1500 });
  assert.deepEqual(parseDealValue(''), { ok: true, value: null }, 'пустое поле — суммы нет, а не ноль');
  assert.deepEqual(parseDealValue('   '), { ok: true, value: null });
  assert.equal(parseDealValue('abc').ok, false, 'раньше Number("1,234.56") давал NaN и сервер стирал сумму');
  assert.equal(parseDealValue('1,2,3.4.5').ok, false, 'две точки — не число; отказ вместо молчаливого NULL');
});

test('F-035: быстрое действие двигает сделку только вперёд и не трогает закрытые', () => {
  const { advanceStage } = leadsModule;
  assert.equal(advanceStage('discovery', 'proposal'), 'proposal', '«Отправил КП» из «Обсуждения» переводит в «Предложение»');
  assert.equal(advanceStage('contacted', 'proposal'), 'proposal');
  assert.equal(advanceStage('new', 'contacted'), 'contacted');
  assert.equal(advanceStage('discovery', 'contacted'), 'discovery', '«Позвонил» не откатывает сделку назад');
  assert.equal(advanceStage('proposal', 'proposal'), 'proposal');
  assert.equal(advanceStage('won', 'proposal'), 'won', 'выигранную сделку быстрые действия не переоткрывают');
  assert.equal(advanceStage('lost', 'contacted'), 'lost');
  assert.equal(advanceStage('archived', 'proposal'), 'archived');
  assert.equal(advanceStage('discovery', null), 'discovery', '«Ждёт ответа» этап не меняет');
});

test('F-067: «Связаться сегодня» переносит просроченный срок на сегодня, а не оставляет его в прошлом', () => {
  const { quickActionDue } = leadsModule;
  const noon = new Date(2026, 9, 2, 12, 0, 0);
  assert.equal(quickActionDue('2026-09-15T18:00', 'today', noon), '2026-10-02T18:00', 'просроченный срок уезжает на сегодня');
  assert.equal(quickActionDue('', 'today', noon), '2026-10-02T18:00', 'пустой срок — сегодня в 18:00');
  assert.equal(quickActionDue('2026-10-02T16:00', 'today', noon), '2026-10-02T16:00', 'срок сегодня и впереди остаётся');
  assert.equal(quickActionDue('2026-10-09T10:00', 'today', noon), '2026-10-02T18:00', 'кнопка обещает сегодня, а не следующую неделю');

  const evening = new Date(2026, 9, 2, 19, 20, 0);
  assert.equal(quickActionDue('', 'today', evening), '2026-10-02T20:00', 'после 18:00 — ближайший круглый час, иначе сделка сразу просрочена');
  const night = new Date(2026, 9, 2, 23, 30, 0);
  assert.equal(quickActionDue('', 'today', night), '2026-10-02T23:59', 'но не позже 23:59 сегодня');

  assert.equal(quickActionDue('2026-09-15T12:00', 'proposal', noon), '2026-10-02T13:00', 'у предложения просроченный срок тоже не переживает нажатие');
  assert.equal(quickActionDue('2026-10-09T10:00', 'proposal', noon), '2026-10-09T10:00', 'срок впереди предложение не трогает');
  assert.equal(quickActionDue('', 'proposal', new Date(2026, 9, 2, 9, 0, 0)), '2026-10-02T12:00');
});

const crmLeadsPayload = () => ({
  success: true,
  leads: [],
  pagination: { limit: 100, offset: 0, total: 0, returned: 0 },
  filters: {},
  summary: {
    stages: {}, priorities: {}, quality: {}, values_by_currency: [],
    reminders: { overdue: 2, today: 0, without_next_action: 0 }, tasks: { open: 0, overdue: 0, today: 0 },
  },
  facets: { services: [], sources: [], tags: [] },
  capabilities: { correctness: true, migration: '' },
});

test('F-066: плитка «Просрочено» с доски открывает список с фильтром, а не включает его молча', async () => {
  localStorage.setItem('ww-admin-crm-view', 'board');
  const calls = mockFetch([
    ['/api/admin/crm-leads', crmLeadsPayload()],
    ['/api/admin/lead-trash', { success: true, leads: [], pagination: { total: 0 } }],
  ]);
  const view = await mount(leadsModule.AdminLeads, { password: 'x' });
  // Список грузится с задержкой 260 мс (поиск по мере набора).
  await wait(320);

  const tile = [...view.container.querySelectorAll('.admin-crm-summary button')].find((node) => node.textContent.includes('Просрочено'));
  assert.ok(tile, 'плитка «Просрочено» на экране');
  assert.ok(view.container.querySelector('.crm-board-wrap, .crm-board'), 'по умолчанию открыта доска');

  await click(tile);
  await wait(320);
  assert.equal(localStorage.getItem('ww-admin-crm-view'), 'list', 'режим переключился на список');
  assert.equal(view.container.querySelector('.crm-board-wrap, .crm-board'), null, 'доска скрыта');
  const listRequest = calls.filter((call) => call.url.includes('/api/admin/crm-leads') && call.url.includes('due=overdue'));
  assert.ok(listRequest.length > 0, 'список запрошен с фильтром due=overdue');
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-030 (+ стык F-029) — Аналитика CRM                                    */
/* ---------------------------------------------------------------------- */

const analyticsModule = await bundle(`
  export { default as CrmAnalytics } from './src/app/components/admin/CrmAnalytics';
`);

const analyticsPayload = () => ({
  success: true, currency: 'USD', checkedAt: '2026-10-02T10:00:00Z',
  stages: [{ stage: 'new', count: 2, value: 0, otherCurrencyDeals: 0 }, { stage: 'won', count: 8, value: 5000, otherCurrencyDeals: 0 }],
  totals: {
    leads: 10, open: 2, won: 8, lost: 0, winRate: 100,
    openValue: null, wonValue: 5000, averageDeal: 1000,
    wonPriced: 5, wonWithoutValue: 3, openPriced: 0, openWithoutValue: 2,
  },
  health: { overdue: 0, today: 0, withoutNextAction: 0, stale: null, staleDays: 7 },
  tasks: { open: 0, overdue: 0, completed30d: 0 },
  cycle: { averageDays: null, deals: 0, available: false },
  firstResponse: { averageMinutes: null, answered: 0, available: false },
  quality: null,
  revenueByMonth: [],
  lossReasons: [],
  wonBySource: [
    { source: 'google', deals: 5, value: 5000 },
    { source: 'instagram', deals: 3, value: 0 },
    { source: 'telegram', deals: 1, value: 0, otherCurrencyDeals: 1 },
  ],
  notes: [],
});

test('F-030: источник без суммы подписан словами, а число сделок не выдаётся за деньги', async () => {
  mockFetch([['/api/admin/crm-analytics', analyticsPayload()]]);
  const view = await mount(analyticsModule.CrmAnalytics, { password: 'x', refreshToken: 0 });
  await settle();

  const section = [...view.container.querySelectorAll('section')].find((node) => node.textContent.includes('Откуда выигранные сделки'));
  assert.ok(section, 'блок «Откуда выигранные сделки» на месте');
  const rows = [...section.querySelectorAll('.crm-ranked li')].map((item) => ({
    key: item.querySelector('.crm-ranked__label').textContent,
    value: item.querySelector('.crm-ranked__value').textContent,
    width: item.querySelector('.crm-ranked__fill').style.width,
  }));
  assert.equal(rows.length, 3);
  assert.match(rows[0].value, /^5.000 USD5 сд\.$/, 'у источника с суммой — деньги и число сделок');
  assert.equal(rows[1].value, 'сумма не указана3 сд.', 'три сделки без суммы — не «3 USD»');
  assert.equal(rows[2].value, 'сумма в другой валюте1 сд.', 'сумма в другой валюте не выдаётся за незаполненную');
  assert.equal(rows[1].width, '2%', 'строка без суммы остаётся на минимальной полосе, а не на шкале денег');
  assert.ok(!section.textContent.includes('3 USD'));

  // Стык F-029: плитки говорят, по скольким сделкам посчитана сумма.
  const text = view.container.textContent;
  assert.ok(text.includes('Сумма — по 5 сделкам; у 3 сумма не заполнена'), 'плитка «Выиграно» объясняет неполную сумму');
  assert.ok(text.includes('Сумма не заполнена ни у одной (2)'), 'плитка «В работе» без сумм — «—» с объяснением, а не ноль');
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-031 — Собрать кейс                                                    */
/* ---------------------------------------------------------------------- */

const caseModule = await bundle(`
  export { buildCaseFromMonths, toCaseData } from './src/app/components/admin/caseFromClient';
`);

const monthRow = (month, spend, leads, sales, revenue) => ({ month, spend, leads, sales, revenue, spend_currency: 'USD' });

test('F-031: цена заявки считается только по месяцам, где есть и расход, и заявки', () => {
  const result = caseModule.buildCaseFromMonths([
    monthRow('2026-01', null, 50, null, null),
    monthRow('2026-02', 1000, 50, null, null),
    monthRow('2026-03', 1000, 50, null, null),
  ]);
  assert.equal(result.ok, true, result.problem);
  assert.equal(result.totals.cpl, 20, 'раньше 2000 ÷ 150 = 13.33: январь без расхода занижал цену заявки');
  assert.equal(result.totals.spend, 2000, 'суммы по колонкам остаются честными суммами');
  assert.equal(result.totals.leads, 150);
  assert.deepEqual(result.ratioGaps.cpl, ['январь 2026'], 'месяц без пары назван по имени');
  assert.deepEqual(result.ratioGaps.conversion, ['январь 2026', 'февраль 2026', 'март 2026'], 'продаж нет нигде — конверсия без пар');
  assert.equal(result.totals.conversion, null);
});

test('F-031: ROMI и конверсия тоже считаются по парам, а месяцы без пары перечислены', () => {
  const result = caseModule.buildCaseFromMonths([
    monthRow('2026-01', 1000, 50, 5, 5000),
    monthRow('2026-02', 1000, 50, 5, null),
    monthRow('2026-03', null, 50, 5, 9000),
  ]);
  assert.equal(result.ok, true, result.problem);
  assert.equal(result.totals.cpl, 20);
  assert.equal(result.totals.romi, 400, 'ROMI по январю: (5000 − 1000) ÷ 1000; февраль без выручки и март без расхода не участвуют');
  assert.equal(result.totals.conversion, 10, 'конверсия: 15 продаж ÷ 150 заявок — пары есть во всех месяцах');
  assert.deepEqual(result.ratioGaps.romi, ['февраль 2026', 'март 2026']);
  assert.deepEqual(result.ratioGaps.cpl, ['март 2026']);
  assert.deepEqual(result.ratioGaps.conversion, []);
  assert.equal(caseModule.toCaseData(result).roiValue, 400, 'в заголовок кейса уходит честный ROMI');
});

test('F-031: когда ни у одного месяца нет пары, показатель не считается вовсе', () => {
  const result = caseModule.buildCaseFromMonths([
    monthRow('2026-01', 1000, null, null, null),
    monthRow('2026-02', null, 40, null, null),
  ]);
  assert.equal(result.ok, true, result.problem);
  assert.equal(result.totals.cpl, null, 'расход и заявки есть, но в разных месяцах — делить нечего');
  assert.equal(result.totals.spend, 1000);
  assert.equal(result.totals.leads, 40);
  assert.deepEqual(result.ratioGaps.cpl, ['январь 2026', 'февраль 2026']);
  assert.equal(caseModule.toCaseData(result).metrics.some((metric) => metric.label === 'цена заявки'), false);
});

/* ---------------------------------------------------------------------- */
/* F-039 · F-071 — Планер                                                  */
/* ---------------------------------------------------------------------- */

const plannerModule = await bundle(`
  export { default as AdminPlanner } from './src/app/components/admin/AdminPlanner';
  export { currentWeekStart, shiftWeek, emptyWeek } from './src/app/components/admin/plannerModel';
`);

/**
 * Поддельный сервер планера: хранит недели, пишет журнал запросов и умеет
 * задерживать ответы. `readDelay[неделя]` — список задержек, по одной на
 * каждое следующее чтение этой недели. Ответ на чтение берёт данные в момент
 * запроса — как настоящий сервер, который читает базу до того, как к нему
 * долетит чужая запись.
 */
function plannerServer({ weeks = {}, template = null, readDelay = {}, writeDelay = 0 } = {}) {
  const store = new Map(Object.entries(weeks));
  const log = [];
  const respond = (payload) => ({ ok: true, status: 200, json: async () => payload });
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    const method = init.method || 'GET';
    if (address.includes('/api/admin/planner-template')) return respond({ success: true, template });
    if (address.includes('/api/admin/planner')) {
      if (method === 'POST') {
        const body = JSON.parse(init.body);
        log.push({ method, week: body.week });
        store.set(body.week, body.data);
        if (writeDelay) await new Promise((resolve) => setTimeout(resolve, writeDelay));
        return respond({ success: true });
      }
      const week = new URL(address, 'https://www.whalewzrd.com').searchParams.get('week');
      log.push({ method, week });
      const snapshot = store.get(week) || null;
      const delay = readDelay[week]?.shift();
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      return respond({ success: true, week, data: snapshot, updatedAt: null });
    }
    return respond({ success: true });
  };
  return { store, log };
}

const weekWith = (overrides) => {
  const week = plannerModule.emptyWeek();
  return { ...week, ...overrides };
};

test('F-039: «Перенести» с воскресенья и сразу «›» не записывает следующую неделю поверх текущей', async () => {
  const thisWeek = plannerModule.currentWeekStart();
  const nextWeek = plannerModule.shiftWeek(thisWeek, 1);
  const sunday = { tasks: [{ id: 'carry-1', text: 'Позвонить Ивану', done: false }, { id: 'done-1', text: 'Сдать отчёт', done: true }], notes: [{ id: 'n1', text: 'Заметка воскресенья' }], journal: plannerModule.emptyWeek().days[0].journal };
  const source = weekWith({ goals: [{ id: 'g1', text: 'Цель этой недели', done: false }] });
  source.days[6] = sunday;
  // Чтение следующей недели для переноса идёт дольше, чем для «›»: ответ на
  // «›» приходит раньше, чем закончится перенос, — ровно та гонка из находки.
  const server = plannerServer({ weeks: { [thisWeek]: source }, readDelay: { [nextWeek]: [120, 20] }, writeDelay: 30 });

  const view = await mount(plannerModule.AdminPlanner, { password: 'x' });
  await wait(30);
  assert.ok(view.container.textContent.includes('Цель этой недели'), 'текущая неделя загружена');

  const carry = [...view.container.querySelectorAll('.planner-day__carry')].find((node) => node.textContent.includes('Перенести на следующую неделю'));
  await click(carry);
  // Не дожидаясь переноса — сразу на следующую неделю, как в сценарии находки.
  await click(buttonByAria(view.container, 'Следующая неделя'));
  await wait(250);
  assert.deepEqual(
    server.log.slice(1, 4).map((entry) => `${entry.method} ${entry.week === nextWeek ? 'next' : 'this'}`),
    ['GET next', 'GET next', 'POST next'],
    'сценарий воспроизведён: следующая неделя открылась до того, как перенос записал её',
  );
  // Автосохранение отложено на 1,2 с — ждём, пока очередь дойдёт до сервера.
  await wait(1400);

  const savedSource = server.store.get(thisWeek);
  assert.ok(savedSource, 'исходная неделя на сервере есть');
  assert.deepEqual(savedSource.goals.map((goal) => goal.text), ['Цель этой недели'], 'цели исходной недели не затёрты содержимым следующей');
  assert.deepEqual(savedSource.days[6].tasks.map((task) => task.id), ['done-1'], 'перенесённая задача убрана из воскресенья, выполненная осталась');
  assert.equal(savedSource.days[6].notes.length, 1, 'заметки воскресенья на месте');

  const savedNext = server.store.get(nextWeek);
  assert.ok(savedNext, 'следующая неделя записана');
  assert.deepEqual(savedNext.days[0].tasks.map((task) => task.id), ['carry-1'], 'задача ровно один раз в понедельнике следующей недели');
  assert.deepEqual(savedNext.goals, [], 'следующая неделя не унаследовала цели исходной');

  // На экране — следующая неделя, и перенесённая задача в ней видна: иначе
  // первая же правка сохранила бы понедельник без неё. Задачи и цели лежат в
  // textarea, поэтому смотрим на значения полей, а не на текст страницы.
  const fieldValues = [...view.container.querySelectorAll('textarea, input')].map((field) => field.value);
  assert.ok(fieldValues.includes('Позвонить Ивану'), 'перенесённая задача видна в открытой следующей неделе');
  assert.ok(!fieldValues.includes('Цель этой недели'), 'на экране уже следующая неделя');
  await view.unmount();
});

test('F-071: шаблон недели подставляется снова после возврата на неделю, где его не сохраняли', async () => {
  const thisWeek = plannerModule.currentWeekStart();
  const previousWeek = plannerModule.shiftWeek(thisWeek, -1);
  const previous = weekWith({ goals: [{ id: 'g0', text: 'Прошлая цель', done: false }] });
  const server = plannerServer({
    weeks: { [previousWeek]: previous },
    template: { days: [['Разобрать почту'], [], [], [], [], [], []], goals: ['Цель из шаблона'] },
  });

  const view = await mount(plannerModule.AdminPlanner, { password: 'x' });
  await wait(30);
  assert.ok(view.container.textContent.includes('Дела подставлены из шаблона'), 'в пустую текущую неделю шаблон подставлен');
  assert.ok(view.container.textContent.includes('Разобрать почту'));

  await click(buttonByAria(view.container, 'Предыдущая неделя'));
  await wait(30);
  assert.ok(view.container.textContent.includes('Прошлая цель'), 'открыта прошлая неделя');
  assert.ok(!view.container.textContent.includes('Разобрать почту'), 'в заполненную прошлую неделю шаблон не лезет');

  await click(buttonByAria(view.container, 'Следующая неделя'));
  await wait(30);
  assert.ok(view.container.textContent.includes('Разобрать почту'), 'после возврата шаблон снова на месте, а не пустая неделя');
  assert.ok(view.container.textContent.includes('Дела подставлены из шаблона'));

  await wait(1400);
  assert.equal(server.log.filter((entry) => entry.method === 'POST').length, 0, 'пролистывание не плодит записей: подстановка не сохраняется');
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-040 (+ стык F-034) — Доска CRM                                        */
/* ---------------------------------------------------------------------- */

const boardModule = await bundle(`
  export { default as CrmBoard } from './src/app/components/admin/CrmBoard';
`);

const boardLead = (id, stage, overrides = {}) => ({
  id, name: `Сделка ${id}`, email: '', phone: '', telegram_username: '', service: 'Meta Ads',
  pipeline_stage: stage, priority: 'normal', lead_score: 10, deal_value: null, deal_currency: 'USD',
  next_action_at: null, next_action_text: '', crm_revision: 1, ...overrides,
});

test('F-040: доска догружает открытые сделки сверх 300, а счётчики и суммы берёт с сервера', async () => {
  const pastDue = new Date(Date.now() - 86_400_000).toISOString();
  const open = Array.from({ length: 310 }, (_, index) => boardLead(index + 1, 'new', index === 0 ? { next_action_at: pastDue } : {}));
  const closed = Array.from({ length: 300 }, (_, index) => boardLead(1000 + index, index === 0 ? 'lost' : 'won', index === 0 ? { next_action_at: pastDue } : {}));
  const summary = {
    stages: { new: 310, won: 349, lost: 1 },
    values_by_currency: [{ deal_currency: 'USD', open_value: 0, won_value: 123456 }],
  };
  const calls = mockFetch([
    ['/api/admin/crm-leads', (address) => {
      const params = new URL(address, 'https://www.whalewzrd.com').searchParams;
      const stages = (params.get('pipeline_stage') || '').split(',');
      const offset = Number(params.get('offset') || 0);
      const limit = Number(params.get('limit') || 100);
      const pool = stages.includes('new') ? open : closed;
      const total = stages.includes('new') ? open.length : 350;
      return { success: true, leads: pool.slice(offset, offset + limit), pagination: { total, limit, offset }, summary };
    }],
  ]);

  const view = await mount(boardModule.CrmBoard, {
    password: 'x', editingReady: true, selectedId: null, onOpenLead() {}, onChanged() {}, refreshToken: 0,
  });
  await settle(6);

  const boardCalls = calls.filter((call) => call.url.includes('/api/admin/crm-leads')).map((call) => new URL(call.url, 'https://www.whalewzrd.com').searchParams);
  const openPages = boardCalls.filter((params) => params.get('pipeline_stage') === 'new,contacted,discovery,proposal');
  assert.deepEqual(openPages.map((params) => params.get('offset')), ['0', '300'], 'открытые этапы догружены второй страницей');
  assert.ok(openPages.every((params) => params.get('limit') === '300' && params.get('sort') === 'priority'));
  const closedPages = boardCalls.filter((params) => params.get('pipeline_stage') === 'won,lost,archived');
  assert.equal(closedPages.length, 1, 'закрытые этапы — одной страницей последних');
  assert.equal(closedPages[0].get('sort'), 'recent');

  const columnByName = (label) => [...view.container.querySelectorAll('.crm-column')].find((node) => node.querySelector('h3')?.textContent === label);
  assert.equal(columnByName('Новые').querySelector('.crm-column__count').textContent, '310', 'все 310 открытых на доске, а не 300');
  assert.equal(columnByName('Новые').querySelectorAll('.crm-card').length, 310);
  assert.equal(columnByName('Выиграны').querySelector('.crm-column__count').textContent, '349', 'счётчик колонки — с сервера, а не длина загруженного');
  assert.match(columnByName('Выиграны').querySelector('.crm-column__value').textContent, /^123.456 USD$/, 'сумма выигранных — итог сервера по всем сделкам');
  assert.ok(columnByName('Выиграны').textContent.includes('Показаны последние 299 из 349.'), 'неполная колонка говорит об этом словами');
  assert.ok(view.container.textContent.includes('Сделок на доске: 610 из 660'), 'шапка показывает «N из M», когда загружено не всё');

  // Стык F-034: закрытая сделка с прошедшим сроком не горит «просрочено», открытая — горит.
  const cardById = (id) => [...view.container.querySelectorAll('.crm-card')].find((node) => node.textContent.includes(`Сделка ${id}`));
  assert.ok(cardById(1).querySelector('.is-overdue'), 'открытая сделка с прошедшим сроком помечена');
  assert.equal(cardById(1000).querySelector('.is-overdue'), null, 'проигранная сделка с прошедшим сроком не помечена');
  await view.unmount();
});

test('F-040: когда всё помещается, доска не пишет «из» и считает суммы по загруженным', async () => {
  const rows = [boardLead(1, 'new', { deal_value: 1500 }), boardLead(2, 'contacted', { deal_value: 500 }), boardLead(3, 'won', { deal_value: 3000 })];
  mockFetch([
    ['/api/admin/crm-leads', (address) => {
      const stages = (new URL(address, 'https://www.whalewzrd.com').searchParams.get('pipeline_stage') || '').split(',');
      const leads = rows.filter((row) => stages.includes(row.pipeline_stage));
      return { success: true, leads, pagination: { total: leads.length }, summary: { stages: { new: 1, contacted: 1, won: 1 }, values_by_currency: [{ deal_currency: 'USD', open_value: 2000, won_value: 3000 }] } };
    }],
  ]);
  const view = await mount(boardModule.CrmBoard, { password: 'x', editingReady: true, selectedId: null, onOpenLead() {}, onChanged() {}, refreshToken: 0 });
  await settle(6);
  assert.ok(view.container.textContent.includes('Сделок на доске: 3.'), 'без «из», когда загружено всё');
  assert.ok(!view.container.textContent.includes('Показаны последние'));
  const column = [...view.container.querySelectorAll('.crm-column')].find((node) => node.querySelector('h3')?.textContent === 'Новые');
  assert.match(column.querySelector('.crm-column__value').textContent, /^1.500 USD$/);
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-065 · F-068 — Рекламные расходы                                       */
/* ---------------------------------------------------------------------- */

const spendModule = await bundle(`
  export { default as AdminAdSpend } from './src/app/components/admin/AdminAdSpend';
  export { toIsoDate } from './src/app/components/admin/plannerModel';
`);

test('F-065: при ошибке сервера введённая сумма и вставленный CSV остаются в полях', async () => {
  let fail = true;
  const calls = mockFetch([
    ['/api/admin/ad-spend', (_address, init) => (init.method === 'POST' && fail
      ? { status: 400, success: false, error: 'В файле не нашлись колонки с датой и суммой' }
      : { success: true, entries: [], totals: [], knownSources: [], saved: 1 })],
  ]);
  const view = await mount(spendModule.AdminAdSpend, { password: 'x', days: 30, onSaved() {} });
  await click(buttonByText(view.container, 'Ввести расходы'));
  await settle();

  const sourceInput = byLabel(view.container, 'Источник');
  const amountInput = byLabel(view.container, 'Сумма, $');
  await type(sourceInput, 'facebook');
  await type(amountInput, '120.5');
  await submit(view.container.querySelector('form.adm-spend__form'));
  await settle();
  assert.ok(view.container.textContent.includes('В файле не нашлись колонки'), 'ошибка сервера показана');
  assert.equal(amountInput.value, '120.5', 'сумма не стёрта после ошибки');
  assert.equal(sourceInput.value, 'facebook');

  await click(buttonByText(view.container, 'Загрузить CSV'));
  const textarea = view.container.querySelector('textarea[aria-label="Содержимое CSV"]');
  await type(textarea, 'date,amount\n2026-07-01,120.50');
  await click(buttonByText(view.container, 'Загрузить'));
  await settle();
  assert.equal(view.container.querySelector('textarea[aria-label="Содержимое CSV"]')?.value, 'date,amount\n2026-07-01,120.50', 'выгрузка не стёрта и панель не закрыта');

  fail = false;
  await click(buttonByText(view.container, 'Загрузить'));
  await settle();
  assert.equal(view.container.querySelector('textarea[aria-label="Содержимое CSV"]'), null, 'после удачной загрузки панель CSV закрывается');
  await submit(view.container.querySelector('form.adm-spend__form'));
  await settle();
  assert.equal(amountInput.value, '', 'после удачного сохранения сумма очищается');
  assert.ok(calls.filter((call) => call.method === 'POST').length >= 4);
  await view.unmount();
});

test('F-068: дата расхода по умолчанию и её предел — сегодня по местному календарю, а не по Гринвичу', async () => {
  const local = spendModule.toIsoDate(new Date());
  const utc = new Date().toISOString().slice(0, 10);
  assert.notEqual(local, utc, 'предусловие: в выбранном поясе местная дата сейчас отличается от UTC');

  mockFetch([['/api/admin/ad-spend', { success: true, entries: [], totals: [], knownSources: [] }]]);
  const view = await mount(spendModule.AdminAdSpend, { password: 'x', days: 30, onSaved() {} });
  await click(buttonByText(view.container, 'Ввести расходы'));
  await settle();
  const dayInput = byLabel(view.container, 'Дата');
  assert.equal(dayInput.value, local, 'по умолчанию стоит сегодняшняя местная дата');
  assert.equal(dayInput.max, local, 'сегодняшнюю дату можно выбрать');
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-069 · F-072 — «Сегодня»: план и заметка дня                            */
/* ---------------------------------------------------------------------- */

const todayModule = await bundle(`
  export { default as TodayPlan, applyPlanTaskOp } from './src/app/components/admin/TodayPlan';
  export { default as TodayNote } from './src/app/components/admin/TodayNote';
  export { createRef } from 'react';
`);

const WEEK = '2026-09-28';
const dayWith = (tasks, notes = []) => ({ tasks, notes, journal: { sleep: '', energy: 0, mood: 0, lesson: '', gratitude: '', thoughts: '' } });

test('F-072: серия дней на «Сегодня» согласована с числом: «21 день», «2 дня», «5 дней»', async () => {
  mockFetch([]);
  const props = { password: 'x', tasks: [], weekStart: WEEK, dayIndex: 0, onNavigate() {}, onSaved() {} };
  const view = await mount(todayModule.TodayPlan, { ...props, streak: 21 });
  assert.ok(view.container.textContent.includes('21 день подряд'), 'раньше было «21 дней подряд»');
  await view.rerender({ ...props, streak: 2 });
  assert.ok(view.container.textContent.includes('2 дня подряд'));
  await view.rerender({ ...props, streak: 5 });
  assert.ok(view.container.textContent.includes('5 дней подряд'));
  await view.rerender({ ...props, streak: 111 });
  assert.ok(view.container.textContent.includes('111 дней подряд'));
  await view.unmount();
});

test('F-069: отметка на «Сегодня» применяется к свежепрочитанной неделе и не стирает задачу, добавленную в планере', async () => {
  const stored = { goals: [], habits: [], days: Array.from({ length: 7 }, () => dayWith([])) };
  stored.days[2] = dayWith([{ id: 't1', text: 'Позвонить', done: false }, { id: 't2', text: 'Добавлено с телефона', done: false }]);
  const calls = mockFetch([
    ['/api/admin/planner', (_address, init) => {
      if ((init.method || 'GET') === 'POST') { Object.assign(stored, JSON.parse(init.body).data); return { success: true }; }
      return { success: true, data: stored };
    }],
  ]);
  // На экране — снимок до того, как в планере появилась вторая задача.
  const view = await mount(todayModule.TodayPlan, { password: 'x', tasks: [{ id: 't1', text: 'Позвонить', done: false }], weekStart: WEEK, dayIndex: 2, onNavigate() {}, onSaved() {} });
  await click(view.container.querySelector('.today-plan__check'));
  await settle();

  const post = calls.find((call) => call.method === 'POST');
  assert.ok(post, 'запись ушла');
  assert.deepEqual(post.body.data.days[2].tasks, [
    { id: 't1', text: 'Позвонить', done: true },
    { id: 't2', text: 'Добавлено с телефона', done: false },
  ], 'отметка легла на свежий список, чужая задача не затёрта');
  assert.ok(view.container.textContent.includes('Добавлено с телефона'), 'после записи на экране и чужая задача');
  assert.equal(view.container.querySelector('.today-plan__check[aria-pressed="true"]') !== null, true);
  await view.unmount();
});

test('F-069: план и заметка дня пишут неделю по очереди, последняя запись не стирает первую', async () => {
  const stored = { goals: [], habits: [], days: Array.from({ length: 7 }, () => dayWith([])) };
  stored.days[0] = dayWith([{ id: 't1', text: 'Позвонить', done: false }]);
  const calls = mockFetch([
    ['/api/admin/planner', async (_address, init) => {
      if ((init.method || 'GET') === 'POST') { Object.assign(stored, JSON.parse(init.body).data); return { success: true }; }
      // Чтение медленнее записи: без очереди обе карточки прочитали бы неделю до чужой записи.
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { success: true, data: JSON.parse(JSON.stringify(stored)) };
    }],
  ]);
  const queue = todayModule.createRef();
  queue.current = Promise.resolve();
  const plan = await mount(todayModule.TodayPlan, { password: 'x', tasks: stored.days[0].tasks, weekStart: WEEK, dayIndex: 0, queue, onNavigate() {}, onSaved() {} });
  const note = await mount(todayModule.TodayNote, { password: 'x', notes: [], weekStart: WEEK, dayIndex: 0, queue, onSaved() {} });

  await click(plan.container.querySelector('.today-plan__check'));
  await type(note.container.querySelector('input[aria-label="Новая заметка на сегодня"]'), 'Договорились на вторник');
  await submit(note.container.querySelector('form.today-note__add'));
  await wait(120);

  assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST', 'GET', 'POST'], 'второй цикл начался после окончания первого');
  assert.equal(stored.days[0].tasks[0].done, true, 'отметка задачи сохранилась');
  assert.deepEqual(stored.days[0].notes.map((item) => item.text), ['Договорились на вторник'], 'заметка сохранилась');
  await plan.unmount();
  await note.unmount();
});

test('F-069: при ошибке записи экран откатывается к прежнему списку', async () => {
  mockFetch([
    ['/api/admin/planner', (_address, init) => ((init.method || 'GET') === 'POST'
      ? { status: 500, success: false, error: 'База недоступна' }
      : { success: true, data: { goals: [], habits: [], days: Array.from({ length: 7 }, () => dayWith([{ id: 't1', text: 'Позвонить', done: false }])) } })],
  ]);
  const view = await mount(todayModule.TodayPlan, { password: 'x', tasks: [{ id: 't1', text: 'Позвонить', done: false }], weekStart: WEEK, dayIndex: 0, onNavigate() {}, onSaved() {} });
  await click(view.container.querySelector('.today-plan__check'));
  await settle();
  assert.equal(view.container.querySelector('.today-plan__check').getAttribute('aria-pressed'), 'false', 'отметки, которой нет в базе, на экране нет');
  assert.ok(view.container.textContent.includes('База недоступна'));
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-041 · F-070 — Клиенты                                                  */
/* ---------------------------------------------------------------------- */

const clientsModule = await bundle(`
  export { default as AdminClients } from './src/app/components/admin/AdminClients';
  export { toIsoDate } from './src/app/components/admin/plannerModel';
`);

const localMonth = () => clientsModule.toIsoDate(new Date()).slice(0, 7);

const clientFixture = () => ({
  id: 1, lead_id: null, name: 'Ива Петрова', company: '', status: 'active', started_at: '2026-01-10',
  paused_until: null, finished_at: null, finish_reason: '', contact_method: 'telegram', contact_value: '@iva',
  timezone_offset: null, services: [], retainer_amount: 800, retainer_currency: 'USD', billing_day: 5,
  contract_number: '', contract_signed_at: null, contract_ends_at: null, contract_auto_renew: 0, contract_file_url: '',
  scope_included: '', scope_excluded: '', next_touch_at: null, next_touch_text: '', media_folder: '',
  health: 'ok', healthReasons: [], lastReportMonth: null,
});

function clientsServer({ months = [], access = [], setAccessDelay = 0 } = {}) {
  const calls = mockFetch([
    ['/api/admin/clients', async (address, init) => {
      if ((init.method || 'GET') === 'POST') {
        const body = JSON.parse(init.body);
        if ((body.action === 'set_access' || body.action === 'seed_access') && setAccessDelay) await new Promise((resolve) => setTimeout(resolve, setAccessDelay));
        return { success: true, id: 1 };
      }
      const params = new URL(address, 'https://www.whalewzrd.com').searchParams;
      if (params.get('id')) return { success: true, client: clientFixture(), months, access, notes: [] };
      return { success: true, clients: [clientFixture()], summary: { recurring: [], activeCount: 1, totalCount: 1, needAttention: 0, averageLifetimeDays: 0 } };
    }],
  ]);
  return calls;
}

/** Месяц на шаг раньше в формате «ГГГГ-ММ» — как `previousMonth` в AdminClients. */
const monthBefore = (month) => {
  const [year, part] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, part - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

test('F-041: «Добавить месяц» при занятом текущем даёт пустую форму со свободным месяцем, месяц существующей строки не меняется, строку можно удалить', async () => {
  const confirms = [];
  let confirmAnswer = false;
  window.confirm = (text) => { confirms.push(text); return confirmAnswer; };
  const month = localMonth();
  const calls = clientsServer({
    months: [{ client_id: 1, month, report_sent_at: '2026-10-01', report_url: '', spend: 100, spend_currency: 'USD', leads: 10, sales: 1, revenue: 500, note: 'важно' }],
  });
  const view = await mount(clientsModule.AdminClients, { password: 'x' });
  await settle();
  await click([...view.container.querySelectorAll('.clients__list button')].find((node) => node.textContent.includes('Ива Петрова')));
  await settle();

  // Текущий месяц уже заведён — владельцу нужно завести прошлый, а не править текущий.
  await click(buttonByText(view.container, 'Добавить месяц'));
  const monthInput = byLabel(view.container, 'Месяц');
  assert.ok(monthInput, 'форма месяца открыта');
  assert.equal(monthInput.value, monthBefore(month), 'предложен первый свободный месяц — на шаг раньше занятого текущего');
  assert.equal(monthInput.readOnly, false, 'в новой форме месяц можно сменить на любой другой');
  assert.equal(byLabel(view.container, 'Отчёт отправлен').value, '', 'форма пустая, а не строка текущего месяца');
  assert.equal(byLabel(view.container, 'Заявок').value, '');

  // Владелец сменил месяц на уже заведённый — перед записью поверх спрашивают, а не стирают молча.
  await type(monthInput, month);
  await click(buttonByText(view.container, 'Сохранить месяц'));
  await settle();
  assert.equal(confirms.length, 1, 'на занятый месяц задан вопрос «Заменить»');
  assert.match(confirms[0], /уже есть/);
  assert.equal(calls.filter((call) => call.method === 'POST' && call.body?.action === 'set_month').length, 0, 'после отказа ничего не записано');
  await click(buttonByText(view.container, 'Отмена'));

  // Правка существующей строки — только через карандаш, и месяц там не меняется.
  await click(buttonByAria(view.container, `Изменить ${month}`));
  const editInput = byLabel(view.container, 'Месяц');
  assert.equal(editInput.value, month);
  assert.equal(editInput.readOnly, true, 'месяц существующей строки не меняется — иначе получался дубль');
  assert.equal(byLabel(view.container, 'Отчёт отправлен').value, '2026-10-01', 'строка открыта со своими значениями');
  assert.equal(byLabel(view.container, 'Заявок').value, '10');
  await click(buttonByText(view.container, 'Сохранить месяц'));
  await settle();
  const saved = calls.find((call) => call.method === 'POST' && call.body?.action === 'set_month');
  assert.ok(saved, 'сохранение ушло');
  assert.equal(confirms.length, 1, 'правка своей строки вопросов не задаёт');
  assert.equal(saved.body.note, 'важно', 'заметка месяца проходит через форму, а не стирается');
  assert.equal(saved.body.month, month);

  confirmAnswer = true;
  await click(buttonByAria(view.container, `Удалить ${month}`));
  await settle();
  const removed = calls.find((call) => call.method === 'POST' && call.body?.action === 'delete_month');
  assert.ok(removed, 'удаление месяца доступно из интерфейса');
  assert.equal(removed.body.month, month);
  assert.equal(removed.body.id, 1);
  await view.unmount();
});

test('F-070: повторное нажатие «Создать чек-лист» не плодит дубли доступов', async () => {
  const calls = clientsServer({ setAccessDelay: 15 });
  const view = await mount(clientsModule.AdminClients, { password: 'x' });
  await settle();
  await click([...view.container.querySelectorAll('.clients__list button')].find((node) => node.textContent.includes('Ива Петрова')));
  await settle();

  const button = buttonByText(view.container, 'Создать чек-лист');
  assert.ok(button, 'кнопка типового набора на месте');
  await click(button);
  assert.equal(button.disabled, true, 'на время запросов кнопка заперта');
  assert.equal(button.textContent.trim(), 'Создаю…');
  await click(button);
  await wait(200);

  // После стыка F-070 набор уходит одним запросом seed_access, а дубли отсекает сервер (WHERE NOT EXISTS).
  const seeds = calls.filter((call) => call.method === 'POST' && call.body?.action === 'seed_access');
  assert.equal(seeds.length, 1, 'ровно один запрос на типовой набор, второй клик во время первого не уходит');
  const names = seeds[0].body.names;
  assert.equal(names.length, 7, 'ровно один набор из семи доступов');
  assert.equal(new Set(names).size, names.length, 'без дублей');
  assert.equal(calls.filter((call) => call.method === 'POST' && call.body?.action === 'set_access').length, 0, 'по одному доступу больше не шлём');
  await view.unmount();
});

/* ---------------------------------------------------------------------- */
/* F-068 — Цели и Отчёт                                                    */
/* ---------------------------------------------------------------------- */

const periodsModule = await bundle(`
  export { default as AdminGoals } from './src/app/components/admin/AdminGoals';
  export { default as AdminReport } from './src/app/components/admin/AdminReport';
`);

test('F-068: «Цели» открываются на месяце по местному календарю и переходят на месяц сервера', async () => {
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const serverNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const serverToday = `${serverNext.getFullYear()}-${String(serverNext.getMonth() + 1).padStart(2, '0')}-01`;
  const calls = mockFetch([
    ['/api/admin/goals', (address) => ({
      success: true, today: serverToday, period: new URL(address, 'https://www.whalewzrd.com').searchParams.get('period'),
      goal: null, hasGoal: false, fact: { leads: 0, qualified: 0, won: 0, revenue: null, spend: null },
      forecast: { elapsedDays: 1, totalDays: 30, isCurrent: true, leads: null, qualified: null, revenue: null, spend: null },
      history: [], notes: [],
    })],
  ]);
  const view = await mount(periodsModule.AdminGoals, { password: 'x' });
  await settle(6);
  const periods = calls.filter((call) => call.url.includes('/api/admin/goals')).map((call) => new URL(call.url, 'https://www.whalewzrd.com').searchParams.get('period'));
  assert.equal(periods[0], local, 'первый запрос — за месяц по местному календарю, а не по Гринвичу');
  assert.equal(periods[1], serverToday.slice(0, 7), 'сервер считает текущим другой месяц — раздел перешёл на него');
  assert.equal(periods.length, 2, 'переход один, по кругу не ходит');
  await view.unmount();
});

test('F-068: «Отчёт» открывается на месяце по местному календарю', async () => {
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const numbers = { views: null, visitors: null, leads: 0, qualified: null, won: null, revenue: null, spend: null };
  const calls = mockFetch([
    ['/api/admin/report', (address) => ({
      success: true, period: new URL(address, 'https://www.whalewzrd.com').searchParams.get('period'), isCurrentMonth: true, currency: 'USD',
      current: numbers, previous: numbers, derived: { profit: null, cpl: null, cpq: null, romi: null }, goal: null, sources: [], pages: [], publishedArticles: null, notes: [],
    })],
  ]);
  const view = await mount(periodsModule.AdminReport, { password: 'x' });
  await settle(4);
  const period = new URL(calls.find((call) => call.url.includes('/api/admin/report')).url, 'https://www.whalewzrd.com').searchParams.get('period');
  assert.equal(period, local);
  assert.equal(buttonByAria(view.container, 'Следующий месяц')?.disabled, true, 'стрелка вперёд из текущего месяца заперта');
  await view.unmount();
});
