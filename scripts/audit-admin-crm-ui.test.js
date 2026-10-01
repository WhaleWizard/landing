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
        const result = typeof reply === 'function' ? reply(address, init, calls) : reply;
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
