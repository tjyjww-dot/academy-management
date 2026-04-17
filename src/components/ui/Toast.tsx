'use client';

import React from 'react';
import { cn } from './cn';
import { triggerHaptic, type HapticKind } from '@/lib/haptics';

export type ToastTone = 'neutral' | 'success' | 'warn' | 'danger' | 'info';

export interface ToastInput {
  tone?: ToastTone;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** ms. 기본 2600ms. null 이면 수동 닫기만 */
  duration?: number | null;
  haptic?: HapticKind;
}

interface ToastItem extends Required<Pick<ToastInput, 'tone'>>, ToastInput {
  id: number;
}

type ToastFn = (t: ToastInput) => number;

interface ToastContextValue {
  toast: ToastFn;
  /** 편의 메소드 */
  success: (title: React.ReactNode, description?: React.ReactNode) => number;
  warn: (title: React.ReactNode, description?: React.ReactNode) => number;
  danger: (title: React.ReactNode, description?: React.ReactNode) => number;
  info: (title: React.ReactNode, description?: React.ReactNode) => number;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, { bg: string; border: string; color: string; icon: string; iconBg: string; haptic: HapticKind }> = {
  neutral: {
    bg: 'var(--color-surface)',
    border: 'var(--color-border)',
    color: 'var(--color-ink)',
    icon: '·',
    iconBg: 'var(--color-surface-2)',
    haptic: 'selection',
  },
  success: {
    bg: 'var(--color-surface)',
    border: 'var(--color-success-bg)',
    color: 'var(--color-ink)',
    icon: '✓',
    iconBg: 'var(--color-success-bg)',
    haptic: 'success',
  },
  warn: {
    bg: 'var(--color-surface)',
    border: 'var(--color-warn-bg)',
    color: 'var(--color-ink)',
    icon: '!',
    iconBg: 'var(--color-warn-bg)',
    haptic: 'warn',
  },
  danger: {
    bg: 'var(--color-surface)',
    border: 'var(--color-danger-bg)',
    color: 'var(--color-ink)',
    icon: '!',
    iconBg: 'var(--color-danger-bg)',
    haptic: 'heavy',
  },
  info: {
    bg: 'var(--color-surface)',
    border: 'var(--color-info-bg)',
    color: 'var(--color-ink)',
    icon: 'i',
    iconBg: 'var(--color-info-bg)',
    haptic: 'light',
  },
};

const toneIconColor: Record<ToastTone, string> = {
  neutral: 'var(--color-mute)',
  success: 'var(--color-success)',
  warn:    'var(--color-warn)',
  danger:  'var(--color-danger)',
  info:    'var(--color-accent)',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(1);

  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback<ToastFn>((input) => {
    const id = idRef.current++;
    const tone: ToastTone = input.tone ?? 'neutral';
    const item: ToastItem = { id, tone, duration: 2600, ...input };
    setItems((prev) => [...prev, item]);
    // 햅틱
    triggerHaptic(input.haptic ?? toneStyles[tone].haptic);
    // 자동 닫기
    if (item.duration !== null) {
      const ms = item.duration ?? 2600;
      setTimeout(() => dismiss(id), ms);
    }
    return id;
  }, [dismiss]);

  const value = React.useMemo<ToastContextValue>(() => ({
    toast,
    dismiss,
    success: (title, description) => toast({ tone: 'success', title, description }),
    warn:    (title, description) => toast({ tone: 'warn',    title, description }),
    danger:  (title, description) => toast({ tone: 'danger',  title, description }),
    info:    (title, description) => toast({ tone: 'info',    title, description }),
  }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Provider가 없을 때도 앱이 깨지지 않도록 no-op fallback 제공
    const noop = () => 0;
    return {
      toast: noop,
      dismiss: () => {},
      success: noop,
      warn: noop,
      danger: noop,
      info: noop,
    };
  }
  return ctx;
}

function ToastViewport({
  items,
  dismiss,
}: {
  items: ToastItem[];
  dismiss: (id: number) => void;
}) {
  if (typeof window === 'undefined') return null;
  return (
    <div
      role="region"
      aria-label="알림"
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] flex flex-col items-center px-3"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
        gap: 8,
      }}
    >
      {items.map((t) => {
        const s = toneStyles[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={cn('pointer-events-auto w-full max-w-[420px] anim-pop-in press press-subtle')}
            style={{
              background: s.bg,
              border: `1px solid ${s.border}`,
              color: s.color,
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-sh2)',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              cursor: 'pointer',
            }}
            onClick={() => dismiss(t.id)}
          >
            <span
              aria-hidden
              className="shrink-0 flex items-center justify-center"
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: s.iconBg,
                color: toneIconColor[t.tone],
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {s.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-h3" style={{ fontSize: 14 }}>{t.title}</p>
              {t.description && (
                <p className="text-caption mt-0.5" style={{ fontSize: 12.5 }}>
                  {t.description}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="닫기"
              onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
              className="shrink-0 press press-subtle"
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                background: 'transparent',
                color: 'var(--color-mute)',
                fontSize: 16,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
