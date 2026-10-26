const { build } = require('esbuild');
const { ssrBuildOptions } = require('../ssr-bundle.js');
const { createRequire } = require('node:module');

async function testCookie() {
  const serverBundle = await build(ssrBuildOptions({
    stdin: {
      contents: `
        import React from 'react';
        import { renderToString } from 'react-dom/server';
        import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';
        import { routes } from './src/app/routes';
        import { AppFrame } from './src/app/App';
        import { loadCookiePolicy } from './src/app/utils/routePreload';

        export async function render(url) {
          await loadCookiePolicy();
          const handler = createStaticHandler(routes);
          const context = await handler.query(new Request('https://www.whalewzrd.com' + url));
          const router = createStaticRouter(handler.dataRoutes, context);
          return renderToString(
            <AppFrame>
              <StaticRouterProvider router={router} context={context} />
            </AppFrame>
          );
        }
      `,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    format: 'cjs',
    write: false,
  }));

  const m = { exports: {} };
  new Function('require', 'module', 'exports', serverBundle.outputFiles[0].text)(require, m, m.exports);
  const html = await m.exports.render('/cookie-policy');
  console.log('Scripts inside rendered html:', html.match(/<script[\s\S]*?<\/script>/gi));
}

testCookie().catch(console.error);
