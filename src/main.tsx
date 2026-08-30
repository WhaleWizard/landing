import { createRoot } from "react-dom/client";
import { flushSync } from 'react-dom';
import App from "./app/App";
import AppErrorBoundary from './app/components/AppErrorBoundary';
import { initLeadRetryQueue } from './app/utils/leadRetryQueue';
import { startWebVitals } from './app/utils/webVitals';
import { prepareRoute } from './app/utils/routePreload';
import "./styles/index.css";

// Админка (включая iframe точного предпросмотра) не является визитом клиента:
// не отправляем из неё RUM и не запускаем параллельную досылку заявок.
const isAdminRoute = /^\/admin(?:\/|$)/.test(window.location.pathname);
if (!isAdminRoute) {
  initLeadRetryQueue();
  // Реальная скорость у посетителей: без идентификаторов и cookies, отправка
  // один раз при уходе со страницы. Любая ошибка внутри молча выключает сбор.
  startWebVitals();
}

const rootElement = document.getElementById('root')!;
const ROUTE_PREPARE_TIMEOUT_MS = 8_000;
const hadGeneratedShell = rootElement.hasChildNodes();

function currentSiteContentKey(pathname: string): string | null {
  if (pathname === '/') return 'site:home';
  const service = pathname.match(/^\/(meta-ads|meta-apps|google-ads|consult)\/?$/)?.[1];
  return service ? `service:${service}` : null;
}

async function prepareCurrentSiteContent(): Promise<unknown> {
  const cacheKey = currentSiteContentKey(window.location.pathname);
  if (!cacheKey) return undefined;
  const { preloadSiteContent } = await import('./app/hooks/useServiceContent');
  try {
    return await preloadSiteContent(cacheKey);
  } catch {
    // The inline production seed remains a valid fallback. A transient CMS
    // request must never prevent React from mounting the public page.
    return undefined;
  }
}

let appRendered = false;

function renderApp() {
  // Защёлка от второго createRoot на том же узле. Bootstrap должен монтировать
  // приложение ровно один раз, даже если асинхронный route-preload завершится
  // одновременно с обработчиком восстановления после ошибки.
  if (appRendered) return;
  appRendered = true;
  flushSync(() => {
    createRoot(rootElement).render(
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>,
    );
  });
}

function handOffToApp() {
  if (!hadGeneratedShell || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    renderApp();
    return;
  }

  // Do not wrap this first mount in the View Transition API. React can commit
  // its route-level Suspense fallback for one microtask even after the route
  // preload has resolved; the browser would snapshot that generic skeleton as
  // the "new" view and keep it visible over the ready app for the transition
  // duration. A direct compositor-only fade keeps the generated shell hand-off
  // smooth without ever capturing an intermediate frame.
  rootElement.classList.add('ww-app-handoff');
  renderApp();
  window.setTimeout(() => rootElement.classList.remove('ww-app-handoff'), 360);
}

async function bootstrap() {
  // The admin UI (and especially its exact-preview iframe) has no useful
  // public SEO shell to preserve. Waiting for a lazy route and cross-fading
  // that placeholder only creates a visible stale frame inside the editor.
  if (isAdminRoute) {
    renderApp();
    return;
  }

  // Production pages contain a useful SEO-first shell. Keep it visible while
  // the current route module is being prepared, so a cold visit performs one
  // visual hand-off instead of shell -> generic skeleton -> real page.
  if (hadGeneratedShell) {
    // Only JavaScript needed to render the first screen belongs on this
    // critical path. CMS content is already available from the generated
    // inline seed and every mounted section revalidates it after paint. A
    // network request here used to keep the stale SEO shell on screen while
    // production waited for `/api/site-content`, making the hand-off feel
    // like a jump even when the route chunk was ready.
    const routeTask = prepareRoute(window.location.href);
    if (routeTask) {
      let timeout = 0;
      await Promise.race([
        routeTask,
        new Promise<void>((resolve) => {
          timeout = window.setTimeout(resolve, ROUTE_PREPARE_TIMEOUT_MS);
        }),
      ]);
      if (timeout) window.clearTimeout(timeout);
    }
  }
  handOffToApp();

  // Revalidate editable copy only after the first interactive frame has been
  // handed off. This keeps the CMS request useful without competing with the
  // route/hero chunks or delaying the visual transition.
  if (hadGeneratedShell) {
    window.setTimeout(() => { void prepareCurrentSiteContent(); }, 0);
  }
}

void bootstrap();
