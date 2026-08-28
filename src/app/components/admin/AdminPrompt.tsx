import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PenLine } from 'lucide-react';

/**
 * Окно с полем ввода — замена системному `prompt()`.
 *
 * Подтверждение (`confirmAsk`) у админки своё давно, а вот спросить строку
 * было нечем, и медиатека звала браузерный `prompt`: серое окно вверху экрана,
 * чужой шрифт, не подчиняется теме и блокирует страницу.
 *
 * Устроено так же, как `confirmAsk`: вызов императивный, потому что окно нужно
 * и тому компоненту, который сам рендерит провайдера.
 */

interface PromptOptions {
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  maxLength?: number;
  /** Проверка перед закрытием: вернуть текст ошибки или пустую строку. */
  validate?: (value: string) => string;
}

interface PromptRequest {
  options: PromptOptions;
  resolve: (value: string | null) => void;
}

let openPrompt: ((request: PromptRequest) => void) | null = null;

/** Спросить строку. `null` — человек отказался. */
export function promptAsk(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!openPrompt) {
      // Хост не смонтирован — системное окно лучше, чем молчаливый отказ.
      resolve(window.prompt(options.title, options.initialValue || ''));
      return;
    }
    openPrompt({ options, resolve });
  });
}

export function AdminPromptProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PromptRequest | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    openPrompt = (request) => {
      setValue(request.options.initialValue || '');
      setError('');
      setState(request);
    };
    return () => { openPrompt = null; };
  }, []);

  const close = useCallback((result: string | null) => {
    setState((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!state) return undefined;
    inputRef.current?.focus();
    inputRef.current?.select();
    // Только Escape. Enter обрабатывает сама форма — так кнопка «Отмена»
    // остаётся кнопкой отмены, даже когда на ней фокус.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, state]);

  if (!state) return <>{children}</>;

  const { options } = state;

  return (
    <>
      {children}
      <div
        className="admin-confirm"
        role="dialog"
        aria-modal="true"
        aria-label={options.title}
        onClick={(event) => { if (event.target === event.currentTarget) close(null); }}
      >
        <form
          className="admin-confirm__card"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = value.trim();
            const message = options.validate ? options.validate(trimmed) : '';
            if (message) { setError(message); return; }
            close(trimmed);
          }}
        >
          <div className="admin-confirm__head">
            <span className="admin-confirm__icon" aria-hidden="true"><PenLine /></span>
            <div>
              <h2 className="admin-confirm__title">{options.title}</h2>
              {options.description ? <p className="admin-confirm__text">{options.description}</p> : null}
            </div>
          </div>

          <label className="admin-field">
            {options.label ? <span className="admin-label">{options.label}</span> : null}
            <input
              ref={inputRef}
              className="admin-input"
              value={value}
              maxLength={options.maxLength}
              placeholder={options.placeholder}
              aria-invalid={error ? true : undefined}
              onChange={(event) => { setValue(event.target.value); if (error) setError(''); }}
            />
            {error ? <span className="admin-hint admin-state--danger" role="alert">{error}</span> : null}
          </label>

          <div className="admin-confirm__actions">
            <button type="button" className="admin-button admin-button--quiet" onClick={() => close(null)}>
              {options.cancelLabel || 'Отмена'}
            </button>
            <button type="submit" className="admin-button admin-button--primary">
              {options.confirmLabel || 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
