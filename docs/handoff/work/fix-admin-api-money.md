# Журнал правок: группа admin-api-money

Сценарий audit-fix, группа «Сервер админки: деньги, CRM, отчёты, сводки». Одна строка на находку:
id · статус · файлы · что сделано. Если сессия оборвалась — продолжать с первой находки, которой здесь нет.

Тест группы: `node --test scripts/audit-admin-api-money.test.js` (настоящие обработчики на node:sqlite с настоящими миграциями).

## Журнал (01.10.2026)

- F-028 · fixed · report.ts, goals.ts, attribution.ts · расход за период считается с COUNT(*): ни одной строки ad_spend → spend=null (прибыль, цена заявки, ROMI не считаются, «—» и плашка в UI); строка с суммой 0 остаётся честным нулём. В воронке spendReady только при валюте, найденной по строкам ad_spend (detectCurrency.spendCurrency), readSpendTotal → null без строк.
- F-038 · fixed · goals.ts, report.ts, crm-analytics.ts · выигранные сделки и выручка — отдельным запросом по date(COALESCE(closed_at, updated_at), местный модификатор) в границах месяца; заявки — по дате заявки; месяц без сделок — 0, не null; правило вписано в notes обоих разделов. В crm-analytics группировка по месяцам тоже по местному времени.
- F-124 · fixed · crm-analytics.ts · date('now', ?, 'start of month', '-11 months') — порядок модификаторов, самый старый месяц не пропадает 29–31 числа.
- F-029 · fixed · crm-analytics.ts · в запрос по этапам добавлен priced (сделки с суммой в валюте отчёта); averageDeal/wonValue/openValue = null без таких сделок; в totals добавлены wonPriced, wonWithoutValue, openPriced, openWithoutValue для подписей плиток (UI — стык, см. ниже).
- F-034 · fixed · crm-leads.ts, crm-analytics.ts · overdue/today считаются только по открытым этапам (как without_next_action); фильтр due=overdue/today/upcoming — те же условия. Данные не трогаются, срок шага у закрытой сделки остаётся историей. Клиентская подсветка «просрочено» на закрытых карточках — стык (CrmBoard.tsx, AdminLeads.tsx).
- F-093 · fixed · _lib/admin-crm.ts (foldSearchSql/foldSearchQuery), crm-leads.ts, lead-trash.ts · колонки сводятся к строчным цепочкой replace() по 33 заглавным кириллицы + Ё/ё→е, запрос — toLowerCase в JS; «анна» находит «Анна Петрова», по тегу и в корзине тоже.
- F-100 · fixed · ad-spend.ts · только для import_csv: строки с одним ключом (день|источник|кампания|валюта) складываются до записи (mergeDuplicateSlots), переполнение MAX_AMOUNT — в errors и skipped; ответ saved по итоговым строкам + merged; повторный импорт того же файла заменяет, ручной upsert не складывает. Текст уведомления «объединено: N» — стык (AdminAdSpend.tsx).
- F-042 · fixed · finance.ts · выборка счетов: OR status = 'issued' — неоплаченный счёт приходит всегда.
- F-085/F-099 · fixed (мои файлы) · _lib/local-day.ts (isoSince), stats.ts, _lib/admin-alerts.ts · граница «за сутки» в ISO через bind, колонка не оборачивается в datetime(); health.ts:390 и meta-center.ts (переиспользовать isoSince) — стык.
- F-126 · fixed · stats.ts · created_at >= date('now', '-13 day') — целые сутки, индекс idx_leads_created работает.
- F-127 · fixed · today.ts · ORDER BY datetime(leadTime) ASC — в фокус попадают самые давние новые заявки.
- F-132 · fixed (сервер) · performance.ts · recordHistory(env, result, request): день через localTodayIso(request). Чтобы заработало в проде, AdminPerformance.tsx должен слать timezone_offset (стык); до этого день = UTC, как раньше.
- F-032 · fixed · clients.ts · computeHealth: отчёт за прошлый месяц требуется только если started_at (YYYY-MM) <= previousMonth; некорректная дата — старое поведение.
- F-033 · fixed · clients.ts · finished_at убран из clientFields: create ставит сегодня (local) при status=finished, update пишет CASE WHEN ?='finished' THEN COALESCE(?, finished_at, ?) ELSE NULL END; срок жизни пропускает завершённых без даты. Пункт 3 (поле «Закончили» в UI) — по желанию владельца, стык.
- F-036 · needs-cross-group · _lib/admin-alerts.ts · syncAlerts различает «скрыто владельцем» по колонке dismissed_at (проверка через PRAGMA, без колонки — по-старому, раздел не падает); экспортирован dismissAlert(db, id). Нужны: миграция 0043_admin_alerts_dismissed.sql (ALTER TABLE admin_alerts ADD COLUMN dismissed_at TEXT), вызов dismissAlert из api/admin/alerts.ts (action=dismiss), npm run build:migration-map, строка в таблице миграций CLAUDE.md/AGENTS.md. Без этих трёх шагов поведение прежнее.
- F-125 · fixed · attribution.ts · когорты по понедельнику: date(created_at, '-6 days', 'weekday 1') AS week_start, окно date('now', '-6 days', 'weekday 1', '-(weeks-1)*7 days'); week = week_start (формат YYYY-MM-DD совместим с UI).

Тест: scripts/audit-admin-api-money.test.js — 17 проверок, все зелёные. Добавить в package.json: `"test:audit-admin-api-money": "node --test scripts/audit-admin-api-money.test.js"` и в цепочку check (стык — package.json не трогал).
Прогнаны: typecheck:app, typecheck:functions, test:admin-performance, test:audit-admin-api-core, test:admin-migrations, test:migration-map, test:lead-dedupe, test:meta-capi — зелёные.
