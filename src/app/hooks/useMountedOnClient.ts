import { useEffect, useState } from 'react';

/**
 * «Уже смонтировано в браузере». До первого эффекта — false и на сервере, и
 * в браузере, поэтому разметка первого рендера совпадает при гидратации;
 * всё, что рисуется только при true, появляется кадром позже.
 *
 * Нужен ленивым компонентам вне серверной разметки (баннер cookie, подвал,
 * паутинка): React.lazy внутри renderToString отдаёт границу «дорисовать с
 * клиента», и гидратация сообщала бы об ошибке на каждой такой странице.
 */
export function useMountedOnClient(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}
