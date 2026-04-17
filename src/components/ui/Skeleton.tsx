import React from 'react';
import { cn } from './cn';

export function Skeleton({
  className,
  style,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('skeleton', className)}
      style={{ borderRadius: 'var(--radius-btn)', ...style }}
      {...rest}
    />
  );
}
