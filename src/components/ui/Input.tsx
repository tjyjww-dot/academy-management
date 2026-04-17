'use client';

import React from 'react';
import { cn } from './cn';

type Size = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: Size;
  invalid?: boolean;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
}

const sizes: Record<Size, string> = {
  sm: 'text-xs h-8 px-2.5',
  md: 'text-[13.5px] h-10 px-3.5',
  lg: 'text-sm h-12 px-4',
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ inputSize = 'md', invalid = false, leftIcon, rightSlot, className, style, ...rest }, ref) => {
    const wrapper = (
      <input
        ref={ref}
        className={cn(
          'w-full bg-surface text-ink placeholder:text-mute-2 border',
          'transition-all duration-150 ease-out',
          'focus:outline-none focus:ring-0',
          sizes[inputSize],
          invalid ? 'border-danger' : 'border-border-2',
          leftIcon && 'pl-9',
          rightSlot && 'pr-10',
          className
        )}
        style={{ borderRadius: 'var(--radius-btn)', ...style }}
        onFocus={(e) => {
          (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--color-ink)';
          (e.currentTarget as HTMLInputElement).style.boxShadow = 'var(--shadow-focus)';
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLInputElement).style.borderColor = invalid
            ? 'var(--color-danger)'
            : 'var(--color-border-2)';
          (e.currentTarget as HTMLInputElement).style.boxShadow = '';
          rest.onBlur?.(e);
        }}
        {...rest}
      />
    );

    if (!leftIcon && !rightSlot) return wrapper;

    return (
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute">
            {leftIcon}
          </span>
        )}
        {wrapper}
        {rightSlot && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
