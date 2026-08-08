import { createRoot } from "react-dom/client";
import App from "./app/App";
import AppErrorBoundary from './app/components/AppErrorBoundary';
import { initLeadRetryQueue } from './app/utils/leadRetryQueue';
import { startWebVitals } from './app/utils/webVitals';
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

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
