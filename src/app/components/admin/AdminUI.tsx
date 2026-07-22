import { useId, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
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
