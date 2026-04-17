'use client';

import React from 'react';
import { cn } from './cn';

type Trend = 'up' | 'down' | 'flat';

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  delta?: React.ReactNode;
  trend?: Trend;
  hint?: React.ReactNode;
  right?: React.ReactNode;
}

/**
 * Stat — KPI 카드 컴포넌트.
 * 원색 상단 라인 대신 숫자 크기와 조판으로 위계를 표현.
 */
export const Stat = React.forwardRef<HTMLDivElement, StatProps>(
  ({ label, value, unit, delta, trend = 'flat', hint, right, className, style, ...rest }, ref) => {
    const trendColor =
      trend === 'up'   ? 'var(--color-success)' :
      trend === 'down' ? 'var(--color-danger)' :
                         'var(--color-mute)';

    const trendArrow =
      trend === 'up'   ? '▲' :
      trend === 'down' ? '▼' :
                         '–';

    return (
      <div
        ref={ref}
        className={cn(
          'bg-surface border border-border relative',
          'p-4 pt-4 pb-3.5',
          className
        )}
        style={{ borderRadius: 'var(--radius-card)', ...style }}
        {...rest}
      >
        <div className="flex items-start justify-between">
          <div className="text-[11.5px] font-medium text-mute tracking-wide">{label}</div>
          {right && <div className="shrink-0">{right}</div>}
        </div>

        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span
            className="text-[22px] font-bold text-ink num-tabular"
            style={{ letterSpacing: '-0.02em' }}
          >
            {value}
          </span>
          {unit && <span className="text-[11.5px] text-mute font-medium">{unit}</span>}
        </div>

        {(delta || hint) && (
          <div className="mt-1 text-[10.5px] font-medium flex items-center gap-1.5 flex-wrap">
            {delta && (
              <span className="inline-flex items-center gap-1" style={{ color: trendColor }}>
                <span aria-hidden>{trendArrow}</span>
                {delta}
              </span>
            )}
            {hint && <span className="text-mute">{hint}</span>}
          </div>
        )}
      </div>
    );
  }
);
Stat.displayName = 'Stat';
