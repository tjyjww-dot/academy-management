'use client';

import React from 'react';
import { cn } from './cn';

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  count?: number | string;
}

/**
 * Pill — 탭/필터/세그먼트용 선택 가능한 알약형 버튼.
 * active 상태일 때 잉크 블랙 배경 + 흰 텍스트.
 */
export const Pill = React.forwardRef<HTMLButtonElement, PillProps>(
  ({ active = false, count, className, style, children, type = 'button', ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        aria-pressed={active}
        className={cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap',
          'text-xs font-medium px-3 h-7',
          'transition-all duration-150 ease-out',
          active
            ? 'bg-ink text-white border border-ink'
            : 'bg-transparent text-mute hover:text-ink border border-transparent hover:bg-surface-2',
          className
        )}
        style={{ borderRadius: '999px', letterSpacing: '-0.01em', ...style }}
        {...rest}
      >
        {children}
        {count !== undefined && (
          <span
            className={cn(
              'inline-flex items-center justify-center min-w-[16px] h-[16px] px-1.5',
              'text-[10px] font-semibold rounded-full',
              active ? 'bg-white/20 text-white' : 'bg-surface-2 text-mute'
            )}
          >
            {count}
          </span>
        )}
      </button>
    );
  }
);
Pill.displayName = 'Pill';
