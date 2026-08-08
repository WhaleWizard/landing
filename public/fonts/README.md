# Cyrillic font library

Локальная библиотека шрифтов для русскоязычных маркетинговых страниц Whale Wizard.
Все файлы получены из официального каталога Google Fonts и распространяются по SIL Open Font License 1.1 (`OFL.txt`).

## Шрифты, используемые в hero

- Meta Ads: Prata, Onest, Caveat.
- Consultation: Commissioner, Bad Script.

Файлы лежат в `hero/` и разделены на `cyrillic-ext`, `cyrillic` и `latin` WOFF2-подмножества. На странице браузер загружает только фактически используемые семейства и веса.

## Дополнительная дизайнерская библиотека

Каталог `library/` хранит кириллические WOFF2, доступные в редакторе сайта:

- Arsenal
- Cormorant Garamond
- Geologica
- Golos Text
- Lora
- Manrope
- Marck Script
- Neucha
- Old Standard TT
- Oranienbaum
- Pangolin
- Playfair Display
- PT Serif
- Roboto Serif
- Shantell Sans
- Sofia Sans
- Tenor Sans
- Unbounded
- Yeseva One

Гарнитуры подключены локальными `@font-face` с `unicode-range`. Браузер загружает только выбранный шрифт и нужное языковое подмножество, а не всю библиотеку.
