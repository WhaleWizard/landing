# 404 «Портал закрыт» — Design QA после luxury/motion-прохода

## Источники истины и нормализация

- Исходный пользовательский референс композиции: `C:\Users\Asus\AppData\Local\Temp\codex-clipboard-1d7d02f6-ff97-47ad-b7e1-a412819de09b.png`, 662 × 478 px.
- Нормализованный desktop-референс: `D:\Dev\Projects\Landing\tmp\404-reference-desktop.png`, 1440 × 1024 px.
- Точный mobile-референс: `D:\Dev\Projects\Landing\tmp\404-reference-mobile.png`, 390 × 844 px.
- Утверждённая пользователем геометрия до UI-прохода: `D:\Dev\Projects\Landing\tmp\404-implementation-desktop-final.png` и `D:\Dev\Projects\Landing\tmp\404-implementation-mobile-final.png`.
- Скриншот проблемы с читаемостью верхнего текста: `C:\Users\Asus\AppData\Local\Temp\codex-clipboard-1f9604f4-bcef-453e-b0bd-b0ed98a0cdd9.png`, 743 × 450 px.
- Финальный desktop implementation: `D:\Dev\Projects\Landing\tmp\404-motion-implementation-desktop-final.png`, CSS viewport 1440 × 1024.
- Финальный mobile implementation: `D:\Dev\Projects\Landing\tmp\404-motion-implementation-mobile-final.png`, CSS viewport 390 × 844.

In-app Browser работает с системным масштабом 1.5. Для сохранения comparison-файлов stage на время кадра был нормализован коэффициентом `2/3`, после чего временное правило удалено. Полученные файлы имеют ровно 1440 × 1024 и 390 × 844 px. Геометрия дополнительно измерена в живом DOM без capture-scale; итоговый код не содержит QA-transform.

## Состояния

- Desktop: сохранённый маршрут `/blog`; context `До портала / Блог`, CTA `Вернуться в блог` и `На главную`.
- Mobile: реальная длинная статья `/blog/kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh`; context обрезается визуальным ellipsis, а accessible title и маршрут остаются полными.
- Static copy: `404 · ПОРТАЛ ЗАКРЫТ`, `Эта страница выпала из воронки.`, `Без паники — точка возврата сохранилась.`

## Визуальные доказательства

- Full desktop, утверждённая геометрия слева / новый UI справа: `D:\Dev\Projects\Landing\tmp\404-motion-design-qa-desktop.png`.
- Full mobile, утверждённая геометрия слева / новый UI справа: `D:\Dev\Projects\Landing\tmp\404-motion-design-qa-mobile.png`.
- Focused desktop actions: `D:\Dev\Projects\Landing\tmp\404-motion-design-qa-actions.png`.
- Focused mobile actions с длинным названием статьи: `D:\Dev\Projects\Landing\tmp\404-motion-design-qa-actions-mobile.png`.
- Дополнительный top-crop issue reference: `D:\Dev\Projects\Landing\tmp\404-motion-design-qa-header.png`; он используется как evidence проблемы, но не как пиксельный full-view target из-за отличающегося crop системного браузера.

Focused comparisons обязательны: full-view подтверждает сохранение портала, карточки и кита, а увеличенные action-регионы позволяют оценить иконки, border treatment, text truncation и иерархию двух CTA.

## Comparison history

### Итерации 1–4 — исходная композиция

- P1: круг, карточка и кит находились в разных системах координат; исправлено единым orbit-wrapper.
- P1: глубина портала, grid и diffuse halo не совпадали с референсом; исправлено отдельными raster-слоями depth/aura/grid/accent без изменения масштаба.
- P1/P2: обнаружены проблемы 768 × 600, длинного title, CTA contrast, cookie collision и portrait-tablet breakpoint; исправлены clamps, отдельный tablet mode, long-title guard, доступная cookie area и затемнение CTA surface.
- P2: SPA-route требовал focus announcement без декоративной рамки на H1; focus перенесён на заголовок, outline снят только с неинтерактивного H1.
- Evidence предыдущего финального цикла остаётся в `D:\Dev\Projects\Landing\tmp\404-design-qa-*-final.png`.

### Итерация 5 — новый UI, заблокировано

- P2, typography/colors: верхний текст лежал непосредственно на ярких кольцах, а две строки имели слишком близкую визуальную массу.
- P2, content/affordance: primary CTA повторял длинный title статьи внутри огромной кнопки; отдельного ясного secondary action не было.
- P2, polish/icons: action-area выглядела как две стандартные прямоугольные поверхности без цельной премиальной иконографики.
- P2, behavior: существовало только дыхание wand-glow; не было цельного motion-language и полного reduced-motion покрытия для новых эффектов.

Исправления:

- Добавлена мягкая radial-подложка под intro через абсолютный pseudo-layer без padding, border и изменения flow.
- Только `404` получил анимированный purple/blue clipped-text gradient; метрики H1, `top`, `left`, `width` и `scaleX` сохранены.
- Copy сокращён и разведен по иерархии; нижняя строка стала заметно тише.
- Context превращён в компактную маршрутную панель с иконкой; длинный source title использует однострочный ellipsis.
- Добавлена пара реальных CTA: короткий возврат по сохранённому маршруту и отдельный переход на главную, оба с иконками из доминирующей в проекте `lucide-react`.
- Добавлены staged entrance, slow aura/halo breathing, whale float, wand glow и hover sheen. Motion использует только `opacity`, `transform` и `background-position`; layout-свойства не анимируются.
- Все новые анимации и transitions отключаются в `prefers-reduced-motion: reduce`.

Post-fix evidence: финальные full и focused comparisons из раздела выше.

### Итерация 6 — пройдено

- P2: worst-case белый текст на raster CTA после первого UI-прохода мог опускаться примерно до 4.44:1.
- Исправление: поверх исходного raster добавлен нейтральный 8% dark layer без изменения цвета/геометрии. Пересчитанный worst-case contrast — 5.07:1.
- Actionable P0/P1/P2 после повторной проверки не осталось.

## Required fidelity surfaces

- Fonts and typography: сохранены семейство `marketing-typography`, H1 `4.45cqw`, weight, tracking, line-height и `scaleX(1.1)`. На desktop подзаголовки получили `clamp(16px, 1.65cqw, 23.76px)` и `clamp(13px, 1.28cqw, 18.43px)`; mobile сохраняет собственную шкалу. Градиентный span не является `inline-block` и не меняет kerning/wrap.
- Spacing and layout rhythm: desktop stage `1440 × 1024`, orbit `x234.45/y31.34/w949.51`, card `x538.28/y320.94/w363.66/h319.69`, intro `x187.70/y112.14/w1064.60`, actions `x440.18/y686.88/w559.64`. Эти якоря совпадают с утверждённой версией. Mobile 390: orbit `x22.63/y12.46/w355.63`, card `x125.75/y123.05`, intro `y390.81`, actions `y536.18`.
- Colors and tokens: cinematic dark underlay не имеет видимой прямоугольной рамки; `404` использует controlled purple/blue gradient. Статические контрасты: tagline 14.44:1, lead 7.30:1, context 12.90:1, secondary CTA 13.79:1, note 4.66:1, tertiary links 8.85:1. Primary CTA worst case 5.07:1.
- Image quality and asset fidelity: portal/card/whale/wand остаются исходными raster-assets. Ни один visual asset не заменён CSS-art или самодельным SVG. Иконки — из существующей библиотеки проекта.
- Copy and content: copy короткая, связана с performance-маркетингом и не мешает навигации. Видимая CTA больше не повторяет title статьи. В long-title state строка `Как Meta Ads и Google Ads создают эффективную воронку продаж` имеет `scrollWidth 433` при `clientWidth 288`, корректно показывая ellipsis без роста блока.
- States and accessibility: H1 программно получает focus при входе, primary и secondary имеют доступные имена, links и buttons сохраняют `:focus-visible`, touch targets не меньше 44 px, decorative icons имеют `aria-hidden`, motion учитывает `prefers-reduced-motion`.

## Responsive и поведение

- Проверены 320 × 568, 390 × 844, 453 × 980, 768 × 600, 768 × 1024, 1440 × 1024 и 1920 × 930.
- На всех размерах `document scrollWidth - clientWidth = 0` и `document scrollHeight - clientHeight = 0`; обе CTA целиком находятся внутри action-row.
- На 320 × 568 note скрыта как декоративная, основные кнопки и четыре destination-link доступны.
- Flow `статья → отсутствующий route → Назад к статье` вернул точный URL статьи.
- Secondary CTA `На главную` перевёл на `/`.
- После входа active element — `H1#not-found-title`.
- Vite/React error overlay отсутствует.
- `npm run build` — успешно: production Vite build и 28 статических routes.
- `git diff --check` — без whitespace errors.

## Остаточные P3

- Сохранённые comparison-кадры слегка мягче live-browser из-за нормализации системного DPR 1.5. В живом preview браузерный текст и Lucide-иконки остаются нативно резкими.
- Ambient motion намеренно очень слабый; дальнейшее усиление halo/blur дало бы больше «эффекта», но повысило бы GPU cost и риск clipping, поэтому не рекомендуется.

Actionable P0/P1/P2 расхождений не осталось.

**final result: passed**

---

# Meta Ads + Consultation hero — revision after user feedback

This pass supersedes the original Meta Ads/Consultation snapshot retained below for history.

## Source truth and normalization

- Required light-paper Meta collage: `C:\Users\Asus\AppData\Local\Temp\codex-clipboard-a7de4e80-f9b0-4616-8186-c60ab0a9cae4.png`, 544 × 722 px.
- User crop requesting unusual collage typography: `C:\Users\Asus\AppData\Local\Temp\codex-clipboard-12d3f2df-538c-4447-ae75-d8227b23b58c.png`, 619 × 786 px.
- Meta wrapping issue reference: `C:\Users\Asus\AppData\Local\Temp\codex-clipboard-9f45e6dc-bd8a-4c98-b906-7aa528af6eb3.png`, 544 × 295 px.
- Consultation wrapping issue reference: `C:\Users\Asus\AppData\Local\Temp\codex-clipboard-49f671bd-c814-4f0e-8ce6-ca1c830f45f9.png`, 499 × 449 px.
- Consultation paragraph target: `C:\Users\Asus\AppData\Local\Temp\codex-clipboard-d36e149f-fbc4-4b36-80a0-f409e3a94127.png`, 660 × 115 px.
- Final Meta raster: `D:\Dev\Projects\Landing\public\images\meta-ads-proof-collage-v3.webp`, 1086 × 1448 px, 117,438 bytes.

The collage comparison normalizes only scale: the 544 × 722 source is resized to the measured browser crop height. The browser screenshot itself is not recolored or restyled. Mobile screenshots were captured from CSS viewports 320 × 844, 390 × 844 and 453 × 900; the in-app browser image excludes its 15 px scrollbar gutter, while DOM measurements use the full CSS viewport.

## Browser evidence

- Meta desktop, CSS viewport 1440 × 900: `D:\Dev\Projects\Landing\tmp\hero-qa-v2\meta-v3-1440-viewport.png` (1425 × 891 captured pixels).
- Meta mobile, CSS viewport 390 × 844: `D:\Dev\Projects\Landing\tmp\hero-qa-v2\meta-v3-390-viewport.png` (375 × 812 captured pixels).
- Meta narrow/mobile checks: `meta-320-viewport.png` and `meta-v3-453-viewport.png` in the same directory.
- Consultation desktop, CSS viewport 1440 × 900: `D:\Dev\Projects\Landing\tmp\hero-qa-v2\consult-1440-viewport.png`.
- Consultation mobile: `consult-320-viewport.png`, `consult-390-viewport.png`, and `consult-453-viewport.png` in the same directory.
- Focused source/browser collage comparison: `D:\Dev\Projects\Landing\tmp\hero-qa-v2\meta-collage-reference-vs-browser.png`.
- Focused headline comparison: `D:\Dev\Projects\Landing\tmp\hero-qa-v2\meta-heading-before-vs-browser.png`.
- Focused consultation paragraph comparison: `D:\Dev\Projects\Landing\tmp\hero-qa-v2\consult-paragraph-reference-vs-browser.png`.

Focused comparisons are required here: full-page captures establish hierarchy and responsive flow, while the collage and text crops keep the exact paper treatment, type character, copy, and wrapping readable at inspection scale.

## Comparison history

### Iteration 1 — blocked

- P1, image fidelity: the old Meta collage used dark neon photographs and dark backing paper, while the selected reference required bright ivory photographs and light paper underlays on the existing dark Whale Wizard canvas.
- P2, responsive typography: both mobile H1s broke into four visual lines; the user requires exactly two.
- P2, typography consistency: Meta used Prata, Onest, and a third Caveat annotation face, creating the visible font scatter the user rejected.
- P2, Consultation text rhythm: the final format/cost paragraph needed a flat, unboxed treatment and the three-line desktop rhythm shown in the source crop.

Fixes:

- Replaced the Meta visual with a new project-bound raster matching the source order and proportions: cart, bell, laptop/cap; off-white photo borders; light torn paper/tape; cobalt arrows and underlines; dark brand backdrop.
- Changed the static Meta accent to `клиенты, а не лиды` and made each mobile title phrase a non-wrapping block with responsive optical sizing.
- Removed every Caveat declaration and every separate handwritten HTML annotation from the Meta hero. The live hero CSS now uses only Prata and Onest.
- Kept the Consultation paragraph as ordinary text with no card, border, or accent line; at 1440 px it measures exactly three lines (`80.625 / 26.88 = 3`).

### Iteration 2 — blocked

- P2, user-directed polish: the first light collage matched the composition but its clean sans-serif was too ordinary after the user's explicit request for unusual text.

Fix:

- Generated `meta-ads-proof-collage-v3.webp` as a text-style-only revision using one narrow premium editorial neo-grotesk with Cyrillic. All five text blocks use the same family; photography, paper, tape, arrows, underlines, glow, copy, and geometry remain unchanged.

### Iteration 3 — passed

- Source and browser were placed into the same focused comparison inputs listed above.
- No actionable P0/P1/P2 mismatch remains. The dark page background and blue/violet/pink glow are intentional brand constraints; light surfaces are limited to the photographic prints and paper underlays as requested.

## Required fidelity surfaces

- Fonts and typography: Meta CSS loads Prata 400 for the two-line editorial H1 and Onest 400/500/600 for all live copy/UI. The raster uses one consistent unusual condensed graphic face rather than several annotation styles. At 320/390/453 px, Meta H1 heights are 53.98/66.65/69.23 px and Consultation H1 heights are 51.28/63.40/69.58 px: exactly two lines in every case.
- Spacing and layout rhythm: desktop Meta remains a two-column hero with a 560 px collage; mobile order is copy → actions → collage → proof. Mobile gutters are 16/20 px, buttons are 51–52 px high, and neither route has horizontal overflow (`scrollWidth === clientWidth`).
- Colors and tokens: the page remains `#08090e`/near-black with the existing `#4F7DFF → #B04DFF → #FF7AB6` brand system. Ivory is confined to the generated photo/paper composition. Consultation retains its existing violet/indigo/blue theme.
- Image quality and fidelity: the browser loads the final 1086 × 1448 WebP at its natural dimensions; LCP preload points to the same v3 file. There is no placeholder, CSS illustration, custom SVG art, or reconstructed paper/card drawing.
- Copy and content: all requested visible case labels are present: `E-commerce · 30k+ покупок`, `Консьерж · 65k+ лидов`, `Инфопродукты · CPL до $5`, plus `Смотреть кейсы →` and `ПРАКТИКА, НЕ ОБЕЩАНИЯ`. No additional performance value was introduced.
- Accessibility and behavior: both heroes retain semantic H1/section labelling, meaningful image alt text, real buttons, focus-visible behavior, forced-colors fallbacks, reduced-motion overrides, and ≥44 px targets.

## Interaction, console, and build validation

- Meta primary scrolls to `#contact` (`contactTop ≈ 46 px` after settling); Meta secondary scrolls to `#cases` (`casesTop ≈ 88 px`).
- Consultation primary scrolls to `#contact` (`contactTop ≈ 20 px`).
- Fresh local tabs contain no React/application error. The existing Meta Pixel traffic-permission warning on localhost remains unrelated to these hero changes.
- `npm run check` passed: app/functions typechecks, Meta CAPI, lead reliability, tracking security, SEO content/output, calculators, glossary, admin imports, production build, and 28 generated static routes.
- Generated `/meta-ads` HTML preloads `/images/meta-ads-proof-collage-v3.webp`; `/consult` preloads `/images/consult-hero-studio.webp`.
- `git diff --check` passed with no whitespace errors.

No P3 item remains that should delay this handoff.

**final result: passed**

---

# Meta Ads + Consultation hero — Design QA

## Источники и нормализация

- Meta Ads desktop reference: `C:\Users\Asus\.codex\generated_images\019fd8c7-84da-7522-807b-af4ba5a4a8a8\exec-1c3b570d-0233-47c1-baf8-ea9bf7d33b5d.png`.
- Meta Ads mobile reference: `C:\Users\Asus\.codex\generated_images\019fd8c7-84da-7522-807b-af4ba5a4a8a8\exec-e981914e-5256-4590-aae9-51b7bb08d314.png`.
- Consultation desktop reference: `C:\Users\Asus\.codex\generated_images\019fd8c7-84da-7522-807b-af4ba5a4a8a8\exec-610b066a-3944-4184-a652-78cc8b3126b1.png`.
- Consultation mobile reference: `C:\Users\Asus\.codex\generated_images\019fd8c7-84da-7522-807b-af4ba5a4a8a8\exec-fb14ec0b-b55b-49a4-99e1-ef8489ba3a2f.png`.
- User constraint applied as a design invariant: Meta Ads keeps the Whale Wizard dark canvas and blue/violet/pink palette; only the editorial composition, typography, paper, tape and photo-clipping language is transferred from the light reference.
- References were normalized with `ImageOps.fit` to the exact implementation viewport before comparison. No transform or QA-only style remains in the application.

## Visual evidence

- Meta Ads desktop implementation, 1440 × 900: `D:\Dev\Projects\Landing\tmp\hero-qa\meta-desktop-1440x900.png`.
- Meta Ads mobile implementation, 390 × 844: `D:\Dev\Projects\Landing\tmp\hero-qa\meta-mobile-390x844.png`.
- Consultation desktop implementation, 1440 × 900: `D:\Dev\Projects\Landing\tmp\hero-qa\consult-desktop-1440x900.png`.
- Consultation mobile implementation, 390 × 844: `D:\Dev\Projects\Landing\tmp\hero-qa\consult-mobile-390x844.png`.
- Side-by-side comparisons: `D:\Dev\Projects\Landing\tmp\hero-qa\meta-desktop-comparison.png`, `meta-mobile-comparison.png`, `consult-desktop-comparison.png`, `consult-mobile-comparison.png`.

## Comparison passes

### Pass 1 — layout, typography and imagery

- Meta Ads maps the reference's split editorial grid, oversized high-contrast serif headline, vertical proof label, handwritten annotations and three torn photographic prints onto `#08090e`. The page background does not become white; warm paper appears only inside the generated raster collage.
- Meta display typography uses self-hosted Prata 400 with an explicit real weight, avoiding the global synthetic 700 rule. Onest handles Russian body/UI text and Caveat handles annotations.
- Consultation preserves the reference's 54/46 desktop split: documentary workspace photography on the left and offer/copy on the right. Mobile changes to copy-first followed by the full-width workspace image, matching the selected mobile direction.
- Consultation uses Commissioner for a separate humanist character and Bad Script for the handwritten note; it does not reuse the Meta editorial serif system.
- Both pages render the exact current `pageConfigs` hero copy, buttons and proof values. No new performance number is invented.

### Pass 2 — actionable findings and fixes

- P2, Meta layout: the proof rail initially fell below the 1440 × 900 viewport because the portrait collage dominated row height. Fixed by reducing the desktop collage to a 540 px editorial column and anchoring the three-item proof rail to the hero bottom. Final measured rail is `top=825`, `bottom=900`; hero is exactly 900 px.
- P2, runtime quality: React 18 logged a development warning for camel-case `fetchPriority`. Fixed by using `loading="eager"` on both LCP images and route-specific static HTML image preloads with `fetchpriority="high"`. Fresh browser tabs report no React errors.
- P2, responsiveness: tested 320, 390 and 1440 px. Both H1 boxes remain inside content gutters; primary and secondary mobile buttons are 51–52 px high; `scrollWidth` equals the document client width, so there is no horizontal overflow.
- P2, interactions: Meta primary scrolls to `#contact`, secondary to `#cases`; Consultation primary scrolls to `#contact`. The shared mobile menu opens as a dialog, locks body scrolling and closes without leaving the page locked.

## Required fidelity surfaces

- Fonts and typography: Meta — Prata / Onest / Caveat; Consultation — Commissioner / Bad Script. All production faces are local WOFF2 with Cyrillic and Latin subsets and `font-synthesis: none` inherited from the marketing root.
- Spacing and layout: Meta uses a 1440 px max canvas with 48 px desktop gutters and 20/16 px mobile gutters. Consultation uses a full-bleed photo split on desktop and a natural vertical flow on mobile; neither hero is forced into a cramped single screen.
- Colors: Meta uses the existing `#4F7DFF → #B04DFF → #FF7AB6` brand gradient on a near-black canvas. Consultation keeps the existing violet/indigo/blue route theme with warm espresso/cream photography.
- Image quality: both primary visuals are newly generated raster assets, optimized to WebP (`meta-ads-editorial-collage.webp` 1122 × 1402; `consult-hero-studio.webp` 1448 × 1086). No placeholder imagery, handcrafted SVG illustration or div-art replacement is used.
- Icons: visible interface icons come from the project's existing `lucide-react` library; decorative image arrows/tape are part of the real raster artwork.
- Accessibility: semantic H1/section labelling, meaningful image alt text, decorative labels hidden from the accessibility tree, real buttons, existing focus-visible rings, ≥44 px touch targets, reduced-motion overrides and forced-colors fallbacks are present.
- Font library: 24 Cyrillic-capable families are stored locally. Only the five selected families are declared by the two route CSS chunks, so the broader design library does not become visitor download cost.

## Residual P3

- Meta's real service copy is materially longer than the generated concept copy, so on 390 px the collage begins near the bottom of the first viewport instead of showing all three prints immediately. This is intentional: preserving the exact business copy and readable line-height has priority over compressing the text or shrinking tap targets.
- The local Meta Pixel emits its existing traffic-permission warning in development. It is unrelated to the hero implementation; fresh tabs contain no React/application errors.

No actionable P0/P1/P2 findings remain.

**final result: passed**

---

# Meta Ads + Consultation heroes — final layered implementation QA

This section supersedes every earlier QA snapshot in this file. Older sections remain only as implementation history.

## Source truth and normalization

- Meta collage/layout source: `C:\Users\Asus\AppData\Local\Temp\codex-clipboard-a7de4e80-f9b0-4616-8186-c60ab0a9cae4.png` (544 × 722).
- Consultation direction source: `C:\Users\Asus\.codex\generated_images\019fd8c7-84da-7522-807b-af4ba5a4a8a8\exec-610b066a-3944-4184-a652-78cc8b3126b1.png` (1586 × 992).
- Spacing feedback sources: `codex-clipboard-233ee4b1-3aea-4434-8908-b30f2850b515.png` and `codex-clipboard-9b5c122c-93fb-4410-9ffc-15d4f4d9bb37.png`.
- Desktop proof-placement source: `codex-clipboard-330d087a-7ad6-4e98-b658-491f5ee96538.png`.
- Final implementation captures: `tmp/layered-qa/meta-desktop.png`, `meta-mobile-390.png`, `consult-desktop.png`, and `consult-mobile-390.png`.
- Desktop browser captures are 1425 × 891 from a 1440 × 900 CSS viewport after browser chrome/scrollbar normalization. Mobile captures are 375 × 812 from a 390 × 844 CSS viewport. Side-by-side evidence was scaled only to a common inspection height; no recoloring, retouching, or QA-only application style was used.

## Finding history and resolution

1. **P1 — flat generated collage and fake CTA.** The first Meta iteration embedded photography, labels, arrows, paper, and “Смотреть кейсы” in one raster image. It could not reflow or behave like a button. Replaced with three standalone photographs, independent paper/tape/arrow/underline layers, live HTML labels, and a real keyboard-focusable button that scrolls to `#cases`.
2. **P1 — weak consultation crop and missing paragraph emphasis.** Replaced with dedicated desktop 4:5 and mobile 16:10 workspace photographs. The second paragraph now has a live blue/violet/pink vertical rule and remains readable at every tested width.
3. **P2 — clipped consultation desktop title.** Before correction, accent lines had scroll widths of 587/627 px inside a 517 px box. The final measured lines are 545/545 px inside a 545 px box.
4. **P2 — Meta collage ending too tightly.** The initial art-to-motto gap was about 12.6 px on desktop and 0.5 px on mobile. Final spacing is about 25 px on desktop and 28.9 px on mobile, with the paper edge, motto, and following content fully separated.
5. **User-directed desktop proof placement.** Pixel / CAPI / CRM now forms a compact 560 px three-column rail directly beneath the two desktop CTA buttons. At ≤1023 px the desktop rail is hidden and the mobile rail remains after the collage. Only one copy is visible and exposed to accessibility APIs at a time.

## Required fidelity surfaces

- Typography: Meta uses only Prata + Onest; Consultation uses Commissioner. Cyrillic faces are locally hosted with real declared weights and no synthetic display bolding.
- Meta palette: the page stays on Whale Wizard near-black with `#4F7DFF → #B04DFF → #FF7AB6`; ivory is limited to physical paper/photo layers.
- Meta copy: `E-commerce / 30k+ покупок`, `Консьерж / 65k+ лидов`, and `Инфопродукты / CPL до $5` are live text. No additional result number was introduced.
- Imagery: final project-bound assets live under `public/images/meta-proof/` and `public/images/consult-proof/`; responsive crops have safe object margins and do not depend on one flattened square collage.
- Motion: layered entrances and restrained float/arrow motion run on capable desktop pointers; coarse/mobile pointers avoid looping movement; `prefers-reduced-motion` is static.
- Responsive quality: 320, 390, 1024, and 1440 px were checked. Both mobile H1s resolve to exactly two visual lines, all tap targets remain at least 44 px, and `scrollWidth === clientWidth` at 320/390/1440.
- Accessibility: semantic sections/H1, real buttons, focus-visible states, descriptive photo alternatives where meaningful, hidden decorative layers, forced-colors fallbacks, and reduced-motion behavior are present.

## Interaction, runtime, and production validation

- Meta “Смотреть кейсы” is visible, enabled, unique, and after activation lands the cases section near the fixed-header offset (`casesTop ≈ 93 px`). Existing primary and secondary hero CTAs retain their original scroll behavior.
- Consultation CTA behavior is unchanged; both responsive image sources were confirmed in-browser.
- Fresh browser error log: empty. The pre-existing Meta Pixel localhost traffic-permission warning is unrelated and is not an application error.
- Route-specific LCP preloads point to `meta-proof/ecommerce-photo.webp`, `consult-proof/workspace-mobile.webp`, and `consult-proof/workspace-portrait.webp` at their matching media queries.
- `npm run check` passed after the final proof-rail move: functions/app typechecks, Meta CAPI, lead reliability, tracking security, SEO content/output, calculators, glossary, admin imports, production build, and all 28 generated routes.
- `git diff --check` passed with no whitespace errors.

No actionable P0, P1, P2, or handoff-blocking P3 finding remains.

**final result: passed**
