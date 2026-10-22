/**
 * Определение тач-устройства без лишнего re-render цикла на монтировании.
 *
 * Свойства `whileHover` в motion/react не добавляют атрибутов в HTML и не
 * вызывают рассинхронизации гидратации. Чтение признака при первом рендере в
 * браузере избавляет Hero, Cases, Testimonials и ContactForm от немедленного
 * повторного прохода рендера на всех смартфонах и планшетах.
 */

let cachedTouch: boolean | undefined;

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (cachedTouch === undefined) {
    cachedTouch = 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  }
  return cachedTouch;
}

export function useTouchDevice(): boolean {
  return isTouchDevice();
}
