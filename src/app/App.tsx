// src/app/App.tsx
import type { ReactNode } from 'react';
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

/**
 * Общая обёртка браузерного приложения и его серверного рендера на сборке.
 *
 * Генератор страниц (`scripts/ssr-entry.tsx`) рисует первый экран ровно в этом
 * же каркасе, а `main.tsx` потом гидратирует готовую разметку. Любое отличие
 * между двумя деревьями — лишний `div`, другой класс — React посчитал бы
 * расхождением и перестроил страницу заново, поэтому обёртка одна на двоих.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <div className="dark">
          {children}
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}

export default function App() {
  return (
    <AppFrame>
      <RouterProvider router={router} />
    </AppFrame>
  );
}
