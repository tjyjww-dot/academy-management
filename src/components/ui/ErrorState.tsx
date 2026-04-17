'use client';

import React from 'react';
import { cn } from './cn';
import { Button } from './Button';

export interface ErrorStateProps {
  /** 제목. 기본: "문제가 발생했어요" */
  title?: React.ReactNode;
  /** 상세 메시지 (에러 객체의 message 등) */
  description?: React.ReactNode;
  /** 다시 시도 핸들러. 지정하면 "다시 시도" 버튼을 자동 표시 */
  onRetry?: () => void | Promise<void>;
  /** 보조 액션 — 예: "홈으로" 등 */
  secondaryAction?: React.ReactNode;
  /** 수직 패딩 규모 */
  size?: 'sm' | 'md' | 'lg';
  /** 카드로 감쌀지 여부 */
  asCard?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const sizePad: Record<NonNullable<ErrorStateProps['size']>, string> = {
  sm: 'py-8 px-4',
  md: 'py-12 px-5',
  lg: 'py-16 px-6',
};

export function ErrorState({
  title = '문제가 발생했어요',
  description,
  onRetry,
  secondaryAction,
  size = 'md',
  asCard = false,
  className,
  style,
}: ErrorStateProps) {
  const [retrying, setRetrying] = React.useState(false);

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    try {
      setRetrying(true);
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const content = (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center text-center anim-pop-in',
        sizePad[size],
        className
      )}
      style={style}
    >
      <div
        aria-hidden
        className="mb-4 flex items-center justify-center"
        style={{
          width: size === 'sm' ? 44 : size === 'lg' ? 64 : 56,
          height: size === 'sm' ? 44 : size === 'lg' ? 64 : 56,
          borderRadius: '50%',
          background: 'var(--color-danger-bg)',
          color: 'var(--color-danger)',
          fontSize: size === 'sm' ? 22 : size === 'lg' ? 30 : 26,
          fontWeight: 600,
        }}
      >
        !
      </div>
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
      {(onRetry || secondaryAction) && (
        <div className="mt-5 flex flex-col items-center gap-2">
          {onRetry && (
            <Button
              variant="secondary"
              size="sm"
              haptic="light"
              loading={retrying}
              onClick={handleRetry}
            >
              다시 시도
            </Button>
          )}
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
