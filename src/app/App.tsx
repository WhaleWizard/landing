// src/app/App.tsx
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { ArticlesProvider } from './context/ArticlesContext';

export default function App() {
  return (
    <div className="dark">
      <ArticlesProvider>
        <RouterProvider router={router} />
      </ArticlesProvider>
    </div>
  );
}