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

function renderApp() {
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

  const transitionDocument = document as Document & {
    startViewTransition?: (update: () => void) => unknown;
  };
  if (transitionDocument.startViewTransition) {
    try {
      transitionDocument.startViewTransition(renderApp);
      return;
    } catch {
      // Fall through to the light CSS hand-off on unsupported edge cases.
    }
  }

  rootElement.classList.add('ww-app-handoff');
  renderApp();
  window.setTimeout(() => rootElement.classList.remove('ww-app-handoff'), 360);
}

async function bootstrap() {
  // Production pages contain a useful SEO-first shell. Keep it visible while
  // the current route module is being prepared, so a cold visit performs one
  // visual hand-off instead of shell -> generic skeleton -> real page.
  if (hadGeneratedShell) {
    const pendingRoute = prepareRoute(window.location.href);
    if (pendingRoute) {
      let timeout = 0;
      await Promise.race([
        pendingRoute,
        new Promise<void>((resolve) => {
          timeout = window.setTimeout(resolve, ROUTE_PREPARE_TIMEOUT_MS);
        }),
      ]);
      if (timeout) window.clearTimeout(timeout);
    }
  }
  handOffToApp();
}

void bootstrap();
