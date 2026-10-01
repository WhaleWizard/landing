# Стенд замеров скорости (perf-lab)

Скрипты, которыми измерялось ускорение сайта 01–02.10.2026 (`docs/handoff/SPEED_PLAN.md`).
В сборку и в `npm run check` не входят; зависимости не в `package.json` — ставить руками:

```
npm run build                                   # нужен готовый dist/
node scripts/perf-lab/static-server.mjs dist 4174   # статический сервер с brotli, как у Cloudflare
npx -y playwright@1.56 install chromium            # или CHROME_PATH на уже установленный Chromium
npm i --no-save playwright@1.56                     # зонды ниже импортируют playwright
```

| Файл | Что делает |
|---|---|
| `static-server.mjs` | отдаёт `dist/` с brotli и правильными путями без завершающего слеша (vite preview отдавал главную вместо страницы) |
| `lh-run.sh <outdir> <url…>` | Lighthouse 13.5, мобильный профиль, один прогон на страницу; `CHROME_PATH` внутри — поправить под машину |
| `lh-summary.js <json…>` | одна строка на отчёт: балл, FCP, LCP, TBT, CLS, SI, вес, главный поток |
| `lh-detail.js <json>` | разбор отчёта: процессор по скриптам, долгие задачи, запросы, сдвиги |
| `hydrate-probe.mjs <url…>` | настоящий Chromium (iPhone 12, процессор ×4): предупреждения гидратации, снят ли `data-ww-prehydrate`, те же ли узлы `h1` и текст статьи до и после React, скриншот |
| `cls-probe.mjs <url>` | источники сдвигов раскладки с координатами; `LHVIEW=1` — окно как у Lighthouse, `NOTHROTTLE=1` — без замедления сети |
| `paint-probe.mjs <url>` | раз в 150 мс: первый кадр, таблицы стилей, прозрачность хиро — что видно до JavaScript |
| `idle-floor.mjs <url…>` | процессор в простое за 6 с (×4): `(program)` в headless — программная композиция, на телефоне её нет; сравнивать страницы между собой, а не с нулём |

Цифры стенда — локальные и на HTTP/1.1; production (HTTP/2, Cloudflare) из облачной сессии недоступен.
Точка отсчёта и результат — таблицы в `docs/handoff/SPEED_PLAN.md`.
