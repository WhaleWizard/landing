import { formatEta, pageLockLabel, resolveLockCopy, type PageLock } from './page-locks';

/**
 * Заглушка закрытой страницы.
 *
 * Самодостаточный HTML: ни одного скрипта, ни одного запроса наружу. Под
 * матовым стеклом намеренно нет настоящей страницы — размытие снимается в
 * инструментах разработчика за пять секунд, и недописанный текст стал бы
 * публичным. Стекло собрано из абстрактного фирменного фона.
 *
 * Форма «сообщить, когда откроется» работает без JavaScript: обычная отправка
 * формы, затем переадресация обратно (иначе обновление страницы отправляло бы
 * почту повторно).
 */

export type PageLockFormState = 'idle' | 'ok' | 'duplicate' | 'error' | 'email' | 'limit';

export interface PageLockPageOptions {
  lock: PageLock;
  path: string;
  formState: PageLockFormState;
  formStamp: string;
}

const FORM_STATE_TEXT: Record<Exclude<PageLockFormState, 'idle'>, { tone: 'ok' | 'warn'; text: string }> = {
  ok: { tone: 'ok', text: 'Готово. Напишем на эту почту, как только страница откроется.' },
  duplicate: { tone: 'ok', text: 'Эта почта уже в списке — напишем, как только страница откроется.' },
  email: { tone: 'warn', text: 'Проверьте адрес почты: похоже, в нём опечатка.' },
  limit: { tone: 'warn', text: 'Слишком много попыток подряд. Попробуйте через минуту.' },
  error: { tone: 'warn', text: 'Не получилось сохранить. Попробуйте ещё раз чуть позже.' },
};

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeFormState(value: string | null): PageLockFormState {
  switch (value) {
    case 'ok':
    case 'duplicate':
    case 'error':
    case 'email':
    case 'limit':
      return value;
    default:
      return 'idle';
  }
}

const STYLES = `
:root {
  color-scheme: dark;
  --ink: #f5f5f7;
  --ink-soft: rgba(245, 245, 247, 0.72);
  --ink-faint: rgba(245, 245, 247, 0.52);
  --violet: #8b5cf6;
  --blue: #3b82f6;
  --line: rgba(255, 255, 255, 0.1);
  --font: "Onest", "Segoe UI Variable Text", "Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif;
}
@font-face {
  font-family: "Onest";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/hero/onest-400-normal-cyrillic.woff2") format("woff2");
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
@font-face {
  font-family: "Onest";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/hero/onest-400-normal-latin.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F, U+2192, U+2212, U+2215;
}
@font-face {
  font-family: "Onest";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/hero/onest-700-normal-cyrillic.woff2") format("woff2");
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
@font-face {
  font-family: "Onest";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/hero/onest-700-normal-latin.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F, U+2192, U+2212, U+2215;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: clamp(16px, 5vw, 48px);
  overflow-x: hidden;
  font-family: var(--font);
  color: var(--ink);
  background: #05060c;
  -webkit-font-smoothing: antialiased;
}
.sky {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 90% at 50% -10%, rgba(139, 92, 246, 0.24), transparent 60%),
    radial-gradient(90% 70% at 8% 100%, rgba(59, 130, 246, 0.2), transparent 62%),
    linear-gradient(180deg, #080a14 0%, #05060c 55%, #04050a 100%);
}
.sky::after {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.35;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.028) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.028) 1px, transparent 1px);
  background-size: 88px 88px;
  mask-image: radial-gradient(72% 60% at 50% 40%, #000 0%, transparent 78%);
  -webkit-mask-image: radial-gradient(72% 60% at 50% 40%, #000 0%, transparent 78%);
}
.orb {
  position: fixed;
  z-index: 0;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.55;
  pointer-events: none;
  will-change: transform;
}
.orb-a {
  width: min(46vw, 380px);
  height: min(46vw, 380px);
  top: -8%;
  right: -6%;
  background: radial-gradient(circle at 35% 35%, rgba(167, 139, 250, 0.75), rgba(139, 92, 246, 0) 68%);
  animation: drift-a 26s ease-in-out infinite;
}
.orb-b {
  width: min(52vw, 420px);
  height: min(52vw, 420px);
  bottom: -14%;
  left: -10%;
  background: radial-gradient(circle at 60% 40%, rgba(96, 165, 250, 0.62), rgba(59, 130, 246, 0) 70%);
  animation: drift-b 32s ease-in-out infinite;
}
@keyframes drift-a {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(-4%, 5%, 0) scale(1.07); }
}
@keyframes drift-b {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(5%, -4%, 0) scale(1.05); }
}
.card {
  position: relative;
  z-index: 1;
  width: min(100%, 560px);
  padding: clamp(24px, 5vw, 44px);
  text-align: center;
  border-radius: clamp(20px, 4vw, 30px);
  border: 1px solid var(--line);
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.022));
  backdrop-filter: blur(28px) saturate(140%);
  -webkit-backdrop-filter: blur(28px) saturate(140%);
  box-shadow: 0 40px 90px rgba(3, 5, 12, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.09);
}
.whale {
  display: block;
  width: 72px;
  height: 72px;
  margin: 0 auto 14px;
  filter: drop-shadow(0 10px 26px rgba(139, 92, 246, 0.4));
}
.eyebrow {
  margin: 0 0 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.9);
}
h1 {
  margin: 0 0 12px;
  font-size: clamp(25px, 5.6vw, 38px);
  line-height: 1.14;
  letter-spacing: -0.02em;
  font-weight: 700;
  background: linear-gradient(180deg, #ffffff, rgba(226, 222, 255, 0.78));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.lede {
  margin: 0 auto;
  max-width: 42ch;
  font-size: clamp(14px, 3.4vw, 16px);
  line-height: 1.62;
  color: var(--ink-soft);
}
.eta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid rgba(139, 92, 246, 0.32);
  background: rgba(139, 92, 246, 0.12);
  font-size: 13px;
  font-weight: 500;
  color: #ddd6fe;
}
.eta span { color: #fff; font-weight: 700; }
.notify {
  margin: 24px 0 0;
  padding-top: 22px;
  border-top: 1px solid var(--line);
  text-align: left;
}
.notify-title {
  margin: 0 0 10px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--ink-soft);
  text-align: center;
}
.row { display: flex; gap: 8px; flex-wrap: wrap; }
input[type="email"] {
  flex: 1 1 190px;
  min-width: 0;
  min-height: 48px;
  padding: 0 15px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(8, 10, 20, 0.6);
  color: var(--ink);
  font: 400 15px/1.4 var(--font);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
input[type="email"]::placeholder { color: rgba(245, 245, 247, 0.34); }
input[type="email"]:focus {
  outline: none;
  border-color: rgba(139, 92, 246, 0.7);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.22);
}
.submit {
  flex: 0 0 auto;
  min-height: 48px;
  padding: 0 20px;
  border: 0;
  border-radius: 14px;
  cursor: pointer;
  font: 600 15px/1 var(--font);
  color: #fff;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  box-shadow: 0 10px 24px rgba(99, 102, 241, 0.34);
  transition: transform 160ms ease, box-shadow 160ms ease;
}
.submit:hover { transform: translateY(-1px); box-shadow: 0 14px 30px rgba(99, 102, 241, 0.42); }
.submit:active { transform: translateY(0); }
.consent {
  display: flex;
  gap: 9px;
  margin-top: 12px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--ink-faint);
  cursor: pointer;
}
.consent input {
  flex: none;
  width: 17px;
  height: 17px;
  margin: 1px 0 0;
  accent-color: var(--violet);
  cursor: pointer;
}
.consent a { color: rgba(196, 181, 253, 0.95); }
.trap,
.sr-only {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.note {
  margin: 22px 0 0;
  padding: 13px 16px;
  border-radius: 14px;
  font-size: 13.5px;
  line-height: 1.5;
  text-align: center;
}
.note-ok {
  border: 1px solid rgba(52, 211, 153, 0.32);
  background: rgba(16, 185, 129, 0.12);
  color: #a7f3d0;
}
.note-warn {
  border: 1px solid rgba(251, 191, 36, 0.32);
  background: rgba(245, 158, 11, 0.12);
  color: #fde68a;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 24px;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 22px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
}
.btn-primary {
  color: #fff;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  box-shadow: 0 12px 28px rgba(99, 102, 241, 0.36);
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 16px 34px rgba(99, 102, 241, 0.44); }
.btn-ghost {
  color: var(--ink);
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.04);
}
.btn-ghost:hover { background: rgba(255, 255, 255, 0.09); }
.foot {
  margin: 18px 0 0;
  font-size: 12.5px;
  color: var(--ink-faint);
}
a:focus-visible,
button:focus-visible,
input:focus-visible {
  outline: 2px solid #a78bfa;
  outline-offset: 2px;
}
@media (max-width: 380px) {
  .row { flex-direction: column; }
  .submit { width: 100%; }
  .actions { flex-direction: column; }
  .btn { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .orb { animation: none; }
  .btn, .submit { transition: none; }
}
`;

function renderNotifyForm(options: PageLockPageOptions): string {
  const { lock, path, formState, formStamp } = options;
  if (formState === 'ok' || formState === 'duplicate') {
    const state = FORM_STATE_TEXT[formState];
    return `<p class="note note-${state.tone}">${escapeHtml(state.text)}</p>`;
  }

  if (!lock.showSubscribe || !formStamp) {
    return formState === 'idle' ? '' : renderStateNote(formState);
  }

  return `${renderStateNote(formState)}
      <form class="notify" method="post" action="/api/page-lock-notify">
        <p class="notify-title">Написать вам, когда страница откроется?</p>
        <input type="hidden" name="path" value="${escapeHtml(path)}">
        <input type="hidden" name="stamp" value="${escapeHtml(formStamp)}">
        <div class="trap" aria-hidden="true"><label>Компания<input type="text" name="company" tabindex="-1" autocomplete="off"></label></div>
        <div class="row">
          <label class="sr-only" for="ww-email">Ваша почта</label>
          <input id="ww-email" type="email" name="email" required maxlength="120" autocomplete="email" placeholder="you@example.com" inputmode="email">
          <button class="submit" type="submit">Сообщить</button>
        </div>
        <label class="consent">
          <input type="checkbox" name="consent" value="1" required>
          <span>Согласен на обработку почты для одного письма об открытии страницы — <a href="/privacy-policy">политика конфиденциальности</a></span>
        </label>
      </form>`;
}

function renderStateNote(formState: PageLockFormState): string {
  if (formState === 'idle') return '';
  const state = FORM_STATE_TEXT[formState];
  if (!state) return '';
  return `<p class="note note-${state.tone}">${escapeHtml(state.text)}</p>`;
}

export function renderPageLockHtml(options: PageLockPageOptions): string {
  const { lock, path } = options;
  const copy = resolveLockCopy(lock);
  const eta = formatEta(lock.eta);
  const ctaLabel = pageLockLabel(lock.ctaPath);
  const showCta = lock.ctaPath !== '/';

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#05060c">
<title>${escapeHtml(copy.title)} — Whale Wizard</title>
<link rel="icon" href="/images/brand/whale-wizard-96.webp" type="image/webp">
<link rel="preload" as="font" type="font/woff2" href="/fonts/hero/onest-700-normal-cyrillic.woff2" crossorigin>
<style>${STYLES}</style>
</head>
<body>
<div class="sky" aria-hidden="true"></div>
<div class="orb orb-a" aria-hidden="true"></div>
<div class="orb orb-b" aria-hidden="true"></div>
<main class="card">
  <img class="whale" src="/images/brand/whale-wizard-96.webp" width="72" height="72" alt="" decoding="async">
  <p class="eyebrow">Whale Wizard</p>
  <h1>${escapeHtml(copy.title)}</h1>
  <p class="lede">${escapeHtml(copy.message)}</p>
  ${eta ? `<p class="eta">Планируем открыть <span>${escapeHtml(eta)}</span></p>` : ''}
  ${renderNotifyForm(options)}
  <div class="actions">
    <a class="btn btn-primary" href="/">На главную</a>
    ${showCta ? `<a class="btn btn-ghost" href="${escapeHtml(lock.ctaPath)}">${escapeHtml(ctaLabel)}</a>` : ''}
  </div>
  <p class="foot">Остальные разделы сайта работают как обычно.</p>
</main>
</body>
</html>`;
}

/**
 * Ответ закрытой страницы.
 *
 * Код 503 «временно недоступна», а не 404 и не 200: 404 сказал бы поиску
 * «страницы больше нет» и выбросил бы её из индекса, а 200 с заглушкой создал
 * бы в индексе пустую страницу — ровно ту проблему, из-за которой в проекте
 * уже чинили soft-404.
 */
export function renderPageLockResponse(options: PageLockPageOptions): Response {
  return new Response(renderPageLockHtml(options), {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '3600',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
