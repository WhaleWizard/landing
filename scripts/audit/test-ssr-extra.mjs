import { renderRoute } from '../../scripts/ssr-entry.tsx';

async function test() {
  for (const route of ['/blog', '/cases', '/faq']) {
    try {
      const html = await renderRoute(route);
      console.log(route, 'SSR SUCCESS! Length:', html.length, 'hasH1:', html.includes('<h1'));
    } catch (err) {
      console.log(route, 'SSR ERROR:', err.message);
    }
  }
}

test();
