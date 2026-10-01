/**
 * Сборка исходников сайта в один Node-модуль для рендера первого экрана на
 * этапе генерации страниц и для тестов.
 *
 * Общий файл нужен, чтобы генератор и тесты собирали ровно один и тот же
 * бандл: иначе тест проверял бы одно, а в `dist/` уезжало бы другое.
 */
import { basename, join } from 'node:path';

/** Адрес-заглушка для картинок, импортированных из кода (`src/assets/...`). */
export const SSR_ASSET_PLACEHOLDER = '/assets/__ssr-asset__/';

const ASSET_FILTER = /\.(?:webp|png|jpe?g|gif|svg|avif|woff2?)$/i;
/** CSS из пакетов (`@fontsource-variable/*`): в ESM-бандле такой импорт поднялся бы наверх, и Node упал бы на `.css`. */
const PACKAGE_CSS_FILTER = /^@fontsource|\.css$/i;
/**
 * Админка и кадр предпросмотра на сборке не рендерятся, но лежат в дереве
 * маршрутов. В ESM-бандле их пакеты (react-dnd, cmdk, sonner, шрифты админки)
 * поднимаются в верхний уровень и исполняются в Node ради ничего — подменяем
 * пустыми компонентами.
 */
const BROWSER_ONLY_PAGE_FILTER = /\/pages\/(?:Admin|ContentPreview)$/;

/**
 * Картинки из импортов не нужны серверному рендеру: их адреса выдаёт Vite и
 * только в браузере. Заменяем на заглушку и проверяем после рендера, что она
 * не попала в разметку, — иначе гидратация увидела бы чужой `src`.
 */
export function ssrAssetPlugin() {
  return {
    name: 'ssr-asset-placeholder',
    setup(build) {
      build.onResolve({ filter: ASSET_FILTER }, (args) => ({
        path: join(args.resolveDir, args.path),
        namespace: 'ssr-asset',
      }));
      build.onLoad({ filter: /.*/, namespace: 'ssr-asset' }, (args) => ({
        contents: `export default ${JSON.stringify(SSR_ASSET_PLACEHOLDER + basename(args.path))};`,
        loader: 'js',
      }));
      build.onResolve({ filter: PACKAGE_CSS_FILTER }, (args) => ({ path: args.path, namespace: 'ssr-empty' }));
      build.onLoad({ filter: /.*/, namespace: 'ssr-empty' }, () => ({ contents: '', loader: 'js' }));
      build.onResolve({ filter: BROWSER_ONLY_PAGE_FILTER }, (args) => ({ path: args.path, namespace: 'ssr-stub' }));
      build.onLoad({ filter: /.*/, namespace: 'ssr-stub' }, () => ({
        contents: 'export default function BrowserOnlyPage() { return null; }',
        loader: 'js',
      }));
    },
  };
}

/** Значения `import.meta.env`, которые Vite подставляет в браузерную сборку. */
export const SSR_DEFINE = {
  'import.meta.env.DEV': 'false',
  'import.meta.env.PROD': 'true',
  'import.meta.env.SSR': 'true',
  'import.meta.env.MODE': '"production"',
};

/** Общие настройки esbuild для серверного бандла (без стилей и бинарных ассетов). */
export function ssrBuildOptions(overrides = {}) {
  return {
    bundle: true,
    platform: 'node',
    jsx: 'automatic',
    // Пакеты из node_modules грузит сам Node — так React, motion и Radix
    // остаются одними и теми же модулями для всех частей бандла.
    packages: 'external',
    loader: { '.css': 'empty', '.json': 'json' },
    plugins: [ssrAssetPlugin()],
    define: SSR_DEFINE,
    logLevel: 'silent',
    ...overrides,
  };
}
