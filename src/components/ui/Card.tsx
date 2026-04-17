'use client';

import React from 'react';
import { cn } from './cn';

type Padding = 'none' | 'sm' | 'md' | 'lg';
type Elevation = 'flat' | 'sh1' | 'sh2' | 'sh3';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: Padding;
  elevation?: Elevation;
  borderless?: boolean;
  as?: keyof React.JSX.IntrinsicElements;
}

const paddings: Record<Padding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-7',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    { padding = 'md', elevation = 'flat', borderless = false, as: Tag = 'div', className, style, children, ...rest },
    ref
  ) => {
    const shadowVar =
      elevation === 'sh1' ? 'var(--shadow-sh1)' :
      elevation === 'sh2' ? 'var(--shadow-sh2)' :
      elevation === 'sh3' ? 'var(--shadow-sh3)' :
      undefined;

    return React.createElement(
      Tag as string,
      {
        ref,
        className: cn(
          'bg-surface',
          !borderless && 'border border-border',
          paddings[padding],
          className
        ),
        style: {
          borderRadius: 'var(--radius-card)',
          boxShadow: shadowVar,
          ...style,
        },
        ...rest,
      },
      children
    );
  }
);
Card.displayName = 'Card';

/* ---------- Composition helpers ---------- */

export function CardHeader({ title, description, right, className }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-4', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
        {description && (
          <p className="text-xs text-mute mt-1 leading-relaxed">{description}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
