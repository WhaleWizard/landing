# Аудит и перестройка Knowledge Hub WhaleWzrd

Дата: 2026-07-07

## Что было найдено

- В блоге было 12 материалов в public/articles.seed.json и 10 в data/articles.local.json.
- Статья kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh оставлена без изменений по требованию.
- 9 старых статей имели почти одинаковую структуру: стратегия, воронка, кейс, что делать сейчас.
- 2 статьи были фактически пустыми: creative-testing-framework-2026 и crm-automation-lead-nurturing-2026.
- В public/articles.seed.json были дубли ID 11 и 12.
- Внутренняя перелинковка была слабой: статьи существовали рядом, но не как база знаний.

## Сильные стороны старого блога

- Темы выбраны коммерчески верно: Meta Ads, Google Ads, B2B, e-commerce, аналитика, ретаргетинг.
- Есть понятный фокус на performance marketing.
- Формат JSON уже поддерживает summary, keyTakeaways, FAQ и SEO-поля.
- Текущая статья про полную воронку достаточно близка к нужному направлению и поэтому сохранена.

## Слабые стороны старого блога

- Повторялись одинаковые вступления, структура и CTA.
- Не хватало глубины по отдельным интентам.
- Много общих утверждений без практической диагностики.
- Не было полноценной карты знаний и кластеров.
- Недостаточно E-E-A-T: мало ограничений, компромиссов, типичных ошибок и управленческих выводов.
- Не было 10 новых supporting articles, закрывающих отдельные поисковые интенты.

## Конкурентное поле

Основные конкуренты по уровню ожиданий читателя:
- Google Ads Help и Google Analytics Help: сильны официальностью, слабы бизнес-интерпретацией.
- Meta Business / Developers documentation: сильны первоисточником, слабы объяснением управленческих сценариев.
- Think with Google: силен стратегическим уровнем, но редко дает пошаговую операционную диагностику.
- HubSpot, Semrush, Ahrefs, WordStream: сильны SEO-упаковкой и понятными гайдами, но часто пишут широко и не связывают рекламу, CRM, маржу и качество лидов.
- CXL и отраслевые блоги: сильны CRO/экспериментами, но не закрывают всю performance-систему WhaleWzrd.

## Information Gap

Главный разрыв: конкуренты часто объясняют инструмент, но не показывают, как бизнес должен принять решение.

Закрытые gaps:
- связь CPA с качеством CRM-лида;
- отдельная роль Search, PMax, Meta, YouTube и ретаргетинга;
- measurement plan до запуска рекламы;
- server-side события как бизнес-сигнал, а не техническая мода;
- разделение ROAS, CAC, CPA, LTV;
- локальная реклама через поведение маршрутов, а не радиус;
- mobile app marketing без раскрытия внутренних методик.

## Search Intent

Интенты закрыты четырьмя группами:
- диагностический: почему растет CPA, почему не сходятся данные, почему страница не конвертит;
- стратегический: как связать Meta + Google, как распределять бюджет, как строить SaaS/e-commerce/B2B;
- инструментальный: CAPI, Enhanced Conversions, measurement plan, dashboard;
- обучающий: метрики, creative testing, offer testing, ретаргетинг.

## Primary Entity

Primary Entity всего хаба: Performance Marketing.

## Supporting Entities

Meta Ads, Google Ads, Performance Max, Search campaigns, YouTube Ads, Demand Gen, GA4, GTM, CRM, attribution, Conversions API, Enhanced Conversions, first-party data, CAC, CPA, ROAS, LTV, CRO, landing page, lead nurturing, e-commerce, B2B, SaaS, local business, mobile app marketing.

## Архитектура

Pillar:
- kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh

Core supporting:
- kak-snizit-cpa-v-meta-ads-v-2026
- google-ads-search-pmax-strategiya-2026
- analytics-attribution-2026
- plan-30-days-ads-launch
- b2b-lead-gen-google-meta
- ecommerce-scale-meta-google

Specialized supporting:
- retargeting-pervye-dannye-2026
- creative-testing-framework-2026
- crm-automation-lead-nurturing-2026
- local-geo-ads-2026
- anti-crisis-ads-control
- measurement-plan-before-ads
- landing-page-paid-traffic-diagnostics
- performance-marketing-metrics-cac-roas-ltv
- budget-allocation-meta-google
- meta-capi-google-enhanced-conversions
- mobile-app-performance-marketing-principles
- saas-demand-generation-paid-media
- youtube-demand-gen-performance-funnel
- offer-testing-performance-marketing
- performance-dashboard-owner

## Новые статьи

Создано 10 новых статей:
1. measurement-plan-before-ads
2. landing-page-paid-traffic-diagnostics
3. performance-marketing-metrics-cac-roas-ltv
4. budget-allocation-meta-google
5. meta-capi-google-enhanced-conversions
6. mobile-app-performance-marketing-principles
7. saas-demand-generation-paid-media
8. youtube-demand-gen-performance-funnel
9. offer-testing-performance-marketing
10. performance-dashboard-owner

## Источники, использованные при проверке направления

- Google Search Central: Creating helpful, reliable, people-first content — https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google Ads Help: About Performance Max campaigns — https://support.google.com/google-ads/answer/10724817
- Google Ads Help: About enhanced conversions — https://support.google.com/google-ads/answer/9888656
- Google Ads Help: About offline conversion imports — https://support.google.com/google-ads/answer/2998031
- Google Analytics Help: Get started with attribution — https://support.google.com/analytics/answer/10596866
- Google Analytics Help: Reporting identity — https://support.google.com/analytics/answer/10976610
- HubSpot: Marketing Statistics 2026 — https://www.hubspot.com/marketing-statistics
- Research context on first-party/server-side tracking changes — https://arxiv.org/abs/2606.16720
- Research context on AI Overviews and source quality — https://arxiv.org/abs/2605.14021

Meta official documentation was partially unavailable from this environment because Meta pages redirected or blocked access, so Meta-specific claims were kept principle-based and conservative.

## Финальная проверка

- Защищенная статья не изменена.
- Все остальные старые статьи переписаны с новой структурой.
- Две пустые статьи заменены полноценными материалами.
- Добавлено 10 новых тем без прямого пересечения.
- Все статьи получили FAQ, summary, keyTakeaways, SEO-поля, status, publishedAt и updatedAt.
- Внутренняя перелинковка добавлена естественно.
- Дубли ID исправлены.
