'use client';

import React from 'react';
import { cn } from './cn';
import { triggerHaptic } from '@/lib/haptics';

export interface StepItem {
  /** 1부터 시작하는 단계 번호(자동 부여되므로 생략 가능) */
  id?: string;
  /** 단계 제목 (예: "업로드") */
  label: string;
  /** 보조 설명 (예: "PDF 파일 선택") */
  description?: string;
}

export interface StepperProps {
  /** 단계 목록 */
  steps: StepItem[];
  /** 현재 진행중인 단계 인덱스 (0-based) */
  current: number;
  /** 이 인덱스 이하는 모두 완료 표시 (기본: current - 1) */
  completedUntil?: number;
  /** 사용자가 완료된 스텝 클릭 가능 여부 */
  onStepClick?: (index: number) => void;
  /** 배치 방향 — 기본 horizontal. mobile 에서도 가로 스크롤. */
  orientation?: 'horizontal';
  className?: string;
}

/**
 * Stepper — 수평 단계 인디케이터.
 * 각 단계는 원형 인디케이터(번호/체크) + 라벨 + 보조설명으로 구성.
 * 완료 단계: accent 원(체크), 진행중: accent 링(번호), 대기: 회색.
 * 단계 사이는 가로 라인으로 연결 (완료 구간은 accent, 그 외는 border).
 *
 * 사용 예:
 *   <Stepper
 *     steps={[
 *       { label: '업로드', description: 'PDF 선택' },
 *       { label: '범위', description: '문제/답지' },
 *       { label: '추출', description: '자동 감지' },
 *       { label: '저장', description: '반 지정' },
 *     ]}
 *     current={extractState === 'idle' ? 0 : extractState === 'done' ? 2 : 3}
 *   />
 */
export function Stepper({
  steps,
  current,
  completedUntil,
  onStepClick,
  className,
}: StepperProps) {
  const doneUntil = completedUntil ?? current - 1;

  return (
    <nav
      aria-label="진행 단계"
      className={cn('w-full overflow-x-auto scrollbar-none', className)}
    >
      <ol className="flex items-start min-w-max gap-0">
        {steps.map((step, i) => {
          const status: 'done' | 'current' | 'pending' =
            i <= doneUntil ? 'done' : i === current ? 'current' : 'pending';
          const isLast = i === steps.length - 1;
          const canClick = Boolean(onStepClick) && status !== 'pending';

          return (
            <li
              key={step.id ?? String(i)}
              className={cn(
                'flex items-start',
                !isLast && 'flex-1 min-w-[100px]'
              )}
            >
              {/* Step indicator + label */}
              <button
                type="button"
                disabled={!canClick}
                onPointerDown={() => canClick && triggerHaptic('selection')}
                onClick={() => canClick && onStepClick?.(i)}
                className={cn(
                  'flex flex-col items-center gap-1.5 px-2 min-w-[80px]',
                  canClick && 'press press-subtle cursor-pointer',
                  !canClick && 'cursor-default'
                )}
                aria-current={status === 'current' ? 'step' : undefined}
              >
                {/* circle */}
                <span
                  className="flex items-center justify-center w-7 h-7 text-xs font-semibold shrink-0"
                  style={{
                    borderRadius: '999px',
                    transition:
                      'background-color 200ms var(--ease-apple-inout), color 200ms var(--ease-apple-inout), border-color 200ms var(--ease-apple-inout)',
                    background:
                      status === 'done'
                        ? 'var(--color-accent)'
                        : status === 'current'
                        ? 'var(--color-info-bg)'
                        : 'var(--color-surface-2)',
                    color:
                      status === 'done'
                        ? '#fff'
                        : status === 'current'
                        ? 'var(--color-accent)'
                        : 'var(--color-mute)',
                    border:
                      status === 'current'
                        ? '1.5px solid var(--color-accent)'
                        : status === 'done'
                        ? '1.5px solid var(--color-accent)'
                        : '1.5px solid var(--color-border)',
                  }}
                >
                  {status === 'done' ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M2.5 6.2L5 8.7L9.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span className="num-tabular">{i + 1}</span>
                  )}
                </span>

                {/* label */}
                <span
                  className={cn(
                    'text-[12px] font-medium whitespace-nowrap',
                    status === 'done' && 'text-ink',
                    status === 'current' && 'text-accent',
                    status === 'pending' && 'text-mute'
                  )}
                  style={{ letterSpacing: '-0.01em' }}
                >
                  {step.label}
                </span>

                {step.description && (
                  <span
                    className={cn(
                      'text-[10.5px] whitespace-nowrap',
                      status === 'pending' ? 'text-mute' : 'text-ink-2'
                    )}
                    style={{ opacity: status === 'pending' ? 0.7 : 1 }}
                  >
                    {step.description}
                  </span>
                )}
              </button>

              {/* connector line */}
              {!isLast && (
                <span
                  className="flex-1 mt-3.5 mx-1 h-[2px] min-w-[24px]"
                  style={{
                    borderRadius: '2px',
                    background:
                      i < doneUntil + 1
                        ? 'var(--color-accent)'
                        : 'var(--color-border)',
                    transition: 'background-color 320ms var(--ease-apple-inout)',
                  }}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
Stepper.displayName = 'Stepper';
