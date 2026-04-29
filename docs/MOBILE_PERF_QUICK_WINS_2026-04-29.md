# Quick Wins: mobile performance + API conversion (Meta)

Дата: **29 апреля 2026**
Источник: Lighthouse (Moto G Power, 4G slow), whalewzrd.com.

## Что уже хорошо
- FCP ~ **1.2s** (очень достойно).
- CLS ~ **0.002** (практически идеально).

## Главные узкие места (по вашему отчёту)
1. **LCP = 4.0s**: большой вклад даёт hero-изображение (портрет) и задержка до отрисовки.
2. **TBT = 1590ms**: много JS на main thread (особенно `vendor` и `motion`).
3. Длинная цепочка запросов и ранний фоновый API (`/api/articles`, `/api/geo`) на слабой сети.

---

## Приоритет 1 (минимальные правки, быстрый эффект)

### 1) Preconnect к `i.ibb.co`
**Зачем:** ускорить старт загрузки LCP-изображения.

Добавить в `<head>`:

```html
<link rel="preconnect" href="https://i.ibb.co" crossorigin>
<link rel="dns-prefetch" href="//i.ibb.co">
```

Ожидаемо: заметное улучшение LCP на мобильных (Lighthouse уже подсказывает экономию ~550ms).

### 2) Снизить “вес” LCP-изображения без изменения дизайна
- Для мобилки отдавать меньшую ширину в `srcset` (например 480/640/768), а не крупный исходник.
- Конвертировать в AVIF/WebP и проверить фактический byte size.
- Убедиться, что `sizes` точно соответствует реальному контейнеру.

Ожидаемо: меньше download duration + меньше render delay.

### 3) Отложить не-критичные API до `requestIdleCallback`
Для **не-LCP** логики (например, предзагрузка статей/доп. данных) запускать fetch после первого рендера/idle.

Ожидаемо: меньше конкуренции за сеть и CPU в первые секунды.

---

## Приоритет 2 (без архитектурной ломки)

### 4) Уменьшить TBT: “анимации только где реально видны”
- Для мобильного first paint упростить анимации в hero/navbar.
- Отключать часть motion-эффектов на low-end (через media query / runtime heuristic).

### 5) Проверить, что route-level lazy не приводит к лишним ранним preloads
У вас уже есть lazy-компоненты; важно убедиться, что второстепенные чанки не вытягиваются слишком рано.

### 6) Render-blocking CSS
Сейчас блокировка ~300ms. Можно:
- выделить critical above-the-fold CSS,
- остальной CSS грузить неблокирующе.

---

## API conversion Meta (самое важное для сист. аналитика)

### 7) Дедупликация Pixel + CAPI через `event_id`
Для каждого `Lead`:
- отправлять одинаковый `event_id` в браузерный Pixel и в CAPI,
- верифицировать dedup в Events Manager.

### 8) Обязательные поля качества матчинга
Передавать в CAPI стабильно:
- `client_user_agent`, `event_source_url`, `action_source="website"`,
- `fbc`, `fbp`,
- хешированные `em`, `ph` (если есть согласие и данные),
- `external_id` (stable first-party id).

### 9) Тайминг отправки Lead
- Browser Pixel: сразу на успешный submit.
- CAPI: сервером почти синхронно (очередь допустима, но не терять `event_time`).

### 10) Контрольная воронка
Еженедельно сверять:
- CRM leads,
- Pixel browser leads,
- CAPI leads,
- deduplicated leads в Meta.

Цель: расхождение не более 5–10% (после стабилизации).

---

## KPI после quick wins
- LCP: **4.0s → 2.8–3.2s**
- TBT: **1590ms → <900ms**
- Speed Index: **7.2s → ~5.5–6.0s**
- Meta lead match quality: рост за счёт `fbc/fbp + event_id + external_id`

---

## Порядок внедрения (без больших правок)
1. `preconnect` + проверка image bytes
2. idle/defer не-критичных API
3. точечная деградация анимаций на mobile low-end
4. Meta CAPI dedup + QA dashboard

