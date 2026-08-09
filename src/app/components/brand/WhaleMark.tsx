import type { CSSProperties } from 'react';

interface WhaleMarkProps {
  size?: number | string;
  className?: string;
  animated?: boolean;
  anchor?: boolean;
  priority?: boolean;
  label?: string;
}

type WhaleMarkStyle = CSSProperties & {
  '--ww-whale-size': string;
};

export default function WhaleMark({
  size = 56,
  className = '',
  animated = false,
  anchor = false,
  priority = false,
  label,
}: WhaleMarkProps) {
  const resolvedSize = typeof size === 'number' ? `${size}px` : size;
  const style: WhaleMarkStyle = { '--ww-whale-size': resolvedSize };
  const decorative = !label;

  return (
    <span
      className={`ww-whale-mark${animated ? ' ww-whale-mark--alive' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      data-whale-logo-anchor={anchor ? 'true' : undefined}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={label}
    >
      <picture className="ww-whale-mark__picture">
        <source srcSet="/images/brand/whale-wizard-96.webp" type="image/webp" />
        <img
          className="ww-whale-mark__image"
          src="/images/brand/whale-wizard-256.png"
          width="256"
          height="256"
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          draggable={false}
        />
      </picture>
      <img
        className="ww-whale-mark__glow"
        src="/images/brand/whale-wand-glow.png"
        width="96"
        height="96"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </span>
  );
}
