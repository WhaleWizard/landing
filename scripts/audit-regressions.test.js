import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

/**
 * Закрепляет ошибки, найденные построчным аудитом в августе 2026.
 *
 * Все они одного рода: код не падал и не жаловался, а молча портил данные или
 * ронял страницу от значения в адресе. Такое не ловится ни типами, ни глазами
 * при code review — только проверкой на конкретных значениях. Журнал находок:
 * `audit-reports/08_аудит_кода_2026-08-26/`.
 */

/**
 * Компилирует один модуль проекта в память.
 *
 * Импорты по умолчанию подменяются пустышкой: проверяемые функции чистые, и
 * тащить за ними React с браузерным окружением незачем. Но некоторые из них
 * опираются на общие утилиты — например на согласование числительных, — и
 * такие модули нужно подставить по-настоящему, иначе тест падает не на
 * проверяемом правиле, а на заглушке.
 */
async function compile(relativePath, resolve = () => ({})) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const compiled = await transform(source, { loader: 'ts', format: 'cjs', target: 'node20' });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compiled.code)(module, module.exports, resolve);
  return module.exports;
}

async function loadModule(relativePath) {
  const plural = await compile('src/app/utils/plural.ts');
  return compile(relativePath, (request) => (request.endsWith('/plural') ? plural : {}));
}

const money = await loadModule('functions/_lib/money.ts');
const redact = await loadModule('functions/_lib/redact.ts');
const phone = await loadModule('src/app/utils/phoneCountry.ts');

test('денежная сумма читается во всех форматах, которыми её пишут люди', () => {
  // «Цель по выручке» ошибалась в сто раз: запятая вырезалась вместе с прочим,
  // и «1 500,50» превращалось в 150050.
  assert.equal(money.parseMoney('1 500,50'), 1500.5);
  assert.equal(money.parseMoney('1500.50'), 1500.5);

  // Эти три формата прежний серверный разбор превращал в ноль.
  assert.equal(money.parseMoney('1,234.56'), 1234.56);
  assert.equal(money.parseMoney('1.234,56'), 1234.56);
  assert.equal(money.parseMoney('$1,234.56'), 1234.56);

  // Пустое поле — это «не заполнено», а не ноль: разница важна для правила
  // «не выдумывать числа».
  assert.equal(money.parseMoney(''), null);
  assert.equal(money.parseMoneyOrZero(''), 0);

  // Отрицательных сумм не бывает, за верхнюю границу выходить нельзя.
  assert.equal(money.parseMoney('-5'), null);
  assert.equal(money.parseMoney(2_000_000_000), null);
});

test('маскировка скрывает телефон, но не съедает даты и коды ошибок Meta', () => {
  assert.equal(
    redact.redactSensitiveText('звонил +7 926 123-45-67 вчера'),
    'звонил [телефон скрыт] вчера',
  );

  // Из-за прежней регулярки «восемь цифр подряд» из сообщения об ошибке
  // пропадало ровно то, ради чего в него смотрят: метки времени, числовые коды
  // Meta и даты.
  assert.match(redact.redactSensitiveText('error_code 1724680000'), /1724680000/);
  assert.match(redact.redactSensitiveText('произошло 2026-08-27'), /2026-08-27/);
  assert.match(redact.redactSensitiveText('fbtrace 987654321012345'), /987654321012345/);

  // Наши номера всегда приходят с ведущим плюсом, поэтому они по-прежнему
  // скрываются, даже когда записаны без разделителей.
  assert.equal(redact.redactSensitiveText('номер +79261234567'), 'номер [телефон скрыт]');

  assert.match(redact.redactSensitiveText('писал c ivan@example.com'), /\[email скрыт\]/);
  assert.match(redact.redactSensitiveText('?access_token=secret123 упал'), /\[скрыто\]/);
});

test('номер с восьмёркой не превращается в несуществующий', () => {
  // «8 926 123-45-67» и «+7 926 123-45-67» — один и тот же номер. Прежде к
  // первому приклеивался код страны: +789261234567, двенадцать цифр.
  assert.equal(phone.buildFullPhone('+7', '8 926 123 45 67'), '+79261234567');
  assert.equal(phone.buildFullPhone('+7', '7 926 123 45 67'), '+79261234567');
  assert.equal(phone.buildFullPhone('+7', '926 123 45 67'), '+79261234567');

  // Введённый плюс всегда главнее выбора в списке.
  assert.equal(phone.buildFullPhone('+1', '+7 926 123 45 67'), '+79261234567');

  // Правило узкое: чужие нумерации не трогаем.
  assert.equal(phone.buildFullPhone('+1', '8005551234'), '+18005551234');
  assert.equal(phone.buildFullPhone('+7', ''), '');
});

test('ключ из адреса не достаёт унаследованные свойства карт', async () => {
  // Три случая в проекте: псевдонимы навигации, профили ограничителя частоты и
  // карты витрины кейсов. В последнем /cases?from=constructor роняла страницу.
  const rateLimit = await readFile(new URL('../functions/_lib/rate-limit.ts', import.meta.url), 'utf8');
  const navigation = await readFile(new URL('../src/app/utils/siteNavigation.ts', import.meta.url), 'utf8');
  const catalog = await readFile(new URL('../src/app/data/caseCatalog.ts', import.meta.url), 'utf8');
  const cases = await readFile(new URL('../src/app/pages/CasesPage.tsx', import.meta.url), 'utf8');

  for (const [name, source] of [
    ['rate-limit', rateLimit],
    ['siteNavigation', navigation],
    ['caseCatalog', catalog],
    ['CasesPage', cases],
  ]) {
    assert.ok(
      source.includes('hasOwnProperty.call'),
      `${name} ищет по карте значением из запроса и обязан проверять собственный ключ`,
    );
  }

  // Поведение, ради которого всё это: ключ-прототип не должен возвращать функцию.
  const catalogModule = await loadModule('src/app/data/caseCatalog.ts').catch(() => null);
  if (catalogModule?.getCaseCatalogMeta) {
    for (const key of ['constructor', '__proto__', 'toString', 'valueOf']) {
      assert.equal(catalogModule.getCaseCatalogMeta(key), undefined, `ключ ${key} не должен ничего находить`);
    }
  }
});

test('автооценка лида читает те значения качества, которые есть в базе', async () => {
  const scoring = await loadModule('src/app/components/admin/leadScore.ts');
  const rich = {
    budget: '$100к+',
    phone: '+79261234567',
    email: 'a@b.c',
    telegram_username: '@x',
    submissions_count: 2,
    message: 'x'.repeat(120),
    service: 'Meta Ads',
    utm_source: 'facebook',
    marketing_consent: 1,
  };

  // В базе значения ровно такие: '' | target | nontarget (миграция 0009).
  // Раньше код сравнивал с 'qualified'/'unqualified', и обе ветки молчали.
  const target = scoring.suggestLeadScore({ ...rich, quality: 'target' });
  assert.ok(target.reasons.some((reason) => reason.includes('целевым')), 'целевой лид должен получать надбавку');

  // Главное: лид, помеченный нецелевым, не должен выглядеть перспективным
  // из-за бюджета и каналов связи. До правки он получал 90 из 100.
  const nontarget = scoring.suggestLeadScore({ ...rich, quality: 'nontarget' });
  assert.ok(nontarget.score <= 15, `нецелевой лид ограничен пятнадцатью, получено ${nontarget.score}`);
  assert.ok(nontarget.reasons.some((reason) => reason.includes('ограничена')), 'ограничение должно объясняться словами');

  // Оценка всегда объясняет себя — это заявленное правило раздела.
  assert.ok(target.reasons.length > 0);
});

test('разные валюты нигде не складываются в одно число', async () => {
  // Сквозное правило проекта: курсов в системе нет, поэтому сумма рублей и
  // долларов — выдуманное число. Аудит нашёл два нарушения: шапка колонки на
  // доске сделок показывала такую сумму, а список «кто сколько принёс» по ней
  // сортировался.
  const board = await readFile(new URL('../src/app/components/admin/CrmBoard.tsx', import.meta.url), 'utf8');
  const finance = await readFile(new URL('../src/app/components/admin/AdminFinance.tsx', import.meta.url), 'utf8');

  assert.ok(
    !/leads\.reduce\(\(sum, lead\) => sum \+ \(Number\(lead\.deal_value\)/.test(board),
    'шапка колонки не должна складывать deal_value всех валют подряд',
  );
  assert.ok(board.includes('columnTotals'), 'сумма колонки считается по каждой валюте отдельно');

  assert.ok(
    !/total: \[\.\.\.money\.values\(\)\]\.reduce/.test(finance),
    'порядок клиентов не должен считаться суммой всех валют',
  );
  assert.ok(finance.includes('primaryTotal'), 'клиенты сортируются по основной валюте');
});

test('числительные согласуются по-русски, включая 11, 21 и 111', async () => {
  const { plural, withPlural } = await compile('src/app/utils/plural.ts');
  const forms = ['заявка', 'заявки', 'заявок'];

  // Правило жило в четырёх копиях и в двух разных записях; в шести надписях
  // его не было вовсе — оттуда «1 заявок», «2 файлов», «1 ошибок».
  const expected = {
    0: 'заявок', 1: 'заявка', 2: 'заявки', 4: 'заявки', 5: 'заявок',
    11: 'заявок', 12: 'заявок', 14: 'заявок', 15: 'заявок',
    21: 'заявка', 22: 'заявки', 25: 'заявок',
    101: 'заявка', 111: 'заявок', 112: 'заявок', 121: 'заявка',
  };
  for (const [count, form] of Object.entries(expected)) {
    assert.equal(plural(Number(count), forms), form, `${count}: ожидалось «${form}»`);
  }

  assert.equal(withPlural(1, forms), '1 заявка');
  assert.equal(withPlural(5, forms), '5 заявок');
});

test('выгрузка воронки не превращает UTM-метку в формулу Excel', async () => {
  const source = await readFile(new URL('../src/app/components/admin/AdminAttribution.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('defuseFormula'), 'ячейки CSV должны обезвреживаться перед выгрузкой');

  // Правило повторено здесь дословно: файл тянет за собой React и графики,
  // а проверять нужно именно поведение на конкретных значениях.
  const defuse = (value) => {
    if (!value) return value;
    const first = value[0];
    if (first === '-' && /^-?[\d\s.,]+%?$/.test(value)) return value;
    return '=+-@\t\r'.includes(first) ? `'${value}` : value;
  };

  // UTM-метку задаёт кто угодно ссылкой, а сервер её только подрезает по
  // длине. Открыв выгрузку в Excel, владелец запустил бы формулу у себя.
  assert.equal(defuse("=cmd|'/c calc'!A0"), "'=cmd|'/c calc'!A0");
  assert.equal(defuse('@SUM(1+9)*cmd'), "'@SUM(1+9)*cmd");
  assert.equal(defuse('+1234'), "'+1234");
  assert.equal(defuse('-скидка'), "'-скидка");

  // Отрицательные числа остаются числами: иначе сортировка в Excel сломается.
  assert.equal(defuse('-12,5%'), '-12,5%');
  assert.equal(defuse('-5'), '-5');
  assert.equal(defuse('facebook'), 'facebook');
});

test('временный отказ приёма заявки отличается от окончательного', async () => {
  const source = await readFile(new URL('../src/app/utils/leadRetryQueue.ts', import.meta.url), 'utf8');
  const compiled = await transform(source, { loader: 'ts', format: 'cjs', target: 'node20' });
  const module = { exports: {} };
  // Модуль тянет за собой согласие и очередь браузера — для чистой функции
  // достаточно заглушек: проверяется только правило «что считать временным».
  new Function('module', 'exports', 'require', compiled.code)(
    module,
    module.exports,
    () => ({ loadConsent: () => null, applyConsentDowngrade: (value) => value }),
  );

  const { isRetryableLeadStatus } = module.exports;

  // 429 сюда входит намеренно: лимит — двадцать заявок за десять минут с
  // адреса, и упереться в него может человек за общим адресом оператора.
  // Раньше форма считала такой отказ окончательным и выбрасывала заявку.
  assert.equal(isRetryableLeadStatus(429), true);
  assert.equal(isRetryableLeadStatus(408), true);
  assert.equal(isRetryableLeadStatus(503), true);
  assert.equal(isRetryableLeadStatus(500), true);

  // Испорченный токен и заявка без контакта — окончательные отказы:
  // повторять их трое суток бессмысленно и вредно.
  assert.equal(isRetryableLeadStatus(403), false);
  assert.equal(isRetryableLeadStatus(400), false);
  assert.equal(isRetryableLeadStatus(404), false);
});
