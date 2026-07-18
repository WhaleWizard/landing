import type { MouseEventHandler } from 'react';
import WhaleMark from './WhaleMark';

interface BrandLogoProps {
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  markSize?: number | string;
  priority?: boolean;
  anchor?: boolean;
  ariaLabel?: string;
}

export default function BrandLogo({
  onClick,
  className = '',
  markSize = 'clamp(42px, 4vw, 54px)',
  priority = false,
  anchor = true,
  ariaLabel = 'Whale Wizard — на главную',
}: BrandLogoProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ww-public-brand-logo inline-flex min-h-11 items-center font-bold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
      data-whale-brand-anchor={anchor ? 'true' : undefined}
      aria-label={ariaLabel}
    >
      <span className="ww-brand-mark-shell">
        <WhaleMark size={markSize} animated anchor={anchor} priority={priority} />
      </span>
      <span className="ww-brand-wordmark bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
        Whale Wizard
      </span>
    </button>
  );
}
