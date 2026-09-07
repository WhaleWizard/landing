// src/app/App.tsx
import { RouterProvider } from 'react-router';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { router } from './routes';

/**
 * Анимации живут на `m.*`, а не на `motion.*`.
 *
 * Полный `motion` тянет всю библиотеку (перетаскивание, layout-анимации и
 * прочее, чем сайт не пользуется) и весил 45 КБ gzip на каждой странице —
 * ровно те «неиспользуемые скрипты», на которые жаловался PageSpeed.
 * `LazyMotion` с набором `domAnimation` даёт те же появления, наведения,
 * `whileInView` и `AnimatePresence`, но без лишнего кода. Сами анимации,
 * их длительности и кривые не менялись.
 *
 * Правило: новые анимированные элементы — только `m.div` и родня. Компонент
 * `motion.div` внутри этого дерева тоже заработает, но молча вернёт полную
 * библиотеку в бандл; это стережёт `test:audit-regressions`.
 */
export default function App() {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <div className="dark">
          <RouterProvider router={router} />
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
