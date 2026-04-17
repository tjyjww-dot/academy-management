'use client';

import React from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'info' | 'success' | 'warn';

export interface EmptyStateProps {
  /** 상단 원형 영역에 표시할 아이콘 또는 이모지/문자 */
  icon?: React.ReactNode;
  /** 제목 (굵게) */
  title: React.ReactNode;
  /** 설명 (옵션) */
  description?: React.ReactNode;
  /** 하단 액션 영역 (Button 컴포넌트 등) */
  action?: React.ReactNode;
  /** 서브 액션 (링크/텍스트 버튼) */
  secondaryAction?: React.ReactNode;
  /** 강조 톤 — 아이콘 원형 배경 색 */
  tone?: Tone;
  /** 수직 패딩 규모 */
  size?: 'sm' | 'md' | 'lg';
  /** 카드로 감쌀지 여부. 기본 false (부모 Card 안에서 쓸 때) */
  asCard?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const toneBg: Record<Tone, string> = {
  neutral: 'var(--color-surface-2)',
  info:    'var(--color-info-bg)',
  success: 'var(--color-success-bg)',
  warn:    'var(--color-warn-bg)',
};

const toneColor: Record<Tone, string> = {
  neutral: 'var(--color-mute)',
  info:    'var(--color-accent)',
  success: 'var(--color-success)',
  warn:    'var(--color-warn)',
};

const sizePad: Record<NonNullable<EmptyStateProps['size']>, string> = {
  sm: 'py-8 px-4',
  md: 'py-12 px-5',
  lg: 'py-16 px-6',
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  tone = 'neutral',
  size = 'md',
  asCard = false,
  className,
  style,
}: EmptyStateProps) {
  const content = (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center anim-pop-in',
        sizePad[size],
        className
      )}
      style={style}
    >
      {icon !== undefined && (
        <div
          aria-hidden
          className="mb-4 flex items-center justify-center"
          style={{
            width: size === 'sm' ? 44 : size === 'lg' ? 64 : 56,
            height: size === 'sm' ? 44 : size === 'lg' ? 64 : 56,
            borderRadius: '50%',
            background: toneBg[tone],
            color: toneColor[tone],
            fontSize: size === 'sm' ? 20 : size === 'lg' ? 28 : 24,
          }}
        >
          {icon}
        </div>
      )}
      <h3
        className="text-h3"
        style={{ fontSize: size === 'lg' ? 17 : 15, color: 'var(--color-ink)' }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="text-caption mt-1.5 max-w-[420px] leading-relaxed"
          style={{ fontSize: 13 }}
        >
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-col items-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );

  if (asCard) {
    return (
      <div
        className="bg-surface border border-border"
        style={{ borderRadius: 'var(--radius-card)' }}
      >
        {content}
      </div>
    );
  }
  return content;
}
