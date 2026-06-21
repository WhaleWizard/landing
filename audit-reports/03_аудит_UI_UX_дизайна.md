# Файл: 03_аудит_UI_UX_дизайна.md

## 1. Общий вывод
UI современный: тёмная тема, glassmorphism, градиенты, motion, Radix primitives, адаптивная сетка. Главные риски: перегруз анимациями на мобильных, отсутствие глобального reduced-motion, checkbox согласия 16×16 меньше рекомендованных 44×44, использование alert для ошибок, недостаточная SSR/a11y проверка модалок и фокус-ловушек, возможное переполнение селекта страны/телефона на 320px.

## 2. UI-дизайн
- 🟢 Единая тёмная палитра через `className="dark"` и CSS theme.
- 🟢 Компонентная база Radix/shadcn повышает консистентность.
- 🟡 Тёмная тема принудительная; нет light mode/prefers-color-scheme.
- 🟡 Много blur/gradient/pulse эффектов: визуально современно, но на low-end Android вызывает jank.

## 3. Графический дизайн
- 🟢 Hero image preload и OG image заданы.
- 🟡 Нужно проверить retina/AVIF/WebP версии всех картинок. В коде нет централизованного image component с `srcset`.
- 🟡 Внешний хостинг изображения (`i.ibb.co`) снижает контроль над LCP, cache headers, availability.

## 4. Визуальные дефекты и состояния
- 🟢 Form layout использует `grid lg:grid-cols-2`, мобильный стек по умолчанию.
- 🟡 Декоративные absolute blur layers внутри формы могут перекрывать клики, если z-index/pointer-events изменятся. Сейчас content wrapper relative выше, но лучше явно `pointer-events-none` для декора.
- 🟡 Budget radio label имеет `p-4`, но скрытый input `sr-only`; focus state зависит от peer и может быть недостаточно видимым для keyboard.
- 🟡 Hover-эффекты частично отключаются для touch только в ContactForm, но не во всём сайте.

## 5. UX форм
- 🟢 Поля name/email/phone required, autocomplete задан.
- 🟢 Гео-подстановка phone code через `/api/geo`.
- 🟡 Ошибки через `alert()`; на мобильном это прерывает поток, не связано с полем и плохо для a11y.
- 🟡 Нет маски/валидации телефона по стране; пользователь может отправить слишком короткий номер.
- 🟡 После submit навигация на `/thank-you` через 800ms, но нет защиты от double submit при race кроме `isSubmitting`.
- 🟡 Checkbox consent `w-4 h-4` меньше 44×44 touch target.

Пример улучшения:
```tsx
<label className="grid grid-cols-[44px_1fr] gap-3">
  <span className="flex h-11 w-11 items-center justify-center">
    <input className="h-5 w-5" type="checkbox" />
  </span>
  <LegalConsentCopy />
</label>
```

## 6. Доступность WCAG 2.1 AA
- 🟢 Labels для основных inputs есть.
- 🟢 `aria-describedby` у согласия есть.
- 🟢 Radix components обычно обеспечивают роли/focus management.
- 🟡 Нужно проверить контраст muted text на dark background инструментально.
- 🟡 Нет skip-to-content ссылки.
- 🟡 Нет глобального `prefers-reduced-motion`.
- 🟡 Focus outline зависит от Tailwind/Radix классов; нужен axe/keyboard pass.
- 🟡 Honeypot с `aria-hidden` и `tabIndex=-1` хорошо, но label внутри aria-hidden дерева можно оставить; не критично.

## 7. Мобильная версия
- 🟢 Form uses mobile-first spacing: `py-16 md:py-24`, `px-4 sm:px-6 lg:px-8`.
- 🟢 Phone country selector на mobile сужается до `w-[118px]` и показывает flag + code.
- 🟠 Touch target checkbox 16×16 — высокий риск промаха.
- 🟡 Бюджетные карточки в 2 колонки могут быть тесными на 320px; проверить перенос `$10к-100к` и `$100к+`.
- 🟡 Нет обработки iOS keyboard viewport: форма может оказаться под клавиатурой, особенно в модалках.
- 🟡 Landscape mobile не проверен: двухколоночные/height effects могут давать overflow.
- 🟡 Для smart watches/TV адаптации нет, но для landing это низкий бизнес-приоритет.

## 8. Рекомендованный mobile test matrix
1. iPhone SE 320×568 portrait/landscape.
2. iPhone 12/13/14 390×844.
3. Android Chrome 360×800 с 4× CPU slowdown.
4. iPad 768×1024 и 1024×768.
5. Touch keyboard: name/email/tel/message submit.
6. Slow 3G + offline during submit.

## 9. Сводная таблица приоритетов
| Приоритет | Критичность | Проблема | Где | Решение |
|---|---|---|---|---|
| P0 | 🟠 Высокий | Малый touch target consent checkbox | ContactForm | 44×44 clickable label |
| P1 | 🟠 Высокий | Анимации без reduced-motion | CSS/components | Global media query + motion gating |
| P2 | 🟡 Средний | Alert вместо inline errors | ContactForm | Field/form error component |
| P3 | 🟡 Средний | Нет skip link/axe baseline | App/layout | Skip link + CI axe |
| P4 | 🟡 Средний | Возможные overflow на 320px | forms/cards | Playwright screenshots |
