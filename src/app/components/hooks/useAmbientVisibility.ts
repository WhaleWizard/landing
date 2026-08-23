import { useEffect, type RefObject } from 'react';

/**
 * Отмечает на секции, видна она сейчас или нет.
 *
 * Признак пишется прямо в разметку атрибутом `data-ambient`, а не хранится в
 * состоянии React. Разница принципиальная: `useInView` возвращает значение, и
 * каждое пересечение границы экрана перерисовывало всю секцию целиком —
 * «Услуги», «Кейсы», «Отзывы» и форму. Перерисовка приходилась ровно на тот
 * кадр, в котором страница движется, и читалась как зацеп прокрутки.
 *
 * Фоновым петлям хватает CSS: `.ww-ambient-motion` внутри секции с
 * `data-ambient="off"` встаёт на паузу и остаётся ровно в том кадре, где была.
 * Логике, которой нужно само значение (автолистание карусели, разовые события),
 * подходит `visibilityRef` — он читается в момент, когда значение нужно.
 */
export const AMBIENT_ATTRIBUTE = 'data-ambient';

export type AmbientVisibilityOptions = {
  /** Совпадает с прежним `margin` у useInView: низ экрана «не считается». */
  rootMargin?: string;
  /** Вызывается один раз при первом появлении секции. */
  onFirstVisible?: () => void;
  /** Читается кодом, которому нужно значение, а не пауза анимации. */
  visibilityRef?: { current: boolean };
};

export function useAmbientVisibility(
  ref: RefObject<HTMLElement | null>,
  options: AmbientVisibilityOptions = {},
): void {
  const { rootMargin = '0px 0px -10% 0px', onFirstVisible, visibilityRef } = options;

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    if (typeof IntersectionObserver === 'undefined') {
      element.setAttribute(AMBIENT_ATTRIBUTE, 'on');
      if (visibilityRef) visibilityRef.current = true;
      onFirstVisible?.();
      return undefined;
    }

    // Атрибут появляется только после первого ответа наблюдателя. Поставить
    // его заранее нельзя: секция первого экрана моргнула бы паузой.
    let announced = false;
    const observer = new IntersectionObserver(([entry]) => {
      const visible = Boolean(entry?.isIntersecting);
      element.setAttribute(AMBIENT_ATTRIBUTE, visible ? 'on' : 'off');
      if (visibilityRef) visibilityRef.current = visible;
      if (visible && !announced) {
        announced = true;
        onFirstVisible?.();
      }
    }, { rootMargin, threshold: 0 });

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, onFirstVisible, visibilityRef]);
}

export default useAmbientVisibility;
