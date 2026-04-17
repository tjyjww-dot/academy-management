import React from 'react';
import { cn } from './cn';

export function Divider({
  orientation = 'horizontal',
  className,
  ...rest
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="separator"
      className={cn(
        orientation === 'horizontal' ? 'w-full h-px' : 'h-full w-px',
        'bg-border',
        className
      )}
      {...rest}
    />
  );
}
