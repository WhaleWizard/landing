import type { ReactNode } from 'react';
import './card-icon.css';

export default function CardIcon({ children, size = 'regular', className }: {
  children: ReactNode;
  size?: 'tile' | 'regular' | 'compact' | 'marker';
  className?: string;
}) {
  return <span className={className} data-card-icon={size} aria-hidden="true">{children}</span>;
}
