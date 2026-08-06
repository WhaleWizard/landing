import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import WhaleMark from '../brand/WhaleMark';

/**
 * Общий слой обратной связи админки: тосты вместо системных `alert`,
 * диалог подтверждения вместо `confirm`, единые пустые состояния и
 * скелетоны. До этого каждый раздел показывал браузерные окна — они
 * не подчиняются теме и выглядят как незаконченный прототип.
 */

export const notify = {
  success: (message: string, description?: string) => toast.success(message, { description }),
  error: (message: string, description?: string) => toast.error(message, { description, duration: 6000 }),
  info: (message: string, description?: string) => toast(message, { description }),
};

export function AdminToaster({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      closeButton
      richColors
      toastOptions={{ style: { fontFamily: 'inherit' } }}
    />
  );
}

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface ConfirmRequest {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

// Императивный вызов, как у тостов: диалог нужен и в самом компоненте,
// который рендерит провайдер, а через контекст он себя не увидел бы.
let openConfirm: ((request: ConfirmRequest) => void) | null = null;

export const confirmAsk: ConfirmFn = (options) => new Promise<boolean>((resolve) => {
  if (!openConfirm) {
    // Хост не смонтирован — лучше системное окно, чем молчаливое «нет».
    const fallback = options.description ? `${options.title}\n\n${options.description}` : options.title;
    resolve(window.confirm(fallback));
    return;
  }
  openConfirm({ options, resolve });
});

/** Совместимость с обычным использованием внутри дерева. */
export function useConfirm(): ConfirmFn {
  return confirmAsk;
}

export function AdminConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmRequest | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    openConfirm = (request) => setState(request);
    return () => { openConfirm = null; };
  }, []);

  const close = useCallback((value: boolean) => {
    setState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!state) return undefined;
    confirmButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false);
      if (event.key === 'Enter') close(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, state]);

  return (
    <>
      {children}
      {state && (
        <div
          className={`admin-confirm${state.options.tone === 'danger' ? ' admin-confirm--danger' : ''}`}
          role="alertdialog"
          aria-modal="true"
          aria-label={state.options.title}
          onClick={(event) => { if (event.target === event.currentTarget) close(false); }}
        >
          <div className="admin-confirm__card">
            <div className="admin-confirm__head">
              <span className="admin-confirm__icon" aria-hidden="true">
                {state.options.tone === 'danger' ? <AlertTriangle /> : <HelpCircle />}
              </span>
              <div>
                <h2 className="admin-confirm__title">{state.options.title}</h2>
                {state.options.description ? <p className="admin-confirm__text">{state.options.description}</p> : null}
              </div>
            </div>
            <div className="admin-confirm__actions">
              <button type="button" className="admin-button admin-button--quiet" onClick={() => close(false)}>
                {state.options.cancelLabel || 'Отмена'}
              </button>
              <button
                type="button"
                ref={confirmButtonRef}
                className={`admin-button ${state.options.tone === 'danger' ? 'admin-button--danger-solid' : 'admin-button--primary'}`}
                onClick={() => close(true)}
              >
                {state.options.confirmLabel || 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function AdminBlank({
  icon,
  title,
  text,
  actions,
  inline = false,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  actions?: ReactNode;
  inline?: boolean;
}) {
  // Пустой раздел — единственное место, где интерфейсу нечего показать по делу.
  // Вместо очередной серой иконки здесь стоит кит: это не «ошибка», а просто
  // экран, до которого ещё не дошли данные. Иконку можно передать явно —
  // например, лупу там, где пусто именно из-за поиска.
  return (
    <div className={`admin-blank${inline ? ' admin-blank--inline' : ''}`}>
      <span className={`admin-blank__art${icon ? '' : ' admin-blank__art--whale'}`} aria-hidden="true">
        {icon || <WhaleMark size={inline ? '46px' : '62px'} />}
      </span>
      <div>
        <p className="admin-blank__title">{title}</p>
        {text ? <p className="admin-blank__text">{text}</p> : null}
      </div>
      {actions ? <div className="admin-blank__actions">{actions}</div> : null}
    </div>
  );
}

export function AdminSkeleton({ variant = 'text', width, count = 1 }: {
  variant?: 'text' | 'title' | 'tile' | 'row' | 'chart';
  width?: string;
  count?: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`admin-skeleton admin-skeleton--${variant}`} style={width ? { width } : undefined} />
      ))}
    </>
  );
}

/** Заглушка раздела на время первой загрузки: без прыжка контента. */
export function AdminSectionSkeleton({ tiles = 4, rows = 4 }: { tiles?: number; rows?: number }) {
  return (
    <div className="admin-stack admin-stack--lg" role="status" aria-live="polite" aria-label="Загрузка раздела">
      <div className="admin-skeleton-stack">
        <AdminSkeleton variant="title" />
        <AdminSkeleton variant="text" width="62%" />
      </div>
      {tiles > 0 && (
        <div className="admin-skeleton-grid">
          <AdminSkeleton variant="tile" count={tiles} />
        </div>
      )}
      <div className="admin-skeleton-stack">
        <AdminSkeleton variant="row" count={rows} />
      </div>
    </div>
  );
}
