'use client';

import React from 'react';
import { cn } from './cn';
import { triggerHaptic, type HapticKind } from '@/lib/haptics';

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  count?: number | string;
  /** 햅틱 강도. 기본: 'selection' (가장 미세한 틱) */
  haptic?: HapticKind;
}

/**
 * Pill — 탭/필터/세그먼트용 선택 가능한 알약형 버튼.
 * active 상태일 때 잉크 블랙 배경 + 흰 텍스트.
 * 터치 시 미세한 haptic selection + press 스케일 피드백 제공.
 */
export const Pill = React.forwardRef<HTMLButtonElement, PillProps>(
  ({ active = false, count, className, style, children, type = 'button', haptic = 'selection', onPointerDown, ...rest }, ref) => {
    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!rest.disabled) triggerHaptic(haptic);
      onPointerDown?.(e);
    };
    return (
      <button
        ref={ref}
        type={type}
        aria-pressed={active}
        className={cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap',
          'text-xs font-medium px-3 h-7',
          'press',
          active
            ? 'bg-ink text-white border border-ink'
            : 'bg-transparent text-mute hover:text-ink border border-transparent hover:bg-surface-2',
          className
        )}
        style={{ borderRadius: '999px', letterSpacing: '-0.01em', ...style }}
        onPointerDown={handlePointerDown}
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
