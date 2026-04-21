// src/app/App.tsx
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { ArticlesProvider } from './context/ArticlesContext';
import CookieConsentManager from './components/cookie/CookieConsentManager';

export default function App() {
  return (
    <div className="dark">
      <ArticlesProvider>
        <RouterProvider router={router} />
        <CookieConsentManager />
      </ArticlesProvider>
    </div>
  );
}
