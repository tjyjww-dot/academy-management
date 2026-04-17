'use client';

/**
 * Command Palette · ⌘K / Ctrl+K
 * 애플 Spotlight 감성의 빠른 이동 · 검색 팔레트.
 *
 * 특징
 *  - ⌘K (macOS) / Ctrl+K (Win/Linux) 로 토글
 *  - ESC 로 닫기
 *  - ↑/↓ 키보드 네비게이션 · Enter 로 실행
 *  - 한글/영문/chocho-sung(초성) 부분매칭
 *  - 백드롭 블러 + anim-sheet-up 애니메이션
 *  - 햅틱 피드백 (선택 이동 / 실행)
 *
 * 사용
 *  <CommandPaletteProvider items={items}>{children}</CommandPaletteProvider>
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { hapticSelection, hapticLight, hapticMedium } from '@/lib/haptics';

export type CommandItem = {
  /** 고유 식별자 */
  id: string;
  /** 메인 라벨 · 검색 대상 */
  label: string;
  /** 보조 라벨 · 섹션 · 카테고리 표시용 */
  hint?: string;
  /** 검색용 추가 키워드 (예: 영문명) */
  keywords?: string[];
  /** 왼쪽 아이콘 (이모지 또는 JSX) */
  icon?: ReactNode;
  /** 이동할 라우트 — href 지정 시 router.push */
  href?: string;
  /** 커스텀 액션 — 지정 시 href 보다 우선 */
  action?: () => void | Promise<void>;
  /** 섹션 그룹 제목 (같은 section 끼리 묶여서 표시) */
  section?: string;
  /** 단축 표시 (예: "⌘D") */
  shortcut?: string;
};

type CommandPaletteContextValue = {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  한글 초성 매칭                                                     */
/* ------------------------------------------------------------------ */
const CHOSUNG = [
  'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
];

function extractChosung(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = Math.floor((code - 0xac00) / 588);
      out += CHOSUNG[idx];
    } else {
      out += ch;
    }
  }
  return out;
}

function isChosungOnly(s: string): boolean {
  if (!s) return false;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    // 한글 초성 유니코드 범위
    if (!(code >= 0x3131 && code <= 0x314e)) return false;
  }
  return true;
}

function scoreItem(item: CommandItem, q: string): number {
  if (!q) return 1;
  const query = q.toLowerCase().trim();
  const haystacks: string[] = [
    item.label.toLowerCase(),
    ...(item.keywords ?? []).map((k) => k.toLowerCase()),
    (item.hint ?? '').toLowerCase(),
    (item.section ?? '').toLowerCase(),
  ];

  // 일반 부분 매치
  let best = 0;
  for (const h of haystacks) {
    if (!h) continue;
    if (h === query) best = Math.max(best, 100);
    else if (h.startsWith(query)) best = Math.max(best, 80);
    else if (h.includes(query)) best = Math.max(best, 50);
  }

  // 초성 검색 (쿼리가 초성만일 때)
  if (isChosungOnly(query)) {
    const cho = extractChosung(item.label);
    if (cho.startsWith(query)) best = Math.max(best, 70);
    else if (cho.includes(query)) best = Math.max(best, 40);
  }

  return best;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */
export function CommandPaletteProvider({
  items,
  children,
}: {
  items: CommandItem[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setActiveIdx(0);
  }, []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  /* 글로벌 단축키 · ⌘K / Ctrl+K */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        hapticLight();
        toggle();
      }
      // ESC — 닫기 (포커스가 팔레트 내부일 때도 처리)
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, toggle, close]);

  /* 열리면 입력창 포커스 */
  useEffect(() => {
    if (isOpen) {
      // 애니메이션 프레임 후에 포커스 (transition 간섭 방지)
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      // body 스크롤 잠금
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen]);

  /* 필터링 & 정렬 */
  const filtered = useMemo(() => {
    if (!query.trim()) {
      return items;
    }
    return items
      .map((it) => ({ it, score: scoreItem(it, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.it);
  }, [items, query]);

  /* 쿼리 바뀌면 선택 위치 초기화 */
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  /* 섹션 그룹화 (필터 결과 유지) */
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const it of filtered) {
      const key = it.section ?? '기타';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries());
  }, [filtered]);

  /* 실행 */
  const runItem = useCallback(
    async (item: CommandItem) => {
      hapticMedium();
      close();
      if (item.action) {
        await item.action();
      } else if (item.href) {
        router.push(item.href);
      }
    },
    [router, close]
  );

  /* 키보드 네비게이션 */
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length === 0) return;
      setActiveIdx((i) => {
        const next = (i + 1) % filtered.length;
        hapticSelection();
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length === 0) return;
      setActiveIdx((i) => {
        const next = (i - 1 + filtered.length) % filtered.length;
        hapticSelection();
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIdx];
      if (item) runItem(item);
    }
  };

  /* 선택 항목이 스크롤 영역 밖이면 스크롤 인투 뷰 */
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeIdx]);

  const ctx = useMemo<CommandPaletteContextValue>(
    () => ({ open, close, toggle, isOpen }),
    [open, close, toggle, isOpen]
  );

  // activeIdx가 filtered 범위를 벗어났을 때 보정
  const safeActiveIdx = filtered.length === 0 ? -1 : Math.min(activeIdx, filtered.length - 1);

  /* 플랫 인덱스 계산용 맵 (그룹 렌더링 중에도 activeIdx 매칭) */
  const flatIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((it, i) => m.set(it.id, i));
    return m;
  }, [filtered]);

  return (
    <CommandPaletteContext.Provider value={ctx}>
      {children}

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="빠른 명령 팔레트"
          className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[10vh] sm:pt-[15vh]"
          style={{
            background: 'rgba(14,14,12,0.38)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            animation: 'fade-in 160ms var(--ease-apple) both',
          }}
          onClick={(e) => {
            // 배경 클릭시 닫기 (팔레트 바디 클릭은 전파되지 않도록 아래에서 stopPropagation)
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="anim-sheet-up w-full max-w-xl rounded-[20px] overflow-hidden"
            style={{
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-sh3)',
              border: '1px solid var(--color-border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 검색 입력 */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ color: 'var(--color-mute)' }}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="어디로 이동할까요? (예: 대시보드, ㄷㅅㅂ)"
                aria-label="명령 검색"
                aria-autocomplete="list"
                aria-controls="cmd-palette-list"
                aria-activedescendant={
                  safeActiveIdx >= 0 ? `cmd-item-${filtered[safeActiveIdx]?.id}` : undefined
                }
                className="flex-1 bg-transparent outline-none text-[15px]"
                style={{
                  color: 'var(--color-ink)',
                  letterSpacing: '-0.01em',
                }}
              />
              <kbd
                className="hidden sm:inline-flex items-center px-2 h-6 rounded-md text-[11px] font-semibold"
                style={{
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-mute)',
                  border: '1px solid var(--color-border)',
                }}
              >
                ESC
              </kbd>
            </div>

            {/* 결과 목록 */}
            <div
              id="cmd-palette-list"
              ref={listRef}
              role="listbox"
              className="max-h-[60vh] overflow-y-auto py-2"
            >
              {filtered.length === 0 ? (
                <div
                  className="px-4 py-10 text-center text-[14px]"
                  style={{ color: 'var(--color-mute)' }}
                >
                  <div className="text-2xl mb-2" aria-hidden="true">🔍</div>
                  <div>검색 결과가 없습니다</div>
                  <div className="text-[12px] mt-1" style={{ color: 'var(--color-mute-2)' }}>
                    다른 키워드로 시도해보세요
                  </div>
                </div>
              ) : (
                grouped.map(([section, list]) => (
                  <div key={section} className="px-2 mb-1">
                    <div
                      className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--color-mute)', letterSpacing: '0.08em' }}
                    >
                      {section}
                    </div>
                    {list.map((it) => {
                      const flatIdx = flatIndexMap.get(it.id) ?? -1;
                      const isActive = flatIdx === safeActiveIdx;
                      return (
                        <button
                          key={it.id}
                          id={`cmd-item-${it.id}`}
                          data-idx={flatIdx}
                          role="option"
                          aria-selected={isActive}
                          type="button"
                          onMouseEnter={() => setActiveIdx(flatIdx)}
                          onClick={() => runItem(it)}
                          className="press press-subtle w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-left transition-colors"
                          style={{
                            background: isActive ? 'rgba(31,58,95,0.08)' : 'transparent',
                            color: 'var(--color-ink)',
                          }}
                        >
                          <span
                            className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-[16px]"
                            style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-mute)' }}
                            aria-hidden="true"
                          >
                            {it.icon ?? '•'}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span
                              className="block text-[14px] font-medium truncate"
                              style={{ letterSpacing: '-0.01em' }}
                            >
                              {it.label}
                            </span>
                            {it.hint && (
                              <span
                                className="block text-[12px] truncate"
                                style={{ color: 'var(--color-mute)' }}
                              >
                                {it.hint}
                              </span>
                            )}
                          </span>
                          {it.shortcut && (
                            <kbd
                              className="hidden sm:inline-flex items-center px-2 h-6 rounded-md text-[11px] font-semibold flex-shrink-0"
                              style={{
                                background: 'var(--color-surface-2)',
                                color: 'var(--color-mute)',
                                border: '1px solid var(--color-border)',
                              }}
                            >
                              {it.shortcut}
                            </kbd>
                          )}
                          {isActive && (
                            <svg
                              className="w-4 h-4 flex-shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              style={{ color: 'var(--color-accent)' }}
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.4}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* 푸터 · 키보드 힌트 */}
            <div
              className="flex items-center justify-between gap-2 px-4 py-2 text-[11px]"
              style={{
                background: 'var(--color-surface-2)',
                borderTop: '1px solid var(--color-border)',
                color: 'var(--color-mute)',
              }}
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  이동
                </span>
                <span className="flex items-center gap-1">
                  <Kbd>↵</Kbd>
                  실행
                </span>
                <span className="hidden sm:flex items-center gap-1">
                  <Kbd>ESC</Kbd>
                  닫기
                </span>
              </div>
              <span className="hidden sm:inline">
                {filtered.length}개 항목
              </span>
            </div>
          </div>
        </div>
      )}
    </CommandPaletteContext.Provider>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] font-semibold"
      style={{
        background: 'var(--color-surface)',
        color: 'var(--color-ink-2)',
        border: '1px solid var(--color-border)',
      }}
    >
      {children}
    </kbd>
  );
}
