import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

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
