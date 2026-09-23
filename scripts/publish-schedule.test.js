import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

/**
 * Раскладка публикаций по расписанию (src/app/utils/publishSchedule.ts).
 * Владелец полагается на неё вслепую: нажал кнопку — статьи выходят сами
 * три недели. Поэтому проверяется то, что он не увидит глазами: пояс,
 * окно, зазор между статьями, равномерность и что ни одна статья не
 * потерялась.
 */
async function load() {
  const result = await build({
    entryPoints: ['src/app/utils/publishSchedule.ts'],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const { planSchedule, ownerTomorrow, MIN_GAP_MINUTES } = await load();

// Детерминированный генератор, чтобы тесты не мигали.
function seeded(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const slugs = (n) => Array.from({ length: n }, (_, i) => `article-${i + 1}`);
const base = { startDate: '2026-10-01', days: 21, perDay: 2, fromHour: 9, toHour: 21, shuffle: true };

test('все статьи получают место, каждая ровно один раз', () => {
  const input = slugs(40);
  const { items, overflow, error } = planSchedule(input, { ...base, random: seeded() });
  assert.equal(error, undefined);
  assert.equal(overflow.length, 0);
  assert.equal(items.length, 40);
  assert.deepEqual([...items.map((item) => item.slug)].sort(), [...input].sort());
});

test('время в окне по Ташкенту, а в базу уходит UTC на пять часов раньше', () => {
  const { items } = planSchedule(slugs(42), { ...base, random: seeded(7) });
  for (const item of items) {
    const [hours, minutes] = item.localTime.split(':').map(Number);
    const localMinutes = hours * 60 + minutes;
    assert.ok(localMinutes >= 9 * 60 && localMinutes < 21 * 60, `${item.localTime} вне окна 09–21`);
    const utc = new Date(item.publishedAt);
    const expectedUtcMinutes = (localMinutes - 5 * 60 + 24 * 60) % (24 * 60);
    assert.equal(utc.getUTCHours() * 60 + utc.getUTCMinutes(), expectedUtcMinutes, `${item.localTime} ↔ ${item.publishedAt}`);
  }
});

test('в один день — не больше заданного числа и не ближе зазора друг к другу', () => {
  const { items } = planSchedule(slugs(42), { ...base, perDay: 2, random: seeded(3) });
  const byDay = new Map();
  for (const item of items) {
    const list = byDay.get(item.localDate) || [];
    list.push(item.localTime);
    byDay.set(item.localDate, list);
  }
  assert.equal(byDay.size, 21, 'ровно три недели');
  for (const [day, times] of byDay) {
    assert.ok(times.length <= 2, `${day}: ${times.length} статей`);
    const minutes = times.map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; }).sort((a, b) => a - b);
    for (let i = 1; i < minutes.length; i += 1) {
      assert.ok(minutes[i] - minutes[i - 1] >= MIN_GAP_MINUTES, `${day}: ${times.join(', ')} ближе ${MIN_GAP_MINUTES} мин`);
    }
  }
});

test('мало статей — растягиваются на весь период, а не на первые дни', () => {
  const { items } = planSchedule(slugs(5), { ...base, random: seeded(11) });
  const days = [...new Set(items.map((item) => item.localDate))].sort();
  assert.equal(items.length, 5);
  assert.equal(days.length, 5, 'по одной в день');
  assert.ok(days[days.length - 1] >= '2026-10-15', `последняя выходит ${days[days.length - 1]} — период не использован`);
});

test('лишние статьи не теряются молча, а возвращаются списком', () => {
  const { items, overflow } = planSchedule(slugs(50), { ...base, days: 7, perDay: 3, random: seeded(5) });
  assert.equal(items.length, 21);
  assert.equal(overflow.length, 29);
  assert.equal(new Set([...items.map((i) => i.slug), ...overflow]).size, 50);
});

test('без перемешивания порядок статей сохраняется', () => {
  const { items } = planSchedule(slugs(6), { ...base, days: 3, perDay: 2, shuffle: false, random: seeded(9) });
  const ordered = [...items].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)).map((i) => i.slug);
  assert.deepEqual(ordered, slugs(6));
});

test('невозможные настройки объясняются словами, а не молчат', () => {
  assert.match(planSchedule(slugs(3), { ...base, startDate: '2026-02-30' }).error, /дату начала/);
  assert.match(planSchedule(slugs(3), { ...base, fromHour: 21, toHour: 9 }).error, /раньше/);
  assert.match(planSchedule(slugs(3), { ...base, perDay: 12, fromHour: 9, toHour: 12 }).error, /не помещается/);
  assert.match(planSchedule(slugs(3), { ...base, days: 0 }).error, /Период/);
});

test('«завтра» считается по Ташкенту, а не по поясу компьютера', () => {
  // 2026-09-30 20:00 UTC — в Ташкенте уже 1 октября, 01:00; завтра — 2 октября.
  assert.equal(ownerTomorrow(Date.UTC(2026, 8, 30, 20, 0)), '2026-10-02');
  assert.equal(ownerTomorrow(Date.UTC(2026, 8, 30, 10, 0)), '2026-10-01');
});

test('первая статья выходит в первый же день, а не через неделю', () => {
  const { items } = planSchedule(slugs(3), { ...base, random: seeded(21) });
  const days = items.map((item) => item.localDate).sort();
  assert.equal(days[0], '2026-10-01', 'первая — в день начала');
  assert.deepEqual(days, ['2026-10-01', '2026-10-08', '2026-10-15'], 'дальше — с равным шагом');
});
