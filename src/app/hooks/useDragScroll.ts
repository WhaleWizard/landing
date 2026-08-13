import { useEffect, type RefObject } from 'react';

const DRAG_THRESHOLD_PX = 4;

/**
 * Тянуть горизонтальную ленту мышью.
 *
 * Карусели показывают курсор-«ладонь», но тащить их было нечем: на десктопе
 * оставалась только полоса прокрутки. Хук работает на pointer-событиях и
 * намеренно не трогает колесо мыши — перехват wheel требует preventDefault на
 * непассивном слушателе, а это ровно та задержка прокрутки, от которой уходили.
 *
 * Тач не подключается: там нативная инерция уже лучше любого ручного расчёта.
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    let pointerId: number | null = null;
    let startX = 0;
    let startScrollLeft = 0;
    let dragged = false;

    const releasePointer = () => {
      if (pointerId === null) return;
      if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
      pointerId = null;
      node.style.cursor = 'grab';
      node.style.scrollBehavior = '';
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || pointerId !== null) return;
      if (node.scrollWidth <= node.clientWidth) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startScrollLeft = node.scrollLeft;
      dragged = false;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const delta = event.clientX - startX;
      // Порог оставляет обычному клику по карточке право сработать: захват
      // указателя включается только когда движение стало осознанным.
      if (!dragged) {
        if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
        dragged = true;
        node.setPointerCapture(pointerId);
        node.style.cursor = 'grabbing';
        // У лент со scroll-behavior: smooth прямая запись scrollLeft тоже
        // анимируется — под рукой это ощущается как залипание, поэтому на
        // время перетаскивания лента следует за курсором один в один.
        node.style.scrollBehavior = 'auto';
      }
      node.scrollLeft = startScrollLeft - delta;
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      releasePointer();
    };

    // Клик, которым закончилось перетаскивание, не должен открывать статью.
    // Перехват на фазе погружения: React слушает на корне приложения, поэтому
    // остановка здесь случается раньше, чем onClick карточки вообще запустится.
    const handleClickCapture = (event: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      event.stopPropagation();
      event.preventDefault();
    };

    node.addEventListener('pointerdown', handlePointerDown);
    node.addEventListener('pointermove', handlePointerMove);
    node.addEventListener('pointerup', handlePointerUp);
    node.addEventListener('pointercancel', handlePointerUp);
    node.addEventListener('click', handleClickCapture, true);

    return () => {
      releasePointer();
      node.removeEventListener('pointerdown', handlePointerDown);
      node.removeEventListener('pointermove', handlePointerMove);
      node.removeEventListener('pointerup', handlePointerUp);
      node.removeEventListener('pointercancel', handlePointerUp);
      node.removeEventListener('click', handleClickCapture, true);
    };
  }, [ref]);
}
