# Design QA — Meta Apps hero

Date: 2026-07-26  
Route: `/meta-apps/`

## Источник визуальной истины

- Desktop: `C:\Users\Asus\OneDrive\Рабочий стол\call_32GktYnjiCFjk5ws8vuvd9Ds.png`
- Mobile: `C:\Users\Asus\OneDrive\Рабочий стол\call_wTN6WBauGTRhB7rGrWWye5Rb.png`
- Содержимое телефона: `C:\Users\Asus\AppData\Local\Temp\codex-clipboard-d9a6f32b-9da1-4176-94ea-11a0e17a461b.png`
- Последний дефектный desktop-кадр: `C:\Users\Asus\AppData\Local\Temp\codex-clipboard-6220ff4a-684f-48a7-978f-83e4eb7c7eb2.png`

## Реализация и доказательства

- Короткий desktop: `D:\Dev\Projects\Landing\implementation-meta-apps-desktop-final.png`
- Desktop в размере референса: `D:\Dev\Projects\Landing\implementation-meta-apps-desktop-reference-viewport.png`
- Общая desktop-пара: `D:\Dev\Projects\Landing\design-qa-desktop-comparison-final.png`
- Фокус на подставке: `D:\Dev\Projects\Landing\design-qa-stone-focus-final.png`
- Mobile 390 px: `D:\Dev\Projects\Landing\implementation-meta-apps-mobile-final.png`
- Mobile 453 px: `D:\Dev\Projects\Landing\implementation-meta-apps-mobile-453-full-final.png`
- Mobile-пара: `D:\Dev\Projects\Landing\design-qa-mobile-comparison.png`
- Фокус на телефоне: `D:\Dev\Projects\Landing\design-qa-phone-comparison.png`

## Viewport и нормализация

- Desktop-референс: 1487 × 1058 px.
- Desktop-реализация: viewport 1488 × 1059 CSS px, device scale factor 1; browser-capture 1473 × 1049 px.
- Короткий desktop: viewport 1365 × 755 CSS px; browser-capture 1350 × 747 px.
- Общая пара размещает исходные изображения рядом без неравномерного масштабирования.
- Фокусная пара использует одинаковый нижний диапазон `y=760…1049`.
- Mobile дополнительно проверен при ширине 453 px; desktop-правило не применяется благодаря `min-width: 1280px`.
- Состояние: hero после завершения входной анимации, без hover/focus.

## История сравнения

### Итерации 1–6

Ранее устранены: плоский корпус телефона, неверная перспектива live-экрана, двойная камера, регулярная колонна чеков, слабая бумажная фактура, перенос `сервер подтверждён`, толстые mobile-карточки, пустые полосы между телефоном/чеками/карточками и чрезмерный масштаб короткого desktop. После исправлений P0/P1/P2 не оставалось.

### Итерация 7 — blocked

- [P1] На коротком desktop каменная подставка почти полностью уходила ниже viewport.
  - Локация: `.meta-apps-stage__stone`.
  - Доказательство: при 1365 × 755 bbox камня начинался на `y=668`, а непрозрачная часть исходного PNG — ещё примерно на 165 px ниже; в кадре оставалась только тонкая кромка.
  - Влияние: телефон и чеки казались висящими в воздухе, исчезала глубина всей hero-композиции.

Исправление:

- Базовое положение desktop-подставки поднято с `bottom: -455px` до `-390px`, чтобы на высоком экране телефон касался поверхности.
- Для desktop шириной от 1280 px и высотой до 970 px добавлена плавная формула:
  `bottom: clamp(-390px, calc(523px - 100vh), -175px)`.
- При 1365 × 755 итоговое значение равно `-232.33px`: видны верхняя поверхность и толстая передняя грань, а телефон/чеки остаются на прежних местах.
- При 1488 × 1059 применяется `-390px`: корпус визуально опирается на камень без пустого зазора.
- Mobile/tablet-правила `-75px`, `-74px` и `-205px` не изменены.

Постфиксное доказательство:

- `design-qa-desktop-comparison-final.png`
- `design-qa-stone-focus-final.png`
- `implementation-meta-apps-desktop-final.png`

### Итерация 8 — passed

После повторного сравнения нет незакрытых P0/P1/P2 по текущему запросу. Толщина подставки читается на коротком и высоком desktop, телефон опирается на поверхность, а мобильная композиция не изменилась.

## Обязательные поверхности fidelity

- Fonts/typography: существующие семейства, веса, переносы и текст не изменялись; `сервер подтверждён` остаётся в одну строку.
- Spacing/layout rhythm: изменена только вертикальная позиция растровой подставки. Телефон, чеки, CTA и SDK/MMP/CAPI не увеличивались и не перемещались.
- Colors/tokens: тёмный фон, сине-фиолетово-розовый градиент и подсветка камня сохранены.
- Image quality/assets: используется исходный прозрачный WebP подставки без растяжения; фактура, края и синяя/фиолетовая подсветка остаются резкими.
- Copy/content: текст страницы, телефона и чеков не изменён.

## Функциональная проверка

- Внутренняя анимация телефона и независимое движение трёх чеков продолжают работать.
- Горизонтального overflow на 1365 × 755 и 1488 × 1059 не обнаружено.
- В консоли нет ошибок приложения; остаётся только прежнее локальное предупреждение Meta Pixel о traffic permission.
- `npm run build` прошёл после последней CSS-правки, включая генерацию 27 статических роутов.

## Остаточная P3-полировка

- На очень широких экранах можно отдельно подбирать горизонтальный crop подставки, но это не влияет на текущую desktop/mobile композицию.

final result: passed
