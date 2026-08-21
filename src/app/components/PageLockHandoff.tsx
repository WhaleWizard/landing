import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import WhaleMark from './brand/WhaleMark';
import '../../styles/page-lock-handoff.css';

/**
 * Переход внутри сайта на закрытую страницу.
 *
 * Саму заглушку рисует сервер — там же лежат её тексты и оформление. Здесь
 * страница не собирается заново: браузер просто перезагружает адрес, и сервер
 * отдаёт ту же заглушку, что увидит любой другой посетитель. Так у неё один
 * исходник, и содержимое закрытой страницы не попадает в браузер вообще.
 *
 * Повторная попытка по тому же адресу блокируется: если сервер почему-то
 * отдал страницу, а список блокировок в этой вкладке устарел, перезагрузка не
 * должна зациклиться.
 */

const GUARD_PREFIX = 'ww_lock_handoff:';
const GUARD_TTL_MS = 15_000;

function alreadyTried(path: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(`${GUARD_PREFIX}${path}`);
    return Boolean(raw) && Date.now() - Number(raw) < GUARD_TTL_MS;
  } catch {
    return false;
  }
}

function remember(path: string): void {
  try {
    window.sessionStorage.setItem(`${GUARD_PREFIX}${path}`, String(Date.now()));
  } catch {
    // Приватный режим без хранилища: защита от цикла отключается, но сама
    // перезагрузка отработает один раз и приведёт к заглушке сервера.
  }
}

export default function PageLockHandoff({ path }: { path: string }) {
  const [stuck, setStuck] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (alreadyTried(path)) {
      setStuck(true);
      return;
    }

    remember(path);
    window.location.replace(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  }, [path]);

  return (
    <main className="ww-lock-handoff">
      <WhaleMark size={64} animated={!stuck} />
      {stuck ? (
        <>
          <h1>Страница временно закрыта</h1>
          <p>Мы готовим этот раздел. Загляните чуть позже — остальной сайт работает как обычно.</p>
          <Link className="ww-lock-handoff__link" to="/">На главную</Link>
        </>
      ) : (
        <p aria-live="polite">Открываем страницу…</p>
      )}
    </main>
  );
}
