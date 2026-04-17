import React from 'react';
import { cn } from './cn';

export function SectionHeader({
  eyebrow,
  title,
  description,
  right,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex items-end justify-between gap-4 mb-5', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-eyebrow mb-1.5">{eyebrow}</div>
        )}
        <h2
          className="text-[22px] font-bold text-ink"
          style={{ letterSpacing: '-0.025em', lineHeight: 1.2 }}
        >
          {title}
        </h2>
        {description && (
          <p className="text-[13px] text-mute mt-1.5 leading-relaxed">{description}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
