# Журнал: пакет A, группа page-static

Исполнитель workflow perf-a, сессия 06.10.2026. Задание A2 и A4: `/faq`, `/marketing-glossary`, `/offer`, `/privacy-policy`, `/cookie-policy`, `/thank-you` пригодны к серверному рендеру и гидратации; попутно F-011 и F-096.
Файлы группы: `src/app/pages/FAQPage.tsx`, `MarketingGlossaryPage.tsx`, `Offer.tsx`, `PrivacyPolicy.tsx`, `CookiePolicy.tsx`, `ThankYou.tsx`, `src/app/components/legal/*`, `src/app/content/*`, `src/app/utils/leadContext.ts`.
Прогон гидратации (временный, в scratchpad сессии): `static-hydration.mjs` — рендер через `createStaticRouter` без охраны `SSR_ROUTES`, затем `hydrateRoot` в jsdom по образцу `scripts/first-screen-hydration.test.js`.

## Записи

- Шаг 0 — прочитан `perf-a-scout.md`; по группе: пункт A (ленивый Footer без ClientOnly — 6 файлов), B (`m.*` с `opacity:0` — FAQ ×2, словарь ×1, «спасибо» ×5), E (нет `data-ww-title-fit` — FAQ, словарь h1+h2, три юридические), `/thank-you` читает `sessionStorage` в `useState`, словарь без определений в React-разметке (F-096), F-011 — `setQuery('')` в `openTerm` и в эффекте хеша уже есть в коде (коммит e55dce6), статус в findings не обновлён — проверить поведение прогоном.
