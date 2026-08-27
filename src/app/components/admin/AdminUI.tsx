import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function AdminPanel({ children, className = '', ...props }: PanelProps) {
  return (
    <div className={`admin-panel ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'default' | 'primary' | 'quiet' | 'danger';
  compact?: boolean;
};

export function AdminButton({
  children,
  className = '',
  tone = 'default',
  compact = false,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`admin-button admin-button--${tone}${compact ? ' admin-button--compact' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function AdminSectionHeading({
  title,
  description,
  action,
  className = '',
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`admin-section-heading ${className}`.trim()}>
      <div className="min-w-0">
        <h2 className="admin-section-heading__title">{title}</h2>
        {description ? <p className="admin-meta mt-1">{description}</p> : null}
      </div>
      {action ? <div className="admin-section-heading__action">{action}</div> : null}
    </div>
  );
}

export function AdminMeta({ children, className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`admin-meta ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}

export type AdminSelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export function AdminSelect({
  value,
  options,
  onValueChange,
  label,
  ariaLabel,
  placeholder = 'Выберите',
  hint,
  disabled = false,
  compact = false,
  className = '',
}: {
  value?: string;
  options: AdminSelectOption[];
  onValueChange: (value: string) => void;
  label?: ReactNode;
  ariaLabel?: string;
  placeholder?: string;
  hint?: ReactNode;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const id = useId();
  const control = (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
        className={`admin-select-trigger${compact ? ' admin-select-trigger--compact' : ''} ${className}`.trim()}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="admin-select-content" position="popper">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="admin-select-item"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!label && !hint) return control;

  return (
    <div className="admin-field">
      {label ? <label className="admin-label" htmlFor={id}>{label}</label> : null}
      {control}
      {hint ? <span className="admin-hint">{hint}</span> : null}
    </div>
  );
}

/**
 * Разбор денежной строки: «1234.56», «1 234,56», «$1,234.56» — одно и то же.
 *
 * Правило то же, что на сервере в `functions/api/admin/ad-spend.ts`:
 * последний разделитель считается десятичным, остальные — разрядными.
 * Пустая строка — это «не заполнено», а не ноль.
 */
export function parseDecimalInput(raw: string): number | null {
  const cleaned = String(raw ?? '').replace(/[^\d.,-]/g, '').trim();
  if (!cleaned || cleaned === '-') return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const normalized = lastComma > lastDot
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

type DecimalInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
};

/**
 * Поле для дробного числа.
 *
 * Обычное поле с `value={число}` и преобразованием в `onChange` не позволяет
 * ввести дробь вообще: после нажатия точки `Number("1500.")` даёт `1500`,
 * состояние не меняется, и React возвращает в поле прежний текст — точка
 * стирается на лету. Ввод «1500.50» превращался в «150050».
 *
 * Поэтому набранный текст живёт здесь, а наверх уходит только разобранное
 * число. Значение извне (переключили карточку, сбросили черновик) поле
 * подхватывает, а собственный ввод — нет: иначе точка снова стиралась бы.
 */
export function AdminDecimalInput({ value, onValueChange, ...props }: DecimalInputProps) {
  const [text, setText] = useState(() => (value === null || value === undefined ? '' : String(value)));
  const reported = useRef<number | null>(value ?? null);

  useEffect(() => {
    const next = value ?? null;
    if (next !== reported.current) {
      setText(next === null ? '' : String(next));
      reported.current = next;
    }
  }, [value]);

  return (
    <input
      {...props}
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        const raw = event.target.value.replace(/[^\d.,-]/g, '');
        setText(raw);
        const parsed = parseDecimalInput(raw);
        reported.current = parsed;
        onValueChange(parsed);
      }}
    />
  );
}
