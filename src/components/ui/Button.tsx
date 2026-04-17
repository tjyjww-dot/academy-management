'use client';

import React from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium ' +
  'transition-all duration-150 ease-out ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 ' +
  'whitespace-nowrap select-none';

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 h-8',
  md: 'text-[13px] px-4 h-9',
  lg: 'text-sm px-5 h-11',
};

const variants: Record<Variant, string> = {
  // 잉크 블랙 — 가장 강한 primary
  primary:
    'bg-ink text-white hover:bg-black active:translate-y-[0.5px] ' +
    'shadow-[0_1px_2px_rgba(14,14,12,0.08)]',
  // 흰 배경 + 얇은 테두리
  secondary:
    'bg-surface text-ink border border-border-2 hover:bg-surface-2',
  // 투명 배경, 텍스트만
  ghost:
    'bg-transparent text-ink-2 hover:bg-surface-2',
  // 위험 액션
  danger:
    'bg-danger text-white hover:brightness-95',
  // 딥 네이비 포인트
  accent:
    'bg-accent text-white hover:bg-accent-2',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      leftIcon,
      rightIcon,
      loading = false,
      disabled,
      className,
      children,
      style,
      ...rest
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          base,
          sizes[size],
          variants[variant],
          fullWidth && 'w-full',
          className
        )}
        style={{ borderRadius: 'var(--radius-btn)', letterSpacing: '-0.01em', ...style }}
        {...rest}
      >
        {loading ? (
          <span
            aria-hidden
            className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
          />
        ) : (
          leftIcon && <span className="inline-flex">{leftIcon}</span>
        )}
        {children}
        {!loading && rightIcon && <span className="inline-flex">{rightIcon}</span>}
      </button>
    );
  }
);
Button.displayName = 'Button';
