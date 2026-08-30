// src/app/App.tsx
import { RouterProvider } from 'react-router';
import { MotionConfig } from 'motion/react';
import { router } from './routes';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="dark">
        <RouterProvider router={router} />
      </div>
    </MotionConfig>
  );
}
