import { createRoot } from "react-dom/client";
import App from "./app/App";
import AppErrorBoundary from './app/components/AppErrorBoundary';
import { initLeadRetryQueue } from './app/utils/leadRetryQueue';
import "./styles/index.css";

initLeadRetryQueue();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);