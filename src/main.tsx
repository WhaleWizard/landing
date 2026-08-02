import { createRoot } from "react-dom/client";
import App from "./app/App";
import AppErrorBoundary from './app/components/AppErrorBoundary';
import { initLeadRetryQueue } from './app/utils/leadRetryQueue';
import { startWebVitals } from './app/utils/webVitals';
import "./styles/index.css";

initLeadRetryQueue();
// Реальная скорость у посетителей: без идентификаторов и cookies, отправка
// один раз при уходе со страницы. Любая ошибка внутри молча выключает сбор.
startWebVitals();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);