// src/app/routes.tsx
import { createBrowserRouter } from "react-router";
import { lazy, Suspense } from "react";
import Home from "./pages/Home";
import ThankYou from "./pages/ThankYou";
import BlogPage from "./pages/BlogPage";
import Calculator from "./pages/Calculator";
import RoiPage from "./pages/RoiPage";
import Admin from "./pages/Admin"; // <-- добавить

const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Offer = lazy(() => import("./pages/Offer"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));

function LazyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Загрузка...</div>}>
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  { path: "/", Component: Home },
  { path: "/calculator", Component: Calculator },
  { path: "/roi-calculator", Component: RoiPage },
  { path: "/thank-you", Component: ThankYou },
  { path: "/blog", Component: BlogPage },
  { path: "/blog/:slug", Component: BlogPage },
  { path: "/admin", Component: Admin }, // <-- добавить
  { path: "/privacy-policy", element: <LazyWrapper><PrivacyPolicy /></LazyWrapper> },
  { path: "/offer", element: <LazyWrapper><Offer /></LazyWrapper> },
  { path: "/cookie-policy", element: <LazyWrapper><CookiePolicy /></LazyWrapper> },
]);