'use client';

import React from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'accent' | 'gold' | 'success' | 'warn' | 'danger' | 'info' | 'ink';
type Variant = 'soft' | 'solid' | 'outline';
type Size = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  variant?: Variant;
  size?: Size;
  dot?: boolean;
}

const sizeStyles: Record<Size, string> = {
  sm: 'text-[10.5px] px-2 py-[2px]',
  md: 'text-[11.5px] px-2.5 py-[3px]',
};

function toneToCss(tone: Tone, variant: Variant): React.CSSProperties {
  const map: Record<Tone, { fg: string; bg: string; border: string }> = {
    neutral: { fg: 'var(--color-ink-2)', bg: 'var(--color-surface-2)', border: 'var(--color-border)' },
    accent:  { fg: 'var(--color-accent)', bg: 'var(--color-info-bg)', border: 'var(--color-info-bg)' },
    gold:    { fg: 'var(--color-gold)',   bg: 'var(--color-gold-soft)', border: '#E8DBC2' },
    success: { fg: 'var(--color-success)',bg: 'var(--color-success-bg)',border: 'var(--color-success-bg)' },
    warn:    { fg: 'var(--color-warn)',   bg: 'var(--color-warn-bg)',   border: 'var(--color-warn-bg)' },
    danger:  { fg: 'var(--color-danger)', bg: 'var(--color-danger-bg)', border: 'var(--color-danger-bg)' },
    info:    { fg: 'var(--color-info)',   bg: 'var(--color-info-bg)',   border: 'var(--color-info-bg)' },
    ink:     { fg: '#FFFFFF',             bg: 'var(--color-ink)',       border: 'var(--color-ink)' },
  };
  const t = map[tone];
  if (variant === 'solid') {
    return tone === 'ink'
      ? { color: '#fff', background: 'var(--color-ink)', border: '1px solid var(--color-ink)' }
      : { color: '#fff', background: t.fg, border: `1px solid ${t.fg}` };
  }
  if (variant === 'outline') {
    return { color: t.fg, background: 'transparent', border: `1px solid ${t.border}` };
  }
  return { color: t.fg, background: t.bg, border: `1px solid ${t.border}` };
}

export function Badge({
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  dot = false,
  className,
  style,
  children,
  ...rest
}: BadgeProps) {
  const css = toneToCss(tone, variant);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-semibold tracking-wide whitespace-nowrap',
        sizeStyles[size],
        className
      )}
      style={{ borderRadius: '999px', letterSpacing: '0.02em', ...css, ...style }}
      {...rest}
    >
      {dot && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
